import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The spreadsheet import, against a fake supabase client. Nothing here
 * reaches a database: every rpc and table write is recorded and answered
 * in memory.
 */

interface Call { op: string; name?: string; args?: unknown; table?: string; payload?: unknown }
const calls: Call[] = [];
const state: { rpcFail: Record<string, string>; adverts: Record<string, unknown>[] } = { rpcFail: {}, adverts: [] };
let nextId = 0;

vi.mock('../supabase', () => {
  const chainFor = (table: string) => {
    const call: Call = { op: 'select', table };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ['select', 'eq', 'order', 'range', 'or', 'in']) c[m] = vi.fn(() => c);
    c.insert = vi.fn((payload: unknown) => { call.op = 'insert'; call.payload = payload; return c; });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.then = (f?: any, r?: any) => {
      calls.push(call);
      const data = call.op === 'insert' ? null : table === 'advertisements' ? state.adverts : [];
      return Promise.resolve({ data, error: null }).then(f, r);
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => chainFor(t)),
      rpc: vi.fn(async (name: string, args: unknown) => {
        calls.push({ op: 'rpc', name, args });
        if (state.rpcFail[name]) return { data: null, error: { message: state.rpcFail[name] } };
        nextId += 1;
        return { data: `${name}-${nextId}`, error: null };
      }),
      storage: { from: vi.fn() },
    },
  };
});

vi.mock('read-excel-file/browser', () => ({
  readSheet: vi.fn(async () => [
    ['type', 'site_name', 'price'],
    ['Billboard', 'Ikeja unipole', 450000],
    [null, true, new Date('2026-11-01T00:00:00Z')],
  ]),
}));

import { zipSync, strToU8 } from 'fflate';
import {
  parseCsv, parseXlsx, guessMapping, validateRows, findDuplicates, runImport, checkImportFile,
  xlsxExpandedSize, capReport, CsvParseError, XlsxTooLargeError,
  TEMPLATE_HEADERS, IMPORT_LIMITS, type Draft,
} from './placementImport';
import { supabase } from '../supabase';
import type { Advertisement } from '../../types';

const HEADER = TEMPLATE_HEADERS.map(([, h]) => h);
const mapping = guessMapping(HEADER);

/** One template row, by header name; anything omitted is blank. */
function row(v: Partial<Record<string, string>>): string[] {
  return HEADER.map((h) => v[h] ?? '');
}
const GOOD = {
  type: 'Billboard', site_name: 'Ikeja Along unipole', city: 'Lagos', country: 'NG',
  address: 'Opposite Ikeja City Mall', size_type: 'area', width_m: '12', height_m: '6',
  price: '450,000', currency: 'NGN', per: 'month',
};

beforeEach(() => {
  calls.length = 0;
  state.rpcFail = {};
  state.adverts = [];
  nextId = 0;
});

