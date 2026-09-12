import { describe, it, expect } from 'vitest';

import {
  socialUrl, parseDelimitedList, parseServices, parseServicesJson, parseFaqs, parseFaqsJson,
  parseFoundedYear, formatWeekHours,
  normaliseProfile, SOCIAL_PLATFORMS, SOCIAL_FIELDS, LIST_FIELDS, TEXT_FIELDS,
} from './profileFields';
import { DATASET_FIELDS } from './mapping';
import { readFileSync } from 'node:fs';

/**
 * Reading the rest of a business profile out of a spreadsheet.
 *
 * Every conversion here has a wrong answer that looks right — "@mamaput" as a
 * literal name, "Est. 1998" as no year at all, a services cell that silently
 * yields nothing. So each test below is a shape a real file actually contains.
 */

describe('socials', () => {
  it('turns a bare handle into a link', () => {
    expect(socialUrl('instagram', 'mamaput').url).toBe('https://instagram.com/mamaput');
    expect(socialUrl('instagram', '@mamaput').url).toBe('https://instagram.com/mamaput');
  });

  it('sends X to x.com and TikTok to its @ form', () => {
    expect(socialUrl('twitter', 'mamaput').url).toBe('https://x.com/mamaput');
    expect(socialUrl('tiktok', 'mamaput').url).toBe('https://tiktok.com/@mamaput');
    expect(socialUrl('youtube', 'mamaput').url).toBe('https://youtube.com/@mamaput');
    expect(socialUrl('linkedin', 'mama-put').url).toBe('https://linkedin.com/company/mama-put');
  });

  it('keeps a pasted link', () => {
    expect(socialUrl('instagram', 'https://instagram.com/mamaput/').url)
      .toBe('https://instagram.com/mamaput/');
    expect(socialUrl('facebook', 'facebook.com/mamaput').url)
      .toBe('https://facebook.com/mamaput');
  });

  it('upgrades http and accepts an x.com link under the twitter key', () => {
    expect(socialUrl('twitter', 'http://x.com/mamaput').url).toBe('https://x.com/mamaput');
    expect(socialUrl('twitter', 'https://twitter.com/mamaput').problem).toBeNull();
  });

  it('keeps a link whose host does not match, and says so', () => {
    /*
     * A Facebook URL in the Instagram column. Discarding the only social link
     * a business has to punish a mis-titled column loses the reachable thing
     * in order to protect a label.
     */
    const r = socialUrl('instagram', 'https://facebook.com/mamaput');
    expect(r.url).toBe('https://facebook.com/mamaput');
    expect(r.problem).toBe('wrong_platform');
  });

  it('refuses a placeholder and prose', () => {
    expect(socialUrl('instagram', 'UNKNOWN')).toEqual({ url: null, problem: 'placeholder' });
    expect(socialUrl('instagram', 'ask us for it').url).toBeNull();
    expect(socialUrl('instagram', '  ')).toEqual({ url: null, problem: null });
  });

  it('refuses a javascript: link', () => {
    // Stored XSS is the reason the scheme is an allowlist rather than a filter.
    expect(socialUrl('instagram', 'javascript:alert(1)').url).toBeNull();
  });

  it('covers every platform the mapper offers a column for', () => {
    // A mapped column with no platform entry would read a cell and drop it.
    const mapped = DATASET_FIELDS.businesses.map((f) => f.field);
    for (const key of SOCIAL_FIELDS) expect(mapped, key).toContain(key);
    expect(SOCIAL_PLATFORMS.length).toBe(SOCIAL_FIELDS.length);
  });
});

describe('delimited lists', () => {
  it('splits on pipe, semicolon, newline and comma', () => {
    expect(parseDelimitedList('Cash|Card')).toEqual(['Cash', 'Card']);
    expect(parseDelimitedList('Cash; Card')).toEqual(['Cash', 'Card']);
    expect(parseDelimitedList('Cash\nCard')).toEqual(['Cash', 'Card']);
    expect(parseDelimitedList('Cash, Card')).toEqual(['Cash', 'Card']);
  });

  it('drops blanks, placeholders and duplicates but keeps order', () => {
    expect(parseDelimitedList('Cash||N/A|Card|cash')).toEqual(['Cash', 'Card']);
  });

  it('is empty for a placeholder cell', () => {
    expect(parseDelimitedList('UNKNOWN')).toEqual([]);
    expect(parseDelimitedList('')).toEqual([]);
  });
});

