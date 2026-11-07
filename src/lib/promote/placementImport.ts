import { supabase } from '../supabase';
import { CURRENCIES } from '../currency';
import { isStockPlaceholder } from '../stockImage';
import { ADVERT_CATEGORIES } from '../../data/advertCategories';
import { distanceMetres } from '../radar/entity';
import { normalizePlace } from '../radar/normalize';
import { nameSimilarity, tokens, DUPLICATE_THRESHOLD } from '../../../supabase/functions/_shared/nameMatch';
import type { Advertisement } from '../../types';
import type { Result } from './mediaOwners';
import {
  claimPlacement, createPlacement, updatePlacement, recordImport, cityOf, PLACEMENT_COUNTRIES,
  type ImportErrorEntry, type PlacementInput, type PlacementPatch,
} from './partner';
import {
  sizeSummary, toUsdPerDay, SIZE_KIND_LABELS, VEHICLE_EXTENT_LABELS,
  type RatePeriod, type SizeKind, type SizeSpec, type VehicleExtent,
} from './sizeSpec';

/**
 * Spreadsheet import for media owners: template → upload → map columns →
 * validate each row → preview possible duplicates → confirm.
 *
 * THE RULES THIS FILE HOLDS
 *
 * - Parsing happens in the browser. CSV is parsed here (RFC 4180: quoted
 *   fields, "" inside quotes, commas and line breaks inside quotes, CRLF, LF
 *   or a lone CR). XLSX is read by read-excel-file, loaded only when an XLSX
 *   is chosen so it never weighs on the Dashboard's first load.
 * - Limits: 5MB per file, 2,000 data rows. A bigger file is refused whole,
 *   not truncated: importing "the first 2,000" would silently drop sites.
 * - Every row is checked against the same rules the placement form applies,
 *   and the same PlacementInput is built (size_spec, the owner's own rate,
 *   and pricing as USD per day from toUsdPerDay). A row with any problem is
 *   left out and listed by its spreadsheet row number (the header is row 1),
 *   which is the number the owner sees in Excel or Sheets.
 * - Writes go only through the owner paths that already exist:
 *   createPlacement (owner_create_placement decides the lifecycle),
 *   updatePlacement for a placement already linked to THIS owner, and
 *   claimPlacement for any other "this is the same site". So an import can
 *   never edit a placement the owner does not own: an unowned one becomes a
 *   claim an admin decides, and another owner's is refused by the database
 *   (owner_claim_placement: "This placement already has an owner").
 * - Writes run in batches of 100, one batch after another, with at most 10
 *   in flight at once inside a batch (a small pool, not Promise.all over 100).
 * - The import is recorded once, after its rows (recordImport), with every
 *   left-out and failed row in error_report. placement_imports has no
 *   rows_updated column, so updates are the remainder of the total.
 *
 * DUPLICATES
 *
 * A possible match is a placement in the same city (the first comma segment
 * of "City, Country") whose title has the SAME set of significant tokens
 * (nameSimilarity from _shared/nameMatch.ts, the repo's duplicate rule:
 * token-set equality, measured against the live directory; containment would
 * match distinct sites such as "Lekki Toll Gate Billboard" and "... North"),
 * or one within 50m when both sides carry coordinates. Only
 * placements with no owner or this owner are candidates (spec 4.3). The
 * owner decides each one; nothing is merged automatically.
 */

export type Field =
  | 'category' | 'title' | 'city' | 'country' | 'address'
  | 'sizeType' | 'width' | 'height' | 'resolution' | 'orientation' | 'seconds' | 'spots' | 'coverage' | 'sizeText'
  | 'price' | 'currency' | 'period' | 'description' | 'photo'
  | 'latitude' | 'longitude';

export type Mapping = Record<Field, number | null>;

/**
 * The template's columns, in order. public/templates/nowopen-placements-template.csv
 * has exactly these headers (a test reads the file), and guessMapping maps
 * each one to its own field.
 */
