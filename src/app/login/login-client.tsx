'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import Spinner from '@/lib/ui/spinner';
import { useRouter, useSearchParams } from 'next/navigation';
import { registerAction } from './actions';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';
import { usePrefs } from '@/lib/ui/prefs';
import type { TranslationKey } from '@/lib/ui/i18n';

/** NextAuth's ?error= codes, including the ones our signIn callback returns. */
const SIGNIN_ERRORS: Record<string, TranslationKey> = {
  AccessDenied: 'login.accessDenied',
  PendingApproval: 'login.pendingApproval',
  AccountInactive: 'login.accountInactive',
};

function LoginForm({
  googleEnabled,
  signupDomains,
}: {
  googleEnabled: boolean;
  signupDomains: string[];
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const urlError = searchParams.get('error');
  // Kept as a key, not text, so it follows a language switch on this page.
  const urlErrorKey: TranslationKey | null = urlError
    ? (SIGNIN_ERRORS[urlError] ?? 'login.signInFailed')
    : null;

  // Signing up is not failing. The account was created; it is waiting. Shown in
  // red beside a sign-in form, that reads as "something went wrong, try again"
  // -- so people tried again, which is the one thing that cannot help.
  const waiting = urlError === 'PendingApproval';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(urlErrorKey && !waiting ? t(urlErrorKey) : '');
  const [loading, setLoading] = useState(false);
  // Google sends the browser away, so this never resets -- which is the point:
  // the button stays spent while the redirect is on its way.
  const [googleLoading, setGoogleLoading] = useState(false);
  const busy = loading || googleLoading;
  const signupEnabled = signupDomains.length > 0;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [notice, setNotice] = useState(waiting && urlErrorKey ? t(urlErrorKey) : '');

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
    setNotice('');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const res = await registerAction({
        name: regName,
        email: regEmail,
        password: regPassword,
      });
      if (res.ok) {
        setNotice(t(res.notice));
        setRegName('');
        setRegEmail('');
        setRegPassword('');
      } else {
        setError(t(res.error, res.vars));
      }
    } catch {
      setError(t('register.failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (res?.error) {
        setError(t('login.failed'));
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError(t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    // Sized to fit one screen without scrolling: the switchers sit in the
    // card's corner instead of taking a row, and vertical rhythm is 16px.
    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6 space-y-4">
      {/* Switchers moved to nav bar */}
      <div className="text-center pt-2 pb-2">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          {mode === 'login' ? t('login.title') : t('register.title')}
        </h1>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Amber, not green: the account exists but cannot be used yet, and green
          reads as "done". Both routes here -- registering, and a first Google
          sign-in -- end in the same wait, so both say what to do next: nothing. */}
      {notice && (
        <div
          className="p-3 text-sm bg-amber-50 rounded-lg border border-amber-200 space-y-1"
          role="status"
        >
          <p className="text-amber-900 font-medium">{notice}</p>
          <p className="text-amber-800">{t('login.pendingNothingToDo')}</p>
        </div>
      )}

      {mode === 'login' && (
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('login.email')}
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@test.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('login.password')}
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && <Spinner />}
          {loading ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
      )}

      {mode === 'register' && (
      <form onSubmit={handleRegister} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="reg-name">
            {t('register.name')}
          </label>
          <input
            id="reg-name"
            type="text"
            required
            value={regName}
            onChange={(e) => setRegName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="reg-email">
            {t('login.email')}
          </label>
          <input
            id="reg-email"
            type="email"
            required
            value={regEmail}
            onChange={(e) => setRegEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-900"
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('register.domainHint')}{' '}
            <span className="font-mono">{signupDomains.join(', ')}</span>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="reg-password">
            {t('login.password')}
          </label>
          <input
            id="reg-password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={regPassword}
            onChange={(e) => setRegPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-900"
          />
          <p className="mt-1 text-xs text-gray-500">
            {t('register.passwordHint', { n: MIN_PASSWORD_LENGTH })}
          </p>
        </div>

        <p className="text-xs text-gray-500">
          {t('register.approvalNote')}
        </p>

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading && <Spinner />}
          {loading ? t('register.submitting') : t('register.submit')}
        </button>
      </form>
      )}

      {signupEnabled && (
        <p className="text-center text-sm text-gray-600">
          {mode === 'login' ? t('login.noAccount') + ' ' : t('login.hasAccount') + ' '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-blue-600 hover:text-blue-800 font-medium hover:underline"
          >
            {mode === 'login' ? t('register.submit') : t('login.submit')}
          </button>
        </p>
      )}

      {googleEnabled && mode === 'login' && (
        <>
        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-gray-200"></div>
          <span className="flex-shrink mx-3 text-gray-400 text-xs">{t('login.or')}</span>
          <div className="flex-grow border-t border-gray-200"></div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setNotice('');
            setGoogleLoading(true);
            signIn('google', { callbackUrl });
          }}
          className="w-full flex items-center justify-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <Spinner />
          ) : (
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          )}
          {googleLoading ? t('login.submitting') : t('login.google')}
        </button>
        </>
      )}

      {process.env.NEXT_PUBLIC_SHOW_DEV_TOOLS === 'true' && (
        <div className="pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-2">
          <p className="font-semibold text-gray-700">
            {t('login.devTitle')} <code>SEED_PASSWORD</code>
          </p>
          <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 space-y-1">
            <p>• {t('login.devAdmin')}: <code className="text-blue-600 font-mono">admin@test.com</code></p>
            <p>• {t('login.devManager')}: <code className="text-blue-600 font-mono">prof1@test.com</code></p>
            <p>• {t('login.devStudent')}: <code className="text-blue-600 font-mono">student1@test.com</code></p>
          </div>
          <p className="text-gray-400">{t('login.devInitMoved')}</p>
        </div>
      )}

      {/* Brand logo at the bottom */}
      {/* From lg up the brand column beside this card already carries the mark,
          the name and the tagline, so a third copy inside the card is only
          height -- and it was the 104px that pushed the page past a laptop
          screen. Below lg that column is hidden, and this is the branding. */}
      <div className="flex lg:hidden pt-6 mt-4 justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/irish-logo-text.png"
          alt="IRiSH"
          className="brand-logo h-20 w-auto opacity-80 object-contain"
        />
      </div>
    </div>
  );
}

export default function LoginClient({
  googleEnabled,
  signupDomains,
}: {
  googleEnabled: boolean;
  signupDomains: string[];
}) {
  const { t } = usePrefs();
  return (
    <Suspense fallback={<div className="text-gray-500 text-sm">{t('common.loading')}</div>}>
      <LoginForm googleEnabled={googleEnabled} signupDomains={signupDomains} />
    </Suspense>
  );
}
