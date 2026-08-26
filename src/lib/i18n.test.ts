import { describe, expect, it } from 'vitest';

import en from '../locales/en';
import fr from '../locales/fr';
import {
  DEFAULT_LOCALE,
  LOCALES,
  contentLocale,
  detectLocale,
  directionFor,
  isTranslated,
  translate,
} from './i18n';

describe('detectLocale', () => {
  it('honours an explicit choice over the browser', () => {
    // Someone who picked English on a French laptop meant it.
    expect(detectLocale('en', ['fr-FR', 'fr'])).toBe('en');
    expect(detectLocale('fr', ['en-GB'])).toBe('fr');
  });

  it('ignores a stored locale we do not ship', () => {
    expect(detectLocale('de', ['fr'])).toBe('fr');
  });

  it('matches the browser on language, ignoring region', () => {
    // fr-SN and fr-CI are real audiences; neither is a dictionary.
    expect(detectLocale(null, ['fr-SN'])).toBe('fr');
    expect(detectLocale(null, ['fr-CI', 'en'])).toBe('fr');
  });

  it('respects preference order', () => {
    expect(detectLocale(null, ['en-NG', 'fr'])).toBe('en');
  });

  it('falls back to English for unsupported languages', () => {
    expect(detectLocale(null, ['sw-KE', 'pt-AO'])).toBe(DEFAULT_LOCALE);
    expect(detectLocale(null, [])).toBe(DEFAULT_LOCALE);
  });
});

describe('translate', () => {
  it('interpolates named variables', () => {
    expect(translate({ k: 'Hi {name}, {n} new' }, {}, 'k', { name: 'Ada', n: 3 })).toBe(
      'Hi Ada, 3 new',
    );
  });

  it('leaves an unknown placeholder intact rather than blanking it', () => {
    expect(translate({ k: '{a} and {b}' }, {}, 'k', { a: '1' })).toBe('1 and {b}');
  });

  it('falls back to English when the locale lacks the key', () => {
    expect(translate({}, { 'nav.home': 'Home' }, 'nav.home')).toBe('Home');
  });

  it('returns the key when it exists nowhere, so a typo is visible', () => {
    // A blank button ships unnoticed; "nav.missing" does not.
    expect(translate({}, {}, 'nav.missing')).toBe('nav.missing');
  });
});

describe('dictionaries', () => {
  it('every French key exists in English, so nothing is orphaned', () => {
    const orphans = Object.keys(fr).filter((k) => !(k in en));
    expect(orphans).toEqual([]);
  });

  it('no French value is silently left as its English source', () => {
    // Some words are genuinely the same in both languages. Listing them means
    // a copy-paste that forgets to translate shows up as a failure, instead of
    // hiding behind a pattern loose enough to excuse anything.
    const SAME_IN_BOTH = new Set(['footer.contact', 'a11y.page']);
    const untranslated = Object.keys(fr).filter(
      (k) => fr[k] === en[k] && !SAME_IN_BOTH.has(k),
    );
    expect(untranslated).toEqual([]);
  });

  it('placeholders survive translation', () => {
    for (const key of Object.keys(fr)) {
      const holders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(holders(fr[key]), `placeholders differ for ${key}`).toEqual(holders(en[key]));
    }
  });
});

describe('contentLocale', () => {
  it('reports English for a route whose body is not translated', () => {
    // The guard that stops <html lang="fr"> claiming untranslated prose.
    expect(contentLocale('/businesses', 'fr')).toBe('en');
  });

  it('is a no-op when the reader is already on English', () => {
    expect(contentLocale('/anything', 'en')).toBe('en');
  });
});

describe('direction', () => {
  it('is ltr for every shipped locale', () => {
    for (const l of LOCALES) expect(directionFor(l.code)).toBe('ltr');
  });

  it('is rtl for Arabic, with or without a region', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('ar-MA')).toBe('rtl');
  });
});

describe('isTranslated', () => {
  it('distinguishes a real translation from an English fallback', () => {
    expect(isTranslated(fr, 'nav.home')).toBe(true);
    // A key French does not carry falls back to English, and must report so —
    // this is what drives the lang attribute on untranslated regions.
    expect(isTranslated(fr, 'home.hero.title')).toBe(false);
    expect(isTranslated(en, 'home.hero.title')).toBe(false);
  });
});
