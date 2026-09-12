/**
 * The rest of a business profile, read out of a spreadsheet.
 *
 * WHAT WAS WRONG
 *
 * `businesses` holds 72 columns — tagline, about, story, mission, socials,
 * founded year, payment methods, service area — and the importer mapped 23 of
 * them. Worse, the ones it DID map beyond the core dozen went nowhere:
 * `import_batch_to_candidates` projected 12 keys into `radar_candidates`, so a
 * file supplying a logo, a tagline or an Instagram handle had them read,
 * validated, staged in `import_rows.mapped`… and dropped at the candidate
 * stage. Nothing reported it. An admin filling in every column of a template
 * would have watched a business publish with a third of it missing.
 *
 * WHAT THIS FILE DOES
 *
 * Turns spreadsheet text into the shapes the profile page actually reads. It
 * is all pure, because every one of these conversions has a wrong answer that
 * looks right:
 *
 *   "@mamaput"          →  https://instagram.com/mamaput
 *   "Haircut:2500 | Beard trim:1500"
 *                       →  [{name: 'Haircut', price: '2500'}, …]
 *   "English, Yoruba"   →  ['English', 'Yoruba']
 *   "Est. 1998"         →  1998
 *   "UNKNOWN"           →  nothing at all
 *
 * WHERE THE WORK IS SPLIT
 *
 * Interpretation happens HERE, in TypeScript, under test. The SQL that moves a
 * candidate into `businesses` only does mechanics — split a canonical
 * pipe-delimited string, cast a JSON string, build an object from flat keys.
 * A regex that guesses what "Est. 1998" means does not belong in a migration.
 */

import { isPlaceholderValue, checkWebsite } from '../webLink';

/* --- Socials -------------------------------------------------------------- */

export interface SocialPlatform {
  /** The key written into `businesses.social_links`. */
  key: string;
  label: string;
  /** Host that confirms a pasted URL belongs to this platform. */
  host: RegExp;
  /** How a bare handle becomes a URL. */
  fromHandle: (handle: string) => string;
}

/**
 * The platforms a Nigerian business actually lists.
 *
 * `social_links` is a free-form jsonb object, so this list is about what the
 * importer will RECOGNISE — a column headed "Snapchat" stays unmapped and
 * visible rather than being invented into a key nothing renders.
 */
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = Object.freeze([
  { key: 'instagram', label: 'Instagram', host: /(^|\.)instagram\.com$/i, fromHandle: (h) => `https://instagram.com/${h}` },
  { key: 'facebook', label: 'Facebook', host: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i, fromHandle: (h) => `https://facebook.com/${h}` },
  { key: 'twitter', label: 'X (Twitter)', host: /(^|\.)(twitter\.com|x\.com)$/i, fromHandle: (h) => `https://x.com/${h}` },
  { key: 'tiktok', label: 'TikTok', host: /(^|\.)tiktok\.com$/i, fromHandle: (h) => `https://tiktok.com/@${h}` },
  { key: 'linkedin', label: 'LinkedIn', host: /(^|\.)linkedin\.com$/i, fromHandle: (h) => `https://linkedin.com/company/${h}` },
  { key: 'youtube', label: 'YouTube', host: /(^|\.)(youtube\.com|youtu\.be)$/i, fromHandle: (h) => `https://youtube.com/@${h}` },
]);

export type SocialProblem = 'placeholder' | 'not_a_handle' | 'wrong_platform';

export interface SocialResult {
  /** An absolute https URL, or null when there is nothing to link to. */
  url: string | null;
  problem: SocialProblem | null;
}

/** A handle: letters, digits, dot, dash, underscore. No spaces, no slashes. */
const HANDLE = /^[a-z0-9._-]{2,60}$/i;

/**
 * Turn a cell into a social URL.
 *
 * A PASTED URL IS KEPT EVEN IF THE HOST LOOKS WRONG, and flagged. A Facebook
 * URL in the Instagram column is an admin's mistake worth reporting, but
 * discarding the only social link a business has in order to punish a
 * mis-titled column loses the reachable thing to protect a label.
 */
