import { AFRICAN_PLACES } from '../../data/locations';
import { GOALS, type GoalSlug } from './goals';

/**
 * The Promote request bar: words in, `{ goal, city }` out.
 *
 * Deterministic on purpose, like src/lib/create/intent.ts: same sentence, same
 * answer, no model, testable. Unknown words fall back to showing the six tiles
 * (goal null). It never guesses a goal from nothing.
 */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Phrases per goal. The first goal (in GOALS order) with a match wins. */
const GOAL_WORDS: Record<GoalSlug, string[]> = {
  nearby: ['customers', 'nearby', 'near me', 'foot traffic', 'walk in', 'walk ins', 'find us', 'findable'],
  launch: ['launch', 'grand opening', 'opening', 'new shop', 'new store', 'new product', 'new service', 'just opened', 'opening soon'],
  sale: ['sale', 'discount', 'offer', 'promo', 'promotion', 'black friday', 'clearance', 'deal', 'deals'],
  event: ['event', 'concert', 'party', 'festival', 'conference', 'tickets', 'seminar', 'workshop', 'fundraiser'],
  awareness: ['awareness', 'brand awareness', 'billboard', 'visibility', 'reach more'],
  hiring: ['hiring', 'hire', 'vacancy', 'vacancies', 'job', 'jobs', 'recruit', 'recruiting', 'cashier', 'cashiers'],
};

/** Whole-word / whole-phrase test on normalised text. */
const has = (text: string, phrase: string) => ` ${text} `.includes(` ${phrase} `);

/** Neighbourhoods that should say "Lagos" even when not in AFRICAN_PLACES. */
const ALIASES: [string, string][] = [
  ['victoria island', 'Lagos'], ['vi', 'Lagos'], ['lekki', 'Lagos'], ['ikeja', 'Lagos'],
  ['yaba', 'Lagos'], ['surulere', 'Lagos'], ['ajah', 'Lagos'],
];

/**
 * Every place name maps to its city: a district's `region` reads
 * "Lagos, Nigeria", so the city is the part before the first comma; a city's
 * own region is just the country, so the city is its name.
 */
const PLACE_TO_CITY: [string, string][] = [
  ...ALIASES,
  ...AFRICAN_PLACES.map((p): [string, string] => [
    norm(p.name),
    p.region.includes(',') ? p.region.split(',')[0].trim() : p.name,
  ]),
].sort((a, b) => b[0].length - a[0].length); // longest first: "lagos island" before "lagos"

export function parsePromoteIntent(text: string): { goal: GoalSlug | null; city: string | null } {
  // "we are not hiring" must not read as hiring: drop negated phrases first.
  const t = norm(text).replace(/(^| )(not|no longer|stopped|aren t|isn t|never) (hiring|recruiting)( |$)/g, ' ').replace(/ +/g, ' ').trim();
  if (!t) return { goal: null, city: null };

  const goal = GOALS.find((g) => GOAL_WORDS[g.slug].some((w) => has(t, w)))?.slug ?? null;
  const city = PLACE_TO_CITY.find(([name]) => has(t, name))?.[1] ?? null;
  return { goal, city };
}