describe('services', () => {
  it('reads names only', () => {
    expect(parseServices('Haircut|Beard trim')).toEqual([
      { name: 'Haircut' }, { name: 'Beard trim' },
    ]);
  });

  it('reads name and price, with either separator', () => {
    expect(parseServices('Haircut:2500|Beard trim = 1500')).toEqual([
      { name: 'Haircut', price: '2500' },
      { name: 'Beard trim', price: '1500' },
    ]);
  });

  it('keeps the price exactly as written', () => {
    /*
     * business_services.price is text, and "from 2500" is a real answer.
     * Parsing to a number would lose the currency or invent a precision.
     */
    expect(parseServices('Haircut:from N2,500')).toEqual([
      { name: 'Haircut', price: 'from N2,500' },
    ]);
  });

  it('reads a third part as a description', () => {
    expect(parseServices('Beard trim:1500:Includes a hot towel')).toEqual([
      { name: 'Beard trim', price: '1500', description: 'Includes a hot towel' },
    ]);
  });

  it('drops duplicates and nameless entries', () => {
    expect(parseServices('Haircut:2500|haircut:3000|:900|UNKNOWN')).toEqual([
      { name: 'Haircut', price: '2500' },
    ]);
  });

  it('splits a plain comma list, but not a description containing a comma', () => {
    expect(parseServices('Haircut, Beard trim, Wash')).toEqual([
      { name: 'Haircut' }, { name: 'Beard trim' }, { name: 'Wash' },
    ]);
    // A comma inside a description must survive.
    expect(parseServices('Bag of beans:8500:250g, whole bean')).toEqual([
      { name: 'Bag of beans', price: '8500', description: '250g, whole bean' },
    ]);
  });

  it('takes a free-text cell at its word rather than guessing', () => {
    /*
     * "call for prices" becomes a service by that name. It is what the file
     * says, and the alternative is a heuristic that decides which cells are
     * prose — which would silently discard real service names.
     */
    expect(parseServices('call for prices')).toEqual([{ name: 'call for prices' }]);
  });

  it('is empty rather than wrong for a cell it cannot read', () => {
    expect(parseServices('N/A')).toEqual([]);
    expect(parseServices('')).toEqual([]);
    expect(parseServices(':::')).toEqual([]);
    expect(parseServices(':2500|:900')).toEqual([]);
  });
});

describe('parseServicesJson', () => {
  it('reads back a staged services_json string', () => {
    expect(parseServicesJson(JSON.stringify([
      { name: 'Haircut', price: '2500' }, { name: 'Beard trim' },
    ]))).toEqual([
      { name: 'Haircut', price: '2500' }, { name: 'Beard trim' },
    ]);
  });

  it('is [] for a missing, malformed or non-array value', () => {
    expect(parseServicesJson('')).toEqual([]);
    expect(parseServicesJson('not json')).toEqual([]);
    expect(parseServicesJson('"a string"')).toEqual([]);
    expect(parseServicesJson('[{"price":"900"}]')).toEqual([]);
  });
});

describe('FAQs', () => {
  it('reads Question::Answer pairs', () => {
    expect(parseFaqs('Do you deliver?::Yes, within Lekki.|Card?::Yes.')).toEqual([
      { q: 'Do you deliver?', a: 'Yes, within Lekki.' },
      { q: 'Card?', a: 'Yes.' },
    ]);
  });

  it('keeps a colon inside the answer', () => {
    // Which is why the separator is `::` and not `:`.
    expect(parseFaqs('Hours?::Open: 9am to 6pm')).toEqual([
      { q: 'Hours?', a: 'Open: 9am to 6pm' },
    ]);
  });

  it('drops a pair missing either half', () => {
    // The profile page's own reader discards these, so keeping them here would
    // produce a row that silently disappears later.
    expect(parseFaqs('Do you deliver?|::Yes|Card?::')).toEqual([]);
  });
});

describe('parseFaqsJson', () => {
  it('reads back a staged faqs_json string', () => {
    expect(parseFaqsJson(JSON.stringify([
      { q: 'Do you deliver?', a: 'Yes.' }, { q: 'Card?', a: 'Yes.' },
    ]))).toEqual([
      { q: 'Do you deliver?', a: 'Yes.' }, { q: 'Card?', a: 'Yes.' },
    ]);
  });

  it('drops an entry without a question but keeps an answerless question', () => {
    expect(parseFaqsJson(JSON.stringify([{ a: 'no question' }, { q: 'Hours?' }]))).toEqual([
      { q: 'Hours?', a: '' },
    ]);
  });

  it('is [] for a missing, malformed or non-array value', () => {
    expect(parseFaqsJson('')).toEqual([]);
    expect(parseFaqsJson('not json')).toEqual([]);
    expect(parseFaqsJson('{"q":"x"}')).toEqual([]);
  });
});

