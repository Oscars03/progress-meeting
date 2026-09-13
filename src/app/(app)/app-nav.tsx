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

function Icon({
  d,
  children,
  className = 'h-5 w-5',
}: {
  d?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
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
    // w-72 when expanded: the mark, a gap and the system name share one row,
    // and at 18px the name alone is ~213px -- more than the 223px a w-64 rail
    // leaves once the mark sits beside it.
    <nav className="w-full md:w-72 md:collapsed:w-16 bg-white border-r border-gray-200 p-4 md:collapsed:px-3 flex flex-col gap-4 shadow-sm shrink-0 transition-[width] duration-200 motion-reduce:transition-none">
      {/* Expanded: the mark is exactly as tall as the name's line. Both inherit
          text-lg from the grid, so h-[1lh] on the image resolves to the same
          line height the h1 uses -- equal by construction, not by a magic number. */}
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 text-lg md:collapsed:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- a vector mark gains nothing from next/image optimisation */}
        <img
          src="/brand/irish-mark.svg"
          alt=""
          aria-hidden="true"
          width={28}
          height={28}
          className="brand-logo h-[1lh] w-auto"
        />
        <h1 className="font-bold text-gray-900 whitespace-nowrap">{t('app.name')}</h1>
        {/* No `uppercase`: it turns the lab's own "IRiSH" into "IRISH". */}
        <p className="col-start-2 text-xs font-semibold tracking-[0.14em] text-blue-600">
          IRiSH Lab
        </p>
      </div>

      {/* Collapsed: a 40px rail has room for the mark alone. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- a vector mark gains nothing from next/image optimisation */}
      <img
        src="/brand/irish-mark.svg"
        alt="IRiSH Lab"
        width={40}
        height={40}
        className="brand-logo hidden md:collapsed:block mx-auto"
      />

      {/* Controls row. The collapse toggle lives up here, not at the foot of
          the rail, where it sat under the Next dev badge and was the last thing
          anyone looked at. It uses the same 32px frame as the theme toggle.
          justify-end below md: the toggle is hidden there, and justify-between
          would leave the remaining controls stranded on the left. When
          collapsed the row stacks vertically to fit the 40px rail. */}
      <div className="flex items-center justify-end md:justify-between gap-1.5 md:collapsed:flex-col md:collapsed:justify-center md:collapsed:gap-2">
        <button
          type="button"
          onClick={() => setSidebar(collapsed ? 'expanded' : 'collapsed')}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="hidden md:inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition"
        >
          <Icon
            className="h-4 w-4"
            d={collapsed ? 'M13 17l5-5-5-5M6 17l5-5-5-5' : 'M11 17l-5-5 5-5M18 17l-5-5 5-5'}
          />
        </button>
        <div className="flex items-center gap-1.5 md:collapsed:flex-col md:collapsed:gap-2">
          {/* The language switch is wider than the collapsed rail; expand to change it. */}
          <LocaleSwitcher className="md:collapsed:hidden" />
          <ThemeToggle />
        </div>
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
      </div>
    </nav>
  );
}