export function socialUrl(platformKey: string, raw: string | null | undefined): SocialResult {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === platformKey);
  if (!platform) return { url: null, problem: 'not_a_handle' };

  const s = String(raw ?? '').trim();
  if (!s) return { url: null, problem: null };
  if (isPlaceholderValue(s)) return { url: null, problem: 'placeholder' };

  // Already a link, or at least trying to be one.
  if (/^https?:\/\//i.test(s) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(s)) {
    const { url } = checkWebsite(s);
    if (!url) return { url: null, problem: 'not_a_handle' };
    try {
      const host = new URL(url).hostname;
      return { url, problem: platform.host.test(host) ? null : 'wrong_platform' };
    } catch {
      return { url: null, problem: 'not_a_handle' };
    }
  }

  const handle = s.replace(/^@+/, '').replace(/\/+$/, '');
  if (!HANDLE.test(handle)) return { url: null, problem: 'not_a_handle' };
  return { url: platform.fromHandle(handle), problem: null };
}

/* --- Lists ---------------------------------------------------------------- */

/**
 * A cell holding several values.
 *
 * Pipe, semicolon, newline or comma — spreadsheets use all four, and which one
 * appears is a property of whoever exported the file rather than of the data.
 * Duplicates and blanks are dropped; order is kept, because "Cash, Transfer"
 * is a business telling you what it prefers.
 */
