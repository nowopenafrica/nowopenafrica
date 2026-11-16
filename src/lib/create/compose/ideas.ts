// Model-written ideas and copy for the three concepts (decision D2), and the
// gate they pass through before a customer sees a word of them.
//
// The model is asked (supabase/functions/_shared/conceptIdeas.ts) for one
// visual idea and five short lines per concept. It writes for a business it
// knows nothing about, so the danger is not bad prose, it is a made-up fact:
// a price, a date, a street, an award. Founder rule C10 forbids those, and a
// prompt cannot enforce a rule. This file does.
//
// Every line is checked alone. A line that fails is dropped and the concept
// keeps the plain line it already had, so the worst a bad reply can do is
// change nothing. Nothing here calls a model: see ideaClient.ts for that.

import type { CreativeBrief } from '../brief';
import { archetypeOf, movementOf } from '../intel';
import type { Concept } from './concepts';

export type IdeaField = 'idea' | 'eyebrow' | 'headline' | 'support' | 'cta';
export const COPY_FIELDS = ['eyebrow', 'headline', 'support', 'cta'] as const;

export interface IdeaRefusal { n: number; field: IdeaField; reason: string }

export interface IdeaOutcome {
  /** The lines that passed, by concept number. A missing field was refused or absent. */
  accepted: Record<number, Partial<Record<IdeaField, string>>>;
  /** Every line dropped and why. Kept for the log and the review sheet, not shown to customers. */
  refused: IdeaRefusal[];
}

/** What the server function is sent. Mirrors IdeaRequest in _shared/conceptIdeas.ts. */
export interface IdeaRequestBody {
  request: string;
  industry?: string;
  objective?: string;
  tier?: string;
  place?: string;
  audience?: string;
  ownHeadline?: string;
  concepts: { n: number; movement: string; composition: string; hasPhoto: boolean }[];
}

export function ideaRequestFor(brief: CreativeBrief, concepts: Concept[]): IdeaRequestBody {
  return {
    request: brief.request,
    industry: brief.industry?.value,
    objective: brief.objective?.value,
    tier: brief.tier?.value,
    place: brief.place?.value,
    audience: brief.audience?.value,
    ownHeadline: brief.headline?.value,
    concepts: concepts.map((c) => {
      const m = movementOf(c.movement);
      const a = archetypeOf(c.archetype);
      return { n: c.n, movement: `${m?.name ?? c.movement}: ${m?.principles[0] ?? ''}.`, composition: `${a.name}: ${a.idea}`, hasPhoto: !!c.input.image };
    }),
  };
}

/* ── the gate ─────────────────────────────────────────────────────────────── */

const LIMIT: Record<IdeaField, { words: number; chars: number }> = {
  idea: { words: 26, chars: 190 }, eyebrow: { words: 4, chars: 36 }, headline: { words: 8, chars: 64 },
  support: { words: 26, chars: 170 }, cta: { words: 3, chars: 26 },
};

/* Letters (accents included), spaces and the punctuation plain copy uses. Anything else is refused. */
const PLAIN = /^[A-Za-zÀ-ɏḀ-ỿ\s.,;:?'’–—&/()-]+$/;

/* Words that state a fact, a rank or an offer the model cannot know to be true. */
const CLAIM = /\b(best|finest|unrivall?ed|unmatched|unbeatable|unparalleled|perfect|ultimate|pure|purest|results?|effective|flawless|exclusive|renowned|prime|lasting|visible|leading|number one|top[- ]rated|award\w*|guarantee\w*|certified|accredited|licensed|approved|official\w*|trusted|proven|voted|cheapest|lowest|free|discount\w*|sale|half price|clinically|dermatolog\w*|medical\w*|cure\w*|heal\w*|organic|natural|handmade|since|established|years?|decades?|generations?|world[- ]class|award[- ]winning|five[- ]star|michelin)\b/i;

/* A named day or month is an invented date. */
const DATED = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|today|tonight)\b/i;

/* Number words state quantities and prices as surely as digits do. "One" and "first" are ordinary English. */
const COUNTED = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|dozen|half|double|triple)\b/i;

/* The copy is read by a customer. A line about the layout is the model describing its own work. */
const ABOUT_DESIGN = /\b(layout|composition|margin|panel|inset|full-bleed|image|photo\w*|pattern|typography|typeface|grid|backdrop|canvas|headline|copy|text|rows?|crop\w*|portrait)\b/i;

const CLICHE = /^(welcome to|experience the|elevate your|unlock|discover the|introducing|your journey|where .* meets)/i;

