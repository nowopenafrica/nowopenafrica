// A typed request becomes a creative brief.
//
// Reads what was said, fills what the trade implies, and asks only for what
// would change the result. Nothing is invented: a default is labelled a
// default, a place is used only if it was named, and what the piece must
// carry is listed for the customer to supply.

import { SUBCATEGORIES } from '../catalogueTaxonomy';
import { quotedText } from '../intent';
import { parseQuery } from '../searchRank';
import { INDUSTRIES, MOVEMENTS, REQUEST_FAMILIES, industryOf, movementOf, movementsForIndustry } from '../intel';
import {
  AUDIENCE_WORDS, CATEGORY_TO_INDUSTRY, DELIVERABLE_EXTRA, DIRECTION_TO_MOVEMENTS, INDUSTRY_WORDS,
  MOVEMENT_WORDS, OBJECTIVE_WORDS, PLACE_WORDS, SERIES_WORDS, SYSTEM_WORDS, TIER_WORDS,
} from './lexicon';
import type { BriefContext, BriefQuestion, CreativeBrief, Field, Objective, Scope, Tier } from './types';

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
const has = (text: string, phrase: string) => text.includes(` ${phrase} `);

/** The key whose longest phrase appears in the text. */
function pick<K extends string>(text: string, table: Record<K, string[]>): { key: K; phrase: string } | null {
  let best: { key: K; phrase: string } | null = null;
  for (const key of Object.keys(table) as K[]) {
    for (const phrase of table[key]) {
      if (has(text, phrase) && (!best || phrase.length > best.phrase.length)) best = { key, phrase };
    }
  }
  return best;
}

/** Every key with a phrase in the text, in the order the phrases appear. */
function pickAll<K extends string>(text: string, table: Record<K, string[]>): K[] {
  const found: { key: K; at: number }[] = [];
  for (const key of Object.keys(table) as K[]) {
    const at = Math.min(...table[key].map((p) => text.indexOf(` ${p} `)).filter((i) => i >= 0), Infinity);
    if (at !== Infinity) found.push({ key, at });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.key);
}

const typed = <T>(value: T, from?: string): Field<T> => ({ value, source: 'typed', from });
const inferred = <T>(value: T, from?: string): Field<T> => ({ value, source: 'inferred', from });
const byDefault = <T>(value: T, from?: string): Field<T> => ({ value, source: 'default', from });

const subOf = (key: string) => SUBCATEGORIES.find((s) => s.key === key) ?? null;
const familyForCategory = (category: string) =>
  REQUEST_FAMILIES.find((r) => r.categories[0] === category) ?? REQUEST_FAMILIES.find((r) => r.categories.includes(category)) ?? null;

/** What each objective is usually trying to do, when the request does not say. */
const DEFAULT_OBJECTIVE: Record<string, Objective> = {
  branding: 'identity', social: 'awareness', advertising: 'awareness', events: 'event',
  packaging: 'launch', 'print-merch': 'inform', production: 'awareness',
};

const uniq = <T>(xs: T[]) => [...new Set(xs)];

function movementOrder(named: string[], hinted: string[], industryKey: string | null): string[] {
  const profile = industryKey ? industryOf(industryKey) : null;
  const avoid = new Set(profile?.avoid ?? []);
  const fits = profile?.fits ?? [];
  const usable = hinted.filter((k) => !avoid.has(k));
  return uniq([
    ...named,                                   // the customer asked for it by name: it goes first, even if unusual
    ...usable.filter((k) => fits.includes(k)),  // their style word and the trade agree
    ...usable.slice(0, 2),                      // their style word, where the trade does not object
    ...fits,                                    // what the trade usually suits
    ...movementsForIndustry(industryKey).map((m) => m.key),
  ]).filter((k) => !!movementOf(k));
}

