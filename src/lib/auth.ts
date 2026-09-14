import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { SheetRepo } from './db/sheet-repo';
import { verifyPassword } from './password';
import { allowedSignupDomains, normalizeEmail } from './signup-policy';
import { storeRefreshToken } from './google/tokens';
import { IDENTITY_SCOPES } from './google/scopes';
import type { UserRecord } from './db/schema';
import { PENDING_APPROVAL } from './auth-signals';

async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const users = await SheetRepo.find<UserRecord>('users');
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

      const user = await findUserByEmail(email);
      if (!user) return null;

      // Fails closed for legacy plaintext rows -- see npm run db:migrate-passwords.
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) return null;

      // Checked *after* the password, deliberately. "Waiting for approval" is
      // told only to somebody who already proved the account is theirs, so it
      // reveals nothing a stranger could use to find out who has registered.
      if (user.active !== true) throw new Error(PENDING_APPROVAL);

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
          if (existing.active !== true) return '/?pending=1';
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
            console.error('Could not store Google refresh token:', e);
          }

          return true;
        }

        const domain = email.split('@')[1] ?? '';
        if (!allowedSignupDomains().includes(domain)) {
          return '/login?error=AccessDenied';
        }

        // Self-registration lands inactive; an admin must approve before login.
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
          'google-signup'
        );

        return '/?pending=1';
      } catch (e) {
        console.error('Google sign-in error:', e);
        return false;
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
  pages: {
    signIn: '/login',
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
