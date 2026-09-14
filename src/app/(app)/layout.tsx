import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AppNav from './app-nav';

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // h-dvh, not h-screen: on a phone or tablet 100vh is the height the page
  // would have with the browser toolbar hidden, so the bottom of the sidebar --
  // sign out -- sits underneath the toolbar and cannot be reached. dvh shrinks
  // with it.
  return (
    <div className="h-dvh flex flex-col md:flex-row bg-gray-50 text-gray-900 overflow-hidden">
      <AppNav userName={session.user?.name ?? ''} />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
