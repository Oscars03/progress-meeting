import { cookies } from 'next/headers';
import { isLocale, LOCALE_COOKIE, translate, type Locale, type TranslationKey, type TranslationVars } from './i18n';

/**
 * The visitor's language, for Server Components.
 *
 * It travels in a cookie rather than localStorage because the server renders
 * the page and never sees storage. Reading cookies makes a route dynamic, which
 * every page here already is: they read the session and the sheet per request.
 */
export async function getLocale(): Promise<Locale> {
  // `cookies()` throws where there is no request to read one from -- a server
  // action called from a test, or any other context outside the request. A
  // missing language is not a failure: it means the default, which is what a
  // first visit gets anyway. Nothing is granted by the answer, so falling
  // back can only ever be safe.
  try {
    const value = (await cookies()).get(LOCALE_COOKIE)?.value;
    return isLocale(value) ? value : 'th';
  } catch {
    return 'th';
  }
}

export async function getT() {
  const locale = await getLocale();
  return (key: TranslationKey, vars?: TranslationVars) => translate(locale, key, vars);
}
