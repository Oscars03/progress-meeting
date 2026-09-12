'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { isLocale, translate, type Locale, type TranslationKey } from './i18n';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'wpm.theme';
const LOCALE_KEY = 'wpm.locale';

/**
 * Theme and locale live outside React -- in localStorage, and on <html> where
 * the inline bootstrap script puts them before first paint. useSyncExternalStore
 * is how React subscribes to that: getServerSnapshot supplies the value the
 * server rendered, and React swaps in the client value after hydration without
 * a mismatch. Reading it in an effect instead would render twice on every load
 * and trips react-hooks/set-state-in-effect.
 */
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Keep two tabs of the same app in step.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === LOCALE_KEY) listener();
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

function getLocaleSnapshot(): Locale {
  const stored = readStorage(LOCALE_KEY);
  return isLocale(stored) ? stored : 'th';
}

const serverTheme = (): Theme => 'light';
const serverLocale = (): Locale => 'th';

type Prefs = {
  theme: Theme;
  locale: Locale;
  setTheme: (t: Theme) => void;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, serverTheme);
  const locale = useSyncExternalStore(subscribe, getLocaleSnapshot, serverLocale);

  const setTheme = useCallback((next: Theme) => {
    writeStorage(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
    emit();
  }, []);

  const setLocale = useCallback((next: Locale) => {
    writeStorage(LOCALE_KEY, next);
    document.documentElement.lang = next;
    emit();
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale]
  );

  return (
    <PrefsContext.Provider value={{ theme, locale, setTheme, setLocale, t }}>
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
 * Applied before first paint so the page never flashes the wrong theme.
 * Kept as a string because it has to run inline, ahead of React.
 */
export const THEME_BOOTSTRAP = `(function(){try{
var t=localStorage.getItem('${THEME_KEY}');
if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
document.documentElement.dataset.theme=t;
var l=localStorage.getItem('${LOCALE_KEY}');
if(l==='th'||l==='en'){document.documentElement.lang=l;}
}catch(e){document.documentElement.dataset.theme='light';}})();`;
