import type { DesignTemplate } from '../designTemplates';
import { DIRECTIONS, directionOf } from '../design/directions';
import { paletteOf, type PaletteFamily } from '../design/palettes';
import { CATEGORIES, subcategoryFor } from './catalogueTaxonomy';
import { canvasOf, isPreviewOnly, pxText } from './templateDetail';

/**
 * The Create page's catalogue filters (spec §10, Filters).
 *
 * Every value comes from the template itself or a registry it names: the
 * category from its subcategory, the colour family from `look.palette`, the
 * format, dimensions and orientation from its canvas, editability from C7.
 * Nothing is written down per template.
 *
 * A value that would match nothing is not offered, and a group left with no
 * value is not shown (`filterOptions`). Counts are taken against the OTHER
 * groups' choices, so picking any offered value always leaves something.
 *
 * Left out on purpose:
 *  - "Recent": no template carries a real date. Code templates have none, and
 *    the uploaded rows' `published_at` is not carried onto DesignTemplate. It
 *    is added once one is, never faked from catalogue order.
 *  - "Free or paid", "Trending", "Popularity": nothing paid exists and there
 *    is no reliable usage count (spec §10).
 */

export type FilterGroupKey =
  | 'category' | 'industry' | 'format' | 'dimensions'
  | 'direction' | 'colour' | 'orientation' | 'editable';

export const FILTER_GROUPS: { key: FilterGroupKey; label: string }[] = [
  { key: 'category', label: 'Category' },
  { key: 'industry', label: 'Industry' },
  { key: 'format', label: 'Format' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'direction', label: 'Direction' },
  { key: 'colour', label: 'Colour' },
  { key: 'orientation', label: 'Orientation' },
  { key: 'editable', label: 'Editable format' },
];

export type FilterSelection = Partial<Record<FilterGroupKey, string>>;

export interface FilterValue { value: string; label: string; count: number }
export interface FilterGroupOptions { key: FilterGroupKey; label: string; values: FilterValue[] }

const FAMILY_ORDER: PaletteFamily[] = ['warm', 'cool', 'earth', 'bold', 'pastel', 'mono'];
const ORIENTATIONS = ['portrait', 'landscape', 'square'] as const;
type Orientation = typeof ORIENTATIONS[number];
const EDITABILITY = ['editable', 'preview-only'] as const;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const orientationOf = (w: number, h: number): Orientation =>
  w === h ? 'square' : h > w ? 'portrait' : 'landscape';

/*
 * filterOptions reads every template once per group, and the grid re-reads on
 * each change, so the facets are cached per template OBJECT. A template is
 * replaced (never mutated) when it changes, so a new object is read afresh.
 */
const FACETS = new WeakMap<DesignTemplate, Readonly<Record<FilterGroupKey, readonly string[]>>>();

/** Every value each group reads off one template. Industry may hold several. Cached; do not mutate. */
export function facetsOf(tpl: DesignTemplate): Readonly<Record<FilterGroupKey, readonly string[]>> {
  const hit = FACETS.get(tpl);
  if (hit) return hit;
  const facets = readFacets(tpl);
  FACETS.set(tpl, facets);
  return facets;
}

function readFacets(tpl: DesignTemplate): Readonly<Record<FilterGroupKey, readonly string[]>> {
  const canvas = canvasOf(tpl);
  const category = subcategoryFor(tpl)?.category;
  const direction = directionOf(tpl.direction)?.key;
  const family = paletteOf(tpl.look?.palette)?.family;
  return {
    category: category ? [category] : [],
    industry: [...new Set(tpl.industries ?? [])],
    /* A design with no format of its own renders square; it names no format. */
    format: canvas.format && canvas.formatKey ? [canvas.formatKey] : [],
    dimensions: canvas.format ? [`${canvas.w}x${canvas.h}`] : [],
    direction: direction ? [direction] : [],
    colour: family ? [family] : [],
    orientation: [orientationOf(canvas.w, canvas.h)],
    editable: [isPreviewOnly(tpl) ? 'preview-only' : 'editable'],
  };
}

function labelFor(group: FilterGroupKey, value: string, sample: DesignTemplate | undefined): string {
  switch (group) {
    case 'category': return CATEGORIES.find((c) => c.key === value)?.name ?? value;
    case 'direction': return directionOf(value)?.name ?? value;
    case 'format': return sample ? canvasOf(sample).label : value;
    case 'dimensions': {
      const [w, h] = value.split('x').map(Number);
      return pxText({ w, h });
    }
    case 'editable': return value === 'editable' ? 'Editable' : 'Preview only';
    case 'colour':
    case 'orientation': return capital(value);
    default: return value;
  }
}

/** A fixed order where the registry has one; otherwise by label. */
function rank(group: FilterGroupKey): ((v: FilterValue) => number) | null {
  const order: readonly string[] | null =
    group === 'category' ? CATEGORIES.map((c) => c.key)
      : group === 'direction' ? DIRECTIONS.map((d) => d.key)
        : group === 'colour' ? FAMILY_ORDER
          : group === 'orientation' ? ORIENTATIONS
            : group === 'editable' ? EDITABILITY
              : null;
  return order ? (v) => order.indexOf(v.value) : null;
}

const matches = (tpl: DesignTemplate, sel: FilterSelection, skip?: FilterGroupKey): boolean => {
  const f = facetsOf(tpl);
  return FILTER_GROUPS.every(({ key }) => {
    if (key === skip) return true;
    const want = sel[key];
    return !want || f[key].includes(want);
  });
};

export function applyFilters(pool: DesignTemplate[], sel: FilterSelection): DesignTemplate[] {
  if (!Object.values(sel).some(Boolean)) return pool;
  return pool.filter((t) => matches(t, sel));
}

/** The groups and values worth offering for this pool under this selection. */
export function filterOptions(pool: DesignTemplate[], sel: FilterSelection): FilterGroupOptions[] {
  const out: FilterGroupOptions[] = [];
  for (const { key, label } of FILTER_GROUPS) {
    const counts = new Map<string, { count: number; sample: DesignTemplate }>();
    for (const tpl of pool) {
      if (!matches(tpl, sel, key)) continue;
      for (const value of facetsOf(tpl)[key]) {
        const found = counts.get(value);
        if (found) found.count += 1; else counts.set(value, { count: 1, sample: tpl });
      }
    }
    const values: FilterValue[] = [...counts].map(([value, { count, sample }]) => ({
      value, label: labelFor(key, value, sample), count,
    }));
    /* A chosen value stays on show, even at nought, so it can be cleared. */
    const chosen = sel[key];
    if (chosen && !counts.has(chosen)) {
      values.push({ value: chosen, label: labelFor(key, chosen, pool.find((t) => facetsOf(t)[key].includes(chosen))), count: 0 });
    }
    const by = rank(key);
    values.sort(by ? (a, b) => by(a) - by(b) : (a, b) => a.label.localeCompare(b.label));
    if (values.length > 0) out.push({ key, label, values });
  }
  return out;
}
