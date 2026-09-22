'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { APP_VERSION, changesByDay } from '@/lib/changelog';
import { usePrefs } from '@/lib/ui/prefs';
import { ThemeToggle, LocaleSwitcher } from '@/lib/ui/switchers';
import type { TranslationKey } from '@/lib/ui/i18n';
import { settingsMenuOpen, type MenuToggle } from '@/lib/ui/settings-menu';

type IconName = 'dashboard' | 'tasks' | 'meetings' | 'presentations' | 'report' | 'feedback' | 'settings';

/**
 * Tasks and Report are not part of the current workflow, so they are off the
 * menu. The pages still exist and still work if their URL is opened directly --
 * this hides them rather than deleting work that may come back.
 */
const LINKS: { href: string; key: TranslationKey; icon: IconName }[] = [
  { href: '/dashboard', key: 'nav.dashboard', icon: 'dashboard' },
  { href: '/tasks', key: 'nav.tasks', icon: 'tasks' },
  { href: '/meetings', key: 'nav.meetings', icon: 'meetings' },
  { href: '/presentations', key: 'nav.presentations', icon: 'presentations' },
  { href: '/feedback', key: 'nav.feedback', icon: 'feedback' },
  { href: '/settings', key: 'nav.settings', icon: 'settings' },
];

/**
 * Settings is five pages, listed under it in the menu. Lab and Users are the
 * admin's; everybody else sees three. Shown to a *real* admin even while they
 * preview another role, because Users holds the control that ends a preview.
 */
