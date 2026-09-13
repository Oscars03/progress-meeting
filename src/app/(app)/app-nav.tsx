'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { ThemeToggle, LocaleSwitcher } from '@/lib/ui/switchers';
import type { TranslationKey } from '@/lib/ui/i18n';

type IconName = 'dashboard' | 'tasks' | 'meetings' | 'report' | 'settings';

const LINKS: { href: string; key: TranslationKey; icon: IconName }[] = [
  { href: '/dashboard', key: 'nav.dashboard', icon: 'dashboard' },
  { href: '/tasks', key: 'nav.tasks', icon: 'tasks' },
  { href: '/meetings', key: 'nav.meetings', icon: 'meetings' },
  { href: '/report', key: 'nav.report', icon: 'report' },
  { href: '/settings', key: 'nav.settings', icon: 'settings' },
];

function Icon({ d, children }: { d?: string; children?: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

function NavIcon({ name }: { name: IconName }) {
  switch (name) {
    case 'dashboard':
      return (
        <Icon>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </Icon>
      );
    case 'tasks':
      return <Icon d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />;
    case 'meetings':
      return (
        <Icon>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </Icon>
      );
    case 'report':
      return <Icon d="M3 20h18M7 16V9M12 16V5M17 16v-4" />;
    case 'settings':
      return (
        <Icon>
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
          <circle cx="16" cy="6" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </Icon>
      );
  }
}

/**
 * Collapse is driven by `data-sidebar` on <html>, not by React state, so the
 * width is right on the very first paint: the inline bootstrap script sets the
 * attribute before hydration, the same way the theme avoids a flash. The
 * `collapsed:` variant (globals.css) reads it. It only applies from `md` up --
 * on a phone the nav is a full-width bar and has nothing to collapse into.
 */
export default function AppNav({ userName }: { userName: string }) {
  const { t, sidebar, setSidebar } = usePrefs();
  const pathname = usePathname();
  const collapsed = sidebar === 'collapsed';
  const toggleLabel = collapsed ? t('nav.expand') : t('nav.collapse');

  return (
    <nav className="w-full md:w-64 md:collapsed:w-16 bg-white border-r border-gray-200 p-4 md:collapsed:px-3 flex flex-col gap-4 shadow-sm shrink-0 transition-[width] duration-200 motion-reduce:transition-none">
      <div className="space-y-2">
        {/* Expanded: the lab's text lockup carries the lab name. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a vector logo gains nothing from next/image optimisation */}
        <img
          src="/brand/irish-logo-text.svg"
          alt="IRiSH — Intelligent Robot and Industrial System Hub"
          width={200}
          height={100}
          className="brand-logo md:collapsed:hidden"
        />
        {/* Collapsed: a 40px rail has room for the mark alone. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a vector mark gains nothing from next/image optimisation */}
        <img
          src="/brand/irish-mark.svg"
          alt="IRiSH Lab"
          width={40}
          height={40}
          className="brand-logo hidden md:collapsed:block mx-auto"
        />
        <h1 className="text-lg font-bold leading-tight text-gray-900 md:collapsed:hidden">
          {t('app.name')}
        </h1>
      </div>

      <div className="flex items-center justify-end gap-1.5 md:collapsed:justify-center">
        {/* The language switch is wider than the collapsed rail; expand to change it. */}
        <LocaleSwitcher className="md:collapsed:hidden" />
        <ThemeToggle />
      </div>

      <div className="flex flex-col gap-1 mt-2">
        {LINKS.map(({ href, key, icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              title={t(key)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2 md:collapsed:justify-center md:collapsed:px-0 rounded-md font-medium transition ${
                active ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <NavIcon name={icon} />
              {/* sr-only rather than hidden, so the link keeps its name when collapsed. */}
              <span className="truncate md:collapsed:sr-only">{t(key)}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col gap-3 pt-4 border-t border-gray-200">
        <div className="md:collapsed:hidden">
          <p className="text-sm text-gray-500 truncate">{userName}</p>
        </div>

        <Link
          href="/api/auth/signout"
          title={t('nav.signOut')}
          className="flex items-center gap-3 px-3 py-2 md:collapsed:justify-center md:collapsed:px-0 rounded-md text-sm text-red-500 hover:bg-gray-100"
        >
          <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          <span className="md:collapsed:sr-only">{t('nav.signOut')}</span>
        </Link>

        <button
          type="button"
          onClick={() => setSidebar(collapsed ? 'expanded' : 'collapsed')}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="hidden md:flex items-center gap-3 px-3 py-2 md:collapsed:justify-center md:collapsed:px-0 rounded-md text-sm text-gray-500 hover:bg-gray-100"
        >
          <Icon d={collapsed ? 'M13 17l5-5-5-5M6 17l5-5-5-5' : 'M11 17l-5-5 5-5M18 17l-5-5 5-5'} />
          <span className="md:collapsed:sr-only">{toggleLabel}</span>
        </button>
      </div>
    </nav>
  );
}
