/**
 * Universal search: suggestions from the database, plus the app's own pages.
 *
 * ── WHY THE MATCHING IS NOT IN THE BROWSER ───────────────────────────────
 *
 * MEASURED 2026-09-17: 3,141 listable businesses, 22,085 published services,
 * 2,807 products, 278 places. The component written for this before —
 * GlobalSearchInput — indexed 300 rows per table in the browser, so it could
 * match under a tenth of the directory and none of the services, and told
 * anyone searching outside that slice that their business did not exist.
 *
 * `search_suggest()` does the matching where the data is, over trigram
 * indexes, and only the rows shown travel. See migration 20260928010000.
 *
 * ── WHAT IS STILL MATCHED LOCALLY, AND WHY ───────────────────────────────
 *
 * The app's own destinations — /open-now, /offers, /nearby, the industry
 * pages. Those are not rows in any table; they are routes this build ships.
 * Putting them in the database would mean a second copy of the router that
 * nothing keeps in step, and a suggestion pointing at a page that no longer
 * exists is worse than no suggestion.
 */

import { supabase } from './supabase';
import { normalize } from './search';
import { INDUSTRIES } from '../data/industrySystems';

export type SuggestionKind =
  | 'business' | 'service' | 'product' | 'place' | 'category'
  | 'advert' | 'media' | 'page';

export interface Suggestion {
  kind: SuggestionKind;
  label: string;
  sublabel: string | null;
  href: string;
  score: number;
  /** How many rows this term covers. 1 for a single entity. */
  hits: number;
}

/** The two-character floor the SQL enforces, repeated so we skip the trip. */
export const MIN_QUERY_LENGTH = 2;

/**
 * Places in the app itself.
 *
 * `keywords` exist because nobody types the route name. Somebody looking for
 * a business that is open right now types "open", and somebody wanting to list
 * theirs types "add" or "register", not "send business".
 */
interface PageTarget {
  label: string;
  href: string;
  sublabel: string;
  keywords: string[];
}

const PAGES: readonly PageTarget[] = [
  { label: 'Open now', href: '/open-now', sublabel: 'Businesses serving customers right now', keywords: ['open', 'now', 'today', 'tonight', 'right now'] },
  { label: 'Near me', href: '/nearby', sublabel: 'Businesses close to you', keywords: ['near', 'nearby', 'close', 'around me', 'my area'] },
  { label: 'Offers', href: '/offers', sublabel: 'Live offers from businesses', keywords: ['offer', 'deal', 'discount', 'promo', 'sale'] },
  { label: 'Discover', href: '/discover', sublabel: 'Browse the whole directory', keywords: ['discover', 'browse', 'explore', 'all'] },
  { label: 'Businesses', href: '/businesses', sublabel: 'Every listing, filtered', keywords: ['business', 'listing', 'directory', 'companies', 'shops'] },
  { label: 'Advertise', href: '/adverts', sublabel: 'Advertising space you can enquire about', keywords: ['advert', 'advertise', 'billboard', 'ads', 'marketing', 'promote'] },
  { label: 'Media & creators', href: '/media/services', sublabel: 'Photographers, videographers and studios', keywords: ['media', 'creator', 'photography', 'video', 'studio'] },
  { label: 'Add your business', href: '/add-business', sublabel: 'Add a business to NowOpen', keywords: ['add', 'list', 'register', 'join', 'submit', 'sign up', 'claim'] },
  { label: 'Nominate a business', href: '/nominate', sublabel: 'Tell us about a business that should be here', keywords: ['nominate', 'suggest', 'recommend', 'tip'] },
  { label: 'Pricing', href: '/pricing', sublabel: 'Plans and what each includes', keywords: ['pricing', 'price', 'plan', 'cost', 'subscription'] },
  { label: 'Forms', href: '/forms', sublabel: 'Digital forms for your business', keywords: ['form', 'forms', 'booking form', 'enquiry'] },
  { label: 'Contact', href: '/contact', sublabel: 'Get in touch with NowOpen', keywords: ['contact', 'support', 'help', 'email us'] },
];

/**
 * Score a local target the same way the SQL scores a row, so the two sets can
 * be merged into one ordered list rather than shown in separate blocks.
 *
 * Kept deliberately below an exact database match: a real business called
 * "Offers Ltd" should outrank the Offers page.
 */
function localScore(target: PageTarget, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const label = normalize(target.label);
  if (label === q) return 95;
  if (label.startsWith(q)) return 75;
  for (const keyword of target.keywords) {
    const k = normalize(keyword);
    if (k === q) return 70;
    if (k.startsWith(q)) return 55;
  }
  if (label.includes(q)) return 35;
  return 0;
}

