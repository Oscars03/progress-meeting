import Link from 'next/link';
import { getT } from '@/lib/ui/server-i18n';
import LoginClient from './login/login-client';
import { allowedSignupDomains } from '@/lib/signup-policy';
import { ThemeToggle, LocaleSwitcher } from '@/lib/ui/switchers';

export default async function Home() {
  const t = await getT();
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const signupDomains = allowedSignupDomains();
  
  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col relative">
      {/* Header */}
      <header className="w-full p-4 sm:p-6 lg:py-4 flex justify-between items-start z-10">
        {/* The brand column below carries the name, but it is hidden under lg,
            so on a phone the app would sit unnamed. The name rides beside the
            mark instead -- inside the existing header row, so nothing else on
            the page moves. */}
        <div className="flex items-center gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/irish-mark.png"
            alt="IRiSH Logo"
            className="brand-logo w-20 h-20 lg:w-[72px] lg:h-[72px] object-contain shrink-0"
          />
          <span className="lg:hidden min-w-0 text-lg sm:text-xl font-bold text-blue-600 leading-tight">
            {t('app.name')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-5 flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16">
        {/* Left Side: Brand & Description */}
        <div className="hidden lg:block lg:flex-1 text-center lg:text-left max-w-xl mb-8 lg:mb-0">
          <h1 className="text-4xl font-extrabold text-blue-600 sm:text-5xl sm:tracking-tight lg:text-5xl xl:text-6xl mb-3">
            {t('app.name')}
          </h1>
          <p className="text-xl xl:text-2xl text-gray-700 mb-4 font-medium leading-relaxed">
            {t('app.tagline')}
          </p>
          
          <div className="hidden lg:block space-y-4 mt-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-100 text-blue-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">{t('landing.meetings.title')}</h3>
                <p className="mt-1 text-base text-gray-500">{t('landing.meetings.desc')}</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-100 text-blue-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">{t('landing.tasks.title')}</h3>
                <p className="mt-1 text-base text-gray-500">{t('landing.tasks.desc')}</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-blue-100 text-blue-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">{t('landing.reports.title')}</h3>
                <p className="mt-1 text-base text-gray-500">{t('landing.reports.desc')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Login Box */}
        <div className="w-full max-w-md flex-shrink-0 mt-0">
           <LoginClient googleEnabled={googleEnabled} signupDomains={signupDomains} />
        </div>
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-1.5 sm:gap-6 text-sm text-gray-500">
          <p className="text-center">
            © {new Date().getFullYear()} IRiSH Lab, Suranaree University of Technology
          </p>
          <div className="flex justify-center space-x-6">
            <Link href="/privacy" className="hover:text-gray-900">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-900">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
