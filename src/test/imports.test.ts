import { describe, it, expect } from 'vitest';

import {
  autoMap, headerKey, missingRequired, applyMapping, splitLocation, DATASET_FIELDS,
} from '../lib/imports/mapping';
import {
  buildReference, validateRow, summarise, findInternalDuplicates, errorReportCsv,
  type ValidatedRow,
} from '../lib/imports/validate';

const ref = buildReference(
  [{ category: 'Restaurant & Food', slug: 'restaurant' }, { category: 'Technology', slug: 'technology' }],
  [{ city: 'Lagos' }, { city: 'Abuja' }],
);

const map = (headers: string[]) => autoMap(headers, 'businesses');
const fieldFor = (headers: string[], header: string) =>
  map(headers).find((m) => m.header === header)?.field ?? null;

/* ===================================================================== */
describe('column auto-mapping', () => {
  it('reads the template headers exactly', () => {
    const headers = ['business_name', 'category', 'city', 'phone', 'website'];
    expect(map(headers).map((m) => m.field)).toEqual(['name', 'category', 'city', 'phone', 'website']);
  });

  // The file people actually send.
  it('maps a messy real-world header row', () => {
    const headers = ['Company', 'Type', 'Location', 'Phone', 'Website'];
    expect(map(headers).map((m) => m.field)).toEqual(['name', 'category', 'city', 'phone', 'website']);
  });

  it('normalises header spelling and punctuation', () => {
    expect(headerKey('Business Name')).toBe('business_name');
    expect(headerKey("Company's  E-Mail ")).toBe('companys_e_mail');
    expect(fieldFor(['Tel.'], 'Tel.')).toBe('phone');
    expect(fieldFor(['E-mail'], 'E-mail')).toBe('email');
  });

  /*
   * When two columns both look like the name, the stronger claim wins and the
   * weaker is left unmapped. An unmapped column an admin can see beats a
   * silently overwritten one they cannot.
   */
  it('gives a field to one column only', () => {
    const m = map(['business_name', 'Company']);
    expect(m[0].field).toBe('name');
    expect(m[1].field).toBeNull();
    expect(m[1].alternatives).toContain('name');
  });

  it('records how sure it is, so the screen can show its working', () => {
    // 'category' IS the field name; 'phone_number' is a known alias of `phone`;
    // 'Trading Company' is no alias but contains the 'company' hint. Three
    // grades, plus no match.
    // Each header wins a different field — confidence describes the winning
    // claim, so a header that loses a contested field reports 'none'.
    const m = map(['category', 'phone_number', 'Trading Company', 'Wobbly Column']);
    expect(m.map((x) => x.field)).toEqual(['category', 'phone', 'name', null]);
    expect(m.map((x) => x.confidence)).toEqual(['exact', 'alias', 'hint', 'none']);
  });

  it('leaves a column it cannot place unmapped rather than guessing', () => {
    expect(fieldFor(['Notes for the intern'], 'Notes for the intern')).toBeNull();
  });

  it('names the required fields still missing', () => {
    const missing = missingRequired(map(['Company', 'Phone']), 'businesses');
    expect(missing.map((f) => f.field).sort()).toEqual(['category', 'city']);
  });

  it('handles the placement and media datasets too', () => {
    expect(autoMap(['Placement Name', 'Format', 'City'], 'placements').map((m) => m.field))
      .toEqual(['name', 'placement_type', 'city']);
    expect(autoMap(['Studio', 'Discipline', 'Services', 'Town'], 'media').map((m) => m.field))
      .toEqual(['name', 'media_type', 'service_category', 'city']);
  });

  it('requires exactly what the import contract requires', () => {
    const req = (d: 'businesses' | 'placements' | 'media') =>
      DATASET_FIELDS[d].filter((f) => f.required).map((f) => f.field);
    expect(req('businesses')).toEqual(['name', 'category', 'city']);
    expect(req('placements')).toEqual(['name', 'placement_type', 'city']);
    expect(req('media')).toEqual(['name', 'media_type', 'service_category', 'city']);
  });
});

/* ===================================================================== */
describe('one column carrying a whole address', () => {
  it('splits "Lekki, Lagos" into area and city', () => {
    expect(splitLocation('Lekki, Lagos')).toEqual({ area: 'Lekki', city: 'Lagos' });
  });

  it('takes the state when there is a third part', () => {
    expect(splitLocation('Lekki, Lagos, Lagos State')).toEqual({ area: 'Lekki', city: 'Lagos', state: 'Lagos State' });
  });

  it('applies the split when mapping a row', () => {
    const mapping = map(['Company', 'Location']);
    const out = applyMapping({ Company: 'ABC Ltd', Location: 'Lekki, Lagos' }, mapping);
    expect(out).toMatchObject({ name: 'ABC Ltd', city: 'Lagos', area: 'Lekki' });
  });

  // An explicit column always beats something inferred from a comma.
  it('never overwrites a field the file supplied outright', () => {
    const mapping = autoMap(['Company', 'Location', 'Area'], 'businesses');
    const out = applyMapping({ Company: 'ABC', Location: 'Lekki, Lagos', Area: 'Victoria Island' }, mapping);
    expect(out.area).toBe('Victoria Island');
  });

  it('drops empty cells rather than storing blanks', () => {
    const out = applyMapping({ Company: 'ABC', Phone: '   ' }, map(['Company', 'Phone']));
    expect(out).not.toHaveProperty('phone');
  });
});

