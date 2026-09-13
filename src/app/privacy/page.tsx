import Link from 'next/link';
import { getT } from '@/lib/ui/server-i18n';

export default async function PrivacyPolicy() {
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
        <div className="bg-white p-5 sm:p-12 rounded-lg shadow-sm border border-gray-100 prose max-w-none text-gray-700">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
          <p className="mb-6">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Information We Collect</h2>
            <p className="mb-4">
              When you use IRiSH Progress Meeting, we may collect the following types of information:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Account Information:</strong> Your name, email address, and profile picture (retrieved via Google OAuth).</li>
              <li><strong>Google Calendar Data:</strong> We request access to your Google Calendar to manage, schedule, and sync progress meetings.</li>
              <li><strong>Application Data:</strong> Tasks, meeting notes, polls, and reports you generate within the application.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. How We Use Your Information</h2>
            <p className="mb-4">We use the collected information to:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Provide and maintain the application services.</li>
              <li>Schedule, modify, and track weekly progress meetings on your Google Calendar.</li>
              <li>Authenticate your account and manage permissions (e.g., student, advisor, administrator).</li>
              <li>Generate weekly summary reports stored in designated Google Sheets.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Google API Services User Data Policy Compliance</h2>
            <p className="mb-4">
              IRiSH Progress Meeting&apos;s use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
            </p>
            <p className="mb-4">
              Specifically:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>We will only use access to Google Calendar API to read and write meeting schedules on your behalf.</li>
              <li>We will not transfer or sell this data to third parties for advertising or any other purpose outside of providing the core features of this application.</li>
              <li>We will not use this data for serving advertisements.</li>
              <li>We will not allow humans to read this data unless we have your affirmative agreement for specific messages, doing so is necessary for security purposes such as investigating abuse, to comply with applicable law, or for the App&apos;s internal operations and even then only when the data have been aggregated and anonymized.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Data Storage and Security</h2>
            <p className="mb-4">
              We implement reasonable security measures to protect your information. Your application data (tasks, meeting metadata) is stored securely within our database, and report summaries are stored in Google Sheets accessible only to authorized administrators and team members.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Data Retention and Deletion</h2>
            <p className="mb-4">
              We retain your data for as long as your account is active. You may request the deletion of your account and associated data by contacting your administrator. Note that some data, such as historical meeting summaries, may be retained in administrative reports even after account deletion.
            </p>
            <p className="mb-4">
              You can revoke the application&apos;s access to your Google Account at any time via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google Account Settings</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Changes to This Privacy Policy</h2>
            <p className="mb-4">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or our data practices, please contact the system administrator or the IRiSH Lab team.
            </p>
          </section>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-center space-x-6 text-sm text-gray-500">
          <Link href="/privacy" className="text-gray-900 font-medium">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-gray-900">Terms of Service</Link>
        </div>
      </footer>
    </div>
  );
}