export const TEMPLATE_HEADERS: [Field, string][] = [
  ['category', 'type'],
  ['title', 'site_name'],
  ['city', 'city'],
  ['country', 'country'],
  ['address', 'address'],
  ['sizeType', 'size_type'],
  ['width', 'width_m'],
  ['height', 'height_m'],
  ['resolution', 'resolution'],
  ['orientation', 'orientation'],
  ['seconds', 'seconds_per_spot'],
  ['spots', 'spots_per_day'],
  ['coverage', 'coverage'],
  ['sizeText', 'size_description'],
  ['price', 'price'],
  ['currency', 'currency'],
  ['period', 'per'],
  ['description', 'description'],
  ['photo', 'photo_link'],
];

/** What the mapping step calls each field. */
export const FIELD_LABELS: Record<Field, string> = {
  category: 'Type of placement',
  title: 'Site name',
  city: 'City',
  country: 'Country',
  address: 'Address or landmark',
  sizeType: 'Size type',
  width: 'Width (m)',
  height: 'Height (m)',
  resolution: 'Screen resolution',
  orientation: 'Orientation',
  seconds: 'Seconds per spot',
  spots: 'Spots per day',
  coverage: 'Vehicle coverage',
  sizeText: 'Size description',
  price: 'Price',
  currency: 'Currency',
  period: 'Price per',
  description: 'Description',
  photo: 'Photo link',
  latitude: 'Latitude',
  longitude: 'Longitude',
};

export const FIELDS = Object.keys(FIELD_LABELS) as Field[];

export const IMPORT_LIMITS = {
  maxRows: 2000,
  maxBytes: 5 * 1024 * 1024,
  batchSize: 100,
  /** Writes in flight at once inside a batch. */
  concurrency: 10,
  /** What an XLSX may expand to (worksheets + shared strings), as its zip declares. */
  maxXlsxExpandedBytes: 40 * 1024 * 1024,
  /** Entries kept in the recorded error_report; the rest become one "and N more" line. */
  maxReportEntries: 200,
} as const;

/** The fields every row needs a column for. An unmapped one is one file-level error. */
export const REQUIRED_FIELDS: Field[] = ['category', 'title', 'city', 'country'];

export const TEMPLATE_PATH = '/templates/nowopen-placements-template.csv';

/** A row that passed every check, ready for createPlacement. */
export interface Draft {
  /** The spreadsheet row number (header = row 1). */
  row: number;
  input: PlacementInput;
  /** Used only to spot duplicates; advertisements stores no coordinates. */
  latitude: number | null;
  longitude: number | null;
}

/** For a row with possible matches: the same site as one of them, or a new one. */
export type Decision = { kind: 'new' } | { kind: 'same'; advertId: string };

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  claimed: number;
  failed: number;
  errors: ImportErrorEntry[];
  recorded: boolean;
  recordError: string | null;
}

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

const extOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** CSV or XLSX, 5MB or less. Returns the refusal, or null when acceptable. */
export function checkImportFile(file: File): string | null {
  const ext = extOf(file.name);
  if (ext !== 'csv' && ext !== 'xlsx') return 'This file type is not accepted. Upload a CSV or XLSX file.';
  if (file.size > IMPORT_LIMITS.maxBytes) return 'This file is larger than 5MB. Split it into smaller files.';
  return null;
}

/** A CSV that cannot be read as written; the message names the line. */
export class CsvParseError extends Error {}

/**
 * RFC 4180 CSV into rows of cells. A UTF-8 byte-order mark is dropped.
 *
 * An unterminated quote throws CsvParseError naming the line it opened on.
 * Without that, one stray quote silently swallows the rest of the file into a
 * single cell and the owner reads "1 row ready" for a 500-row sheet.
 *
 * A final line that is only `""` is kept as a row with one empty cell (a
 * field was written, so it is a row); validateRows skips it as blank, so it
 * neither imports nor counts. A trailing line break alone adds no row.
 */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let quotedField = false;
  let line = 1;
  let quoteLine = 1;
  let i = 0;
  const endRow = () => { row.push(cell); rows.push(row); row = []; cell = ''; quotedField = false; };
  while (i < s.length) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      if (ch === '\n' || (ch === '\r' && s[i + 1] !== '\n')) line += 1;
      cell += ch; i += 1; continue;
    }
    if (ch === '"' && cell === '') { quoted = true; quotedField = true; quoteLine = line; i += 1; continue; }
    if (ch === ',') { row.push(cell); cell = ''; quotedField = false; i += 1; continue; }
    if (ch === '\r' || ch === '\n') {
      endRow();
      i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1;
      line += 1;
      continue;
    }
    cell += ch; i += 1;
  }
  if (quoted) {
    throw new CsvParseError(`Line ${quoteLine} has a quote (") that is never closed. Fix that line and upload the file again.`);
  }
  if (cell !== '' || row.length > 0 || quotedField) endRow();
  return rows;
}

