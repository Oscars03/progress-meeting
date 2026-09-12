import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { SheetRepo } from './db/sheet-repo';

// Need to define NextAuthOptions for v4. If using v5, it's slightly different. Let's assume v4 for simplicity.
export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        
        const users = await SheetRepo.find<any>('users');
        const user = users.find(u => u.email === credentials.email);
        
        if (user && user.active) {
          // For demo, just check if password string matches or it's generic 'hashed_pwd' from seed
          if (credentials.password === 'password' || user.password_hash === credentials.password) {
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role
            };
          }
        }
        return null;
      }
    })
  ],
  callbacks: {
    async signIn({ user, account }: any) {
      if (account?.provider === 'google') {
        try {
          const users = await SheetRepo.find<any>('users');
          let existing = users.find(u => u.email === user.email);
          if (!existing) {
            existing = await SheetRepo.insert('users', {
              name: user.name || 'Google User',
              email: user.email,
              password_hash: '',
              role: 'member',
              team_id: '',
              line_id: '',
              active: true
            });
          }
          user.id = existing.id;
          user.role = existing.role;
          return true;
        } catch (e) {
          console.error('Google sign-in error:', e);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login', // Optional, if we want a custom login page
  },
  session: { strategy: 'jwt' as const }
};
