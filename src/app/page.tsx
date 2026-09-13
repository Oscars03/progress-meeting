import Link from 'next/link';
import { getT } from '@/lib/ui/server-i18n';

export default async function Home() {
  const t = await getT();
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold text-blue-600">{t('app.name')}</span>
            </div>
            <div>
              <Link
                href="/login"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                {t('login.title')}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center justify-center text-center">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl mb-4">
          {t('app.name')}
        </h1>
        <p className="max-w-xl mt-5 text-xl text-gray-500 mb-8">
          {t('app.tagline')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12 max-w-5xl mx-auto text-left">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Meetings</h3>
            <p className="text-gray-500">Plan and schedule weekly progress meetings with your team, seamlessly synced with Google Calendar.</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Tasks</h3>
            <p className="text-gray-500">Track action items, assign responsibilities, and monitor progress across all your projects.</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Reports</h3>
            <p className="text-gray-500">Generate comprehensive weekly summaries directly from the single source of truth in Google Sheets.</p>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-center space-x-6 text-sm text-gray-500">
          <Link href="/privacy" className="hover:text-gray-900">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-gray-900">Terms of Service</Link>
        </div>
      </footer>
    </div>
  );
}