describe('parseCsv', () => {
  it('handles quotes, embedded commas, escaped quotes and newlines', () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n1,,3\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'two\nlines'],
      ['1', '', '3'],
    ]);
  });

  it('keeps an empty last field and treats a lone CR as a line break', () => {
    expect(parseCsv('a,b,\rc,d,e')).toEqual([['a', 'b', ''], ['c', 'd', 'e']]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('an unterminated quote is an error naming the line it opened on', () => {
    expect(() => parseCsv('a,b\n1,2\n3,"never closed\n4,5\n')).toThrow(CsvParseError);
    expect(() => parseCsv('a,b\n1,2\n3,"never closed\n4,5\n')).toThrow(/^Line 3 has a quote/);
    // A quoted line break counts towards the line number.
    expect(() => parseCsv('a,"x\ny"\n"open')).toThrow(/^Line 3 /);
  });

  it('keeps a lone "" last line as one empty cell (a blank row, skipped by validation)', () => {
    expect(parseCsv('a,b\n""')).toEqual([['a', 'b'], ['']]);
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']]);
  });
});

describe('parseXlsx', () => {
  it('turns every cell into text (numbers, booleans, dates, empty cells)', async () => {
    const rows = await parseXlsx(new File(['x'], 'p.xlsx'));
    expect(rows).toEqual([
      ['type', 'site_name', 'price'],
      ['Billboard', 'Ikeja unipole', '450000'],
      ['', 'TRUE', '2026-11-01'],
    ]);
  });

  it('refuses a workbook whose sheets expand past the limit, before reading it', async () => {
    // Highly compressible: tiny on disk, 41MB once inflated.
    const big = zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(41 * 1024 * 1024) });
    expect(big.length).toBeLessThan(IMPORT_LIMITS.maxBytes);
    expect(await xlsxExpandedSize(big)).toBe(41 * 1024 * 1024);
    const { readSheet } = await import('read-excel-file/browser');
    vi.mocked(readSheet).mockClear();
    await expect(parseXlsx(new File([big], 'big.xlsx'))).rejects.toThrow(XlsxTooLargeError);
    await expect(parseXlsx(new File([big], 'big.xlsx'))).rejects.toThrow(
      /^This file has more than 2,000 placements\. Split it and import each part\.$/,
    );
    expect(readSheet).not.toHaveBeenCalled();
  });

  it('loads fflate only on the XLSX path (a dynamic import, never a static one)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/promote/placementImport.ts'), 'utf8');
    expect(src).not.toMatch(/^import [^;]*from 'fflate'/m);
    expect(src).toMatch(/await import\('fflate'\)/);
  });

  it('counts only worksheets and shared strings, and reads nothing when the file is not a zip', async () => {
    const small = zipSync({
      'xl/worksheets/sheet1.xml': strToU8('<x/>'),
      'xl/sharedStrings.xml': strToU8('<y/>'),
      'xl/media/photo.png': new Uint8Array(1000),
    });
    expect(await xlsxExpandedSize(small)).toBe(8);
    expect(await xlsxExpandedSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('checkImportFile', () => {
  it('accepts CSV and XLSX up to 5MB, refuses anything else', () => {
    expect(checkImportFile(new File(['a'], 'p.csv'))).toBeNull();
    expect(checkImportFile(new File(['a'], 'p.xlsx'))).toBeNull();
    expect(checkImportFile(new File(['a'], 'p.xls'))).toMatch(/CSV or XLSX/);
    const big = new File(['a'], 'p.csv');
    Object.defineProperty(big, 'size', { value: IMPORT_LIMITS.maxBytes + 1 });
    expect(checkImportFile(big)).toMatch(/5MB/);
  });
});

describe('guessMapping', () => {
  it('maps every template header to its own column', () => {
    TEMPLATE_HEADERS.forEach(([field], i) => expect(mapping[field]).toBe(i));
  });

  it('the template file has exactly these headers', () => {
    const csv = readFileSync(resolve(__dirname, '../../../public/templates/nowopen-placements-template.csv'), 'utf8');
    expect(csv.includes('\r')).toBe(false);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(HEADER);
    // The example row in the template validates cleanly.
    const checked = validateRows(rows.slice(1), guessMapping(rows[0]));
    expect(checked.errors).toEqual([]);
    expect(checked.valid.length).toBeGreaterThan(0);
  });

  it('recognises common other names and leaves missing fields unmapped', () => {
    const m = guessMapping(['Site Name', 'Town', 'Width (m)', 'Rate', 'Image URL', 'Latitude', 'lng']);
    expect(m.title).toBe(0);
    expect(m.city).toBe(1);
    expect(m.width).toBe(2);
    expect(m.price).toBe(3);
    expect(m.photo).toBe(4);
    expect(m.latitude).toBe(5);
    expect(m.longitude).toBe(6);
    expect(m.country).toBeNull();
  });
});

describe('validateRows', () => {
  it('builds the same input the placement form sends', () => {
    const { valid, errors } = validateRows([row(GOOD)], mapping, { NGN: 1500, USD: 1 });
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].row).toBe(2);
    expect(valid[0].input).toMatchObject({
      category: 'Billboard', title: 'Ikeja Along unipole', city: 'Lagos', country_code: 'NG',
      site_address: 'Opposite Ikeja City Mall', size_spec: { kind: 'area', widthM: 12, heightM: 6 },
      rate_amount: 450000, currency: 'NGN', rate_period: 'month', pricing: 10,
    });
  });

  it('lists each problem by spreadsheet row and leaves those rows out', () => {
    const rows = [
      row(GOOD),
      row({ ...GOOD, city: '' }),
      row({ ...GOOD, price: 'call us' }),
      row({ ...GOOD, type: 'Blimp' }),
      row({ ...GOOD, photo_link: 'https://images.unsplash.com/photo-1' }),
      row({}), // a blank row is skipped, not an error
    ];
    const { valid, errors } = validateRows(rows, mapping);
    expect(valid.map((d) => d.row)).toEqual([2]);
    expect(errors).toEqual([
      { row: 3, message: 'row 3: city missing' },
      { row: 4, message: 'row 4: price is not a number' },
      { row: 5, message: 'row 5: "Blimp" is not a placement type NowOpen lists' },
      { row: 6, message: 'row 6: stock photos are not accepted; use a photo of this site' },
    ]);
  });

  it('accepts a country name, infers the size kind and needs a period with a price', () => {
    const { valid, errors } = validateRows([
      row({ ...GOOD, country: 'kenya', size_type: '', currency: '' }),
      row({ ...GOOD, per: '' }),
      row({ ...GOOD, city: 'Lagos, Ikeja' }),
    ], mapping);
    expect(valid[0].input).toMatchObject({ country_code: 'KE', currency: 'KES', size_spec: { kind: 'area' } });
    expect(errors.map((e) => e.message)).toEqual([
      'row 3: say whether the price is per day, week or month',
      'row 4: put only the city in the city column; the street or landmark goes in address',
    ]);
  });

  it('refuses 2,001 rows', () => {
    const rows = Array.from({ length: IMPORT_LIMITS.maxRows + 1 }, (_, i) => row({ ...GOOD, site_name: `Site ${i}` }));
    const { valid, errors } = validateRows(rows, mapping);
    expect(valid).toEqual([]);
    expect(errors).toEqual([{ row: 0, message: 'This file has 2,001 rows. Import at most 2,000 at a time.' }]);
    expect(validateRows(rows.slice(1), mapping).valid).toHaveLength(IMPORT_LIMITS.maxRows);
  });

  it('an unmapped required column is one error for the file, not one per row', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row({ ...GOOD, site_name: `Site ${i}` }));
    const { valid, errors } = validateRows(rows, { ...mapping, city: null });
    expect(valid).toEqual([]);
    expect(errors).toEqual([{ row: 0, message: "Column for city isn't mapped" }]);
  });

  it('the same site twice in one file: the first row stands, the rest are listed', () => {
    const { valid, errors } = validateRows([
      row(GOOD),
      row({ ...GOOD, site_name: 'Unipole Ikeja Along', price: '500000' }),
      row({ ...GOOD, city: 'Abuja' }), // same name, another city: a different site
      row(GOOD),
    ], mapping);
    expect(valid.map((d) => d.row)).toEqual([2, 4]);
    expect(errors).toEqual([
      { row: 3, message: 'row 3: same site name and city as row 2' },
      { row: 5, message: 'row 5: same site name and city as row 2' },
    ]);
  });

  it('a photo link must be https', () => {
    const { errors } = validateRows([row({ ...GOOD, photo_link: 'http://example.com/site.jpg' })], mapping);
    expect(errors).toEqual([{ row: 2, message: 'row 2: the photo link must start with https://' }]);
    expect(validateRows([row({ ...GOOD, photo_link: 'https://example.com/site.jpg' })], mapping).errors).toEqual([]);
  });
});

