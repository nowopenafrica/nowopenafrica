// Creative Intelligence Library: shared types.
//
// The library is knowledge, held as data so code can reason with it and tests
// can hold it to account. The human-readable copy lives in
// docs/creative-intelligence/ and is GENERATED from these files
// (`npm run intel:docs`); a test fails when the two drift.
//
// Nothing here describes or reproduces any specific existing design. Movements
// are public design history; every rule is a principle applied to our own
// geometry (Ruling AJ).

import type { DirectionKey } from '../../design/directions';
import type { PaletteFamily } from '../../design/palettes';

/** How a design uses pictures. Wider than Direction['imagery']: the engine arrives in CI-3. */
export type ImageryMode =
  | 'none' | 'full-bleed' | 'framed' | 'cut-out' | 'duotone'
  | 'collage' | 'render' | 'illustration' | 'pattern';

/** Composition archetypes: grid-based generators, built in CI-3. Named here so movements can point at them. */
export type ArchetypeKey =
  | 'image-bleed' | 'typographic-poster' | 'editorial-split' | 'modular-grid'
  | 'passe-partout' | 'monumental-type' | 'product-hero' | 'collage-layered'
  | 'information-ledger' | 'centred-emblem' | 'band-and-field' | 'diagonal-energy'
  | 'framed-portrait' | 'pattern-field' | 'render-stage' | 'serial-tiles';

export interface Archetype {
  key: ArchetypeKey;
  name: string;
  /** What the layout does, in one sentence. */
  idea: string;
  /** What leads the eye. */
  hierarchy: 'headline-led' | 'image-led' | 'information-led';
  /** Needs a picture to work at all. The engine must not choose it without one. */
  needsImage: boolean;
}

export interface Movement {
  key: string;
  name: string;
  /** The existing direction it groups under, so today's templates keep their tags. */
  group: DirectionKey;
  /** Where it comes from, in one line. History, not a claim about any brand. */
  origin: string;
  principles: string[];
  grid: string;
  typography: string;
  colour: string;
  imagery: ImageryMode[];
  archetypes: ArchetypeKey[];
  /** Keys of ALL_PAIRINGS: faces we actually ship. */
  pairings: string[];
  paletteFamilies: PaletteFamily[];
  /** A real palette key, used for the review plate and as a safe default. */
  samplePalette: string;
  useWhen: string[];
  avoidWhen: string[];
  /** The mistakes that make this movement look like a cheap imitation of itself. */
  pitfalls: string[];
}

export interface IndustryProfile {
  key: string;
  name: string;
  /** One of INDUSTRY_GROUPS, so existing template tags and search keep working. */
  group: string;
  audience: string;
  goals: string[];
  tone: string;
  /** Movement keys that suit it, strongest first. */
  fits: string[];
  /** Movement keys that usually work against it. */
  avoid: string[];
  /** Information a real piece for this trade cannot leave out. */
  mustCarry: string[];
  /** What the pictures should show. */
  imagery: string[];
  /** Claims and subjects that need care or are regulated. */
  cautions: string[];
  /** What this trade most often needs made. */
  deliverables: string[];
}

export interface Trend {
  key: string;
  name: string;
  summary: string;
  /** Movement keys it shows up in. */
  movements: string[];
  /** ISO date the entry was written. */
  added: string;
  /** ISO date by which somebody must look at it again. A test fails after this. */
  reviewBy: string;
  /**
   * `proposed` until the founder approves it. Only `approved` trends may be
   * shown to customers or weigh on a concept.
   */
  status: 'proposed' | 'approved' | 'retired';
  /** Where the observation comes from. Never a statistic we cannot source. */
  basis: string;
  /** When leaning on it would date the work or mislead. */
  caution: string;
}

export interface PhotographyDirection {
  mode: ImageryMode;
  name: string;
  brief: string;
  rules: string[];
  never: string[];
}

export interface RequestFamily {
  key: string;
  name: string;
  /** Catalogue category keys (catalogueTaxonomy.ts) this family draws on. */
  categories: string[];
  examples: string[];
  /** What a brief in this family must settle before concepts are worth making. */
  briefMustSettle: string[];
}
