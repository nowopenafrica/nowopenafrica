// Three concepts from one brief.
//
// A concept is a movement, a composition, a type pairing, a palette and the
// words, chosen together. Three concepts must differ in the first three, not
// only in colour: CI-0 found that Create's variety was eleven styles times
// thirty-six palettes poured over fixed geometry.
//
// This is the deterministic picker. It decides the art direction from the
// library. The words are the customer's own when they gave any, and otherwise
// come from the hand-written copy bank (copyBank.ts). A model was tried for
// the words (decision D2) and was not good enough; ideas.ts keeps the gate it
// would have to pass.

import { formatOf } from '../../design/formats';
import type { PatternKey } from '../../design/look';
import { PALETTES, paletteOf, type Palette, type PaletteFamily } from '../../design/palettes';
import type { DesignDocument } from '../../studio/designDocument';
import type { CreativeBrief, Tier } from '../brief';
import { ALL_PAIRINGS, archetypeOf, movementOf, type ArchetypeKey, type Movement } from '../intel';
import { IMPLEMENTED, compose, type ComposeInput, type ConceptCopy } from './archetypes';
import { bankLine } from './copyBank';

export interface Concept {
  /** 1, 2 or 3. */
  n: number;
  movement: string;
  archetype: ArchetypeKey;
  pairing: string;
  palette: string;
  /** Why this direction for this brief, in the library's own words. Not a creative idea. */
  rationale: string;
  /** One sentence on what the picture or the type does. Model-written and gated (ideas.ts); absent without a model. */
  idea?: string;
  /** The copy fields a model wrote, when any. Everything else is the customer's or a plain line. */
  modelWrote?: ('eyebrow' | 'headline' | 'support' | 'cta')[];
  input: ComposeInput;
}

export interface ConceptOptions {
  businessName?: string;
  /** Copy for each concept, in order. Missing entries fall back to the brief. */
  copy?: (Partial<ConceptCopy> | undefined)[];
  /** A picture for each concept, in order. A concept with none uses a composition that needs none. */
  images?: (string | undefined)[];
}

/** Movements that set their headlines in capitals. */
const CAPS = new Set(['neo-brutalism', 'kinetic-typography', 'typographic-monumentalism', 'constructivism', 'art-deco', 'retro-futurism']);

/*
 * The repeat a movement reaches for when its composition is a pattern field.
 * All are the pattern library's own constructions; none copies a cloth.
 */
const PATTERN: Record<string, PatternKey> = {
  'afro-contemporary': 'diamond-weave', 'african-modernism': 'arches', maximalism: 'confetti', 'art-deco': 'scales', 'organic-natural': 'waves',
};

/*
 * One movement, many trades. CI-3's review found skincare, real estate and
 * fashion all opening with the same concept: Luxury Minimalism, the same
 * composition, the same type and the same palette, because each choice was
 * "the movement's first". A movement offers several of each, so the trade now
 * decides where in the movement's own list to start. Same brief, same answer;
 * different trade, different answer.
 */
function seedOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
const turned = <T>(xs: T[], by: number): T[] => (xs.length ? [...xs.slice(by % xs.length), ...xs.slice(0, by % xs.length)] : xs);

/** Compositions that set out the facts a piece must carry. An event with no date on it is not finished. */
const CARRIES_FACTS = new Set<ArchetypeKey>(['modular-grid', 'typographic-poster', 'monumental-type', 'band-and-field', 'information-ledger', 'serial-tiles', 'diagonal-energy']);

function archetypeFor(movement: Movement, used: Set<ArchetypeKey>, hasImage: boolean, seed: number, factsFirst: boolean): ArchetypeKey | null {
  const ok = (a: ArchetypeKey) => IMPLEMENTED.includes(a) && !used.has(a) && (hasImage || !archetypeOf(a).needsImage);
  const own = turned(movement.archetypes, seed);
  /* With a picture in hand, lead with a composition that uses it. */
  let ordered = hasImage ? [...own.filter((a) => archetypeOf(a).needsImage), ...own.filter((a) => !archetypeOf(a).needsImage)] : own;
  if (factsFirst) ordered = [...ordered.filter((a) => CARRIES_FACTS.has(a)), ...ordered.filter((a) => !CARRIES_FACTS.has(a))];
  return ordered.find(ok) ?? null;
}

/*
 * Colour has a price level. Varying the palette by trade (above) handed a
 * luxury skincare brief a hot pink and yellow, which reads as a sale. A
 * luxury piece keeps to the quiet families; a premium one may also be warm.
 * Mid-market and value briefs, and briefs with no stated level, take
 * whatever the movement offers.
 */
