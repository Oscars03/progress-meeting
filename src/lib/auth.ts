import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { SheetRepo } from './db/sheet-repo';
import { verifyPassword } from './password';
import { allowedSignupDomains, normalizeEmail } from './signup-policy';
import type { UserRecord } from './db/schema';

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
      if (!user || user.active !== true) return null;

      // Fails closed for legacy plaintext rows -- see npm run db:migrate-passwords.
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) return null;

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
          // An account an admin has deactivated must not sign in through Google.
          if (existing.active !== true) return '/login?error=AccountInactive';
          user.id = existing.id;
          user.role = existing.role;
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
            role: 'member',
            team_id: '',
            line_id: '',
            active: false,
          },
          'google-signup'
        );

        return '/login?error=PendingApproval';
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
  session: { strategy: 'jwt' },
};
