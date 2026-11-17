import type { DesignTemplate } from '../designTemplates';
import { deliverableFor } from '../design/deliverables';
import type { DirectionKey } from '../design/directions';
import { SUBCATEGORIES, subcategoryFor, type CategoryKey } from './catalogueTaxonomy';

/**
 * Intent search: a sentence becomes facets, and templates are ranked by how
 * many facets they match.
 *
 * ── HOW IT READS ──────────────────────────────────────────────────────────
 *
 * "luxury real estate flyer" is not a bag of keywords. It is a product
 * (flyer), a direction (luxury) and an industry (real estate). `parseQuery`
 * finds those from a plain data lexicon below. No model is involved.
 *
 * ── HOW IT RANKS ──────────────────────────────────────────────────────────
 *
 * Facets matched, with the product counting double, then quality score, then
 * key. A luxury real-estate flyer therefore beats a plain flyer that merely
 * mentions "luxury" in its tags.
 *
 * Words the lexicon does not know never drop a result: "posh flyer for my
 * estate agency" still finds flyers. Free-text matching (title, tags,
 * description) is the fallback only when NO facet was understood.
 *
 * ── A PRODUCT THAT DOES NOT EXIST YET ─────────────────────────────────────
 *
 * The lexicon may name a product the catalogue has not got (a pitch deck).
 * `parseQuery` still returns its key, `rankTemplates` returns nothing, and
 * `searchCatalogue` says so honestly and records the miss.
 */

export interface ParsedQuery {
  subcategory: string | null;
  direction: DirectionKey | null;
  industry: string | null;
  occasion: string | null;
  format: string | null;
  /** Words that were not understood as any facet (stop words removed). */
  rest: string[];
}

/* ── lexicon: plain data, longest phrase wins ─────────────────────────────── */

/** Products. Keys not in SUBCATEGORIES are planned (see `PLANNED`). */
const SUBCATEGORY_WORDS: Record<string, string[]> = {
  'business-card': ['business card', 'business cards', 'visiting card', 'name card'],
  'flyer': ['flyer', 'flyers', 'handbill', 'leaflet'],
  'offer-flyer': ['offer flyer', 'promo flyer', 'discount flyer'],
  'poster': ['poster', 'posters'],
  'event-poster': ['event poster', 'concert poster', 'gig poster'],
  'menu': ['menu', 'menus'],
  'price-list': ['price list', 'price lists'],
  'invitation': ['invitation', 'invitations', 'invite', 'invites'],
  'certificate': ['certificate', 'certificates'],
  'ticket': ['ticket', 'tickets'],
  'letterhead': ['letterhead', 'letterheads'],
  'billboard': ['billboard', 'billboards'],
  'billboard-48-sheet': ['48 sheet', '48 sheet billboard'],
  'roll-up': ['roll up', 'rollup', 'pull up banner'],
  'banner': ['banner', 'banners'],
  'display-ad': ['display ad', 'web ad', 'banner ad'],
  'instagram-post': ['instagram', 'instagram post', 'ig', 'insta', 'social post', 'social media post', 'post'],
  'story': ['story', 'stories', 'whatsapp status'],
  'carousel': ['carousel'],
  'youtube-thumbnail': ['youtube thumbnail', 'thumbnail'],
  'sale-post': ['sale post'],
  'company-profile': ['company profile'],
  'proposal': ['proposal'],
  'pitch-deck': ['pitch deck', 'investor deck', 'investor pitch', 'slide deck', 'pitch'],
  'brochure': ['brochure', 'brochures'],
};

/** Products the lexicon knows but the catalogue does not carry yet. */
const PLANNED: Record<string, { name: string; category: CategoryKey }> = {
  'pitch-deck': { name: 'Pitch deck', category: 'presentations' },
  'brochure': { name: 'Brochure', category: 'print' },
};

const DIRECTION_WORDS: Record<DirectionKey, string[]> = {
  luxury: ['luxury', 'luxe', 'posh', 'upscale', 'premium', 'high end', 'exclusive', 'classy'],
  minimal: ['minimal', 'minimalist', 'simple', 'clean'],
  corporate: ['corporate', 'professional', 'formal'],
  editorial: ['editorial', 'magazine'],
  bold: ['bold', 'loud', 'striking', 'punchy'],
  contemporary: ['modern', 'contemporary', 'trendy'],
  playful: ['playful', 'fun', 'cheerful', 'friendly'],
  industry: [],
};