function pageSuggestions(query: string, limit: number): Suggestion[] {
  return PAGES
    .map((p) => ({ p, score: localScore(p, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.p.label.localeCompare(b.p.label))
    .slice(0, limit)
    .map(({ p, score }) => ({
      kind: 'page' as const,
      label: p.label,
      sublabel: p.sublabel,
      href: p.href,
      score,
      hits: 1,
    }));
}

function industrySuggestions(query: string, limit: number): Suggestion[] {
  const q = normalize(query);
  if (!q) return [];
  return INDUSTRIES
    .map((i) => {
      const name = normalize(i.name);
      const score = name === q ? 90 : name.startsWith(q) ? 70 : name.includes(q) ? 32 : 0;
      return { i, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i.name.localeCompare(b.i.name))
    .slice(0, limit)
    .map(({ i, score }) => ({
      kind: 'page' as const,
      label: i.name,
      sublabel: i.tagline,
      href: `/platform?industry=${i.slug}`,
      score,
      hits: 1,
    }));
}

interface SuggestResult {
  suggestions: Suggestion[];
  /**
   * True when the database read failed.
   *
   * Separate from "no matches" on purpose. The local pages still answer, so
   * the dropdown is not empty — and without this flag the UI would present a
   * broken connection as a confident "nothing found", which is the single most
   * misleading thing a search box can say.
   */
  degraded: boolean;
}

/**
 * Everything matching `query`, best first.
 *
 * `signal` is honoured so a superseded keystroke stops mattering. It does not
 * abort the request — supabase-js has no hook for that here — it discards the
 * answer, which is the part that causes the bug: two in-flight searches
 * resolving out of order paint the older one last.
 */
export async function suggest(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<SuggestResult> {
  const limit = opts.limit ?? 12;
  const term = query.trim();
  if (term.length < MIN_QUERY_LENGTH) return { suggestions: [], degraded: false };

  const local = [
    ...pageSuggestions(term, 3),
    ...industrySuggestions(term, 2),
  ];

  /*
   * `error`, not a rejected promise. supabase-js RESOLVES with
   * `{ data: null, error }`, so a `.catch()` here would be dead code and every
   * failure would read as an empty result set.
   */
  const { data, error } = await supabase.rpc('search_suggest', {
    q: term,
    per_kind: 4,
    max_total: limit,
  });

  if (opts.signal?.aborted) return { suggestions: [], degraded: false };

  const remote: Suggestion[] = error || !Array.isArray(data)
    ? []
    : (data as Array<Record<string, unknown>>).map((r) => ({
      kind: String(r.kind) as SuggestionKind,
      label: String(r.label ?? ''),
      sublabel: r.sublabel == null ? null : String(r.sublabel),
      href: String(r.href ?? ''),
      score: Number(r.score ?? 0),
      hits: Number(r.hits ?? 1),
    })).filter((s) => s.label && s.href);

  const merged = [...remote, ...local]
    .sort((a, b) => b.score - a.score || b.hits - a.hits || a.label.localeCompare(b.label))
    .slice(0, limit);

  return { suggestions: merged, degraded: Boolean(error) };
}

export interface PlaceHit {
  label: string;
  /** How many listable businesses are in this place. Never zero. */
  hits: number;
  score: number;
}

/**
 * Places that actually have listings, with how many.
 *
 * MEASURED 2026-09-17: 278 distinct places, steeply distributed — Lagos has
 * 325 listings, Lekki has 5, most have one. The count travels with the
 * suggestion because a bare place name invites somebody to filter the
 * directory down to nothing and conclude the platform is empty.
 *
 * Returns only places with listings. The curated city list handles the rest,
 * and the component shows those separately rather than mixed in, where they
 * would look like results and lead to an empty page.
 */
export async function suggestPlaces(
  query: string,
  limit = 6,
): Promise<{ places: PlaceHit[]; degraded: boolean }> {
  const term = query.trim();
  if (term.length < MIN_QUERY_LENGTH) return { places: [], degraded: false };

  // `error`, not a rejection: supabase-js resolves with { data: null, error }.
  const { data, error } = await supabase.rpc('place_suggest', { q: term, max_rows: limit });
  if (error || !Array.isArray(data)) return { places: [], degraded: Boolean(error) };

  return {
    places: (data as Array<Record<string, unknown>>)
      .map((r) => ({
        label: String(r.label ?? ''),
        hits: Number(r.hits ?? 0),
        score: Number(r.score ?? 0),
      }))
      .filter((p) => p.label),
    degraded: false,
  };
}

/**
 * The business ids offering a named service or product.
 *
 * Needed because /businesses filters on name, description and category only.
 * Without it, picking "Diagnostic tests" from the dropdown would run a text
 * search for that phrase across business NAMES and find nothing — the platform
 * offering a suggestion that leads to an empty page.
 *
 * ── THE RPC RETURNS ONE ARRAY, NOT ONE ROW PER BUSINESS ──────────────────
 *
 * MEASURED IN THE BROWSER, 2026-09-17: the row-per-business version filtered
 * "Diagnostic tests" — advertised as 1,707 businesses — down to exactly 1,000,
 * because PostgREST truncates every response at 1,000 rows silently. 707 real
 * businesses were invisible on a page reached by clicking the number 1,707.
 *
 * A uuid[] inside a single row cannot be truncated by a row cap, so the count
 * in the dropdown and the count on the page are the same number.
 */
export async function businessesOffering(
  name: string,
  kind: 'service' | 'product',
): Promise<{ ids: Set<string>; failed: boolean }> {
  const { data, error } = await supabase.rpc('businesses_offering', {
    offering_name: name,
    offering_kind: kind,
  });
  /*
   * `error` first, and an empty array is NOT a failure — it is the honest
   * answer for a service nobody offers. Conflating them would drop the filter
   * and show the whole directory as if everything matched.
   */
  if (error) return { ids: new Set(), failed: true };
  const ids = Array.isArray(data) ? (data as unknown[]).map(String) : [];
  return { ids: new Set(ids), failed: false };
}
