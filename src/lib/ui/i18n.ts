/**
 * Minimal two-locale dictionary.
 *
 * A full i18n library is not worth its weight for two languages and a fixed
 * string set. Strings live in `messages/`, one file per surface, with Thai and
 * English side by side; `defineMessages` makes a key missing from either
 * language a compile error.
 */

import { common } from './messages/common';
import { avail } from './messages/avail';
import { tasks } from './messages/tasks';
import { meetings } from './messages/meetings';
import { polls } from './messages/polls';
import { settings } from './messages/settings';

export const LOCALES = ['th', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Read by the server to render in the visitor's language, written by the switcher. */
export const LOCALE_COOKIE = 'wpm.locale';

export const DICT = {
  th: { ...common.th, ...avail.th, ...tasks.th, ...meetings.th, ...polls.th, ...settings.th },
  en: { ...common.en, ...avail.en, ...tasks.en, ...meetings.en, ...polls.en, ...settings.en },
};

export type TranslationKey = keyof (typeof DICT)['th'];
export type TranslationVars = Record<string, string | number>;

export function translate(locale: Locale, key: TranslationKey, vars?: TranslationVars): string {
  const table = DICT[locale] as Record<string, string>;
  const raw = table[key as string] ?? (DICT.th as Record<string, string>)[key as string] ?? (key as string);
  if (!vars) return raw;
  return Object.entries(vars).reduce(
    (out, [name, value]) => out.replaceAll(`{${name}}`, String(value)),
    raw
  );
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** BCP 47 tag for Intl date formatting in each locale. */
export function intlLocale(locale: Locale): string {
  return locale === 'th' ? 'th-TH' : 'en-GB';
}