/** Keys are real INDUSTRY_GROUPS names (a test enforces it). */
const INDUSTRY_WORDS: Record<string, string[]> = {
  'Food & Hospitality': ['restaurant', 'restaurants', 'food', 'cafe', 'bakery', 'catering', 'hotel', 'bar', 'lounge', 'eatery', 'hospitality'],
  'Professional Services': ['estate agency', 'estate agent', 'real estate', 'realtor', 'property', 'properties', 'law firm', 'accounting', 'consulting'],
  'Fashion & Beauty': ['fashion', 'tailor', 'boutique', 'clothing', 'apparel', 'bridal'],
  'Health & Wellness': ['salon', 'barber', 'spa', 'clinic', 'pharmacy', 'gym', 'fitness'],
  'Technology & Media': ['tech', 'software', 'startup', 'photography'],
  'Education & Community': ['school', 'church', 'ngo', 'charity', 'tutoring'],
  'Retail & Commerce': ['shop', 'store', 'retail', 'supermarket'],
};

/** Keys are the OCCASIONS keys. */
const OCCASION_WORDS: Record<string, string[]> = {
  'sale': ['sale', 'discount', 'promo', 'promotion', 'offer', 'black friday'],
  'launch': ['launch', 'launching', 'unveiling'],
  'opening': ['opening', 'grand opening', 'new restaurant', 'new shop', 'new store', 'new salon', 'now open'],
  'holiday': ['holiday', 'christmas', 'easter', 'eid', 'ramadan', 'new year', 'festive'],
  'wedding': ['wedding', 'weddings', 'bridal shower', 'engagement'],
  'church-and-community': ['church', 'crusade', 'mosque', 'community', 'fundraiser', 'charity'],
  'sport': ['sport', 'sports', 'football', 'tournament', 'match day'],
};

/** FORMATS keys. */
const FORMAT_WORDS: Record<string, string[]> = {
  'a3': ['a3'],
  'a4': ['a4'],
  'a5': ['a5'],
  'letter': ['us letter'],
  'half-a4': ['half a4', 'dl'],
  'square': ['square'],
};

/** Words that carry no meaning for search. */
const STOP = new Set([
  'a', 'an', 'the', 'for', 'my', 'me', 'our', 'of', 'to', 'in', 'on', 'and', 'with', 'i', 'need', 'want',
  'make', 'create', 'design', 'new', 'please', 'some', 'campaign', 'that', 'is', 'it', 'looking', 'find',
]);

/* ── parsing ──────────────────────────────────────────────────────────────── */

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
const hasPhrase = (text: string, phrase: string) => text.includes(` ${phrase} `);

/** The key holding the longest phrase found in the text. */
function pick<K extends string>(text: string, table: Record<K, string[]>): { key: K; phrase: string } | null {
  let best: { key: K; phrase: string } | null = null;
  for (const key of Object.keys(table) as K[]) {
    for (const phrase of table[key]) {
      if (hasPhrase(text, phrase) && (!best || phrase.length > best.phrase.length)) best = { key, phrase };
    }
  }
  return best;
}

export function parseQuery(input: string): ParsedQuery {
  const text = norm(input);
  const sub = pick(text, SUBCATEGORY_WORDS);
  const dir = pick(text, DIRECTION_WORDS);
  const ind = pick(text, INDUSTRY_WORDS);
  const occ = pick(text, OCCASION_WORDS);
  const fmt = pick(text, FORMAT_WORDS);

  /* Every phrase any facet matched is understood, so none of it is left over. */
  let left = text;
  for (const table of [SUBCATEGORY_WORDS, DIRECTION_WORDS, INDUSTRY_WORDS, OCCASION_WORDS, FORMAT_WORDS]) {
    for (const phrases of Object.values<string[]>(table)) {
      for (const p of phrases) if (hasPhrase(text, p)) left = left.split(` ${p} `).join('  ');
    }
  }
  const rest = left.split(' ').filter((w) => w && !STOP.has(w));

  return {
    subcategory: sub?.key ?? null,
    direction: dir?.key ?? null,
    industry: ind?.key ?? null,
    occasion: occ?.key ?? null,
    format: fmt?.key ?? null,
    rest,
  };
}

