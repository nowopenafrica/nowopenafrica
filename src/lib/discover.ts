import { publicOpenState, type OpenStateInput } from './openingHours';
import { normalize } from './search';
import { businessCategories, matchesCategory } from '../data/categories';

/**
 * The rails on the Discover page.
 *
 * Every rail here is computed from data the platform actually holds. Two the
 * brief asked for are deliberately absent:
 *
 *   TRENDING — would need view or visit counts. Nothing in the schema records
 *   either, so "trending" could only be sorted by rating or recency wearing a
 *   more exciting name. A rail that claims to know what is popular while
 *   secretly showing the newest listings teaches people to distrust the rest.
 *
 *   DISTANCE ("1.2km away") — `businesses` stores `location` as free text and
 *   has no coordinates; only branch rows in `business_locations` carry
 *   lat/lng. Nearby therefore matches on place, and says "in Yaba" rather than
 *   inventing a number.
 *
 * Both become possible later — the first needs a views table, the second needs
 * geocoding on the business record.
 */

/**
 * The columns every discovery surface reads.
 *
 * One constant, because three pages selecting their own list is how one of them
 * ends up naming a column that does not exist. `review_count` is deliberately
 * NOT here: it exists on `media_services` but not on `businesses`, and asking
 * for it makes PostgREST reject the whole query with a 42703 — which surfaces
 * as an empty page, not an error.
 */
/* One literal, not a concatenation. The Supabase client infers the row type
   from the string itself, so splitting it across a `+` turns every result into
   GenericStringError. */
export const DISCOVER_SELECT = 'id,name,category,secondary_categories,description,location,phone,website,verified,rating,image_url,logo_url,username,created_at,opening_hours,hours,timezone,open_status';

export interface DiscoverBusiness extends OpenStateInput {
  id: string;
  name: string;
  category?: string | null;
  secondary_categories?: string[] | null;
  description?: string | null;
  location?: string | null;
  phone?: string | null;
  website?: string | null;
  verified?: boolean | null;
  rating?: number | null;
  review_count?: number | null;
  image_url?: string | null;
  logo_url?: string | null;
  username?: string | null;
  created_at?: string | null;
}

/**
 * Review counts, tallied from the reviews themselves.
 *
 * `businesses` has no counter column, so this counts rows. Cheap today and
 * correct always; if the table grows past what one request should carry, this
 * is the single place that becomes a view or a stored counter.
 */
export function tallyReviews(rows: { business_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r?.business_id) continue;
    counts.set(r.business_id, (counts.get(r.business_id) ?? 0) + 1);
  }
  return counts;
}

/** Attach the tallied counts so the rating rails have something to weigh. */
export function withReviewCounts(
  list: DiscoverBusiness[],
  counts: Map<string, number>,
): DiscoverBusiness[] {
  return list.map((b) => ({ ...b, review_count: counts.get(b.id) ?? 0 }));
}

/** Where a card points. Username first, because that is the shareable one. */
export function businessHref(b: Pick<DiscoverBusiness, 'id' | 'username'>): string {
  return b.username ? `/${b.username}` : `/businesses/${b.id}`;
}

/** Open, or closing soon — a shop closing in twenty minutes is still open. */
export function openNow(list: DiscoverBusiness[], now: Date): DiscoverBusiness[] {
  return list.filter((b) => {
    const kind = publicOpenState(b, now).kind;
    return kind === 'open' || kind === 'closing-soon';
  });
}