export function readBrief(request: string, ctx: BriefContext = {}): CreativeBrief {
  const text = norm(request);
  const q = parseQuery(request);
  const limits: string[] = [];

  /* ── scope: one piece, several of a kind, or a system ─────────────────── */
  const systemWord = SYSTEM_WORDS.filter((w) => has(text, w)).sort((a, b) => b.length - a.length)[0];
  const seriesWord = SERIES_WORDS.filter((w) => has(text, w)).sort((a, b) => b.length - a.length)[0];
  const scope: Field<Scope> = systemWord ? inferred('system', systemWord)
    : seriesWord ? inferred('series', seriesWord) : byDefault('single');

  /* ── industry ─────────────────────────────────────────────────────────── */
  const ind = pick(text, INDUSTRY_WORDS);
  const ctxIndustry = ctx.category ? CATEGORY_TO_INDUSTRY[ctx.category] : undefined;
  const industry: Field<string> | null = ind ? inferred(ind.key, ind.phrase)
    : ctxIndustry ? byDefault(ctxIndustry, `your listing: ${ctx.category}`) : null;
  const profile = industry ? industryOf(industry.value) : null;

  /* ── objective ────────────────────────────────────────────────────────── */
  const obj = pick(text, OBJECTIVE_WORDS);

  /* ── deliverable ──────────────────────────────────────────────────────── */
  const extra = pick(text, DELIVERABLE_EXTRA);
  let deliverableKey: string | null = null;
  let deliverableFrom: string | undefined;
  if (extra && subOf(extra.key)) { deliverableKey = extra.key; deliverableFrom = extra.phrase; }
  else if (q.subcategory && subOf(q.subcategory)) { deliverableKey = q.subcategory; }
  /*
   * An identity is a system, not one product. "A fashion label" names the
   * business, so the word "label" must not turn the request into a product
   * label: CI-0 found exactly that, and the customer was shown jar labels.
   */
  const isIdentity = obj?.key === 'identity';
  if (isIdentity && deliverableKey !== 'brand-guidelines') { deliverableKey = null; deliverableFrom = undefined; }
  if (q.subcategory && !subOf(q.subcategory)) limits.push(`Create has no ${q.subcategory.replace(/-/g, ' ')} designs yet.`);

  const sub = deliverableKey ? subOf(deliverableKey) : null;
  const deliverable: Field<string> | null = sub ? inferred(sub.key, deliverableFrom ?? sub.name.toLowerCase()) : null;

  /* ── request family ───────────────────────────────────────────────────── */
  const fam = isIdentity ? REQUEST_FAMILIES.find((r) => r.key === 'branding')!
    : sub ? familyForCategory(sub.category) : null;
  const family: Field<string> | null = fam ? inferred(fam.key, isIdentity ? obj!.phrase : sub!.name.toLowerCase()) : null;

  const objective: Field<Objective> | null = obj ? inferred(obj.key, obj.phrase)
    : fam ? byDefault(DEFAULT_OBJECTIVE[fam.key] ?? 'awareness', `usual for ${fam.name.toLowerCase()}`) : null;

  /* ── format ───────────────────────────────────────────────────────────── */
  const format: Field<string> | null = sub
    ? (q.format && sub.formats.includes(q.format) ? typed(q.format) : byDefault(sub.formats[0], `first size for a ${sub.name.toLowerCase()}`))
    : null;

  /* ── tier, place, audience ────────────────────────────────────────────── */
  const tierHit = pick(text, TIER_WORDS);
  const tier: Field<Tier> | null = tierHit ? inferred(tierHit.key, tierHit.phrase) : null;

  const placeHit = pick(text, PLACE_WORDS);
  const place: Field<string> | null = placeHit ? typed(placeHit.key, placeHit.phrase)
    : ctx.city ? byDefault(ctx.city, 'your listing') : null;

  const aud = pick(text, AUDIENCE_WORDS);
  const audience: Field<string> | null = aud ? inferred(aud.key, aud.phrase)
    : profile ? byDefault(profile.audience, `usual for ${profile.name.toLowerCase()}`) : null;
  const tone: Field<string> | null = profile ? byDefault(profile.tone, `usual for ${profile.name.toLowerCase()}`) : null;

  /* ── movements ────────────────────────────────────────────────────────── */
  const named = pickAll(text, MOVEMENT_WORDS);
  const hinted = uniq([
    ...(q.direction ? DIRECTION_TO_MOVEMENTS[q.direction] ?? [] : []),
    ...(tier?.value === 'luxury' || tier?.value === 'premium' ? DIRECTION_TO_MOVEMENTS.luxury : []),
  ]);
  const order = movementOrder(named, hinted, industry?.value ?? null);
  const movements: Field<string[]> = named.length ? typed(order, named.map((k) => movementOf(k)!.name).join(', '))
    : hinted.length || profile ? inferred(order, uniq([tier ? null : q.direction, tier?.value, profile?.name.toLowerCase()].filter(Boolean)).join(' + '))
    : byDefault(MOVEMENTS.map((m) => m.key));

  /* ── copy ─────────────────────────────────────────────────────────────── */
  const quoted = quotedText(request);
  const headline: Field<string> | null = quoted ? typed(quoted) : null;

  /* ── honest limits ────────────────────────────────────────────────────── */
  if (isIdentity) limits.push('Create cannot draw an original logo yet. It can build the identity system around a wordmark set in type, or around a logo you upload.');
  if (has(text, 'video') || has(text, 'reel') || has(text, 'animation')) limits.push('Create makes still designs. Video and motion are not built yet.');
  if (fam?.key === 'production') limits.push('Photo and video shoots are not something Create produces today.');

  const brief: CreativeBrief = {
    request, family, deliverable, format, scope, industry, objective, tier, place, audience, tone, movements, headline,
    mustCarry: profile?.mustCarry ?? [], imagery: profile?.imagery ?? [], cautions: profile?.cautions ?? [],
    limits, questions: [],
  };
  brief.questions = questionsFor(brief, ctx);
  return brief;
}

