import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';

import en from '../locales/en';
import fr from '../locales/fr';
import {
  DEFAULT_LOCALE,
  Dictionary,
  LOCALE_STORAGE_KEY,
  Locale,
  detectLocale,
  directionFor,
  isTranslated,
  localeInfo,
  translate,
} from '../lib/i18n';

const DICTIONARIES: Record<Locale, Dictionary> = { en, fr };

interface I18nContextType {
  locale: Locale;
  setLocale: (next: Locale) => void;
  /** Resolve a key, falling back to English. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** True when the active locale actually carries this key. */
  has: (key: string) => boolean;
  /** BCP 47 tag for Intl date and number formatting. */
  intlLocale: string;
  dir: 'ltr' | 'rtl';
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function storedLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Private browsing and blocked storage both throw. A missing preference is
    // recoverable; a crashed provider takes the whole app with it.
    return null;
  }
}

function initialLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  return detectLocale(storedLocale(), navigator.languages ?? [navigator.language]);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // <html lang> is not decoration. Screen readers pick their pronunciation
  // rules from it, and search engines use it to decide who a page is for.
  // dir moves with it so that adding an RTL locale is a dictionary, not a
  // layout rewrite.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = directionFor(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session; it just will not persist.
    }
  }, []);

  const value = useMemo<I18nContextType>(() => {
    const dict = DICTIONARIES[locale] ?? en;
    return {
      locale,
      setLocale,
      t: (key, vars) => translate(dict, en, key, vars),
      has: (key) => isTranslated(dict, key),
      intlLocale: localeInfo(locale).intlLocale,
      dir: directionFor(locale),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Defaulting to English here would let a component silently render outside
    // the provider and only break once somebody switched language.
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}

/** Shorthand for the common case. */
export function useT() {
  return useI18n().t;
}
