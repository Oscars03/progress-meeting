'use client';

import { LOCALES, type Locale } from './i18n';
import { usePrefs } from './prefs';

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
      className={`p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition ${className}`}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
    </button>
  );
}

export function LocaleSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = usePrefs();

  return (
    <div
      className={`inline-flex rounded-lg border border-gray-200 overflow-hidden ${className}`}
      role="group"
      aria-label={t('locale.label')}
    >
      {LOCALES.map((code: Locale) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={`px-2 py-1 text-xs font-medium transition ${
            locale === code
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