const cellText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
};

/** An XLSX refused before it is read; the message is for the owner. */
export class XlsxTooLargeError extends Error {}

/**
 * What an XLSX's worksheets and shared strings expand to, as its zip central
 * directory declares, read WITHOUT decompressing anything: the filter sees
 * each entry's declared size and answers false. Null when the file is not a
 * readable zip, which leaves the refusal to read-excel-file.
 *
 * WHY THIS AND NOT A ROW CAP: read-excel-file 9.3.12 has no row-limit option
 * (its options are trim, parseNumber and dateFormat) and readSheet
 * materialises the whole sheet; the <dimension> element sits inside the sheet
 * XML, so reading it means inflating that XML first. A 5MB XLSX can expand far
 * past 5MB, so this bounds memory before reading. The declared size can be
 * forged; that only slows the owner's own tab, and the 2,000-row refusal
 * still applies after reading.
 *
 * fflate is loaded here, on the XLSX path only, like read-excel-file: a static
 * import put a 13KB chunk on every Dashboard load for owners who never import.
 */
export async function xlsxExpandedSize(bytes: Uint8Array): Promise<number | null> {
  const { unzipSync } = await import('fflate');
  let total = 0;
  try {
    unzipSync(bytes, {
      filter: (f) => {
        if (/^xl\/(worksheets\/[^/]+\.xml|sharedStrings\.xml)$/i.test(f.name)) total += f.originalSize;
        return false;
      },
    });
  } catch {
    return null;
  }
  return total;
}

/** The first sheet of an XLSX workbook, every cell as text. */
export async function parseXlsx(file: File): Promise<string[][]> {
  const expanded = await xlsxExpandedSize(new Uint8Array(await file.arrayBuffer()));
  if (expanded !== null && expanded > IMPORT_LIMITS.maxXlsxExpandedBytes) {
    throw new XlsxTooLargeError(
      `This file has more than ${IMPORT_LIMITS.maxRows.toLocaleString('en-US')} placements. Split it and import each part.`,
    );
  }
  const { readSheet } = await import('read-excel-file/browser');
  const data = await readSheet(file);
  return (data as unknown[][]).map((r) => r.map(cellText));
}

