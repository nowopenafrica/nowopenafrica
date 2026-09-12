import { BUSINESS_CATEGORY_GROUPS } from '../../data/categories';
import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import { DESIGN_STYLES } from './styles';
import { STYLE_TAGS, TEMPLATE_USES, type StyleTag, type TemplateUse } from './tags';

export { STYLE_TAGS, TEMPLATE_USES };
export type { StyleTag, TemplateUse };

/**
 * How a template is found.
 *
 * ── THE PROBLEM THIS SOLVES ───────────────────────────────────────────────
 *
 * A template nobody can find is a template that does not exist. The catalogue
 * had a key, a label, a one-line description and a mood — and the picker showed
 * all of them in one flat grid. That works at 27. It does not work at 60, and
 * the brief is explicit that the library should eventually run to thousands.
 *
 * So every template now says what it is FOR, not just what it looks like:
 * which job (a menu, a price list, a vacancy), which industries it suits, and
 * which visual registers it sits in. Search then means something.
 *
 * ── WHY THE INDUSTRY LIST IS NOT WRITTEN HERE ─────────────────────────────
 *
 * The industry groups are imported from data/categories.ts — the same twelve
 * groups the directory, search and business profiles already use. Inventing a
 * second industry vocabulary for Create is how a product ends up with
 * "Restaurants" in one place and "Food & Hospitality" in another, and with a
 * filter that silently matches nothing. A template's industry tag must be a
 * real NowOpen category group or the test below fails.
 */

/** The twelve real NowOpen industry groups. One vocabulary, not two. */
export const INDUSTRY_GROUPS: string[] = BUSINESS_CATEGORY_GROUPS.map((g) => g.group);

export interface TemplateTags {
  use: TemplateUse;
  /** NowOpen category groups this suits. Empty means it suits any. */
  industries?: string[];
  styles?: StyleTag[];
  /** Free words somebody might type. Not shown; searched. */
  tags?: string[];
}

/* ── search ───────────────────────────────────────────────────────────────── */

export interface TemplateFilters {
  use?: TemplateUse;
  industry?: string;
  style?: StyleTag;
}

const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Words that carry no meaning in a template search. */
const NOISE = new Set([
  'a', 'an', 'the', 'for', 'my', 'our', 'with', 'and', 'of', 'to', 'in', 'on',
  'design', 'template', 'make', 'create', 'need', 'want', 'some', 'me',
]);

const haystack = (tpl: DesignTemplate): string => normalise([
  tpl.label, tpl.desc, tpl.mood, tpl.use ?? '',
  ...(tpl.industries ?? []), ...(tpl.styles ?? []), ...(tpl.tags ?? []),
].join(' '));

/**
 * Find templates for a phrase and a set of filters.
 *
 * "Natural language" here means tolerant, not clever: the query is reduced to
 * meaningful words and scored against each template's own words. There is no
 * model involved and it does not pretend to understand intent — "luxury
 * restaurant weekend promotion" works because those four words appear in the
 * tags of the templates that suit it, which is a thing we control by tagging
 * well rather than by inference.
 *
 * Every word must match SOMETHING (AND, not OR). An OR search on four words
 * returns most of the library and calls it a result, which is worse than
 * returning nothing and letting somebody clear a word.
 */
