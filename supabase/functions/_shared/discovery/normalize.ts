/**
 * Turning what a source said into what radar_candidates stores.
 *
 * Ported from src/lib/radar/normalize.ts (identical rules — same numbers,
 * same refusal-to-guess policy). Two systems computing different name_keys
 * for the same business is how duplicates are born, so the worker must use
 * exactly the engine the review queue was built with.
 *
 * The rule throughout: return null rather than guess. A source that supplies
 * a number NowOpen cannot dial is worse than a source that supplies none,
 * because the confidence score would count it.
 */

/** Nigeria's country code, and the length of a subscriber number after it. */
const NG_CC = '234';
const NG_NSN = 10;

/** A phone number in E.164, or null. */
export function normalizePhone(raw: string | null | undefined, cc: string = NG_CC): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, '');
  if (!d) return null;

  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  else if (d.startsWith(cc)) d = d.slice(cc.length);

  if (d.length === NG_NSN + 1 && d.startsWith('0')) d = d.slice(1);

  if (d.length !== NG_NSN) return null;
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

const LEGAL_SUFFIX = /\b(ltd|limited|plc|inc|incorporated|llc|enterprises?|ventures?|nig|nigeria|company|co|and sons|& sons|intl|international|global|group|holdings)\b/g;

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

/** A business name reduced to what identifies it. For comparison only. */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw).toLowerCase();
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[&]/g, ' and ');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  for (const [re, to] of ABBREV) s = s.replace(re, to);
  s = s.replace(LEGAL_SUFFIX, ' ');
  s = s.replace(NOISE, ' ');
  return collapseInitialisms(s.replace(/\s+/g, ' ').trim());
}

/** "X Y Z Foods" becomes "xyz foods". */
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
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(state|lga|local government( area)?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Street address reduced for comparison. */
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

/** The normalised keys radar_candidates uses for duplicate detection. */
export interface CandidateKeys {
  name_key: string;
  city_key: string;
  phone_e164: string | null;
  domain: string | null;
}

export function candidateKeys(c: {
  name: string;
  city?: string | null;
  phone?: string | null;
  website?: string | null;
}): CandidateKeys {
  return {
    name_key: normalizeName(c.name),
    city_key: normalizePlace(c.city ?? ''),
    phone_e164: normalizePhone(c.phone),
    domain: normalizeDomain(c.website),
  };
}