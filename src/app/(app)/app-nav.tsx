'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { ThemeToggle, LocaleSwitcher } from '@/lib/ui/switchers';
import type { TranslationKey } from '@/lib/ui/i18n';

const LINKS: { href: string; key: TranslationKey }[] = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/tasks', key: 'nav.tasks' },
  { href: '/meetings', key: 'nav.meetings' },
  { href: '/report', key: 'nav.report' },
  { href: '/settings', key: 'nav.settings' },
];

export default function AppNav({ userName }: { userName: string }) {
  const { t } = usePrefs();
  const pathname = usePathname();

  return (
    <nav className="w-full md:w-64 bg-white border-r border-gray-200 p-4 flex flex-col gap-4 shadow-sm shrink-0">
      {/* Name gets the full width of the rail. Sharing the row with the
          language and theme controls squeezed it into a truncated fragment. */}
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- a vector mark gains nothing from next/image optimisation */}
        <img
          src="/brand/irish-mark.svg"
          alt="IRiSH Lab"
          width={44}
          height={44}
          className="brand-logo shrink-0"
        />
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight text-gray-900">{t('app.name')}</h1>
          {/* No `uppercase`: it turns the lab's own "IRiSH" into "IRISH". */}
          <p className="text-xs font-semibold tracking-[0.14em] text-blue-600">IRiSH Lab</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>

      <div className="flex flex-col space-y-1 mt-4">
        {LINKS.map(({ href, key }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`px-3 py-2 rounded-md font-medium transition ${
                active
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {t(key)}
            </Link>
          );
        })}
      </div>

      <div className="pt-6 border-t border-gray-200 mt-auto">
        <p className="text-sm text-gray-500 truncate">{userName}</p>
        <Link href="/api/auth/signout" className="text-sm text-red-500 hover:underline">
          {t('nav.signOut')}
        </Link>
      </div>
    </nav>
  );
}