describe('findDuplicates', () => {
  const draft = (title: string, city = 'Lagos', lat?: number, lng?: number): Draft => ({
    ...validateRows([row({ ...GOOD, site_name: title, city })], mapping).valid[0],
    latitude: lat ?? null, longitude: lng ?? null,
  });
  const ad = (id: string, title: string, location: string, extra: Record<string, unknown> = {}) =>
    ({ id, title, description: '', location, ...extra }) as Advertisement;

  it('matches the same title tokens in the same city, in any order and either direction', () => {
    const existing = [ad('a1', 'Unipole, Ikeja Along', 'Lagos, Nigeria'), ad('a2', 'Ikeja Along unipole', 'Abuja, Nigeria')];
    expect(findDuplicates(draft('Ikeja Along Unipole'), existing).map((a) => a.id)).toEqual(['a1']);
    expect(findDuplicates(draft('Unipole Ikeja Along'), [ad('a3', 'Ikeja Along Unipole Ltd', 'Lagos, Nigeria')]).map((a) => a.id)).toEqual(['a3']);
  });

  it('a title inside a longer one is a different site (token-set equality, not containment)', () => {
    expect(findDuplicates(draft('Lekki Toll Gate Billboard'), [ad('a1', 'Lekki Toll Gate Billboard North', 'Lagos, Nigeria')])).toEqual([]);
    expect(findDuplicates(draft('Lekki Toll Gate Billboard North'), [ad('a1', 'Lekki Toll Gate Billboard', 'Lagos, Nigeria')])).toEqual([]);
  });

  it('does not match a different site in the same city', () => {
    expect(findDuplicates(draft('Lekki toll gate gantry'), [ad('a1', 'Ikeja Along unipole', 'Lagos, Nigeria')])).toEqual([]);
    // Two of three words shared is below 0.8: a neighbouring structure, not the same one.
    expect(findDuplicates(draft('Ikeja Along gantry'), [ad('a1', 'Ikeja Along unipole', 'Lagos, Nigeria')])).toEqual([]);
  });

  it('matches the same coordinates within 50m, and not beyond', () => {
    const near = ad('a3', 'Something else entirely', 'Lagos, Nigeria', { latitude: 6.6018, longitude: 3.3515 });
    expect(findDuplicates(draft('New name', 'Lagos', 6.6020, 3.3515), [near]).map((a) => a.id)).toEqual(['a3']);
    expect(findDuplicates(draft('New name', 'Lagos', 6.6030, 3.3515), [near])).toEqual([]);
  });
});

