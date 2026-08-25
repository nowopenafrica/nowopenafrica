// Which discovery pages exist, and when.
//
// A directory grows organically through long-tail pages — "restaurants in
// Lagos" is the search someone actually types, and the page that answers it is
// the front door. NowOpen had none: twelve static URLs, and every listing
// reachable only by crawling links from a JavaScript app.
//
// The trap is generating them anyway. A page holding one listing is thin
// content: search engines demote the page AND the site that mass-produces
// them, so a directory that pre-builds every city x category combination on
// day one ranks worse than one that builds none. Today every combination here
// holds exactly one business, so none of them qualify.
//
// The rule below is therefore the growth mechanism itself: a page comes into
// existence the moment enough real listings stand behind it, and appears in
// the sitemap on the next crawl. Nobody decides; density does. The page set
// compounds as the platform fills, which is the only kind of SEO growth that
// costs nothing to sustain.

/** A business as far as this module cares. */
export interface DiscoverableListing {
  category?: string | null;
  location?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface DiscoveryPage {
  /** Path relative to the site root, no leading slash trimmed. */
  path: string;
  /** How many live listings stand behind it. */
  count: number;
  kind: 'place' | 'category-in-place';
  place: string;
  category?: string;
}

/**
 * The minimum a page needs before it is worth having.
 *
 * Three is the smallest number that reads as a list rather than a stub: a
 * visitor sees a choice, and the page carries enough distinct text to not be a
 * near-duplicate of every other one. Raising it costs coverage; lowering it
 * risks the whole domain being treated as thin.
 */
export const MIN_LISTINGS_PER_PAGE = 3;

/** "Lagos, Nigeria" and "Lekki, Lagos" both file under their first segment. */
export function placeOf(location: string | null | undefined): string {
  return (location ?? '').split(',')[0].trim();
}

/** URL-safe, lowercase, and stable — this becomes a permanent address. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Every discovery page the current data can support.
 *
 * Place pages come first because they are the ones that qualify earliest; a
 * category-in-place page only appears once that specific pairing is dense
 * enough, which is what stops the sitemap filling with one-listing pages.
 */
export function discoveryPages(
  listings: DiscoverableListing[],
  min = MIN_LISTINGS_PER_PAGE,
): DiscoveryPage[] {
  const byPlace = new Map<string, number>();
  const byPair = new Map<string, { count: number; place: string; category: string }>();

  for (const l of listings) {
    const place = placeOf(l.location);
    if (!place) continue;
    byPlace.set(place, (byPlace.get(place) ?? 0) + 1);

    const category = (l.category ?? '').trim();
    if (!category) continue;
    const key = `${category}||${place}`;
    const cur = byPair.get(key);
    if (cur) cur.count++;
    else byPair.set(key, { count: 1, place, category });
  }

  const pages: DiscoveryPage[] = [];

  for (const [place, count] of byPlace) {
    if (count < min) continue;
    pages.push({ path: `businesses/in/${slugify(place)}`, count, kind: 'place', place });
  }

  for (const { count, place, category } of byPair.values()) {
    if (count < min) continue;
    pages.push({
      path: `businesses/${slugify(category)}/in/${slugify(place)}`,
      count,
      kind: 'category-in-place',
      place,
      category,
    });
  }

  // Densest first: if a sitemap ever has to be truncated, the pages that carry
  // the most real content survive.
  return pages.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}

/** Human title for a discovery page — also its <h1> and its <title>. */
export function discoveryTitle(page: Pick<DiscoveryPage, 'kind' | 'place' | 'category'>): string {
  return page.kind === 'category-in-place' && page.category
    ? `${page.category} in ${page.place}`
    : `Businesses in ${page.place}`;
}

/** Resolve a slug pair back to the matching listings. Slug-based, so it survives renames. */
export function matchesPage(
  listing: DiscoverableListing,
  placeSlug: string,
  categorySlug?: string,
): boolean {
  if (slugify(placeOf(listing.location)) !== placeSlug) return false;
  if (!categorySlug) return true;
  return slugify((listing.category ?? '').trim()) === categorySlug;
}