export function parseDelimitedList(raw: string | null | undefined, limit = 25): string[] {
  const s = String(raw ?? '').trim();
  if (!s || isPlaceholderValue(s)) return [];

  const parts = s.split(/[|;\n]+|,/g)
    .map((p) => p.trim())
    .filter((p) => p !== '' && !isPlaceholderValue(p));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/* --- Services ------------------------------------------------------------- */

export interface ImportedService {
  name: string;
  price?: string;
  description?: string;
}

/**
 * Services from one cell.
 *
 * Accepted, because a real file uses all of these:
 *
 *   Haircut | Beard trim                      names only
 *   Haircut:2500 | Beard trim:1500            name and price
 *   Haircut = ₦2,500                           either separator, any currency
 *   Haircut:2500:Includes a wash               name, price, description
 *
 * PRICE STAYS TEXT, deliberately: `business_services.price` is text, and
 * "₦2,500", "from 2500" and "2500" are all things a business says. Parsing to
 * a number would either lose the currency or invent a precision the file does
 * not have.
 */
export function parseServices(raw: string | null | undefined, limit = 40): ImportedService[] {
  const s = String(raw ?? '').trim();
  if (!s || isPlaceholderValue(s)) return [];

  const out: ImportedService[] = [];
  const seen = new Set<string>();

  /*
   * COMMAS SPLIT ONLY WHEN NOTHING ELSE DOES.
   *
   * "Haircut, Beard trim, Wash" is a list of three and must not become one
   * service with commas in its name. But "Bag of beans:8500:250g, whole bean"
   * has a comma inside a description, and splitting on it would produce a
   * service called "whole bean".
   *
   * The rule: use commas only when the cell contains no pipe, semicolon or
   * newline AND no price separator — that is, when a comma is the only
   * delimiter present and there is nothing for it to break.
   */
  const hasStructure = /[|;\n]/.test(s) || /[:=]/.test(s);
  const chunks = hasStructure ? s.split(/[|;\n]+/g) : s.split(',');

  for (const chunk of chunks) {
    const item = chunk.trim();
    if (!item || isPlaceholderValue(item)) continue;

    // First `:` or `=` separates the name; a second one starts a description.
    const parts = item.split(/\s*[:=]\s*/);
    const name = (parts[0] ?? '').trim();
    if (!name || isPlaceholderValue(name)) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const price = (parts[1] ?? '').trim();
    const description = parts.slice(2).join(': ').trim();

    out.push({
      name,
      ...(price && !isPlaceholderValue(price) ? { price } : {}),
      ...(description && !isPlaceholderValue(description) ? { description } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Read a `services_json` value back into service objects.
 *
 * Staging keeps the array as a JSON STRING under `services_json` (so a plain
 * jsonb column stores it and SQL casts it), and the review queue reads it back
 * for display. A missing key, malformed JSON or an array of junk all yield [],
 * which a display renders as "nothing here" rather than crashing.
 */
export function parseServicesJson(raw: string | null | undefined): ImportedService[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ImportedService =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as Record<string, unknown>).name === 'string' &&
        String((e as Record<string, unknown>).name).trim() !== ''
    );
  } catch {
    return [];
  }
}

/* --- FAQs ----------------------------------------------------------------- */

export interface ImportedFaq { q: string; a: string }

/**
 * FAQs from one cell: `Question?::Answer` pairs.
 *
 * `::` rather than `:` because an answer routinely contains a colon ("Opening:
 * 9am") and a question mark is not reliable either — plenty of FAQ headings
 * are not questions. A pair missing either half is dropped: the profile page's
 * own reader discards those anyway, so keeping them here would only produce a
 * row that silently disappears later.
 */
export function parseFaqs(raw: string | null | undefined, limit = 20): ImportedFaq[] {
  const s = String(raw ?? '').trim();
  if (!s || isPlaceholderValue(s)) return [];

  const out: ImportedFaq[] = [];
  for (const chunk of s.split(/[|\n]+/g)) {
    const [q, ...rest] = chunk.split('::');
    const question = (q ?? '').trim();
    const answer = rest.join('::').trim();
    if (!question || !answer) continue;
    if (isPlaceholderValue(question) || isPlaceholderValue(answer)) continue;
    out.push({ q: question, a: answer });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Read a `faqs_json` value back into FAQ pairs.
 *
 * The mirror of parseServicesJson: staging keeps FAQs as a JSON string, SQL
 * casts it into `businesses.faqs` on publish, and screens read it back here. A
 * missing key, malformed JSON or an array of junk all yield [], which a display
 * renders as "nothing here" rather than crashing. A question with no answer is
 * kept — an answer can be added — but an entry without a question is dropped.
 */
export function parseFaqsJson(raw: string | null | undefined): ImportedFaq[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: ImportedFaq[] = [];
    for (const e of parsed) {
      if (!e || typeof e !== 'object') continue;
      const rec = e as Record<string, unknown>;
      const q = String(rec.q ?? '').trim();
      if (!q) continue;
      out.push({ q, a: String(rec.a ?? '').trim() });
    }
    return out;
  } catch {
    return [];
  }
}

/* --- Opening hours -------------------------------------------------------- */

/** A weekday in week order, and its short display label. */
const WEEK_DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

/**
 * The week object a registration stores, as the text the publish reads.
 *
 * `business_hours` is a jsonb object keyed by weekday with {closed, open,
 * close} values — the shape a week-picker produces. The publish projects
 * `opening_hours` as plain TEXT and the public page renders text, so this
 * turns the object into "Mon–Fri: 09:00–18:00, Sat: 10:00–16:00, Sun: Closed".
 * Consecutive days on the same pattern are grouped; a day with no times or an
 * object that is not that shape simply does not appear. Nothing there at all
 * (or junk) yields "", and is not carried.
 */
export function formatWeekHours(raw: unknown): string {
  let obj: Record<string, unknown>;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { return ''; }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  } else {
    return '';
  }

  const patterns: string[] = [];
  for (const { key } of WEEK_DAYS) {
    const day = obj[key];
    if (!day || typeof day !== 'object' || Array.isArray(day)) { patterns.push(''); continue; }
    const d = day as Record<string, unknown>;
    if (d.closed === true) { patterns.push('Closed'); continue; }
    const open = String(d.open ?? '').trim();
    const close = String(d.close ?? '').trim();
    patterns.push(open && close ? `${open}–${close}` : '');
  }
  if (patterns.every((p) => p === '')) return '';

  const parts: string[] = [];
  let start = 0;
  while (start < patterns.length) {
    if (patterns[start] === '') { start += 1; continue; }
    let end = start;
    while (end + 1 < patterns.length && patterns[end + 1] === patterns[start]) end += 1;
    const range = start === end
      ? WEEK_DAYS[start].label
      : `${WEEK_DAYS[start].label}–${WEEK_DAYS[end].label}`;
    parts.push(`${range}: ${patterns[start]}`);
    start = end + 1;
  }
  return parts.join(', ');
}

/* --- Scalars -------------------------------------------------------------- */

/**
 * A founding year from anything a person writes: "1998", "Est. 1998", "1998.0".
 *
 * Bounded at both ends. A year in the future is a typo, and a year before 1800
 * is either a typo or a claim nobody can support — and `yearsInBusiness`
 * renders it as a credential on the public page, so a wrong one is a false
 * claim about a real business.
 */
export function parseFoundedYear(raw: string | null | undefined, now = new Date()): number | null {
  const s = String(raw ?? '').trim();
  if (!s || isPlaceholderValue(s)) return null;
  const m = /(\d{4})/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1800 || year > now.getFullYear()) return null;
  return year;
}

/* --- Putting it together -------------------------------------------------- */

/** Import fields that become `businesses.social_links` keys. */
export const SOCIAL_FIELDS = SOCIAL_PLATFORMS.map((p) => p.key);

/** Import fields that become a jsonb array of strings. */
export const LIST_FIELDS = [
  'languages', 'payment_methods', 'core_values', 'why_us', 'secondary_categories',
] as const;

/** Plain text columns carried straight through. */
export const TEXT_FIELDS = [
  'tagline', 'about', 'story', 'mission', 'vision',
  'service_area', 'subcategory', 'business_type', 'employees', 'timezone',
] as const;

export interface ProfileIssue {
  field: string;
  message: string;
}

export interface NormalisedProfile {
  /** Flat values, cleaned, ready to be written as-is. */
  fields: Record<string, string>;
  issues: ProfileIssue[];
}

/**
 * Normalise every profile field in a mapped row.
 *
 * Writes back canonical forms the SQL can move without interpreting:
 *
 *   socials        absolute URLs under their own keys
 *   list fields    pipe-delimited, so SQL splits on one character
 *   services/faqs  JSON text under `services_json` / `faqs_json`, so SQL casts
 *   founded_year   four digits, or absent
 *
 * Returns issues for the mapping screen instead of silently dropping: a cell
 * an admin believes they supplied and which does not appear is the failure
 * this whole file exists to stop.
 */
export function normaliseProfile(mapped: Record<string, string>): NormalisedProfile {
  const fields: Record<string, string> = {};
  const issues: ProfileIssue[] = [];

  for (const key of SOCIAL_FIELDS) {
    const raw = mapped[key];
    if (raw === undefined || String(raw).trim() === '') continue;
    const { url, problem } = socialUrl(key, raw);
    if (url) fields[key] = url;
    if (problem === 'not_a_handle') {
      issues.push({ field: key, message: `"${String(raw).trim()}" is not a usable ${key} handle or link; it will be left blank.` });
    } else if (problem === 'wrong_platform') {
      issues.push({ field: key, message: `This ${key} link points somewhere else. It will be saved as given — check the column.` });
    }
  }

  for (const key of LIST_FIELDS) {
    const list = parseDelimitedList(mapped[key]);
    if (list.length) fields[key] = list.join('|');
  }

  const services = parseServices(mapped.services);
  if (services.length) fields.services_json = JSON.stringify(services);
  else if (mapped.services?.trim() && !isPlaceholderValue(mapped.services)) {
    issues.push({ field: 'services', message: `Nothing usable in "${mapped.services.trim().slice(0, 40)}". Use Name:Price separated by |.` });
  }

  const faqs = parseFaqs(mapped.faqs);
  if (faqs.length) fields.faqs_json = JSON.stringify(faqs);
  else if (mapped.faqs?.trim() && !isPlaceholderValue(mapped.faqs)) {
    issues.push({ field: 'faqs', message: 'FAQs need Question::Answer pairs separated by |. Nothing was read from this cell.' });
  }

  const year = parseFoundedYear(mapped.founded_year);
  if (year) fields.founded_year = String(year);
  else if (mapped.founded_year?.trim() && !isPlaceholderValue(mapped.founded_year)) {
    issues.push({ field: 'founded_year', message: `"${mapped.founded_year.trim()}" is not a year between 1800 and now; it will be left blank.` });
  }

  for (const key of TEXT_FIELDS) {
    const v = String(mapped[key] ?? '').trim();
    if (v && !isPlaceholderValue(v)) fields[key] = v;
  }

  return { fields, issues };
}