describe('founding year', () => {
  it('reads a year out of prose', () => {
    expect(parseFoundedYear('1998')).toBe(1998);
    expect(parseFoundedYear('Est. 1998')).toBe(1998);
    expect(parseFoundedYear('since 2015')).toBe(2015);
  });

  it('refuses a future year and an implausible one', () => {
    /*
     * yearsInBusiness renders this as a credential on the public page, so a
     * wrong year is a false claim about a real business.
     */
    const now = new Date('2026-09-08T00:00:00Z');
    expect(parseFoundedYear('2030', now)).toBeNull();
    expect(parseFoundedYear('1500', now)).toBeNull();
    expect(parseFoundedYear('2026', now)).toBe(2026);
  });

  it('has nothing to read from a placeholder', () => {
    expect(parseFoundedYear('UNKNOWN')).toBeNull();
    expect(parseFoundedYear('soon')).toBeNull();
  });
});

describe('formatWeekHours', () => {
  it('turns a weekday object into the text the public page shows', () => {
    expect(formatWeekHours({
      mon: { open: '09:00', close: '18:00' },
      tue: { open: '09:00', close: '18:00' },
      wed: { open: '09:00', close: '18:00' },
      thu: { open: '09:00', close: '18:00' },
      fri: { open: '09:00', close: '18:00' },
      sat: { open: '10:00', close: '16:00' },
      sun: { closed: true },
    })).toBe('Mon–Fri: 09:00–18:00, Sat: 10:00–16:00, Sun: Closed');
  });

  it('reads a JSON string the same way', () => {
    expect(formatWeekHours(JSON.stringify({ mon: { open: '08:00', close: '17:00' } })))
      .toBe('Mon: 08:00–17:00');
  });

  it('is "" for junk and for a week with no times', () => {
    expect(formatWeekHours(null)).toBe('');
    expect(formatWeekHours('not json')).toBe('');
    expect(formatWeekHours({ mon: {}, tue: { open: '' } })).toBe('');
  });
});

describe('normaliseProfile', () => {
  it('produces canonical forms the SQL can move without interpreting', () => {
    const { fields } = normaliseProfile({
      instagram: '@mamaput',
      languages: 'English, Yoruba',
      services: 'Haircut:2500',
      faqs: 'Card?::Yes.',
      founded_year: 'Est. 1998',
      tagline: '  Sharp cuts  ',
    });

    expect(fields.instagram).toBe('https://instagram.com/mamaput');
    expect(fields.languages).toBe('English|Yoruba');
    expect(JSON.parse(fields.services_json)).toEqual([{ name: 'Haircut', price: '2500' }]);
    expect(JSON.parse(fields.faqs_json)).toEqual([{ q: 'Card?', a: 'Yes.' }]);
    expect(fields.founded_year).toBe('1998');
    expect(fields.tagline).toBe('Sharp cuts');
  });

  it('writes nothing for fields the file does not carry', () => {
    const { fields, issues } = normaliseProfile({ name: 'Mama Put' });
    expect(fields).toEqual({});
    expect(issues).toEqual([]);
  });

  it('reports a cell it could not read instead of dropping it silently', () => {
    // A column an admin believes they supplied and which does not appear is
    // the failure this module exists to stop.
    // Prices with no names: structured, not a placeholder, and unreadable.
    const { issues } = normaliseProfile({ services: ':2500|:900', founded_year: 'ages ago' });
    expect(issues.map((i) => i.field)).toEqual(['services', 'founded_year']);
    for (const i of issues) expect(i.message.length).toBeGreaterThan(20);
  });

  it('flags a social link pointing at the wrong platform but keeps it', () => {
    const { fields, issues } = normaliseProfile({ instagram: 'https://facebook.com/mamaput' });
    expect(fields.instagram).toBe('https://facebook.com/mamaput');
    expect(issues[0].field).toBe('instagram');
  });

  it('drops a placeholder without complaining about it', () => {
    // The placeholder scrub in validate.ts already noted it; a second alarm
    // for the same cell trains an admin to ignore both.
    const { fields, issues } = normaliseProfile({ instagram: 'UNKNOWN', tagline: 'N/A' });
    expect(fields).toEqual({});
    expect(issues).toEqual([]);
  });
});