export function findTemplates(
  query: string,
  filters: TemplateFilters = {},
  from: DesignTemplate[] = DESIGN_TEMPLATES,
): DesignTemplate[] {
  const words = normalise(query).split(' ').filter((w) => w.length > 2 && !NOISE.has(w));

  const scored = from
    .filter((tpl) => {
      if (filters.use && tpl.use !== filters.use) return false;
      // An untagged industry list means "suits anything", so it must not be
      // filtered out — otherwise a general-purpose layout disappears the
      // moment somebody picks a trade.
      if (filters.industry && tpl.industries?.length && !tpl.industries.includes(filters.industry)) return false;
      if (filters.style && !(tpl.styles ?? []).includes(filters.style)) return false;
      return true;
    })
    .map((tpl) => {
      const text = haystack(tpl);
      let score = 0;
      for (const word of words) {
        if (!text.includes(word)) return { tpl, score: -1 };
        // A hit in the label is worth more than a hit in the loose tags.
        score += normalise(tpl.label).includes(word) ? 3 : 1;
      }
      return { tpl, score };
    })
    .filter((r) => r.score >= 0);

  // Stable: equal scores keep catalogue order, so the same query always
  // produces the same list in the same order.
  return scored
    .map((r, i) => ({ ...r, i }))
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map((r) => r.tpl);
}

/** How many templates each filter value would return, for a picker's counts. */
export function templateCounts<K extends string>(
  key: 'use' | 'industry' | 'style',
  values: readonly K[],
  from: DesignTemplate[] = DESIGN_TEMPLATES,
): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const value of values) {
    out[value] = findTemplates('', { [key]: value } as TemplateFilters, from).length;
  }
  return out;
}

/** Every style tag actually used by at least one template. */
export const usedStyleTags = (from: DesignTemplate[] = DESIGN_TEMPLATES): StyleTag[] =>
  STYLE_TAGS.filter((tag) => from.some((t) => (t.styles ?? []).includes(tag)));

/**
 * How many distinct finished designs the library can currently produce.
 *
 * Layouts times styles. Stated as a function rather than a number so it cannot
 * drift from the truth, and so nothing anywhere claims a count we do not have.
 */
export const libraryDepth = (from: DesignTemplate[] = DESIGN_TEMPLATES): number =>
  from.length * DESIGN_STYLES.length;

/**
 * Which industry group a business belongs to.
 *
 * This is what makes Create business-first rather than generic: the template
 * list can open already filtered to the trade the business is actually in,
 * instead of asking somebody who runs a laundry to scroll past wedding
 * invitations. Returns null when we cannot tell, and null must mean "show
 * everything" — a wrong guess is worse than no guess.
 */
export function industryGroupFor(category: string | null | undefined): string | null {
  const value = (category ?? '').trim().toLowerCase();
  if (!value) return null;
  const hit = BUSINESS_CATEGORY_GROUPS.find((g) =>
    g.items.some((item) => item.toLowerCase() === value));
  return hit?.group ?? null;
}

/**
 * Reorder so that neighbours do not look alike.
 *
 * The catalogue is in the order it was written, which groups templates by when
 * they were made — so the gallery opened with three dark blue layouts in a row
 * and the first impression of a 312-design library was "this is one design".
 * Nobody scrolls past that to find the variety further down.
 *
 * Round-robin across (scheme, mood) buckets: consecutive cards differ in at
 * least one of light-versus-dark or register, which is what the eye reads as
 * "there is range here".
 *
 * Deterministic — buckets are visited in first-appearance order and drained in
 * catalogue order. No shuffle: a gallery that reorders on every render is a
 * gallery nobody can point a colleague at.
 */
export function diversify(from: DesignTemplate[] = DESIGN_TEMPLATES): DesignTemplate[] {
  const buckets = new Map<string, DesignTemplate[]>();
  for (const tpl of from) {
    const key = `${tpl.scheme}:${tpl.mood}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(tpl);
    else buckets.set(key, [tpl]);
  }

  const queues = [...buckets.values()];
  const out: DesignTemplate[] = [];
  let last = '';
  while (out.length < from.length) {
    // Prefer a queue whose scheme differs from the one just placed; fall back
    // to any non-empty queue so nothing is ever dropped.
    const next =
      queues.find((q) => q.length && q[0].scheme !== last)
      ?? queues.find((q) => q.length);
    if (!next) break;
    const tpl = next.shift() as DesignTemplate;
    out.push(tpl);
    last = tpl.scheme;
  }
  return out;
}
