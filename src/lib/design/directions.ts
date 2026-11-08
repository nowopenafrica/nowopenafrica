// Creative directions: the named art directions a template can belong to.
//
// A direction is a composition and voice, not a colour scheme. Templates in one
// product are meant to differ in direction, and the gallery groups by it.
// Archetypes are unique per direction so two directions cannot collapse into
// the same layout idea. Pairings are keys of TYPE_PAIRINGS, palette families
// are PaletteFamily values; both are checked by tests.

import type { DesignTemplate } from '../designTemplates';
import type { PaletteFamily } from './palettes';

export type DirectionKey =
  | 'luxury' | 'minimal' | 'corporate' | 'editorial'
  | 'bold' | 'contemporary' | 'playful' | 'industry';

export type Archetype =
  | 'whitespace-centred' | 'single-element' | 'header-band' | 'asymmetric-split'
  | 'stacked-type' | 'offset-grid' | 'offset-blocks' | 'trade-led';

export interface Direction {
  key: DirectionKey;
  name: string;
  intent: string;
  archetype: Archetype;
  pairings: string[];
  paletteFamilies: PaletteFamily[];
  imagery: 'none' | 'full-bleed' | 'framed' | 'cut-out' | 'duotone';
  hierarchy: 'headline-led' | 'image-led' | 'information-led';
}

export const DIRECTIONS: Direction[] = [
  { key: 'luxury', name: 'Luxury',
    intent: 'Generous whitespace, centred type and fine rules for premium trades.',
    archetype: 'whitespace-centred', pairings: ['luxury', 'editorial'],
    paletteFamilies: ['mono', 'earth', 'warm'], imagery: 'framed', hierarchy: 'headline-led' },
  { key: 'minimal', name: 'Minimal',
    intent: 'One strong element held inside strict margins.',
    archetype: 'single-element', pairings: ['modern', 'statement'],
    paletteFamilies: ['mono', 'cool'], imagery: 'none', hierarchy: 'headline-led' },
  { key: 'corporate', name: 'Corporate',
    intent: 'A header band over a modular grid for trusted, formal services.',
    archetype: 'header-band', pairings: ['modern'],
    paletteFamilies: ['cool', 'mono'], imagery: 'framed', hierarchy: 'information-led' },
  { key: 'editorial', name: 'Editorial',
    intent: 'An asymmetric split with a serif display voice.',
    archetype: 'asymmetric-split', pairings: ['editorial', 'luxury'],
    paletteFamilies: ['earth', 'mono'], imagery: 'duotone', hierarchy: 'image-led' },
  { key: 'bold', name: 'Bold',
    intent: 'Stacked heavy type on full-bleed colour that is seen from across a street.',
    archetype: 'stacked-type', pairings: ['impact', 'street', 'statement'],
    paletteFamilies: ['bold', 'warm'], imagery: 'full-bleed', hierarchy: 'headline-led' },
  { key: 'contemporary', name: 'Contemporary',
    intent: 'An offset grid, grotesk type and photo frames for current brands.',
    archetype: 'offset-grid', pairings: ['modern', 'street'],
    paletteFamilies: ['cool', 'bold'], imagery: 'framed', hierarchy: 'image-led' },
  { key: 'playful', name: 'Playful',
    intent: 'Rounded shapes and offset blocks with a friendly, soft voice.',
    archetype: 'offset-blocks', pairings: ['warmth'],
    paletteFamilies: ['pastel', 'warm', 'bold'], imagery: 'cut-out', hierarchy: 'headline-led' },
  { key: 'industry', name: 'Industry',
    intent: "Built from the trade's own imagery and information.",
    archetype: 'trade-led', pairings: ['modern', 'warmth'],
    paletteFamilies: ['earth', 'cool', 'warm'], imagery: 'full-bleed', hierarchy: 'information-led' },
];

export function directionOf(key: string | undefined): Direction | null {
  return DIRECTIONS.find((d) => d.key === key) ?? null;
}

/** Reasons a template's direction is unusable. Empty means fine (or unset). */
export function directionProblems(tpl: Pick<DesignTemplate, 'direction' | 'industries'>): string[] {
  const problems: string[] = [];
  if (tpl.direction === undefined) return problems;
  if (!directionOf(tpl.direction)) {
    problems.push(`unknown direction "${tpl.direction}"`);
    return problems;
  }
  if (tpl.direction === 'industry' && !(tpl.industries && tpl.industries.length > 0)) {
    problems.push('industry direction needs at least one industry');
  }
  return problems;
}