describe('runImport', () => {
  const drafts = (n: number, start = 2): Draft[] =>
    Array.from({ length: n }, (_, i) => ({
      ...validateRows([row({ ...GOOD, site_name: `Site ${i}` })], mapping).valid[0],
      row: start + i,
    }));

  it('import update of unowned row creates a claim', async () => {
    const [d] = drafts(1);
    state.adverts = [];
    const existing = [{ id: 'ad-unowned', title: 'Site 0', description: '', location: 'Lagos, Nigeria', owner_id: null } as Advertisement];
    const r = await runImport('o1', [d], { [d.row]: { kind: 'same', advertId: 'ad-unowned' } }, {
      fileName: 'sites.csv', existing, claimStatement: 'We built and run this unipole', invalid: [],
    });
    const rpcs = calls.filter((c) => c.op === 'rpc').map((c) => c.name);
    expect(rpcs).toEqual(['owner_claim_placement']);
    expect(rpcs).not.toContain('owner_update_placement');
    expect(calls.find((c) => c.name === 'owner_claim_placement')!.args).toMatchObject({
      p_advert_id: 'ad-unowned', p_owner_id: 'o1', p_role: 'owner', p_statement: 'We built and run this unipole',
    });
    expect(r).toMatchObject({ total: 1, created: 0, updated: 0, claimed: 1, failed: 0 });
  });

  it("another owner's placement is claimed too (the database refuses it), never edited", async () => {
    const [d] = drafts(1);
    state.rpcFail = { owner_claim_placement: 'This placement already has an owner' };
    const existing = [{ id: 'ad-other', title: 'Site 0', description: '', location: 'Lagos, Nigeria', owner_id: 'o2' } as Advertisement];
    const r = await runImport('o1', [d], { [d.row]: { kind: 'same', advertId: 'ad-other' } }, {
      fileName: 'sites.csv', existing, claimStatement: 'Ours', invalid: [],
    });
    expect(calls.filter((c) => c.op === 'rpc').map((c) => c.name)).toEqual(['owner_claim_placement']);
    expect(r.failed).toBe(1);
    expect(r.errors).toEqual([{ row: 2, message: 'row 2: This placement already has an owner' }]);
  });

  it("updates the owner's own placement with the fields the owner may change", async () => {
    const [d] = drafts(1);
    const existing = [{ id: 'ad-mine', title: 'Site 0', description: '', location: 'Lagos, Nigeria', owner_id: 'o1' } as Advertisement];
    const r = await runImport('o1', [d], { [d.row]: { kind: 'same', advertId: 'ad-mine' } }, {
      fileName: 'sites.csv', existing, invalid: [],
    });
    const call = calls.find((c) => c.name === 'owner_update_placement')!;
    expect(call.args).toMatchObject({ p_advert_id: 'ad-mine' });
    expect(Object.keys((call.args as { p: object }).p)).not.toContain('category');
    expect(r.updated).toBe(1);
  });

  it('writes in batches of 100, records the import, and the counts add up', async () => {
    state.rpcFail = {};
    const ds = drafts(250);
    const invalid = [{ row: 300, message: 'row 300: city missing' }, { row: 301, message: 'row 301: price is not a number' }];
    const progress: number[] = [];
    // Row 5 is a claim with no statement: it fails in claimPlacement's own words.
    const r = await runImport('o1', ds, { 5: { kind: 'same', advertId: 'ad-x' } }, {
      fileName: 'big.xlsx', existing: [], invalid, claimStatement: '', onProgress: (done) => progress.push(done),
    });
    expect(progress).toEqual([100, 200, 250]);
    expect(r.total).toBe(252);
    expect(r.created).toBe(249);
    expect(r.failed).toBe(3);
    expect(r.created + r.updated + r.claimed + r.failed).toBe(r.total);
    expect(r.errors.map((e) => e.row)).toEqual([5, 300, 301]);
    const insert = calls.find((c) => c.op === 'insert' && c.table === 'placement_imports')!;
    expect(insert.payload).toEqual({
      owner_id: 'o1', file_name: 'big.xlsx', rows_total: 252, rows_created: 249, rows_claimed: 0, rows_failed: 3,
      error_report: r.errors,
    });
    expect(r.recorded).toBe(true);
  });

  it('never has more than 10 writes in flight', async () => {
    let inFlight = 0; let peak = 0;
    const original = vi.mocked(supabase.rpc).getMockImplementation()!;
    vi.mocked(supabase.rpc).mockImplementation((async (name: string) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return { data: `${name}-id`, error: null };
    }) as never);
    try {
      const r = await runImport('o1', drafts(120), {}, { fileName: 'x.csv', existing: [], invalid: [] });
      expect(r.created).toBe(120);
      expect(peak).toBe(IMPORT_LIMITS.concurrency);
      expect(IMPORT_LIMITS.concurrency).toBe(10);
    } finally {
      vi.mocked(supabase.rpc).mockImplementation(original);
    }
  });

  it('the recorded error report keeps 200 entries and one "and N more" line', () => {
    const many = Array.from({ length: 450 }, (_, i) => ({ row: i + 2, message: `row ${i + 2}: city missing` }));
    const capped = capReport(many);
    expect(capped).toHaveLength(201);
    expect(capped[199]).toEqual(many[199]);
    expect(capped[200]).toEqual({ row: 0, message: 'and 250 more' });
    expect(capReport(many.slice(0, 200))).toHaveLength(200);
  });

  it('a refused create is a failed row in the report, and the rest still go through', async () => {
    state.rpcFail = { owner_create_placement: 'Upload a photo of the actual site.' };
    const r = await runImport('o1', drafts(2), {}, { fileName: 'x.csv', existing: [], invalid: [] });
    expect(r).toMatchObject({ total: 2, created: 0, failed: 2 });
    expect(r.errors[0].message).toBe('row 2: Upload a photo of the actual site.');
  });
});
