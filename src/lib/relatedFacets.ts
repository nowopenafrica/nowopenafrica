/**
 * The categories and places a search is really about.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * A search for "hospital" matched business NAMES and showed whatever
 * happened to be called that, while 1,769 businesses sat under the category
 * "Hospital & Clinic" and were never offered. When nothing matched at all the
 * page said "No businesses match your filters" and stopped — a dead end in
 * front of a directory that very likely held what the person wanted.
 *
 * So: alongside the results, show the categories and locations that the query
 * actually points at, each with the number of businesses behind it.
 *
 * ── THE RULE THESE FOLLOW ────────────────────────────────────────────────
 *
 * Every facet is counted from the businesses on hand, and a facet with
 * nothing behind it is never offered. A suggestion that leads to an empty
 * page is worse than no suggestion — the same reason the "diagnostic tests"
 * suggestion was fixed in the search box itself.
 */

export interface FacetSource {
  category?: string | null;
  location?: string | null;
  name?: string | null;
  description?: string | null;
}

export interface Facet {
  /** The exact value to filter by — not a label to re-interpret. */
  value: string;
  /** Businesses behind it. Shown, so nobody clicks into an empty page. */
  count: number;
}

export interface RelatedFacets {
  categories: Facet[];
  locations: Facet[];
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Facets related to `query`, counted from `all`.
 *
 * @param all     every business on hand — the counts are only as honest as
 *                this list, so pass the full set rather than the current page.
 * @param query   what the visitor typed. Empty returns nothing: with no query
 *                there is no "related", only the filters already on screen.
 * @param exclude a facet already applied, which it would be noise to re-offer.
 */
export function relatedFacets(
  all: FacetSource[],
  query: string,
  exclude: { category?: string; location?: string } = {},
  limit = 6,
): RelatedFacets {
  const q = norm(query);
  if (!q) return { categories: [], locations: [] };

  const categories = new Map<string, number>();
  const locations = new Map<string, number>();

  for (const b of all) {
    const category = (b.category ?? '').trim();
    const location = (b.location ?? '').trim();

    /*
     * A business counts towards a facet when the QUERY points at that facet —
     * either because the facet's own name contains it ("hospital" →
     * "Hospital & Clinic"), or because the business matched the query some
     * other way and this is the facet it sits in.
     *
     * The first half is what rescues a dead end; the second is what makes the
     * strip useful when there ARE results.
     */
    const hitsText = norm(b.name).includes(q) || norm(b.description).includes(q);

    if (category && (norm(category).includes(q) || hitsText)) {
      categories.set(category, (categories.get(category) ?? 0) + 1);
    }
    if (location && (norm(location).includes(q) || hitsText)) {
      locations.set(location, (locations.get(location) ?? 0) + 1);
    }
  }

  const top = (m: Map<string, number>, skip?: string): Facet[] =>
    [...m.entries()]
      .filter(([value]) => value && norm(value) !== norm(skip))
      // Biggest first: the facet most likely to hold what they want.
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([value, count]) => ({ value, count }));

  return {
    categories: top(categories, exclude.category),
    locations: top(locations, exclude.location),
  };
}

/** True when there is anything worth showing. Keeps the caller's JSX honest. */
export function hasFacets(f: RelatedFacets): boolean {
  return f.categories.length > 0 || f.locations.length > 0;
}
