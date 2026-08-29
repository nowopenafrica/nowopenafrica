import { normalize, matchScore } from './search';

/**
 * Type-ahead suggestions, shared by every search box on the site.
 *
 * Discover, Promote and Create all answer the same shape of question — "is
 * this a thing, a place, or a kind of thing?" — so they get the same list
 * rather than three boxes that behave differently. What differs between them
 * is only WHAT is being searched, which is what the caller supplies.
 */
export type SuggestionKind = 'business' | 'category' | 'place';

export interface Suggestion {
  kind: SuggestionKind;
  /** What to show. */
  label: string;
  /** Second line: a category for an item, a region for a place. */
  detail?: string;
  /** Where selecting it goes, for an item that has its own page. */
  href?: string;
  /** What to put in the filter, for a category or a place. */
  value: string;
}

export interface SuggestInput<T> {
  items: T[];
  /** The item's name — what a person would type. */
  name: (item: T) => string;
  /** The line under it. */
  detail?: (item: T) => string | undefined;
  /** Its own page, if it has one. */
  href?: (item: T) => string | undefined;
  /** Categories worth offering, usually the ones present in the data. */
  categories?: string[];
  /** Places worth offering. */
  places?: { name: string; region: string }[];
  limit?: number;
}

/**
 * A place matching only through its region is a related suggestion, not the
 * thing that was typed, so it is capped below a word-start hit and above a
 * mid-word substring.
 *
 * Both edges came from real output. Uncapped, "la" filled the list with every
 * district of Lagos and buried the categories. Capped lower, Blantyre and
 * Casablanca — which contain "la" mid-word — outranked Ikeja and Agege, which
 * is not what somebody in Nigeria typing "la" is looking for.
 */
export const REGION_ONLY_CAP = 50;

/** Below two characters almost everything matches, which hides the box. */
export const MIN_QUERY = 2;

export function buildSuggestions<T>(src: SuggestInput<T>, query: string): Suggestion[] {
  const q = query.trim();
  if (normalize(q).length < MIN_QUERY) return [];

  const limit = src.limit ?? 8;
  const scored: { s: Suggestion; score: number; rank: number }[] = [];

  for (const item of src.items) {
    const label = src.name(item);
    const score = matchScore(label ?? '', q);
    if (score > 0) {
      scored.push({
        score,
        rank: 0,
        s: {
          kind: 'business',
          label,
          detail: src.detail?.(item),
          href: src.href?.(item),
          value: label,
        },
      });
    }
  }

  for (const place of src.places ?? []) {
    const byName = matchScore(place.name, q);
    const byRegion = matchScore(`${place.name}, ${place.region}`, q);
    const score = byName > 0 ? byName : Math.min(byRegion, REGION_ONLY_CAP);
    if (score > 0) {
      scored.push({
        score,
        rank: 1,
        s: { kind: 'place', label: place.name, detail: place.region, value: place.name },
      });
    }
  }

  for (const category of src.categories ?? []) {
    const score = matchScore(category, q);
    if (score > 0) {
      scored.push({ score, rank: 2, s: { kind: 'category', label: category, value: category } });
    }
  }

  const seen = new Set<string>();
  return scored
    .sort((a, b) => (b.score - a.score) || (a.rank - b.rank) || a.s.label.localeCompare(b.s.label))
    .filter(({ s }) => {
      const key = `${s.kind}:${normalize(s.label)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ s }) => s);
}