const SETTINGS_PAGES: { href: string; key: TranslationKey; adminOnly: boolean }[] = [
  { href: '/settings/account', key: 'nav.settings.account', adminOnly: false },
  { href: '/settings/widget', key: 'nav.settings.widget', adminOnly: false },
  { href: '/settings/lab', key: 'nav.settings.lab', adminOnly: true },
  { href: '/settings/users', key: 'nav.settings.users', adminOnly: true },
  { href: '/settings/system', key: 'nav.settings.system', adminOnly: false },
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
    case 'presentations':
      return <Icon d="M4 6h6M4 12h10M4 18h7M17 5l3 3-3 3" />;
    case 'report':
      return <Icon d="M3 20h18M7 16V9M12 16V5M17 16v-4" />;
    case 'feedback':
      return <Icon d="M21 12a8 8 0 01-8 8H8l-4 3v-5.5A8 8 0 1121 12z" />;
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
 * The system name on two lines, breaking before its last word:
 * "Weekly Progress" / "Meeting". A single-word name stays on one line.
 */
function splitName(name: string): [string, string | null] {
  const cut = name.lastIndexOf(' ');
  return cut === -1 ? [name, null] : [name.slice(0, cut), name.slice(cut + 1)];
}

/**
 * Collapse is driven by `data-sidebar` on <html>, not by React state, so the
 * width is right on the very first paint: the inline bootstrap script sets the
 * attribute before hydration, the same way the theme avoids a flash. The
 * `collapsed:` variant (globals.css) reads it. It only applies from `md` up --
 * on a phone the nav is a full-width bar and has nothing to collapse into.
 */
export default function AppNav({ userName, isAdmin }: { userName: string; isAdmin: boolean }) {
  const { t, locale, sidebar, setSidebar } = usePrefs();
  const pathname = usePathname();
  // Open on every Settings page, closed elsewhere; the arrow overrides that
  // for the page it is pressed on -- see lib/ui/settings-menu.ts.
  const [settingsToggle, setSettingsToggle] = useState<MenuToggle>(null);
  const settingsOpen = settingsMenuOpen(pathname, settingsToggle);
  const settingsPages = SETTINGS_PAGES.filter((page) => isAdmin || !page.adminOnly);
  const collapsed = sidebar === 'collapsed';
  const toggleLabel = collapsed ? t('nav.expand') : t('nav.collapse');
  const [nameLine1, nameLine2] = splitName(t('app.name'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between bg-white border-b border-gray-200 p-4 shrink-0 z-30">
        {/* The name is the way back to the dashboard, the way a site's logo
            usually is. */}
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0 rounded-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/irish-mark.svg"
            alt=""
            aria-hidden="true"
            width={32}
            height={32}
            className="brand-logo w-8 h-8 shrink-0"
          />
          <h1 className="font-bold text-gray-900 truncate max-w-[200px]">
            {t('app.name')}
          </h1>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-md"
          aria-label={t('nav.expand')}
        >
          <Icon d="M4 6h16M4 12h16M4 18h16" />
        </button>
      </div>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-gray-900/50 z-40 md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* md:w-max: the expanded rail is exactly as wide as its widest content --
          today the header -- with no fixed width to leave slack beside short
          menu labels. Collapsed overrides it with a fixed 64px rail. */}
      <nav className={`fixed inset-y-0 left-0 z-50 w-72 h-dvh md:h-auto overflow-hidden bg-white border-r border-gray-200 p-4 flex flex-col gap-4 shadow-sm transition-transform duration-300 motion-reduce:transition-none md:relative md:translate-x-0 md:w-max md:shrink-0 md:collapsed:w-16 md:collapsed:px-3 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Mobile close button */}
        <div className="md:hidden absolute top-4 right-4">
          <button
            type="button"
            onClick={closeMobileMenu}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-md"
            aria-label={t('nav.collapse')}
          >
            <Icon d="M6 18L18 6M6 6l12 12" />
          </button>
        </div>

        {/* Expanded: the mark is exactly as tall as the two lines of the name.
            It inherits text-lg from the grid, so h-[2lh] is two of the name's
            line heights -- equal by construction, not by a pixel value. */}
        {/* pr-9 below md keeps the two-line name clear of the close button,
            which is positioned over this row. */}
        <Link
          href="/dashboard"
          onClick={closeMobileMenu}
          className="grid grid-cols-[auto_auto] items-center gap-x-2 text-lg pr-9 md:pr-0 md:collapsed:hidden rounded-md"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a vector mark gains nothing from next/image optimisation */}
          <img
            src="/brand/irish-mark.svg"
            alt=""
            aria-hidden="true"
            width={56}
            height={56}
            className="brand-logo h-[2lh] w-auto"
          />
          <h1 className="font-bold text-gray-900 whitespace-nowrap">
            {nameLine1}
            {nameLine2 && (
              <>
                <br />
                {nameLine2}
              </>
            )}
          </h1>
          {/* No `uppercase`: it turns the lab's own "IRiSH" into "IRISH". */}
          <p className="col-start-2 text-xs font-semibold tracking-[0.14em] text-blue-600">
            IRiSH Lab
          </p>
        </Link>

        {/* Collapsed: a 40px rail has room for the mark alone. */}
        <Link href="/dashboard" className="hidden md:collapsed:block mx-auto">
          {/* eslint-disable-next-line @next/next/no-img-element -- a vector mark gains nothing from next/image optimisation */}
          <img
            src="/brand/irish-mark.svg"
            alt="IRiSH Lab"
            width={40}
            height={40}
            className="brand-logo"
          />
        </Link>

        {/* Controls row. The collapse toggle lives up here, in the same 32px
            frame as the theme toggle. justify-end below md: the toggle is hidden
            there, and justify-between would leave the remaining controls stranded
            on the left. When collapsed the row stacks to fit the 40px rail. */}
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

        {/* The links are the only part that scrolls.

            The rail is the height of the screen everywhere, but its contents
            are about 600px, so on a short one -- a phone held sideways, a
            small laptop -- the whole rail used to scroll and the version and
            sign-out fell off the bottom with nothing to say they were there.
            The header and the footer hold their size now and the middle
            gives way, so the bottom of the rail is the bottom of the screen
            on every device.

            min-h-0: a flex child will not shrink below its content without
            it, which would push the footer off again. */}
        <div className="flex min-h-0 flex-1 flex-col gap-1 mt-2 overflow-y-auto">
          {LINKS.map(({ href, key, icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            const tone = active ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100';

            if (href !== '/settings') {
              return (
                <Link
                  key={href}
                  href={href}
                  title={t(key)}
                  aria-current={active ? 'page' : undefined}
                  onClick={closeMobileMenu}
                  className={`flex items-center gap-3 px-3 py-2 md:collapsed:justify-center md:collapsed:px-0 rounded-md font-medium transition ${tone}`}
                >
                  <NavIcon name={icon} />
                  {/* sr-only rather than hidden, so the link keeps its name when collapsed. */}
                  <span className="whitespace-nowrap md:collapsed:sr-only">{t(key)}</span>
                </Link>
              );
            }

            // Settings: one row -- the link and, inside the same highlight, an
            // arrow for its pages -- with the pages indented under it. Pressing
            // the link always opens them. Collapsed to icons there is no room,
            // so the icon just goes to Settings' first page.
            return (
              <div key={href} className="flex flex-col gap-0.5">
                <div className={`flex items-center rounded-md transition ${tone}`}>
                  <Link
                    href={href}
                    title={t(key)}
                    onClick={() => {
                      setSettingsToggle(null);
                      closeMobileMenu();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 md:collapsed:justify-center md:collapsed:px-0 font-medium"
                  >
                    <NavIcon name={icon} />
                    <span className="whitespace-nowrap md:collapsed:sr-only">{t(key)}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSettingsToggle({ path: pathname, open: !settingsOpen })}
                    aria-expanded={settingsOpen}
                    aria-controls="settings-pages"
                    aria-label={t('nav.settings.toggle')}
                    title={t('nav.settings.toggle')}
                    className="md:collapsed:hidden mr-1 h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md opacity-70 hover:opacity-100 transition"
                  >
                    <Icon d="M6 9l6 6 6-6" className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {settingsOpen && (
                  <div id="settings-pages" className="md:collapsed:hidden ml-5 pl-3 border-l border-gray-200 flex flex-col gap-0.5">
                    {settingsPages.map((page) => {
                      const here = pathname === page.href || pathname.startsWith(page.href + '/');
                      return (
                        <Link
                          key={page.href}
                          href={page.href}
                          aria-current={here ? 'page' : undefined}
                          onClick={closeMobileMenu}
                          className={`px-3 py-1.5 rounded-md text-sm transition ${
                            here ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {t(page.key)}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Above the rule, with the app rather than with the person: what
            version this is belongs to the thing, not to whoever is signed in.

            The lab finds out what is new by noticing it, so a change that
            moves a familiar button reads as a fault until somebody explains
            it. This is the explanation, one line per change. */}
        <button
          type="button"
          onClick={() => {
            closeMobileMenu();
            setWhatsNewOpen(true);
          }}
          title={t('nav.whatsNew')}
          className="shrink-0 flex items-center gap-3 px-3 py-2 md:collapsed:justify-center md:collapsed:px-0 rounded-md text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
        >
          <Icon
            className="h-4 w-4"
            d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
          />
          <span className="whitespace-nowrap md:collapsed:sr-only">
            {t('nav.version', { version: APP_VERSION })}
          </span>
        </button>

        <div className="shrink-0 flex flex-col gap-3 pt-4 border-t border-gray-200">
          <div className="md:collapsed:hidden">
            {/* w-0 min-w-full: contributes nothing to the rail's max-content
                width, then fills whatever width the rail settles on. A long
                user name truncates instead of widening the sidebar. */}
            <p className="w-0 min-w-full text-sm text-gray-500 truncate">{userName}</p>
          </div>

          {/* A button, not a link to /api/auth/signout: that route renders
              NextAuth's own unstyled page, in English, outside the app's
              theme. Confirming in place keeps both. */}
          <button
            type="button"
            title={t('nav.signOut')}
            onClick={() => {
              closeMobileMenu();
              setSignOutOpen(true);
            }}
            className="flex items-center gap-3 px-3 py-2 md:collapsed:justify-center md:collapsed:px-0 rounded-md text-sm text-red-500 hover:bg-gray-100"
          >
            <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            <span className="whitespace-nowrap md:collapsed:sr-only">{t('nav.signOut')}</span>
          </button>
        </div>
      </nav>

      {whatsNewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.whatsNew')}
          onClick={(e) => {
            if (e.target === e.currentTarget) setWhatsNewOpen(false);
          }}
        >
          <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4">
              <div>
                <h3 className="font-semibold text-gray-900">{t('nav.whatsNew')}</h3>
                <p className="text-xs text-gray-500">
                  {t('nav.version', { version: APP_VERSION })} · {t('nav.whatsNewHint')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWhatsNewOpen(false)}
                aria-label={t('avail.close')}
                className="h-8 w-8 shrink-0 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4 text-sm">
              {changesByDay().map((day, dayIndex) => (
                <details
                  key={day.date}
                  open={dayIndex === 0}
                  className="rounded-lg border border-gray-100"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-gray-50">
                    <span className="tabular-nums text-gray-700">{day.date}</span>
                    <span className="text-xs text-gray-400">
                      {t('nav.changeCount', { count: String(day.entries.length) })}
                    </span>
                  </summary>
                  <ul className="space-y-3 px-3 pb-3 pt-1">
                    {day.entries.map((entry, index) => (
                      <li key={`${entry.date}-${index}`} className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
                            entry.kind === 'new'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {t(entry.kind === 'new' ? 'nav.changeNew' : 'nav.changeFix')}
                        </span>
                        <span className="min-w-0 text-gray-800">
                          {locale === 'en' ? entry.en : entry.th}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}

      {signOutOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-title"
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 sm:p-6 space-y-4">
            <h2 id="signout-title" className="text-lg font-semibold text-gray-900">
              {t('signout.title')}
            </h2>
            <p className="text-sm text-gray-600">{t('signout.body')}</p>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setSignOutOpen(false)}
                disabled={signingOut}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setSigningOut(true);
                  signOut({ callbackUrl: '/' });
                }}
                disabled={signingOut}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {signingOut ? t('signout.working') : t('nav.signOut')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
