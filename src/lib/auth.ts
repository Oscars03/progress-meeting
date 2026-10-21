import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { SheetRepo } from './db/sheet-repo';
import { verifyPassword } from './password';
import { allowedSignupDomains, normalizeEmail } from './signup-policy';
import { storeRefreshToken } from './google/tokens';
import { IDENTITY_SCOPES } from './google/scopes';
import type { UserRecord } from './db/schema';
import { PENDING_APPROVAL, TEMPORARY_ERROR } from './auth-signals';
import { describeError, logError, logEvent } from './app-log';

/**
 * One retry for a read that failed because the Sheets API was busy.
 *
 * Everywhere else in the app a failed read shows an error and the person
 * presses the button again. The Google path has no such button: the read
 * happens inside the OAuth callback, so anything thrown there ends the whole
 * sign-in and lands them back on the login form, and trying again means the
 * entire round trip to Google and back. A 429 or a 5xx from Sheets -- which a
 * cold instance draws often enough to notice -- is not worth that. Two
 * attempts, then let the caller say what happened.
 */
async function withRetry<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    logError('sign_in_retry', e, {
      level: 'warn',
      message: 'Sheet read during sign-in failed; retrying once',
      path: '/login',
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    return await op();
  }
}

/** `email` must already be normalized. Also used by the lab SSO route. */
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const users = await withRetry(() => SheetRepo.find<UserRecord>('users'));
  return users.find((u) => normalizeEmail(u.email) === email) ?? null;
}

const providers: NextAuthOptions['providers'] = [
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      const email = normalizeEmail(credentials?.email);
      const password = credentials?.password;
      if (!email || !password) return null;

      let user: UserRecord | null;
      try {
        user = await findUserByEmail(email);
      } catch (e) {
        logError('sign_in_error', e, { message: 'Could not read users during sign-in', path: '/login', detail: { email } });
        throw e;
      }

      // Kept so "I cannot sign in" can be answered: which address was typed,
      // and which of the three ways it failed. Never the password.
      const failed = (reason: string, userId?: string) =>
        logEvent({
          level: 'warn',
          event: 'sign_in_failed',
          message: reason,
          userId,
          path: '/login',
          detail: { email, provider: 'credentials' },
        });

      if (!user) {
        failed('unknown_email');
        return null;
      }

      // Fails closed for legacy plaintext rows -- see npm run db:migrate-passwords.
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        failed('wrong_password', user.id);
        return null;
      }

      // Checked *after* the password, deliberately. "Waiting for approval" is
      // told only to somebody who already proved the account is theirs, so it
      // reveals nothing a stranger could use to find out who has registered.
      if (user.active !== true) {
        failed('pending_approval', user.id);
        throw new Error(PENDING_APPROVAL);
      }

      return { id: user.id, name: user.name, email: user.email, role: user.role };
    },
  }),
];

// Only offer Google when it is actually configured.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          // Identity only. Calendar access is a separate ask, made by the
          // Connect button when somebody chooses to connect -- see
          // lib/google/scopes.ts. Asking here made a first sign-in several
          // consent screens for access the app did not need yet.
          scope: IDENTITY_SCOPES.join(' '),
        },
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return true;

      const email = normalizeEmail(user.email);
      if (!email) return false;

      try {
        const existing = await findUserByEmail(email);

        if (existing) {
          // Not yet let in -- or let in and since deactivated. Either way the
          // account exists and signing in again cannot help, which is what the
          // waiting screen says. Sending them back to the form with an error
          // invites the retry that is the one thing that cannot work.
          if (existing.active !== true) {
            logEvent({
              level: 'warn',
              event: 'sign_in_failed',
              message: 'pending_approval',
              userId: existing.id,
              path: '/login',
              detail: { email, provider: 'google' },
            });
            return '/?pending=1';
          }
          user.id = existing.id;
          user.role = existing.role;

          // Calendar access is a bonus, not a condition of signing in: a
          // failure to store it must not lock somebody out of the app.
          try {
            await storeRefreshToken({
              userId: existing.id,
              refreshToken: account.refresh_token,
              scope: account.scope ?? '',
              accountEmail: email,
            });
          } catch (e) {
            logError('google_token', e, {
              message: 'Could not store Google refresh token',
              userId: existing.id,
              path: '/login',
            });
          }

          return true;
        }

        const domain = email.split('@')[1] ?? '';
        if (!allowedSignupDomains().includes(domain)) {
          logEvent({
            level: 'warn',
            event: 'sign_in_failed',
            message: 'no_account',
            path: '/login',
            detail: { email, provider: 'google' },
          });
          return '/login?error=AccessDenied';
        }

        // Self-registration lands inactive; an admin must approve before login.
        logEvent({
          level: 'info',
          event: 'sign_up',
          message: 'google',
          path: '/login',
          detail: { email, provider: 'google' },
        });
        await SheetRepo.insert(
          'users',
          {
            name: user.name || email,
            email,
            password_hash: '',
            role: 'student',
            team_id: '',
            line_id: '',
            active: false,
          },
          'google-signup',
          // keep, never update -- see the same call in login/actions.ts.
          { uniqueBy: { email }, onConflict: 'keep' }
        );

        return '/?pending=1';
      } catch (e) {
        // Deliberately not `false`. NextAuth turns that into AccessDenied and
        // renders its own bare page saying the person is not allowed in --
        // which is the wrong thing to say about a spreadsheet that was busy,
        // and leaves them nowhere to try again from. This code lands on the
        // login form with a message that says to.
        logError('sign_in_error', e, {
          message: 'Google sign-in error',
          path: '/login',
          detail: { email, provider: 'google' },
        });
        return `/login?error=${TEMPORARY_ERROR}`;
      }
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  events: {
    // Only a sign-in that worked arrives here; the ways one fails are logged
    // where they are decided, above.
    signIn({ user, account }) {
      logEvent({
        level: 'info',
        event: 'sign_in',
        message: account?.provider ?? '',
        userId: user.id,
        path: '/login',
      });
    },
  },
  // NextAuth's own failures -- a callback Google refused, a session cookie
  // that no longer decrypts -- which it would otherwise only print. Printed
  // still; kept as well. Only the error and the provider are taken from the
  // metadata: some codes attach the OAuth exchange itself.
  //
  // Setting this switches on NextAuth's /_log endpoint, which would pass any
  // stranger's body to it; the route answers that one itself -- see
  // app/api/auth/[...nextauth]/route.ts.
  logger: {
    error(code, metadata) {
      const error = metadata instanceof Error ? metadata : metadata?.error;
      const providerId =
        metadata && !(metadata instanceof Error) && typeof metadata.providerId === 'string'
          ? metadata.providerId
          : undefined;
      console.error(`[next-auth][error][${code}]`, error ?? metadata);
      logEvent({
        level: 'error',
        event: 'auth_error',
        message: code,
        detail: {
          ...(error ? { error: describeError(error) } : {}),
          ...(providerId ? { providerId } : {}),
        },
      });
    },
  },
  pages: {
    signIn: '/login',
    // NextAuth shows only *some* failures on the sign-in page; the rest --
    // AccessDenied, Configuration -- go to a built-in page of its own, in
    // English, with none of this app's chrome and no way back. Pointing the
    // error page at the login form as well means every failure arrives
    // somewhere the person can read it and press the button again.
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24 * 2,
    updateAge: 60 * 60 * 24,
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 2,
  },
};