const QUIET: Partial<Record<Tier, PaletteFamily[]>> = {
  luxury: ['mono', 'earth', 'cool'],
  premium: ['mono', 'earth', 'cool', 'warm'],
};

function paletteFor(movement: Movement, used: Set<string>, seed: number, tier: Tier | undefined): Palette {
  const quiet = tier ? QUIET[tier] : undefined;
  const fits = (p: Palette) => !quiet || quiet.includes(p.family);
  const sample = paletteOf(movement.samplePalette) as Palette;
  const family = PALETTES.filter((p) => movement.paletteFamilies.includes(p.family) && p.key !== sample.key);
  const own = turned([sample, ...family], seed).filter(fits);
  /* A movement that is loud by nature (every palette bold) still has to dress for the brief: borrow a quiet one. */
  const borrowed = quiet ? turned(PALETTES.filter(fits), seed) : [];
  return [...own, ...borrowed].find((p) => !used.has(p.key)) ?? own[0] ?? borrowed[0] ?? sample;
}

export function conceptsFor(brief: CreativeBrief, opts: ConceptOptions = {}, count = 3): Concept[] {
  const out: Concept[] = [];
  const groups = new Set<string>();
  const archetypes = new Set<ArchetypeKey>();
  const palettes = new Set<string>();
  const pairings = new Set<string>();

  const seed = seedOf(brief.industry?.value ?? brief.family?.value ?? '');
  const factsFirst = brief.objective?.value === 'event';

  for (const key of brief.movements.value) {
    if (out.length === count) break;
    const movement = movementOf(key);
    if (!movement || groups.has(movement.group)) continue;
    const n = out.length;
    const image = opts.images?.[n];
    const archetype = archetypeFor(movement, archetypes, !!image, seed >>> 11, factsFirst);
    if (!archetype) continue;
    /* The movement's first pairing that no earlier concept took: three concepts, three voices. */
    /* Past the movement's own list, any voice no earlier concept took is better than a repeat. */
    const pairingKey = turned(movement.pairings, seed >>> 5).find((k) => !pairings.has(k))
      ?? ALL_PAIRINGS.find((p) => !pairings.has(p.key))?.key ?? movement.pairings[0];
    const pairing = ALL_PAIRINGS.find((p) => p.key === pairingKey) ?? ALL_PAIRINGS[0];
    const palette = paletteFor(movement, palettes, seed, brief.tier?.value);
    const given = opts.copy?.[n] ?? {};
    /* The customer's words first, then words given for this concept, then the bank's plain line. */
    const bank = bankLine(brief, n);
    const copy: ConceptCopy = {
      brand: given.brand ?? opts.businessName ?? 'Your brand',
      eyebrow: given.eyebrow ?? bank.eyebrow,
      headline: given.headline ?? brief.headline?.value ?? bank.headline,
      support: given.support ?? bank.support,
      cta: given.cta ?? bank.cta,
      details: given.details ?? brief.mustCarry.slice(0, 4),
    };
    groups.add(movement.group); archetypes.add(archetype); palettes.add(palette.key); pairings.add(pairing.key);
    out.push({
      n: n + 1, movement: movement.key, archetype, pairing: pairing.key, palette: palette.key,
      rationale: `${movement.name}: ${movement.principles[0].toLowerCase()}. ${archetypeOf(archetype).idea}`,
      input: {
        copy, colours: palette.colours, image: archetypeOf(archetype).needsImage ? image : undefined,
        fonts: { display: pairing.display, text: pairing.text, accent: pairing.accent },
        upperHeadline: CAPS.has(movement.key),
        ...(archetype === 'pattern-field' && { pattern: PATTERN[movement.key] ?? 'rings' }),
      },
    });
  }
  return out;
}

/** Why a set of concepts is not three different concepts. Empty means it is. */
export function distinctnessProblems(concepts: Concept[]): string[] {
  const problems: string[] = [];
  const dup = (label: string, values: string[]) => {
    if (new Set(values).size !== values.length) problems.push(`two concepts share a ${label}`);
  };
  dup('movement group', concepts.map((c) => movementOf(c.movement)?.group ?? c.movement));
  dup('composition', concepts.map((c) => c.archetype));
  dup('palette', concepts.map((c) => c.palette));
  dup('type pairing', concepts.map((c) => c.pairing));
  return problems;
}

/** The editable document for a concept, at the brief's format or one given. */
export function documentFor(concept: Concept, brief: CreativeBrief, formatKey?: string): DesignDocument {
  const format = formatOf(formatKey ?? brief.format?.value ?? 'instagram-portrait') ?? { w: 1080, h: 1350 };
  return compose(concept.archetype, concept.input, format, `${movementOf(concept.movement)?.name ?? 'Concept'} concept`);
}
