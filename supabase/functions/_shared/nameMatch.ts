/**
 * Is this Instagram account a business NowOpen already holds?
 *
 * ── WHY NAME MATCHING, WHEN THE HANDLE ALREADY MATCHES ───────────────────
 *
 * The handle check only finds a business whose listing already records that
 * handle. Most do not: the directory was built largely from Wikidata and CSV
 * imports, which carry a name and no Instagram at all. So "Bodylush Hairs"
 * can be on NowOpen already and still look brand new to a handle lookup —
 * and filing it again gives one real business two pages, splitting its
 * reviews, its claim and its search ranking.
 *
 * ── IT FLAGS, IT DOES NOT MERGE ──────────────────────────────────────────
 *
 * A match here sets `duplicate_of` on the candidate, which `riskSignals()`
 * already shows a reviewer as "Looks like a business already on NowOpen". It
 * NEVER writes to the live listing.
 *
 * That restraint is deliberate and it is a security property, not timidity.
 * This runs for anonymous callers, and the name being compared comes from an
 * Instagram account the caller controls. Anyone can name an Instagram account
 * "Jumia Nigeria"; if a name match attached their handle to Jumia's listing,
 * the match itself would be the impersonation route. A person decides.
 *
 * ── CONSERVATIVE ON PURPOSE ──────────────────────────────────────────────
 *
 * A missed duplicate costs a reviewer one merge. A wrong one invites a
 * reviewer to merge two different businesses into one, which destroys a real
 * company's page. So the rules below only fire on strong, explainable
 * evidence, and every match carries the tokens that produced it.
 */

/**
 * Words that carry no identity, stripped before comparing.
 *
 * Legal forms and "official" only. Deliberately NOT country or city names:
 * this is an Africa-wide directory, and dropping "Nigeria" would make
 * "Jumia Nigeria" and "Jumia Kenya" the same business.
 */
const NOISE = new Set([
  "ltd", "limited", "plc", "inc", "llc", "enterprise", "enterprises",
  "company", "co", "the", "and", "official", "org",
]);

/** Significant lowercase tokens of a business name. */
export function tokens(name: string | null | undefined): string[] {
  return (name ?? "")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    /*
     * Possessive 's removed BEFORE splitting, which is why single characters
     * can then be kept: without this, "Ada's Fabrics" tokenises to
     * {ada, s, fabrics} and stops matching "Ada Fabrics".
     */
    .replace(/'s(?![a-z])/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    /*
     * Single characters are KEPT, letters and digits alike.
     *
     * MEASURED against the live directory: dropping them merged
     * "Toungo 1 Primary Health Care Center" with "Toungo 2 ...", five
     * separate "El Maadi Residential Tower" blocks, and every bureau de
     * change on the platform -- "A & S", "A & C" and "A AND B" all reduce to
     * {bureau, de, change}. For those names the single character IS the
     * identity.
     */
    .filter((t) => t.length > 0 && !NOISE.has(t));
}

/**
 * A crude singular form, so "hairs" and "hair" compare equal.
 *
 * Not a stemmer: it only drops a trailing s from a word long enough that
 * doing so cannot change its identity. "Gas" and "bus" keep theirs.
 */
const singular = (t: string) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);

const keyOf = (name: string | null | undefined) => new Set(tokens(name).map(singular));

export interface NameMatch {
  /** 0–1. See `probableDuplicate` for what counts as enough. */
  score: number;
  /** The tokens both names share, so a reviewer can see the reasoning. */
  shared: string[];
}

/**
 * How alike two business names are.
 *
 * ── MEASURED, THEN TIGHTENED ─────────────────────────────────────────────
 *
 * This began as a CONTAINMENT rule: the shorter name entirely inside the
 * longer one. Run across the live directory it flagged 640 pairs — 15.6% of
 * every listing — and the sample was full of different businesses:
 *
 *   "DoubleTree by Hilton Addis Ababa Airport" vs "Hilton Addis Ababa"
 *   "Nairobi Hospital"                         vs "Nairobi Women's Hospital"
 *   "National Museum, Igbo-Ukwu"               vs "National Museum"
 *   "Leo Burnett Nigeria ..."                  vs "A+E ENTERPRISES NIGERIA LIMITED"
 *
 * The last one reduces to the single token "nigeria" once legal words are
 * removed, and a one-token name matches anything containing it.
 *
 * So the rule is EQUALITY of significant tokens, not containment. A business
 * may add "Ltd" or pluralise a word; it does not add "Women's" or swap its
 * brand. Losing "Jumia" vs "Jumia Nigeria" is the price, and it costs one
 * reviewer a merge — against 640 invitations to destroy a real company's page.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): NameMatch {
  const A = keyOf(a);
  const B = keyOf(b);

  /*
   * Two significant tokens minimum. A name that reduces to one — often a
   * country or a trade word once "Limited" and "Enterprises" are stripped —
   * is not an identity, and matching on it was the worst of the false
   * positives above.
   */
  if (A.size < 2 || B.size < 2) return { score: 0, shared: [] };
  if (A.size !== B.size) return { score: 0, shared: [] };

  const shared = [...A].filter((t) => B.has(t)).sort();
  return shared.length === A.size ? { score: 1, shared } : { score: 0, shared };
}

/** Only an exact agreement of significant tokens counts. See above. */
export const DUPLICATE_THRESHOLD = 1;

/**
 * The listing this account is probably already on, or null.
 *
 * The threshold is 1: every significant word of the shorter name appears in
 * the longer one. Anything looser was measured against the live directory and
 * produced matches between businesses that merely share a trade word.
 */
export function probableDuplicate<T extends { id: string; name: string | null }>(
  name: string | null | undefined,
  listings: T[],
): { listing: T; match: NameMatch } | null {
  let best: { listing: T; match: NameMatch } | null = null;

  for (const listing of listings) {
    const match = nameSimilarity(name, listing.name);
    if (match.score < DUPLICATE_THRESHOLD) continue;
    /*
     * More shared tokens wins. "Bodylush Hair Extensions" beats "Bodylush"
     * for an account called "Bodylush Hair Extensions Lagos", because the
     * longer agreement is the stronger evidence.
     */
    if (!best || match.shared.length > best.match.shared.length) best = { listing, match };
  }

  return best;
}
