/**
 * Website links, and the placeholder values that pretend to be them.
 *
 * WHY THIS EXISTS
 *
 * Measured on the live database (2026-09-08): 85 of 271 businesses had
 * `website = 'UNKNOWN'`, and every page that showed a website rendered
 * `href={business.website}` with no validation. An anchor whose href is
 * "UNKNOWN" is a RELATIVE link — a visitor clicking "Website" landed on
 * /business/whatever/UNKNOWN, a not-found page inside NowOpen. The business
 * looked broken, on our page, because of our data.
 *
 * `blank_if_placeholder` in the database now stops those values at the door
 * and 20260908190100 repaired the stored ones. This file is the other half:
 *
 *   - the same placeholder rule in TypeScript, so the IMPORTER can warn an
 *     admin before the write rather than silently dropping a column;
 *   - `websiteHref`, so a bad value that arrives some other way — an owner
 *     typing "coming soon" into the profile form — still cannot render as a
 *     link that goes nowhere.
 *
 * TWO IMPLEMENTATIONS OF ONE RULE, KEPT HONEST BY A TEST
 *
 * The list below is duplicated in SQL, which is normally how two copies drift
 * apart. `webLink.test.ts` parses the migration and asserts the two lists
 * match, so adding a value in one place and not the other fails the suite.
 */

/**
 * What a person types into a cell they cannot fill in.
 *
 * WHOLE-VALUE matches only, never substrings: "Unknown Pleasures Records" is
 * a real business name, "Missing Link Studios" could be, and a rule that
 * matched inside a value would quietly delete both.
 */
export const PLACEHOLDER_VALUES: readonly string[] = [
  'UNKNOWN', 'UNKNOW', 'UNKOWN',
  'N/A', 'NA', 'N.A', 'N.A.', 'NONE', 'NIL', 'NULL', 'NAN',
  'TBD', 'TBA', 'TO BE ADDED', 'TO BE CONFIRMED',
  'NOT AVAILABLE', 'NOT APPLICABLE', 'NOT PROVIDED', 'NOT SPECIFIED',
  'NO WEBSITE', 'NO PHONE', 'NO EMAIL', 'NO ADDRESS', 'NO DATA',
  'COMING SOON', 'PENDING', 'MISSING', 'BLANK', 'EMPTY',
];

const PLACEHOLDER_SET = new Set(PLACEHOLDER_VALUES);

/** Runs of punctuation, and all-zero numbers. */
const PUNCTUATION_ONLY = /^[-_.,;:?*#/]+$/;
const ALL_ZEROS = /^0+$/;

/** Does this value carry no information? */
export function isPlaceholderValue(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim();
  if (!s) return true;
  if (PLACEHOLDER_SET.has(s.toUpperCase())) return true;
  return PUNCTUATION_ONLY.test(s) || ALL_ZEROS.test(s);
}

/**
 * The trimmed value, or null when it carries no information.
 *
 * The TypeScript twin of `public.blank_if_placeholder`.
 */
export function blankIfPlaceholder(raw: string | null | undefined): string | null {
  return isPlaceholderValue(raw) ? null : String(raw).trim();
}

export type LinkProblem = 'empty' | 'placeholder' | 'unsafe_scheme' | 'not_a_url';

export interface LinkCheck {
  /** An absolute https URL, or null when there is nothing safe to link to. */
  url: string | null;
  problem: LinkProblem | null;
}

/**
 * Turn a stored website value into something safe to put in an href.
 *
 * A BARE DOMAIN IS ACCEPTED. Directory data is full of `zanzibar.ng` and
 * `www.example.com` with no scheme, and those are real websites — refusing
 * them would throw away good data to avoid bad. They are returned as https.
 *
 * `http://` is UPGRADED rather than kept: the page is served over https, so a
 * browser blocks mixed content anyway, and the same site almost always answers
 * on https. Upgrading is recoverable; discarding is not.
 */
export function checkWebsite(raw: string | null | undefined): LinkCheck {
  const s = String(raw ?? '').trim();
  if (!s) return { url: null, problem: 'empty' };
  if (isPlaceholderValue(s)) return { url: null, problem: 'placeholder' };

  /*
   * Scheme by explicit allowlist rather than by blocking known-bad ones.
   * `javascript:` in an href is the classic stored-XSS route, and an
   * allowlist is also right about the schemes nobody has thought of.
   */
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) {
    return { url: null, problem: 'unsafe_scheme' };
  }

  const withScheme = /^https?:\/\//i.test(s)
    ? s.replace(/^http:\/\//i, 'https://')
    : `https://${s}`;

  try {
    const u = new URL(withScheme);
    /*
     * A hostname needs a dot. This is what rejects "UNKNOWN", "coming soon"
     * and "see facebook" — each of which the URL parser happily accepts as a
     * hostname once a scheme is prefixed.
     */
    if (!u.hostname.includes('.')) return { url: null, problem: 'not_a_url' };
    // A trailing dot is legal DNS and looks like a typo in a link.
    if (u.hostname.endsWith('.')) return { url: null, problem: 'not_a_url' };
    if (/\s/.test(s)) return { url: null, problem: 'not_a_url' };
    return { url: u.toString(), problem: null };
  } catch {
    return { url: null, problem: 'not_a_url' };
  }
}

/** The href to use, or null — the form every render site needs. */
export function websiteHref(raw: string | null | undefined): string | null {
  return checkWebsite(raw).url;
}

/**
 * How to show a website to a person: the host, without scheme or trailing
 * slash. `https://www.zanzibar.ng/` reads as `zanzibar.ng`.
 */
export function websiteLabel(raw: string | null | undefined): string | null {
  const url = websiteHref(raw);
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '');
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return host + path;
  } catch {
    return null;
  }
}