/** Check, then parse, a chosen file. Rows include the header row. */
export async function readSpreadsheet(file: File): Promise<Result<{ rows: string[][] }>> {
  const refused = checkImportFile(file);
  if (refused) return { ok: false, error: refused };
  try {
    const rows = extOf(file.name) === 'xlsx' ? await parseXlsx(file) : parseCsv(await file.text());
    if (rows.length < 2) return { ok: false, error: 'This file has no rows under the header.' };
    return { ok: true, rows };
  } catch (e) {
    if (e instanceof CsvParseError || e instanceof XlsxTooLargeError) return { ok: false, error: e.message };
    return { ok: false, error: 'This file could not be read. Save it again as CSV or XLSX and retry.' };
  }
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

const normHeader = (h: string) => h.toLowerCase().replace(/\(m\)/g, ' m').replace(/[^a-z0-9]+/g, ' ').trim();

/** Header names each field is recognised by, after normHeader. The template's own name comes first. */
const SYNONYMS: Record<Field, string[]> = {
  category: ['type', 'type of placement', 'placement type', 'category', 'medium', 'media type', 'format'],
  title: ['site name', 'name', 'title', 'site', 'placement', 'placement name'],
  city: ['city', 'town'],
  country: ['country', 'country code'],
  address: ['address', 'address or landmark', 'landmark', 'site address', 'street', 'location'],
  sizeType: ['size type', 'size kind'],
  width: ['width m', 'width', 'width metres', 'width meters'],
  height: ['height m', 'height', 'height metres', 'height meters'],
  resolution: ['resolution', 'screen resolution'],
  orientation: ['orientation'],
  seconds: ['seconds per spot', 'seconds', 'spot length', 'spot seconds'],
  spots: ['spots per day', 'spots', 'spots a day'],
  coverage: ['coverage', 'vehicle coverage', 'wrap'],
  sizeText: ['size description', 'size', 'dimensions'],
  price: ['price', 'rate', 'amount', 'rate amount', 'cost'],
  currency: ['currency'],
  period: ['per', 'period', 'price per', 'rate period', 'billing period'],
  description: ['description', 'notes', 'details'],
  photo: ['photo link', 'photo', 'photo url', 'image', 'image url', 'image link', 'picture'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon', 'long'],
};

/** A best guess at which column holds each field; null when none does. Each column is used once. */
export function guessMapping(headers: string[]): Mapping {
  const norm = headers.map((h) => normHeader(String(h ?? '')));
  const used = new Set<number>();
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, null])) as Mapping;
  // Exact names first, field by field in synonym order, so "size" goes to the
  // size description only when no better column claimed it.
  const maxLen = Math.max(...FIELDS.map((f) => SYNONYMS[f].length));
  for (let rank = 0; rank < maxLen; rank++) {
    for (const f of FIELDS) {
      if (mapping[f] !== null) continue;
      const name = SYNONYMS[f][rank];
      if (!name) continue;
      const i = norm.findIndex((h, idx) => h === name && !used.has(idx));
      if (i >= 0) { mapping[f] = i; used.add(i); }
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

const FALLBACK_RATES: Record<string, number> = Object.fromEntries(CURRENCIES.map((c) => [c.code, c.fallbackRate]));
const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'").trim();

/** "450000", "450,000" or "4.5"; null for blank; NaN for anything else. */
function readNumber(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  const plain = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s;
  return /^-?\d+(\.\d+)?$/.test(plain) ? Number(plain) : NaN;
}

const SIZE_KIND_NAMES: Record<string, SizeKind> = Object.fromEntries([
  ...(Object.keys(SIZE_KIND_LABELS) as SizeKind[]).flatMap((k) => [[k, k], [fold(SIZE_KIND_LABELS[k]), k]]),
  ['width x height', 'area'], ['dimensions', 'area'], ['digital', 'screen'], ['radio', 'airtime'], ['tv', 'airtime'],
]);
const EXTENT_NAMES: Record<string, VehicleExtent> = Object.fromEntries(
  (Object.keys(VEHICLE_EXTENT_LABELS) as VehicleExtent[]).flatMap((k) => [[k, k], [fold(VEHICLE_EXTENT_LABELS[k]), k]]),
);
const PERIOD_NAMES: Record<string, RatePeriod> = {
  day: 'day', daily: 'day', 'per day': 'day', week: 'week', weekly: 'week', 'per week': 'week',
  month: 'month', monthly: 'month', 'per month': 'month',
};

function countryOf(raw: string) {
  const v = fold(raw);
  return PLACEMENT_COUNTRIES.find((c) => c.code.toLowerCase() === v || fold(c.name) === v) ?? null;
}

const positive = (n: number | null) => n !== null && Number.isFinite(n) && n > 0;

/** A title's significant tokens, order-free (nameMatch's tokeniser); the raw title when it has none. */
const siteKey = (title: string) => {
  const t = [...new Set(tokens(title))].sort();
  return t.length ? t.join(' ') : title.toLowerCase().trim();
};

/**
 * Check every data row (the header row excluded). A blank row is skipped.
 * `rates` is the loadRates map; until it loads, the bundled fallback rates
 * stand in, as they do in the placement form.
 */
export function validateRows(
  rows: string[][],
  mapping: Mapping,
  rates: Record<string, number> = FALLBACK_RATES,
): { valid: Draft[]; errors: ImportErrorEntry[] } {
  const filled = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (filled.length > IMPORT_LIMITS.maxRows) {
    return {
      valid: [],
      errors: [{
        row: 0,
        message: `This file has ${filled.length.toLocaleString('en-US')} rows. Import at most ${IMPORT_LIMITS.maxRows.toLocaleString('en-US')} at a time.`,
      }],
    };
  }
  // A missing column is one problem with the file, not one per row.
  const unmapped = REQUIRED_FIELDS.filter((f) => mapping[f] === null);
  if (unmapped.length) {
    return {
      valid: [],
      errors: unmapped.map((f) => ({ row: 0, message: `Column for ${FIELD_LABELS[f].toLowerCase()} isn't mapped` })),
    };
  }
  const valid: Draft[] = [];
  const errors: ImportErrorEntry[] = [];
  /** The first row seen for each site (same title tokens and city) in this file. */
  const firstRowOf = new Map<string, number>();
  rows.forEach((cells, index) => {
    if (!cells.some((c) => String(c ?? '').trim() !== '')) return;
    const n = index + 2;
    const get = (f: Field) => (mapping[f] === null ? '' : String(cells[mapping[f]!] ?? '').trim());
    const problems: string[] = [];

    const categoryRaw = get('category');
    const category = ADVERT_CATEGORIES.find((c) => fold(c) === fold(categoryRaw)) ?? null;
    if (!categoryRaw) problems.push('type missing');
    else if (!category) problems.push(`"${categoryRaw}" is not a placement type NowOpen lists`);

    const title = get('title');
    if (!title) problems.push('site name missing');

    const city = get('city');
    if (!city) problems.push('city missing');
    else if (city.includes(',')) problems.push('put only the city in the city column; the street or landmark goes in address');

    const countryRaw = get('country');
    const country = countryRaw ? countryOf(countryRaw) : null;
    if (!countryRaw) problems.push('country missing');
    else if (!country) problems.push(`"${countryRaw}" is not a country NowOpen lists placements in yet`);

    // Size: the stated kind, or the one the filled columns show.
    const width = readNumber(get('width'));
    const height = readNumber(get('height'));
    const seconds = readNumber(get('seconds'));
    const spots = readNumber(get('spots'));
    const kindRaw = fold(get('sizeType'));
    let kind: SizeKind | null = kindRaw ? SIZE_KIND_NAMES[kindRaw] ?? null : null;
    if (kindRaw && !kind) problems.push(`size type "${get('sizeType')}" is not one of: area, screen, airtime, vehicle, other`);
    if (!kindRaw) {
      if (width !== null || height !== null) kind = 'area';
      else if (get('resolution')) kind = 'screen';
      else if (seconds !== null || spots !== null) kind = 'airtime';
      else if (get('coverage')) kind = 'vehicle';
      else if (get('sizeText')) kind = 'other';
      else problems.push('size missing');
    }
    let size: SizeSpec | null = null;
    switch (kind) {
      case 'area':
        if (positive(width) && positive(height)) size = { kind: 'area', widthM: width!, heightM: height! };
        else problems.push('width and height must be numbers in metres');
        break;
      case 'screen': {
        const o = fold(get('orientation'));
        if (o && o !== 'landscape' && o !== 'portrait') problems.push('orientation must be landscape or portrait');
        if (!get('resolution')) problems.push('screen resolution missing');
        else size = { kind: 'screen', resolution: get('resolution'), orientation: o === 'portrait' ? 'portrait' : 'landscape' };
        break;
      }
      case 'airtime':
        if (positive(seconds) && positive(spots)) size = { kind: 'airtime', seconds: seconds!, spotsPerDay: spots! };
        else problems.push('seconds per spot and spots per day must be numbers');
        break;
      case 'vehicle': {
        const e = EXTENT_NAMES[fold(get('coverage'))];
        if (e) size = { kind: 'vehicle', extent: e };
        else problems.push('coverage must be one flank, both flanks or full wrap');
        break;
      }
      case 'other':
        if (get('sizeText')) size = { kind: 'other', text: get('sizeText') };
        else problems.push('size description missing');
        break;
      default:
        break;
    }

    // Price: optional, but a price needs a period and a currency NowOpen knows.
    const amount = readNumber(get('price'));
    let currency = get('currency').toUpperCase();
    let period: RatePeriod | null = null;
    if (amount !== null) {
      if (Number.isNaN(amount) || amount < 0) problems.push('price is not a number');
      period = PERIOD_NAMES[fold(get('period'))] ?? null;
      if (!period) problems.push('say whether the price is per day, week or month');
    }
    if (!currency) currency = country && CURRENCY_CODES.has(country.currency) ? country.currency : 'USD';
    else if (!CURRENCY_CODES.has(currency)) problems.push(`currency "${get('currency')}" is not one NowOpen prices in`);

    const photo = get('photo');
    if (photo) {
      if (isStockPlaceholder(photo)) problems.push('stock photos are not accepted; use a photo of this site');
      else if (!/^https:\/\/\S+$/i.test(photo)) problems.push('the photo link must start with https://');
    }

    const lat = readNumber(get('latitude'));
    const lng = readNumber(get('longitude'));

    // The same site twice in one file: the first row stands, the rest are
    // listed. Importing both would list one billboard twice.
    if (!problems.length) {
      const key = `${siteKey(title)}|${normalizePlace(city)}`;
      const first = firstRowOf.get(key);
      if (first !== undefined) problems.push(`same site name and city as row ${first}`);
      else firstRowOf.set(key, n);
    }

    if (problems.length) {
      for (const p of problems) errors.push({ row: n, message: `row ${n}: ${p}` });
      return;
    }
    const rate = amount !== null && !Number.isNaN(amount) ? amount : null;
    valid.push({
      row: n,
      input: {
        category: category!,
        title,
        description: get('description') || null,
        city,
        country_code: country!.code,
        site_address: get('address') || null,
        size_spec: size,
        rate_amount: rate,
        currency,
        rate_period: rate === null ? null : period,
        pricing: rate === null || !period ? null : toUsdPerDay(rate, currency, period, rates),
        image_url: photo || null,
        media_urls: photo ? [photo] : null,
      },
      latitude: lat !== null && !Number.isNaN(lat) && lat >= -90 && lat <= 90 ? lat : null,
      longitude: lng !== null && !Number.isNaN(lng) && lng >= -180 && lng <= 180 ? lng : null,
    });
  });
  return { valid, errors };
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

const SAME_SITE_METRES = 50;

type WithCoords = Advertisement & { latitude?: number | null; longitude?: number | null };

/** The existing placements this row may be. Order kept from `existing`. */
export function findDuplicates(draft: Draft, existing: Advertisement[]): Advertisement[] {
  const city = normalizePlace(draft.input.city);
  const title = draft.input.title;
  return existing.filter((raw) => {
    const a = raw as WithCoords;
    if (
      draft.latitude !== null && draft.longitude !== null
      && typeof a.latitude === 'number' && typeof a.longitude === 'number'
      && distanceMetres(draft.latitude, draft.longitude, a.latitude, a.longitude) <= SAME_SITE_METRES
    ) return true;
    if (normalizePlace(cityOf(a.location)) !== city) return false;
    return nameSimilarity(title, a.title).score >= DUPLICATE_THRESHOLD;
  });
}

const PAGE = 1000;

/**
 * Placements a row may duplicate: no owner or this owner, not rejected or
 * archived (those cannot be claimed). Paged past PostgREST's silent 1,000-row
 * cap with an id tiebreaker.
 */
export function loadDuplicateCandidates(ownerId: string): Promise<Result<{ adverts: Advertisement[] }>> {
  return (async () => {
    try {
      const out: Advertisement[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('advertisements')
          .select('id,title,location,owner_id,lifecycle,image_url,media_urls')
          .or(`owner_id.is.null,owner_id.eq.${ownerId}`)
          .order('id')
          .range(from, from + PAGE - 1);
        if (error) return { ok: false as const, error: error.message };
        const rows = (data ?? []) as unknown as Advertisement[];
        out.push(...rows.filter((a) => a.lifecycle !== 'rejected' && a.lifecycle !== 'archived'));
        if (rows.length < PAGE) break;
      }
      return { ok: true as const, adverts: out };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  })();
}

// ---------------------------------------------------------------------------
// Running the import
// ---------------------------------------------------------------------------

/** What an "update it" may change on the owner's own placement: the form's editable fields only. */
function patchFrom(d: Draft, current: Advertisement | undefined): PlacementPatch {
  const p = d.input;
  const patch: PlacementPatch = {
    title: p.title,
    city: p.city,
    country_code: p.country_code,
    size_spec: p.size_spec,
    dimensions: p.size_spec ? sizeSummary(p.size_spec) || null : null,
  };
  if (p.description) patch.description = p.description;
  if (p.site_address) patch.site_address = p.site_address;
  // A blank price leaves the existing price alone (a price change moves the
  // pricing source date; restating nothing should not).
  if (p.rate_amount !== null) {
    patch.rate_amount = p.rate_amount;
    patch.currency = p.currency;
    patch.rate_period = p.rate_period;
    patch.pricing = p.pricing;
  }
  if (p.image_url) {
    patch.image_url = p.image_url;
    const media = current?.media_urls ?? [];
    patch.media_urls = media.includes(p.image_url) ? media : [...media, p.image_url];
  }
  return patch;
}

export interface RunImportOptions {
  fileName: string;
  /** The candidates the duplicates came from; decides own (update) versus not (claim). */
  existing: Advertisement[];
  /** Rows left out by validateRows; they count as failed and go in the report. */
  invalid: ImportErrorEntry[];
  /** The owner's own words on how these sites are theirs; needed for any claim. */
  claimStatement?: string;
  onProgress?: (done: number, total: number) => void;
}

type Outcome = 'created' | 'updated' | 'claimed' | { error: string };

/** Run `work` over `items` with at most `limit` in flight; results keep the items' order. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await work(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

/** The recorded report: the first 200 entries, then one line for the rest. */
export function capReport(errors: ImportErrorEntry[]): ImportErrorEntry[] {
  const max = IMPORT_LIMITS.maxReportEntries;
  if (errors.length <= max) return errors;
  return [...errors.slice(0, max), { row: 0, message: `and ${(errors.length - max).toLocaleString('en-US')} more` }];
}

export async function runImport(
  ownerId: string,
  drafts: Draft[],
  decisions: Record<number, Decision>,
  options: RunImportOptions,
): Promise<ImportResult> {
  const byId = new Map(options.existing.map((a) => [a.id, a]));

  const one = async (d: Draft): Promise<Outcome> => {
    const decision = decisions[d.row];
    if (decision?.kind === 'same') {
      const current = byId.get(decision.advertId);
      // Only a placement KNOWN to be this owner's is edited. Anything else,
      // unowned or not, is a claim; the database refuses one already owned.
      if (current && current.owner_id === ownerId) {
        const r = await updatePlacement(decision.advertId, patchFrom(d, current));
        return r.ok ? 'updated' : { error: r.error };
      }
      const r = await claimPlacement(decision.advertId, ownerId, 'owner', options.claimStatement ?? '', null);
      return r.ok ? 'claimed' : { error: r.error };
    }
    const r = await createPlacement(ownerId, d.input);
    return r.ok ? 'created' : { error: r.error };
  };

  let created = 0; let updated = 0; let claimed = 0;
  const writeErrors: ImportErrorEntry[] = [];
  for (let i = 0; i < drafts.length; i += IMPORT_LIMITS.batchSize) {
    const batch = drafts.slice(i, i + IMPORT_LIMITS.batchSize);
    const outcomes = await pool(batch, IMPORT_LIMITS.concurrency, (d) =>
      one(d).catch((e: unknown): Outcome => ({ error: e instanceof Error ? e.message : String(e) })));
    outcomes.forEach((o, k) => {
      if (o === 'created') created++;
      else if (o === 'updated') updated++;
      else if (o === 'claimed') claimed++;
      else writeErrors.push({ row: batch[k].row, message: `row ${batch[k].row}: ${o.error}` });
    });
    options.onProgress?.(Math.min(i + batch.length, drafts.length), drafts.length);
  }

  const invalidRows = new Set(options.invalid.filter((e) => e.row > 0).map((e) => e.row));
  const failed = invalidRows.size + writeErrors.length;
  const total = drafts.length + invalidRows.size;
  const errors = [...writeErrors, ...options.invalid].sort((a, b) => a.row - b.row);

  const rec = await recordImport(
    ownerId,
    options.fileName,
    { rows_total: total, rows_created: created, rows_claimed: claimed, rows_failed: failed },
    capReport(errors),
  );
  return { total, created, updated, claimed, failed, errors, recorded: rec.ok, recordError: rec.ok ? null : rec.error };
}