const facetCount = (q: ParsedQuery) =>
  [q.subcategory, q.direction, q.industry, q.occasion, q.format].filter(Boolean).length;

/* ── ranking ──────────────────────────────────────────────────────────────── */

const SUBCATEGORY_KEYS = new Set(SUBCATEGORIES.map((s) => s.key));

function occasionMatches(t: DesignTemplate, occasion: string): boolean {
  const words = OCCASION_WORDS[occasion] ?? [occasion.replace(/-/g, ' ')];
  const tags = (t.tags ?? []).map((x) => x.toLowerCase());
  return words.some((w) => tags.includes(w));
}

function facetScore(q: ParsedQuery, t: DesignTemplate): number {
  let n = 0;
  if (q.subcategory && subcategoryFor(t)?.key === q.subcategory) n += 2;
  if (q.direction && t.direction === q.direction) n += 1;
  if (q.industry && (t.industries ?? []).includes(q.industry)) n += 1;
  if (q.occasion && occasionMatches(t, q.occasion)) n += 1;
  if (q.format && deliverableFor(t)?.format === q.format) n += 1;
  return n;
}

function textScore(words: string[], t: DesignTemplate): number {
  const hay = norm(`${t.label} ${t.desc} ${(t.tags ?? []).join(' ')}`);
  return words.filter((w) => hasPhrase(hay, w)).length;
}

/**
 * Templates for a parsed query, best first. Empty when the query names a
 * product the catalogue does not have.
 */
export function rankTemplates(q: ParsedQuery, ts: DesignTemplate[], scores: Map<string, number>): DesignTemplate[] {
  if (q.subcategory && !SUBCATEGORY_KEYS.has(q.subcategory)) return [];

  const facets = facetCount(q);
  const rows: { t: DesignTemplate; hit: number; quality: number }[] = [];
  for (const t of ts) {
    const hit = facets > 0 ? facetScore(q, t) : textScore(q.rest, t);
    if (hit > 0) rows.push({ t, hit, quality: scores.get(t.key) ?? 0 });
  }
  rows.sort((a, b) =>
    b.hit - a.hit || b.quality - a.quality || (a.t.key < b.t.key ? -1 : a.t.key > b.t.key ? 1 : 0));
  return rows.map((r) => r.t);
}

/* ── misses: in memory until Phase 3 picks the store ──────────────────────── */

const MISSES: string[] = [];

export function recordSearchMiss(query: string): void {
  const q = query.trim();
  if (q) MISSES.push(q);
}

export function searchMisses(): readonly string[] {
  return MISSES;
}

/** Test helper: forget recorded misses. */
export function clearSearchMisses(): void {
  MISSES.length = 0;
}

/* ── one call for the UI ──────────────────────────────────────────────────── */

export type SearchOutcome =
  | { status: 'results'; parsed: ParsedQuery; results: DesignTemplate[] }
  | { status: 'not-in-catalogue'; parsed: ParsedQuery; results: []; message: string; nearest: string | null }
  | { status: 'none'; parsed: ParsedQuery; results: []; message: string };

export function searchCatalogue(input: string, ts: DesignTemplate[], scores: Map<string, number>): SearchOutcome {
  const parsed = parseQuery(input);

  if (parsed.subcategory && !SUBCATEGORY_KEYS.has(parsed.subcategory)) {
    const planned = PLANNED[parsed.subcategory];
    const name = planned?.name ?? parsed.subcategory;
    recordSearchMiss(input);
    const nearest = planned ? SUBCATEGORIES.find((s) => s.category === planned.category)?.key ?? null : null;
    return { status: 'not-in-catalogue', parsed, results: [], message: `${name} isn't in the catalogue yet.`, nearest };
  }

  const results = rankTemplates(parsed, ts, scores);
  if (results.length === 0) {
    recordSearchMiss(input);
    return { status: 'none', parsed, results: [], message: 'Nothing in the catalogue matches that yet.' };
  }
  return { status: 'results', parsed, results };
}
