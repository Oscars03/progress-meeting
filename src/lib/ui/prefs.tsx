'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  isLocale,
  LOCALE_COOKIE,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationVars,
} from './i18n';

export type Theme = 'light' | 'dark';
export type Sidebar = 'expanded' | 'collapsed';

const THEME_KEY = 'wpm.theme';
const LEGACY_LOCALE_KEY = 'wpm.locale';
const SIDEBAR_KEY = 'wpm.sidebar';
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Theme and sidebar state live outside React -- in localStorage, and on <html>
 * where the inline bootstrap script puts them before first paint. The locale
 * lives in a cookie so the server can render in it, and on <html lang>.
 * useSyncExternalStore is how React subscribes to that: getServerSnapshot
 * supplies the value the server rendered, and React swaps in the client value
 * after hydration without a mismatch. Reading it in an effect instead would
 * render twice on every load and trips react-hooks/set-state-in-effect.
 */
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Keep two tabs of the same app in step.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Storage can throw outright (blocked site data), not just come back empty. */
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice still applies to this visit; it just will not survive reload.
  }
}

function getThemeSnapshot(): Theme {
  const stored = readStorage(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  // Nothing stored: trust whatever the bootstrap script resolved from the
  // system preference, so this agrees with what is already on screen.
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** <html lang> is rendered from the cookie, so it is the page's own answer. */
function getLocaleSnapshot(): Locale {
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : 'th';
}

/**
 * Read from the attribute, not storage: the attribute is what the CSS collapses
 * on, so the button's state can never disagree with what is on screen.
 */
function getSidebarSnapshot(): Sidebar {
  return document.documentElement.dataset.sidebar === 'collapsed' ? 'collapsed' : 'expanded';
}

const serverTheme = (): Theme => 'light';
const serverSidebar = (): Sidebar => 'expanded';

type Prefs = {
  theme: Theme;
  locale: Locale;
  sidebar: Sidebar;
  setTheme: (t: Theme) => void;
  setLocale: (l: Locale) => void;
  setSidebar: (s: Sidebar) => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
};

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, serverTheme);
  const locale = useSyncExternalStore(subscribe, getLocaleSnapshot, () => initialLocale);
  const sidebar = useSyncExternalStore(subscribe, getSidebarSnapshot, serverSidebar);

  const setTheme = useCallback((next: Theme) => {
    writeStorage(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
    emit();
  }, []);

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
      document.documentElement.lang = next;
      emit();
      // Client components switch at once; this re-renders the server ones.
      router.refresh();
    },
    [router]
  );

  const setSidebar = useCallback((next: Sidebar) => {
    writeStorage(SIDEBAR_KEY, next);
    if (next === 'collapsed') {
      document.documentElement.dataset.sidebar = 'collapsed';
    } else {
      delete document.documentElement.dataset.sidebar;
    }
    emit();
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) => translate(locale, key, vars),
    [locale]
  );

  return (
    <PrefsContext.Provider
      value={{ theme, locale, sidebar, setTheme, setLocale, setSidebar, t }}
    >
      {children}
    </PrefsContext.Provider>
  );
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used inside PrefsProvider');
  return ctx;
}

/**
 * Applied before first paint so the page never flashes the wrong theme, or a
 * wide sidebar that then snaps narrow. Kept as a string because it has to run
 * inline, ahead of React.
 *
 * It also carries over a language chosen before the locale moved to a cookie:
 * the server has already rendered in Thai by then, so it sets the cookie and
 * reloads once -- only if the cookie actually stuck, or blocked cookies would
 * reload forever.
 */
export const THEME_BOOTSTRAP = `(function(){try{
var t=localStorage.getItem('${THEME_KEY}');
if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
document.documentElement.dataset.theme=t;
if(localStorage.getItem('${SIDEBAR_KEY}')==='collapsed'){document.documentElement.dataset.sidebar='collapsed';}
var l=localStorage.getItem('${LEGACY_LOCALE_KEY}');
if(l){localStorage.removeItem('${LEGACY_LOCALE_KEY}');
if(l==='en'&&document.cookie.indexOf('${LOCALE_COOKIE}=')===-1){document.cookie='${LOCALE_COOKIE}=en; path=/; max-age=${ONE_YEAR}; samesite=lax';
if(document.cookie.indexOf('${LOCALE_COOKIE}=en')!==-1){location.reload();}}}
}catch(e){document.documentElement.dataset.theme='light';}})();`;