/**
 * At most three questions, in the order their answers change the result.
 * A field with a usable default is never asked about.
 */
export function questionsFor(brief: CreativeBrief, ctx: BriefContext = {}): BriefQuestion[] {
  const out: BriefQuestion[] = [];
  const isSystem = brief.scope.value === 'system';

  if (!brief.deliverable && !isSystem) {
    out.push({ field: 'deliverable', ask: 'What are we making?',
      why: 'The size and layout depend on it.',
      options: ['instagram-post', 'flyer', 'poster', 'billboard', 'business-card', 'menu'].map((k) => {
        const s = SUBCATEGORIES.find((x) => x.key === k);
        return { value: k, label: s?.name ?? k };
      }) });
  }
  if (!brief.industry) {
    out.push({ field: 'industry', ask: 'What kind of business is it for?',
      why: 'It sets the audience, the pictures and which styles suit.',
      options: INDUSTRIES.map((i) => ({ value: i.key, label: i.name })) });
  }
  if (!ctx.businessName) {
    out.push({ field: 'business', ask: 'What is the business or brand called?',
      why: 'The name goes on the design, and a concept is built around it.' });
  }
  if (!brief.headline) {
    const what = brief.objective?.value === 'event' ? 'the event name, date and place'
      : brief.objective?.value === 'opening' ? 'the opening date and where it is'
      : brief.objective?.value === 'sale' ? 'the offer, the price and when it ends'
      : brief.objective?.value === 'launch' ? 'what is launching and when'
      : 'the one thing it should say';
    out.push({ field: 'message', ask: `What should it say? Give ${what}.`,
      why: 'Your own words are used exactly. Nothing is made up for you.' });
  }
  return out.slice(0, 3);
}

/** Apply an answer and re-ask. Answers are the customer's own word, so they are `typed`. */
export function answerBrief(brief: CreativeBrief, field: BriefQuestion['field'], value: string, ctx: BriefContext = {}): CreativeBrief {
  const v = value.trim();
  if (!v) return brief;
  let next: CreativeBrief = { ...brief };
  let nextCtx = ctx;
  if (field === 'deliverable') {
    const sub = subOf(v);
    if (sub) {
      const fam = familyForCategory(sub.category);
      next = { ...next, deliverable: typed(sub.key), format: byDefault(sub.formats[0], `first size for a ${sub.name.toLowerCase()}`),
        family: fam ? inferred(fam.key, sub.name.toLowerCase()) : next.family,
        objective: next.objective ?? (fam ? byDefault(DEFAULT_OBJECTIVE[fam.key] ?? 'awareness') : null) };
    }
  } else if (field === 'industry') {
    const profile = industryOf(v);
    if (profile) {
      const order = movementOrder(next.movements.source === 'typed' ? next.movements.value.slice(0, 1) : [], [], profile.key);
      next = { ...next, industry: typed(profile.key),
        audience: next.audience?.source === 'inferred' ? next.audience : byDefault(profile.audience),
        tone: byDefault(profile.tone), movements: inferred(order, profile.name),
        mustCarry: profile.mustCarry, imagery: profile.imagery, cautions: profile.cautions };
    }
  } else if (field === 'business') {
    nextCtx = { ...ctx, businessName: v };
  } else if (field === 'message') {
    next = { ...next, headline: typed(v) };
  }
  next.questions = questionsFor(next, nextCtx);
  return next;
}

/** True when concepts can be made without asking anything more. */
export const briefIsReady = (brief: CreativeBrief): boolean =>
  !!brief.industry && (!!brief.deliverable || brief.scope.value === 'system');

/** The first `n` movements from different groups: what three concepts would explore. */
export function directionsToExplore(brief: CreativeBrief, n = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of brief.movements.value) {
    const group = movementOf(key)?.group;
    if (!group || seen.has(group)) continue;
    seen.add(group);
    out.push(key);
    if (out.length === n) break;
  }
  return out;
}
