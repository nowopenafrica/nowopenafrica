// Shared search helpers: diacritic-safe normalisation and lightweight
// relevance ranking used by every autocomplete/search box on the site.

/** Lowercase and strip accents so "Côte d'Ivoire" matches "cote" */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Relevance score for `candidate` against `query`.
 * 0 = no match; higher is better:
 *   100 exact · 80 prefix · 60 any word starts with query ·
 *   40 substring · 25 all query words appear somewhere
 */
export function matchScore(candidate: string, query: string): number {
  const c = normalize(candidate);
  const q = normalize(query);
  if (!q) return 0;
  if (c === q) return 100;
  if (c.startsWith(q)) return 80;
  if (c.split(/[\s,\-/]+/).some(word => word.startsWith(q))) return 60;
  if (c.includes(q)) return 40;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every(w => c.includes(w))) return 25;
  return 0;
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/** Rank `items` by the best score across the strings `keys` extracts. */
export function rankMatches<T>(
  items: T[],
  query: string,
  keys: (item: T) => (string | undefined | null)[],
  limit: number
): T[] {
  if (!normalize(query)) return [];
  const ranked: Ranked<T>[] = [];
  for (const item of items) {
    let best = 0;
    for (const key of keys(item)) {
      if (!key) continue;
      const s = matchScore(key, query);
      if (s > best) best = s;
      if (best === 100) break;
    }
    if (best > 0) ranked.push({ item, score: best });
  }
  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.item);
}

/** Wrap the matched part of `label` for highlighting: returns [before, match, after] or null. */
export function splitMatch(label: string, query: string): [string, string, string] | null {
  const q = normalize(query);
  if (!q) return null;
  const idx = normalize(label).indexOf(q);
  if (idx === -1) return null;
  return [label.slice(0, idx), label.slice(idx, idx + q.length), label.slice(idx + q.length)];
}
