/**
 * Turning what a source said into what NowOpen stores.
 *
 * Every later stage depends on this one: duplicate detection compares
 * normalised names, confidence scoring counts normalised fields, and the
 * publish gate trusts both. Normalisation that quietly mangles a value produces
 * a confident wrong answer downstream, so the rule throughout is to return null
 * rather than guess.
 *
 * Written for the market it serves. Nigerian numbers arrive as 0801…, 234801…,
 * +234 801…, and with spaces, dots and brackets; "Ltd", "Nigeria Limited" and
 * "Nig. Ltd" are the same suffix; "Rest." and "Restaurant" are the same word.
 */

/** Nigeria's country code, and the length of a subscriber number after it. */
const NG_CC = '234';
const NG_NSN = 10;

/**
 * A phone number in E.164, or null.
 *
 * Null is a real answer and the common one — a source that supplies a number
 * NowOpen cannot dial is worse than a source that supplies none, because the
 * confidence score would count it.
 */
export function normalizePhone(raw: string | null | undefined, cc: string = NG_CC): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, '');
  if (!d) return null;

  if (d.startsWith('+')) d = d.slice(1);
  // 00234… international prefix.
  if (d.startsWith('00')) d = d.slice(2);
  // Local trunk form: 0801… → 801…
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  else if (d.startsWith(cc)) d = d.slice(cc.length);

  // A trunk zero can survive the country code: 2340801…
  if (d.length === NG_NSN + 1 && d.startsWith('0')) d = d.slice(1);

  if (d.length !== NG_NSN) return null;
  // Nigerian mobile and landline subscriber numbers never begin with 0 or 1.
  if (/^[01]/.test(d)) return null;
  return `+${cc}${d}`;
}

/** The registrable part of a website, lowercased, or null. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  // A bare label is not a domain; neither is something with no valid TLD.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;
  if (s.includes('..') || s.startsWith('-') || s.startsWith('.')) return null;
  return s;
}

export function normalizeUrl(raw: string | null | undefined): string | null {
  const domain = normalizeDomain(raw);
  if (!domain) return null;
  const s = String(raw).trim();
  const path = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').slice(domain.length);
  return `https://${domain}${path.startsWith('/') ? path.split(/[?#]/)[0].replace(/\/$/, '') : ''}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(s)) return null;
  return s;
}

/*
 * Company-form words, dropped before comparing names.
 *
 * "Yemzo Ltd" and "Yemzo Limited" are one business. Keeping the suffix makes
 * the two look 80% similar instead of identical, which is exactly the band
 * where a duplicate slips through as "possible".
 */
const LEGAL_SUFFIX = /\b(ltd|limited|plc|inc|incorporated|llc|enterprises?|ventures?|nig|nigeria|company|co|and sons|& sons|intl|international|global|group|holdings)\b/g;

/** Words that vary freely between sources without changing the business. */
const NOISE = /\b(the|a|an|of|for|at|in|on)\b/g;

const ABBREV: Array<[RegExp, string]> = [
  [/\brest\b/g, 'restaurant'],
  [/\bpharm\b/g, 'pharmacy'],
  [/\bsupermkt\b/g, 'supermarket'],
  [/\bmkt\b/g, 'market'],
  [/\bsvcs?\b/g, 'services'],
  [/\bctr\b/g, 'centre'],
  [/\bcenter\b/g, 'centre'],
  [/\bhosp\b/g, 'hospital'],
  [/\bacad\b/g, 'academy'],
];

/**
 * A business name reduced to what identifies it.
 *
 * Used for comparison only. The display name is always the one the source gave
 * or the owner set — nothing here is ever shown to anybody.
 */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).toLowerCase();
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[&]/g, ' and ');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  for (const [re, to] of ABBREV) s = s.replace(re, to);
  s = s.replace(LEGAL_SUFFIX, ' ');
  s = s.replace(NOISE, ' ');
  return collapseInitialisms(s.replace(/\s+/g, ' ').trim());
}

/**
 * "X Y Z Foods" becomes "xyz foods".
 *
 * Stripping punctuation turns "X.Y.Z." into three separate one-letter tokens,
 * which then share nothing with the "XYZ" the next source supplied — the two
 * spellings score as unrelated and the same business is listed twice. Runs of
 * single letters are the signature of an initialism, so they are rejoined.
 */
function collapseInitialisms(s: string): string {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 2) out.push(run.join(''));
    else if (run.length === 1) out.push(run[0]);
    run = [];
  };
  for (const token of s.split(' ')) {
    if (token.length === 1 && /[a-z]/.test(token)) run.push(token);
    else { flush(); out.push(token); }
  }
  flush();
  return out.filter(Boolean).join(' ');
}

/** A place name reduced for comparison. */
export function normalizePlace(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(state|lga|local government( area)?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Street address reduced for comparison: "24 Admiralty Way" → "24 admiralty way". */
export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(road|rd)\b/g, 'road')
    .replace(/\b(street|st)\b/g, 'street')
    .replace(/\b(avenue|ave)\b/g, 'avenue')
    .replace(/\b(close|cl)\b/g, 'close')
    .replace(/\b(crescent|cres)\b/g, 'crescent')
    .replace(/\bno\b|\bnumber\b|\bplot\b|\bsuite\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What a normalised candidate looks like once the stage has run. */
export interface NormalizedBusiness {
  name: string;
  nameKey: string;
  category: string | null;
  city: string | null;
  cityKey: string;
  address: string | null;
  addressKey: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  domain: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface RawBusiness {
  business_name?: string | null;
  name?: string | null;
  category?: string | null;
  city?: string | null;
  location?: string | null;
  address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise one discovered record.
 *
 * Never invents. A field the source did not supply, or supplied in a form that
 * cannot be trusted, comes out null — which is what the confidence score is
 * then allowed to see.
 */
export function normalizeBusiness(raw: RawBusiness | null | undefined): NormalizedBusiness | null {
  const name = (raw?.business_name ?? raw?.name ?? '').toString().trim();
  if (!name) return null;

  const city = (raw?.city ?? raw?.location ?? null)?.toString().trim() || null;
  const address = raw?.address?.toString().trim() || null;
  const website = normalizeUrl(raw?.website);

  const lat = num(raw?.latitude);
  const lng = num(raw?.longitude);

  return {
    name,
    nameKey: normalizeName(name),
    category: raw?.category?.toString().trim() || null,
    city,
    cityKey: normalizePlace(city),
    address,
    addressKey: normalizeAddress(address),
    phone: normalizePhone(raw?.phone),
    whatsapp: normalizePhone(raw?.whatsapp),
    email: normalizeEmail(raw?.email),
    website,
    domain: normalizeDomain(raw?.website),
    // Out-of-range coordinates are dropped rather than clamped: a clamped
    // coordinate is a confident lie about where a business is.
    latitude: lat !== null && lat >= -90 && lat <= 90 ? lat : null,
    longitude: lng !== null && lng >= -180 && lng <= 180 ? lng : null,
  };
}