describe('the field lists and the mapper agree', () => {
  it('maps a column for every list and text field', () => {
    /*
     * A field normalised here but not mapped is unreachable; a field mapped
     * but not normalised reaches the database as raw spreadsheet text. Both
     * are silent, so this compares the two lists directly.
     */
    const mapped = new Set(DATASET_FIELDS.businesses.map((f) => f.field));
    for (const f of LIST_FIELDS) expect(mapped.has(f), f).toBe(true);
    for (const f of TEXT_FIELDS) expect(mapped.has(f), f).toBe(true);
    expect(mapped.has('services')).toBe(true);
    expect(mapped.has('faqs')).toBe(true);
    expect(mapped.has('founded_year')).toBe(true);
  });
});

describe('the app and the publish SQL read the same keys', () => {
  /*
   * THE JOIN NOBODY WOULD NOTICE BREAKING.
   *
   * `radar_publish_candidate` reads keys out of `radar_candidates.profile` by
   * name. The app puts them there by name. Neither side knows about the other,
   * and a mismatch loses a field in complete silence — which is exactly the
   * bug this whole change fixed: the SQL read twelve keys and the app supplied
   * twenty-three.
   *
   * So: every key the migration reads must be one the app can produce.
   */
  const sql = readFileSync(
    'supabase/migrations/20260908200000_import_full_profile.sql',
    'utf8',
  );

  it('reads no profile key the app cannot supply', () => {
    const readByStatement = [
      ...sql.matchAll(/c\.profile->>'([a-z_]+)'/g),
      ...sql.matchAll(/public\.profile_(?:list|json)\(c\.profile, '([a-z_]+)'\)/g),
    ].map((m) => m[1]);

    expect(readByStatement.length).toBeGreaterThan(20);

    const canSupply = new Set<string>([
      ...DATASET_FIELDS.businesses.map((f) => f.field),
      // Added by normaliseProfile rather than mapped from a header.
      'services_json', 'faqs_json',
      // Accepted alternative spellings the SQL coalesces over.
      'image_url', 'hours',
    ]);

    const orphans = [...new Set(readByStatement)].filter((k) => !canSupply.has(k));
    expect(orphans, `the SQL reads keys nothing produces: ${orphans.join(', ')}`).toEqual([]);
  });

  it('carries every profile field the mapper accepts', () => {
    /*
     * The other direction, and the one that was broken: a column an admin can
     * fill which no SQL statement reads. Listed explicitly rather than
     * computed, so adding a mapped field forces a decision about whether the
     * publish should carry it.
     */
    const CARRIED_ELSEWHERE = new Set([
      // Candidate columns in their own right, not profile keys.
      'name', 'category', 'city', 'address', 'phone', 'whatsapp', 'email',
      'website', 'description', 'latitude', 'longitude', 'external_id',
      // Read from the profile under a different name, or intentionally staged
      // only: gallery images have no column on businesses yet, and
      // legal_name/country/state/area have none either.
      'gallery_urls', 'legal_name', 'country', 'state', 'area',
      // Services become business_services ROWS, from services_json.
      'services', 'faqs',
      // cover_image_url is read; the raw alias is what the header carries.
      'cover_image_url',
    ]);

    const read = new Set([
      ...[...sql.matchAll(/c\.profile->>'([a-z_]+)'/g)].map((m) => m[1]),
      ...[...sql.matchAll(/public\.profile_(?:list|json)\(c\.profile, '([a-z_]+)'\)/g)].map((m) => m[1]),
    ]);

    const dropped = DATASET_FIELDS.businesses
      .map((f) => f.field)
      .filter((f) => !read.has(f) && !CARRIED_ELSEWHERE.has(f));

    expect(dropped, `mapped but never published: ${dropped.join(', ')}`).toEqual([]);
  });

  it('inserts services as business_services rows', () => {
    expect(sql).toContain('INSERT INTO public.business_services');
    expect(sql).toContain("public.profile_json(c.profile, 'services_json')");
  });

  it('never writes a column an import must not set', () => {
    // The whitelist is the security boundary: a mapped column called `role`
    // or `verified` must not reach a business column of that name.
    const inserted = sql.slice(sql.indexOf('INSERT INTO public.businesses'), sql.indexOf('RETURNING id INTO v_id'));
    for (const forbidden of ['verified', 'user_id', 'role', 'trust_score', 'verification_tier']) {
      expect(inserted.includes(`    ${forbidden},`), forbidden).toBe(false);
    }
  });
});