/* ===================================================================== */
describe('row validation', () => {
  const row = (m: Record<string, string>, line = 1) => validateRow(m, line, 'businesses', ref);

  it('passes a complete, recognised row', () => {
    const r = row({ name: 'Mama Put', category: 'Restaurant & Food', city: 'Lagos', phone: '08031234567' });
    expect(r.status).toBe('valid');
    expect(r.issues).toEqual([]);
    expect(r.normalized?.phone).toBe('+2348031234567');
  });

  it('refuses a row that cannot become a business at all', () => {
    const r = row({ category: 'Technology', city: 'Lagos' });
    expect(r.status).toBe('invalid');
    expect(r.issues[0]).toMatchObject({ field: 'name', severity: 'blocking' });
  });

  /*
   * The judgement that matters most. A real business in a town NowOpen has not
   * listed yet is a gap in the reference data, not a bad record — rejecting it
   * would discard exactly the businesses worth having.
   */
  it('sends an unknown category or city to review, never to invalid', () => {
    const r = row({ name: 'Shop', category: 'Drone Repair', city: 'Warri' });
    expect(r.status).toBe('review');
    expect(r.issues.map((i) => i.field).sort()).toEqual(['category', 'city']);
    expect(r.issues.every((i) => i.severity === 'review')).toBe(true);
  });

  it('accepts a category given as its slug', () => {
    expect(row({ name: 'Shop', category: 'restaurant', city: 'Lagos' }).status).toBe('valid');
  });

  // Silently dropping a phone number is how a directory fills with businesses
  // nobody can ring.
  it('flags a supplied value it had to discard', () => {
    const r = row({ name: 'Shop', category: 'Technology', city: 'Lagos', phone: '12345' });
    expect(r.status).toBe('review');
    expect(r.issues[0].message).toMatch(/not a usable phone number/i);
    expect(r.normalized?.phone).toBeNull();
  });

  it('says nothing about a field the file simply left blank', () => {
    const r = row({ name: 'Shop', category: 'Technology', city: 'Lagos' });
    expect(r.status).toBe('valid');
    expect(r.issues).toEqual([]);
  });

  it('scores each row so the queue can sort by it', () => {
    const thin = row({ name: 'Shop', category: 'Technology', city: 'Lagos' });
    const full = row({ name: 'Shop', category: 'Technology', city: 'Lagos',
      address: '24 Admiralty Way', phone: '08031234567', website: 'shop.ng' });
    expect(full.confidence).toBeGreaterThan(thin.confidence);
  });
});

/* ===================================================================== */
describe('duplicates inside the uploaded file', () => {
  const rows = (['a', 'b', 'c', 'd'] as const).map((_, i) => i);
  void rows;

  const build = (list: Array<Record<string, string>>): ValidatedRow[] =>
    list.map((m, i) => validateRow(m, i + 1, 'businesses', ref));

  it('catches the same shop listed twice by phone number', () => {
    const found = findInternalDuplicates(build([
      { name: 'Mama Put', category: 'Restaurant & Food', city: 'Lagos', phone: '08031234567' },
      { name: 'Other Shop', category: 'Technology', city: 'Lagos' },
      { name: 'Mama Put Kitchen', category: 'Restaurant & Food', city: 'Lagos', phone: '0803 123 4567' },
    ]));
    expect(found.get(3)).toBe(1);
    expect(found.has(2)).toBe(false);
  });

  it('catches a repeat by name and city when there is no phone', () => {
    const found = findInternalDuplicates(build([
      { name: 'Blue Care Pharmacy', category: 'Technology', city: 'Lagos' },
      { name: 'Blue Care Pharmacy Ltd', category: 'Technology', city: 'Lagos' },
    ]));
    expect(found.get(2)).toBe(1);
  });

  it('keeps two branches in different cities apart', () => {
    const found = findInternalDuplicates(build([
      { name: 'Chicken Republic', category: 'Restaurant & Food', city: 'Lagos' },
      { name: 'Chicken Republic', category: 'Restaurant & Food', city: 'Abuja' },
    ]));
    expect(found.size).toBe(0);
  });
});

/* ===================================================================== */
describe('the preview an admin approves', () => {
  const rows: ValidatedRow[] = [
    validateRow({ name: 'A', category: 'Technology', city: 'Lagos' }, 1, 'businesses', ref),
    validateRow({ name: 'B', category: 'Drone Repair', city: 'Lagos' }, 2, 'businesses', ref),
    validateRow({ category: 'Technology', city: 'Lagos' }, 3, 'businesses', ref),
  ];

  it('counts each outcome', () => {
    expect(summarise(rows, 1)).toMatchObject({ total: 3, valid: 1, review: 1, invalid: 1, duplicates: 1 });
  });

  it('produces an error report pointing at the file line', () => {
    const csv = errorReportCsv(rows);
    expect(csv.split('\n')[0]).toBe('line,status,field,severity,problem,value');
    expect(csv).toMatch(/^3,invalid,name,blocking/m);
    expect(csv).not.toMatch(/^1,/m);
  });
});
