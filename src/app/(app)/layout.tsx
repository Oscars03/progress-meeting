import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 text-gray-900">
      <nav className="w-full md:w-64 bg-white border-r border-gray-200 p-4 space-y-4 shadow-sm shrink-0">
        <h1 className="text-xl font-bold text-blue-600 mb-8">Weekly Progress</h1>
        
        <div className="flex flex-col space-y-2">
          <Link href="/dashboard" className="px-3 py-2 rounded-md hover:bg-gray-100 font-medium">ภาพรวม (Dashboard)</Link>
          <Link href="/tasks" className="px-3 py-2 rounded-md hover:bg-gray-100 font-medium">งาน (Tasks)</Link>
          <Link href="/meetings" className="px-3 py-2 rounded-md hover:bg-gray-100 font-medium">ปฏิทิน (Meetings)</Link>
          <Link href="/report" className="px-3 py-2 rounded-md hover:bg-gray-100 font-medium">รายงาน (Report)</Link>
          <Link href="/settings" className="px-3 py-2 rounded-md hover:bg-gray-100 font-medium">การตั้งค่า</Link>
        </div>

        <div className="pt-8 border-t border-gray-200 mt-auto">
          <p className="text-sm text-gray-500 truncate">{session.user?.name}</p>
          <Link href="/api/auth/signout" className="text-sm text-red-500 hover:underline">ออกจากระบบ</Link>
        </div>
      </nav>
      
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
