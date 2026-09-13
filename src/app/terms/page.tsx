import Link from 'next/link';
import { getT } from '@/lib/ui/server-i18n';

export default async function TermsOfService() {
  const t = await getT();
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="text-xl font-bold text-blue-600">
                {t('app.name')}
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white p-8 sm:p-12 rounded-lg shadow-sm border border-gray-100 prose max-w-none text-gray-700">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms of Service</h1>
          <p className="mb-6">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="mb-4">
              By accessing and using the Weekly Progress Meeting System (&quot;the Application&quot;), you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
            <p className="mb-4">
              The Application provides a platform for managing weekly progress meetings, tracking tasks, and integrating with Google Calendar and Google Sheets for academic or organizational use.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. User Conduct and Responsibilities</h2>
            <p className="mb-4">
              You are responsible for maintaining the confidentiality of your account and any activities that occur under your account. You agree to use the Application only for lawful purposes and in a way that does not infringe the rights of, restrict, or inhibit anyone else&apos;s use and enjoyment of the Application.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Privacy and Data Usage</h2>
            <p className="mb-4">
              Your use of the Application is also governed by our <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>, which details how we collect, use, and protect your data, including data obtained via Google APIs.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Modifications to Service</h2>
            <p className="mb-4">
              We reserve the right to modify or discontinue, temporarily or permanently, the Application (or any part thereof) with or without notice.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Limitation of Liability</h2>
            <p className="mb-4">
              In no event shall the developers, administrators, or associated institutions be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Application.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Contact Information</h2>
            <p>
              If you have any questions regarding these Terms of Service, please contact your system administrator.
            </p>
          </section>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-center space-x-6 text-sm text-gray-500">
          <Link href="/privacy" className="hover:text-gray-900">Privacy Policy</Link>
          <Link href="/terms" className="text-gray-900 font-medium">Terms of Service</Link>
        </div>
      </footer>
    </div>
  );
}
