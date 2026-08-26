// Language support.
//
// NowOpen already speaks twelve currencies and resolves each business's own
// timezone, but every word on it was English — on a platform whose supported
// currency list includes the West African CFA (Senegal, Côte d'Ivoire and six
// more) and the Moroccan dirham. A business owner in Dakar could be billed in
// their own currency and still not read the page offering it.
//
// THE RULE THAT SHAPES THIS FILE: a missing translation renders English, never
// a blank and never a raw key. That is what makes it safe to translate the
// platform one surface at a time instead of holding 247 components hostage to
// a big-bang release. It also means adding a locale is additive — a partial
// dictionary is a valid dictionary.
//
// What is NOT here on purpose: machine translation. A dictionary entry is a
// promise that a person can read the sentence; generating one automatically
// breaks that promise in the language we can least afford to be sloppy in.

/** Locales with a dictionary in src/locales. */
export type Locale = 'en' | 'fr';

export interface LocaleInfo {
  code: Locale;
  /** English name, for documentation and admin surfaces. */
  name: string;
  /** The language's name in itself — what a speaker looks for in a menu. */
  endonym: string;
  dir: 'ltr' | 'rtl';
  /** BCP 47 tag used for Intl date and number formatting. */
  intlLocale: string;
}

export const LOCALES: LocaleInfo[] = [
  { code: 'en', name: 'English', endonym: 'English', dir: 'ltr', intlLocale: 'en-GB' },
  { code: 'fr', name: 'French', endonym: 'Français', dir: 'ltr', intlLocale: 'fr-FR' },
];

export const DEFAULT_LOCALE: Locale = 'en';

/** Where an explicit choice is remembered. */
export const LOCALE_STORAGE_KEY = 'nowopen.locale';

/**
 * Scripts written right to left.
 *
 * Empty of shipped locales today, and deliberately still here: Arabic is the
 * first language of North Africa, so `dir` is wired through the provider now
 * rather than being retrofitted through every layout later — retrofitting RTL
 * is the expensive version of this work.
 */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

export function localeInfo(code: string): LocaleInfo {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[0];
}

export function directionFor(code: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(code.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr';
}

/**
 * Which locale to show.
 *
 * An explicit choice always wins — someone who picked English on a French
 * laptop meant it, and having the browser overrule them on the next visit is
 * the single most irritating thing an i18n layer can do.
 *
 * Otherwise the browser's ordered preferences decide. Region is dropped
 * ("fr-CI" and "fr-SN" both mean French) because we serve languages, not
 * countries — country is already handled by the currency layer.
 */
export function detectLocale(
  stored: string | null | undefined,
  preferences: readonly string[] = [],
): Locale {
  const supported = new Set<string>(LOCALES.map((l) => l.code));

  if (stored && supported.has(stored)) return stored as Locale;

  for (const pref of preferences) {
    const base = pref.split('-')[0].toLowerCase();
    if (supported.has(base)) return base as Locale;
  }

  return DEFAULT_LOCALE;
}

/** A flat dictionary. Flat, not nested, so a missing key is a one-line diff. */
export type Dictionary = Readonly<Record<string, string>>;

/**
 * Resolve one key.
 *
 * Returns the key itself only if it is absent from BOTH the active locale and
 * English, which means the key is misspelled — a visible bug rather than a
 * silent blank, because a blank button ships and nobody notices.
 */
export function translate(
  dict: Dictionary,
  fallback: Dictionary,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw = dict[key] ?? fallback[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Is this string actually translated, or is it English showing through?
 *
 * The answer drives a `lang` attribute. A screen reader set to French will
 * pronounce English text as though it were French — "Discover" becomes
 * unintelligible — so untranslated regions have to declare themselves. Marking
 * them is what keeps a partial translation honest rather than harmful.
 */
export function isTranslated(dict: Dictionary, key: string): boolean {
  return key in dict;
}

/**
 * Routes whose page body is fully translated.
 *
 * Empty by design right now: the shared chrome (navigation, footer) is
 * translated and no page body is. That is a real state, not an oversight, and
 * the honest thing is to encode it rather than let <html lang="fr"> imply the
 * whole page is French.
 *
 * Add a path here in the same commit that translates its page. Prefix match,
 * so '/businesses' covers '/businesses/lagos'.
 */
export const TRANSLATED_ROUTES: readonly string[] = [];

/**
 * The language a route's BODY is actually written in.
 *
 * <html lang> describes the chrome. <main lang> corrects it for content that
 * has not been translated yet, which is what stops a French screen reader from
 * reading English prose with French pronunciation — the failure mode that
 * makes a partial translation worse than none.
 */
export function contentLocale(pathname: string, locale: Locale): Locale {
  if (locale === DEFAULT_LOCALE) return locale;
  const translated = TRANSLATED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return translated ? locale : DEFAULT_LOCALE;
}
