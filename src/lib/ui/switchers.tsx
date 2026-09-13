'use client';

import { LOCALES, type Locale } from './i18n';
import { usePrefs } from './prefs';

/**
 * Both controls share one frame so they line up at the same height. The emoji
 * the theme toggle used to show rendered taller than the text beside it and
 * differently on every OS, which is why the two never matched.
 *
 * Only utilities that globals.css remaps for dark mode are used here. A
 * `hover:text-gray-900`, for instance, is not on that list and would turn
 * text near-black on the dark surface.
 */
const FRAME = 'h-8 rounded-lg border border-gray-200';

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme, t } = usePrefs();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? t('theme.toDark') : t('theme.toLight');

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={label}
      aria-label={label}
      className={`${FRAME} w-8 inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 transition ${className}`}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export function LocaleSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = usePrefs();

  return (
    <div
      className={`${FRAME} inline-flex items-stretch gap-0.5 p-0.5 ${className}`}
      role="group"
      aria-label={t('locale.label')}
    >
      {LOCALES.map((code: Locale) => {
        const active = locale === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={active}
            className={`min-w-8 px-2 rounded-md text-xs transition ${
              active
                ? 'bg-gray-100 text-gray-900 font-semibold'
                : 'text-gray-500 font-medium hover:bg-gray-100'
            }`}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