/** Listed in the last `days` days, newest first. */
export function newest(list: DiscoverBusiness[], now: Date, days = 30): DiscoverBusiness[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return list
    .filter((b) => {
      if (!b.created_at) return false;
      const t = Date.parse(b.created_at);
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => Date.parse(b.created_at!) - Date.parse(a.created_at!));
}

/**
 * How many reviews make a reputation established rather than anecdotal.
 *
 * ONE constant, deliberately, because Top rated and Hidden gems split the same
 * population at this line. Two independent thresholds overlapped at the
 * boundary and put the same business in both rails, which is how a page starts
 * looking padded.
 */
export const ESTABLISHED_REVIEWS = 4;

/** A rating only counts as good from here up. */
const GOOD_RATING = 4;

/**
 * Well rated, and rated by enough people to mean something. A single
 * five-star review is not a top-rated business, and letting one in is how a
 * directory's best-of list stops being worth reading.
 */
export function topRated(list: DiscoverBusiness[], minReviews = ESTABLISHED_REVIEWS): DiscoverBusiness[] {
  return list
    .filter((b) => (b.rating ?? 0) >= GOOD_RATING && (b.review_count ?? 0) >= minReviews)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

/**
 * Good, but barely reviewed — the small places a ratings-ordered directory
 * buries forever. This is the rail that earns a small business its first
 * customers, which is the whole promise of listing on NowOpen.
 *
 * Strictly below the same threshold Top rated starts at, so the two rails can
 * never show the same business.
 */
export function hiddenGems(list: DiscoverBusiness[], establishedAt = ESTABLISHED_REVIEWS): DiscoverBusiness[] {
  return list
    .filter((b) => {
      const n = b.review_count ?? 0;
      return (b.rating ?? 0) >= GOOD_RATING && n > 0 && n < establishedAt;
    })
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

/**
 * Same town. Text matching in both directions, because a business may record
 * "Yaba, Lagos" while the detected place is "Lagos" — or the reverse.
 */
export function near(list: DiscoverBusiness[], place: string): DiscoverBusiness[] {
  const want = normalize(place ?? '').trim();
  if (!want) return [];
  return list.filter((b) => {
    const where = normalize(b.location ?? '');
    if (!where) return false;
    return where.includes(want) || want.includes(where);
  });
}

/**
 * Categories someone keeps, most-kept first. The seed of "because you keep
 * restaurants" — derived from what they chose, not from anything watched.
 */
export function affinityCategories(kept: { category?: string | null }[]): string[] {
  const counts = new Map<string, number>();
  for (const k of kept) {
    const c = (k.category ?? '').trim();
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/**
 * "Because you keep restaurants." Excludes what they already keep — recommending
 * somebody a business they already follow is the recommendation failing.
 */
export function recommended(
  list: DiscoverBusiness[],
  keptCategories: string[],
  keptIds: string[],
): DiscoverBusiness[] {
  if (keptCategories.length === 0) return [];
  const already = new Set(keptIds);
  const wanted = keptCategories.map((c) => normalize(c));
  return list
    .filter((b) => !already.has(b.id))
    .filter((b) => {
      const c = normalize(b.category ?? '');
      return c ? wanted.some((w) => c.includes(w) || w.includes(c)) : false;
    })
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

/**
 * A maps link for getting there.
 *
 * A link the person clicks, not a resource the page loads, so it needs no CSP
 * directive — but it lives here rather than inline in the card because the CSP
 * checker classifies a bare URL by what is written near it, and next to an
 * image line it reads as an image host. Keeping it out of the component keeps
 * that check meaningful.
 */
export function directionsHref(b: Pick<DiscoverBusiness, 'name' | 'location'>): string | null {
  if (!b.location) return null;
  const q = encodeURIComponent(`${b.name} ${b.location}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/**
 * The extra categories a business also trades under, cleaned up.
 *
 * Stored as an array that in practice holds nulls and blanks, so this filters
 * before deciding whether there is anything to show — otherwise a card renders
 * a lonely "+" with nothing after it.
 */
export function secondaryCategories(b: Pick<DiscoverBusiness, 'secondary_categories'>): string[] {
  const raw = b.secondary_categories;
  return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : [];
}

/** A website without the scheme, which is noise on a small card. */
export function displayWebsite(url?: string | null): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '') || null;
}

/**
 * `Categorised` takes `category?: string`, but the column is nullable and the
 * client hands back `null`. Coercing here keeps the shared category helpers
 * usable without widening their type or casting the difference away.
 */
function categorised(b: DiscoverBusiness) {
  return { category: b.category ?? undefined, secondary_categories: b.secondary_categories };
}

/** What the Discover search is currently narrowed to. */
export interface DiscoverFilters {
  /** Free text: name, description, or any category it trades under. */
  query?: string;
  /** Town or city, matched against the business's own location text. */
  place?: string;
  /** An exact category, primary or secondary. */
  category?: string;
}

/**
 * Narrow the list by whatever the person has typed or chosen.
 *
 * The three filters are independent and combine with AND, which is what people
 * expect from a search box beside two selects: "restaurants" + "Lagos" means
 * both, not either.
 *
 * Matching mirrors the directory's — name, description and every category the
 * business trades under — so the same words find the same places on both
 * screens. Location is matched separately, and in both directions, because a
 * business may record "Yaba, Lagos" while somebody types "Lagos".
 *
 * An empty filter is not a filter: blank strings pass everything through rather
 * than matching nothing, so a cleared box restores the full list.
 */
export function searchBusinesses(
  list: DiscoverBusiness[],
  filters: DiscoverFilters,
): DiscoverBusiness[] {
  const q = normalize(filters.query ?? '').trim();
  const place = (filters.place ?? '').trim();
  const category = (filters.category ?? '').trim();

  let out = list;

  if (category) out = out.filter((b) => matchesCategory(categorised(b), category));
  if (place) out = near(out, place);
  if (q) {
    out = out.filter((b) =>
      normalize(b.name ?? '').includes(q)
      || normalize(b.description ?? '').includes(q)
      || normalize(b.location ?? '').includes(q)
      || businessCategories(categorised(b)).some((c) => normalize(c).includes(q)));
  }

  return out;
}

/**
 * Every category present in the list, for the filter dropdown.
 *
 * Built from the data rather than the master category list so the menu can only
 * offer choices that will actually return something — a dropdown of 31
 * industries over a directory of 32 businesses is mostly dead ends.
 */
export function availableCategories(list: DiscoverBusiness[]): string[] {
  const set = new Set<string>();
  for (const b of list) for (const c of businessCategories(categorised(b))) set.add(c);
  return [...set].sort((a, b) => a.localeCompare(b));
}
