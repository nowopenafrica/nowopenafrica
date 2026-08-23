// Voice control — turning what someone said into something the app can do.
//
// Rule-based on purpose, like the rest of the platform's "AI" surfaces: the
// commands people actually use are a small, predictable set ("find me a barber
// near me", "open my dashboard"), and a table of patterns answers instantly,
// offline, at no cost per request, and can be read and corrected. A model would
// add latency and spend to every utterance for no gain on this vocabulary.
//
// Speech recognition itself is the browser's (Web Speech API). This module is
// pure text -> intent, so it is fully testable without a microphone.

import { BUSINESS_CATEGORIES } from '../data/categories';

/** Spoken names that should activate the assistant. */
export const WAKE_PHRASES = ['hey nowopen', 'hey now open', 'nowopen ai', 'now open ai', 'ok nowopen'] as const;

export type VoiceIntent =
  | { kind: 'search'; query: string; nearMe: boolean; spoken: string }
  | { kind: 'navigate'; path: string; label: string; spoken: string }
  | { kind: 'unknown'; spoken: string };

const normalise = (text: string): string =>
  (text || '')
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Is the wake phrase present, and what follows it?
 *
 * Recognisers mis-hear a brand name constantly ("hey now open", "hay no open"),
 * so matching is loose: any wake variant anywhere in the utterance counts, and
 * whatever comes after it is the command. Returns null when no wake phrase is
 * present — the caller then knows to keep listening rather than act.
 */
export function stripWakePhrase(transcript: string): string | null {
  const text = normalise(transcript);
  for (const phrase of WAKE_PHRASES) {
    const at = text.indexOf(phrase);
    if (at >= 0) return text.slice(at + phrase.length).trim();
  }
  return null;
}

/** Words that mean "use my location" rather than being part of the search. */
const NEAR_ME = [
  'near me', 'near by', 'nearby', 'in my area', 'around me', 'close to me',
  'closest', 'nearest', 'around here', 'in my neighbourhood', 'in my neighborhood',
];

/** Openers to drop so "I need a barber" searches for "barber". */
const LEAD_INS = [
  'i need', 'i want', 'i am looking for', "i'm looking for", 'im looking for',
  'looking for', 'find me', 'find', 'search for', 'search', 'show me', 'show',
  'get me', 'where can i find', 'where is', 'where are', 'are there any',
  'is there a', 'is there any', 'do you have', 'please',
];

/** Places a spoken command can jump to. */
const DESTINATIONS: { path: string; label: string; patterns: string[] }[] = [
  { path: '/dashboard', label: 'your dashboard', patterns: ['my dashboard', 'dashboard', 'my account'] },
  { path: '/studio', label: 'the Studio', patterns: ['studio', 'creative studio'] },
  { path: '/adverts', label: 'ad placements', patterns: ['adverts', 'advertising', 'ad placements', 'promote', 'billboards'] },
  { path: '/media', label: 'creative services', patterns: ['creative services', 'media services', 'creatives', 'photographers'] },
  { path: '/pricing', label: 'pricing', patterns: ['pricing', 'plans', 'prices', 'subscription'] },
  { path: '/businesses', label: 'the directory', patterns: ['businesses', 'directory', 'discover'] },
  { path: '/platform', label: 'industry systems', patterns: ['industry systems', 'the platform', 'operating systems'] },
  { path: '/waitlist', label: 'the waitlist', patterns: ['waitlist', 'wait list'] },
  { path: '/contact', label: 'contact', patterns: ['contact', 'support', 'help'] },
];

const stripLeadIns = (text: string): string => {
  let out = text;
  let changed = true;
  // Repeat: "please find me a barber" has two stacked openers.
  while (changed) {
    changed = false;
    for (const lead of LEAD_INS) {
      if (out.startsWith(`${lead} `)) {
        out = out.slice(lead.length + 1);
        changed = true;
      } else if (out === lead) {
        out = '';
        changed = true;
      }
    }
    out = out.replace(/^(a|an|the|some|any)\s+/, '');
  }
  return out.trim();
};

/**
 * Turn a spoken command (wake phrase already removed) into an action.
 *
 * Navigation is checked before search so "open my dashboard" doesn't become a
 * search for the word "dashboard"; a bare category or trade name falls through
 * to search, which is the common case.
 */
export function parseVoiceCommand(spokenRaw: string): VoiceIntent {
  const spoken = normalise(spokenRaw);
  if (!spoken) return { kind: 'unknown', spoken };

  // "open/go to/take me to X"
  const navMatch = /^(open|go to|goto|take me to|show|visit|navigate to)\s+(.*)$/.exec(spoken);
  const navTarget = navMatch ? navMatch[2].replace(/^(my|the)\s+/, '').trim() : '';
  if (navTarget) {
    for (const dest of DESTINATIONS) {
      if (dest.patterns.some((p) => navTarget === p || navTarget.startsWith(`${p} `))) {
        return { kind: 'navigate', path: dest.path, label: dest.label, spoken };
      }
    }
  }
  // A destination named on its own ("dashboard", "pricing").
  for (const dest of DESTINATIONS) {
    if (dest.patterns.includes(spoken)) {
      return { kind: 'navigate', path: dest.path, label: dest.label, spoken };
    }
  }

  // Everything else is a search over the WHOLE utterance — not the remainder
  // after the nav verb. "show me a barber" has to search for "barber", and
  // stripLeadIns only knows how to remove "show me" if it can still see it.
  let query = spoken;
  let nearMe = false;
  for (const phrase of NEAR_ME) {
    if (query.includes(phrase)) {
      nearMe = true;
      query = query.replace(phrase, ' ');
    }
  }
  query = stripLeadIns(query.replace(/\s+/g, ' ').trim())
    .replace(/\s+(in|at|around|near)$/, '')
    .trim();

  if (!query) return { kind: 'unknown', spoken };
  return { kind: 'search', query, nearMe, spoken };
}

/**
 * The closest real category to what was said, so "barber" lands on
 * "Salon / Barber". Returns null when nothing matches and the raw words should
 * be used as a free-text search instead.
 */
export function matchCategory(query: string): string | null {
  const q = normalise(query);
  if (!q) return null;
  const exact = BUSINESS_CATEGORIES.find((c) => normalise(c) === q);
  if (exact) return exact;
  // Word-level containment both ways: "barber" -> "Salon / Barber", and
  // "hotel and lodging" -> "Hotel & Lodging".
  const words = q.split(' ').filter((w) => w.length > 2);
  let best: { category: string; score: number } | null = null;
  for (const category of BUSINESS_CATEGORIES) {
    const c = normalise(category);
    let score = 0;
    for (const w of words) if (c.includes(w)) score += w.length;
    if (c.includes(q)) score += q.length;
    if (score > 0 && (!best || score > best.score)) best = { category, score };
  }
  return best ? best.category : null;
}

/** The URL a search intent should open. */
export function searchUrlFor(query: string, location?: string | null): string {
  const params = new URLSearchParams({ search: query });
  if (location) params.set('location', location);
  return `/businesses?${params.toString()}`;
}

/** What the assistant says back, so the user knows it understood. */
export function replyFor(intent: VoiceIntent, location?: string | null): string {
  switch (intent.kind) {
    case 'search':
      return intent.nearMe && location
        ? `Looking for ${intent.query} near ${location}`
        : `Searching for ${intent.query}`;
    case 'navigate':
      return `Opening ${intent.label}`;
    default:
      return "Sorry, I didn't catch that. Try “find a barber near me”.";
  }
}
