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
import { ALL_PAIRINGS, archetypeOf, movementOf, pairingProblems, type ArchetypeKey, type Movement, type TypeContext } from '../intel';
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

/**
 * A fact the customer has not given yet, worded as theirs to give.
 *
 * The brief lists what a piece for this trade must carry ("Name and area",
 * "Opening date or hours"). Printed as written, those read like the labels
 * of an empty form left on the design. "Your name and area" reads as what
 * it is: a place waiting for the customer's own detail. A line that already
 * addresses the reader ("How to book or order") is left alone.
 */
export function asPlaceholder(fact: string): string {
  /*
   * The profiles' facts carry notes for the customer ("if held", "where
   * required", "named correctly", "in plain words"). Those are advice about
   * the fact, not words for the design: they belong in the brief panel, where
   * they are already shown, and are dropped here.
   */
  const t = fact.trim()
    .replace(/\s+(if|where|when)\s+.+$/i, '')
    .replace(/\s+on\s+\w+\s+pieces$/i, '')
    .replace(/\s+(named correctly|in plain words|in one line)$/i, '')
    .trim();
  if (!t || /^(your|how|what|where|when|who|why)\b/i.test(t) || t.includes(':')) return t;
  /* An instruction to the designer, not a fact the customer gives. */
  if (/^call to action$/i.test(t)) return 'How to reach you';
  /* "The signature item" becomes "Your signature item", not "Your the signature item". */
  const bare = t.replace(/^(the|a|an)\s+/i, '').replace(/\s+and\s+the\s+/i, ' and ');
  return `Your ${bare.charAt(0).toLowerCase()}${bare.slice(1)}`;
}

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
  /** Headline faces already used: three concepts should not lead with one face. */
  const displays = new Set<string>();

  const seed = seedOf(brief.industry?.value ?? brief.family?.value ?? '');
  const factsFirst = brief.objective?.value === 'event';
  const roadside = isRoadside(brief);
  /* A format whose text sits near six points: a business card, a compliment slip. */
  const smallPrint = /^(business-card|compliment-slip)/.test(brief.format?.value ?? '');

  for (const key of brief.movements.value) {
    if (out.length === count) break;
    const movement = movementOf(key);
    if (!movement || groups.has(movement.group)) continue;
    const n = out.length;
    const image = opts.images?.[n];
    const archetype = archetypeFor(movement, archetypes, !!image, seed >>> 11, factsFirst);
    if (!archetype) continue;
    const given = opts.copy?.[n] ?? {};
    /* The customer's words first, then words given for this concept, then the bank's plain line. */
    const bank = bankLine(brief, n);
    /* The movement's first pairing that no earlier concept took: three concepts, three voices. */
    /*
     * The type has to suit the piece, not only the movement (intel/typeUse.ts).
     * A hairline serif is not set on a billboard, a display face is not asked
     * for a twelve-word headline, and a business card gets text faces that
     * survive six points. The movement's own voices are tried first; past
     * them, any voice no earlier concept took that suits is better than a
     * repeat, and a repeat that suits is better than a voice that does not.
     */
    const words = (given.headline ?? brief.headline?.value ?? bank.headline).split(/\s+/).filter(Boolean).length;
    const ctx: TypeContext = { distance: roadside, smallPrint, headlineWords: words, capitals: CAPS.has(movement.key) };
    const suits = (k: string) => { const p = ALL_PAIRINGS.find((x) => x.key === k); return !!p && pairingProblems(p, ctx).length === 0; };
    const own = turned(movement.pairings, seed >>> 5);
    /*
     * A new pairing is not enough if it leads with the same face: on the real
     * Create page a Lagos billboard got "modern" and "swiss", both Space
     * Grotesk headlines (2026-11-17). A customer sees the headline face first,
     * so a headline face no earlier concept used is preferred at every step.
     */
    const display = (k: string) => ALL_PAIRINGS.find((x) => x.key === k)?.display;
    const freshFace = (k: string) => !displays.has(display(k) as string);
    const pairingKey = own.find((k) => !pairings.has(k) && suits(k) && freshFace(k))
      ?? ALL_PAIRINGS.find((p) => !pairings.has(p.key) && suits(p.key) && freshFace(p.key))?.key
      ?? own.find((k) => !pairings.has(k) && suits(k))
      ?? ALL_PAIRINGS.find((p) => !pairings.has(p.key) && suits(p.key))?.key
      ?? own.find((k) => suits(k))
      ?? own.find((k) => !pairings.has(k)) ?? movement.pairings[0];
    const pairing = ALL_PAIRINGS.find((p) => p.key === pairingKey) ?? ALL_PAIRINGS[0];
    displays.add(pairing.display);
    const palette = paletteFor(movement, palettes, seed, brief.tier?.value);
    const copy: ConceptCopy = {
      brand: given.brand ?? opts.businessName ?? 'Your brand',
      eyebrow: given.eyebrow ?? bank.eyebrow,
      headline: given.headline ?? brief.headline?.value ?? bank.headline,
      support: given.support ?? bank.support,
      cta: given.cta ?? bank.cta,
      details: given.details ?? brief.mustCarry.slice(0, 4).map(asPlaceholder),
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

/** Is this piece read from a road? A billboard brief, or any billboard format asked for by name. */
export const isRoadside = (brief: CreativeBrief, formatKey?: string): boolean =>
  /^(billboard|board-)/.test(formatKey ?? brief.format?.value ?? '') || !!brief.deliverable?.value.startsWith('billboard');

/** The editable document for a concept, at the brief's format or one given. */
export function documentFor(concept: Concept, brief: CreativeBrief, formatKey?: string): DesignDocument {
  const format = formatOf(formatKey ?? brief.format?.value ?? 'instagram-portrait') ?? { w: 1080, h: 1350 };
  return compose(concept.archetype, concept.input, format, `${movementOf(concept.movement)?.name ?? 'Concept'} concept`, { distance: isRoadside(brief, formatKey) });
}