/* Models reach for typographic hyphens and no-break spaces; they are ordinary characters wearing a costume. */
const tidy = (s: string) => s.replace(/[\u2010\u2011\u2012]/g, '-').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
/* The platform is African: the continent is never an invented fact. A country or a city still has to be the customer's. */
const CONTINENT = new Set(['afric']);
const stem = (w: string) => w.toLowerCase().replace(/[^a-zÀ-ɏ]/g, '').slice(0, 5);

/**
 * Why a line may not be used, or null when it may.
 *
 * `known` is the set of word stems the customer typed. A capitalised word in
 * the middle of a sentence is a name, and the only names this business has
 * given us are the ones in its request: "Lagos" passes for a Lagos brief and
 * "Lekki" does not.
 */
export function refuseLine(text: string, field: IdeaField, known: Set<string>): string | null {
  const limit = LIMIT[field];
  if (text.length > limit.chars || text.split(' ').length > limit.words) return 'too long';
  if (/\d/.test(text)) return 'contains a number';
  if (!PLAIN.test(text)) return 'contains a symbol, quotation mark or placeholder';
  if (field !== 'idea') {
    /* The idea is a note to a designer and may say "natural light" or "sale banner"; the copy may not make claims. */
    if (CLAIM.test(text)) return 'makes a claim that cannot be checked';
    if (COUNTED.test(text)) return 'states a quantity';
    if (ABOUT_DESIGN.test(text)) return 'describes the design instead of speaking to the customer';
  }
  if (DATED.test(text)) return 'names a day or a month';
  if (field === 'headline' && CLICHE.test(text)) return 'is a stock opening';
  if (field === 'headline' && text === text.toUpperCase()) return 'is set in capitals';

  /* Labels are often written In Title Case; those are set in capitals anyway and cannot be told from names. */
  const words = text.split(' ');
  const titled = (field === 'eyebrow' || field === 'cta') && words.every((w) => !/^[a-z]/.test(w));
  if (!titled) {
    let opening = true;
    for (const w of words) {
      const bare = w.replace(/^[^A-Za-zÀ-ɏ]+/, '');
      if (!opening && /^[A-ZÀ-Þ]/.test(bare) && bare !== 'I' && !CONTINENT.has(stem(bare)) && !known.has(stem(bare))) return `names something the request does not ("${bare.replace(/[^A-Za-zÀ-ɏ'-]+$/, '')}")`;
      opening = /[.?:]$/.test(w);
    }
  }
  return null;
}

/**
 * Read a model's reply. Anything not shaped as asked, or not written as
 * allowed, is dropped line by line. Never throws: a reply is untrusted input.
 */
export function readIdeas(raw: unknown, brief: CreativeBrief, concepts: Concept[]): IdeaOutcome {
  const out: IdeaOutcome = { accepted: {}, refused: [] };
  const list = (raw as { concepts?: unknown } | null)?.concepts;
  if (!Array.isArray(list)) return out;
  const known = new Set([brief.request, brief.place?.value ?? ''].join(' ').split(/\s+/).map(stem).filter(Boolean));
  const wanted = new Set(concepts.map((c) => c.n));
  const headlines = new Set<string>();

  for (const entry of list.slice(0, 6)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const n = e.n;
    if (typeof n !== 'number' || !wanted.has(n) || out.accepted[n]) continue;
    const kept: Partial<Record<IdeaField, string>> = {};
    for (const field of ['idea', ...COPY_FIELDS] as IdeaField[]) {
      if (typeof e[field] !== 'string') continue;
      const text = tidy(e[field] as string);
      if (!text) continue;
      let reason = refuseLine(text, field, known);
      if (!reason && field === 'headline') {
        const key = text.toLowerCase().replace(/[^a-z]/g, '');
        if (headlines.has(key)) reason = 'repeats another concept’s headline';
        else headlines.add(key);
      }
      if (reason) out.refused.push({ n, field, reason });
      else kept[field] = text;
    }
    out.accepted[n] = kept;
  }
  return out;
}

/**
 * The concepts with the accepted lines in place. The customer's own headline
 * is never replaced, and the facts a piece must carry are never the model's.
 */
export function applyIdeas(concepts: Concept[], outcome: IdeaOutcome, brief: CreativeBrief): Concept[] {
  return concepts.map((c) => {
    const got = outcome.accepted[c.n];
    if (!got) return c;
    const copy = { ...c.input.copy };
    const wrote: Concept['modelWrote'] = [];
    for (const field of COPY_FIELDS) {
      if (!got[field] || (field === 'headline' && brief.headline)) continue;
      copy[field] = got[field] as string;
      wrote.push(field);
    }
    return { ...c, ...(got.idea && { idea: got.idea }), ...(wrote.length && { modelWrote: wrote }), input: { ...c.input, copy } };
  });
}
