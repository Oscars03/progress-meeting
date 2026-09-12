import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AppNav from './app-nav';

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 text-gray-900">
      <AppNav userName={session.user?.name ?? ''} />

      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
