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
  /** "who's open near me" — the question the product is named after. */
  | { kind: 'open-now'; query: string | null; nearMe: boolean; spoken: string }
  /** Something to do with one named business, answered rather than searched. */
  | { kind: 'business'; name: string; action: BusinessAction; spoken: string }
  | { kind: 'help'; spoken: string }
  | { kind: 'unknown'; spoken: string };

/** What was asked about a specific business. */
export type BusinessAction = 'status' | 'call' | 'directions' | 'open';

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
/**
 * Phrasings that ask about being open, rather than for a shop.
 *
 * Ordered longest-first so "who is open right now" is not consumed by the
 * shorter "open now" and left with a stray "who is".
 */
const OPEN_NOW_PHRASES = [
  "what's open right now", 'what is open right now', "who's open right now", 'who is open right now',
  "what's open now", 'what is open now', "who's open now", 'who is open now',
  "what's open", 'what is open', "who's open", 'who is open',
  'anywhere open near me', 'anything open near me',
  'anywhere open', 'anything open', 'anyone open', 'somewhere open',
  'open right now', 'open now', 'still open', 'open at the moment',
];

/** "is X open", "are X open", "is X still open". */
const STATUS_RE = /^(?:is|are|r)\s+(.+?)\s+(?:still\s+)?open(?:\s+(?:now|today|right now|at the moment))?\??$/;

const CALL_RE = /^(?:call|phone|ring|dial)\s+(.+)$/;
const DIRECTIONS_RE = /^(?:directions? to|take me to|how do i get to|where is|where's|navigate to)\s+(.+)$/;

const HELP_PHRASES = [
  'help', 'what can you do', 'what can i say', 'what can i ask',
  'how does this work', 'what do you do',
];

/** Words that are a request, not part of a business name. */
const trimName = (raw: string): string =>
  raw
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\s+(please|for me|now|today)$/g, '')
    .replace(/[?.!]+$/, '')
    .trim();

export function parseVoiceCommand(spokenRaw: string): VoiceIntent {
  const spoken = normalise(spokenRaw);
  if (!spoken) return { kind: 'unknown', spoken };

  if (HELP_PHRASES.includes(spoken)) return { kind: 'help', spoken };

  // "is Mama Put open?" — the product's own question, answered rather than
  // turned into a search page.
  const status = STATUS_RE.exec(spoken);
  if (status) {
    const name = trimName(status[1]);
    // "is anywhere open" is not about one business; fall through to open-now.
    if (name && !['anything', 'anywhere', 'anyone', 'something'].includes(name)) {
      return { kind: 'business', name, action: 'status', spoken };
    }
  }

  const call = CALL_RE.exec(spoken);
  if (call) {
    const name = trimName(call[1]);
    if (name) return { kind: 'business', name, action: 'call', spoken };
  }

  const directions = DIRECTIONS_RE.exec(spoken);
  if (directions) {
    const name = trimName(directions[1]);
    // "where is the dashboard" asks for a page, not a shop. Answer it as
    // navigation rather than falling through to a search for a business called
    // "dashboard".
    const destination = DESTINATIONS.find((d) => d.patterns.includes(name));
    if (destination) return { kind: 'navigate', path: destination.path, label: destination.label, spoken };
    if (name) return { kind: 'business', name, action: 'directions', spoken };
  }

  // "what's open near me" / "who's open right now"
  for (const phrase of OPEN_NOW_PHRASES) {
    if (!spoken.includes(phrase)) continue;
    let rest = spoken.replace(phrase, ' ');
    let nearMe = false;
    for (const near of NEAR_ME) {
      if (rest.includes(near)) { nearMe = true; rest = rest.replace(near, ' '); }
    }
    const query = stripLeadIns(rest.replace(/\s+/g, ' ').trim())
      .replace(/^(is|are|any|some)\s+/, '')
      .replace(/^(anywhere|anything|anyone|somewhere|anybody)\s*/, '')
      .replace(/\s+(in|at|around|near)$/, '')
      .trim();
    return { kind: 'open-now', query: query || null, nearMe, spoken };
  }

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

/** The directory, filtered to what can be reached right now. */
export function openNowUrl(query: string | null, location?: string | null): string {
  const params = new URLSearchParams({ status: 'open' });
  if (query) params.set('search', query);
  if (location) params.set('location', location);
  return `/businesses?${params.toString()}`;
}

/**
 * The open state as a sentence a person would say.
 *
 * Spoken answers cannot be skimmed, so this leads with the answer — "open" or
 * "closed" — before any detail. And it never says a business is open when the
 * hours could not be read: on a directory that is how someone ends up outside a
 * shut shop.
 */
export function spokenOpenState(
  name: string,
  state: { kind: 'open' | 'closing-soon' | 'closed' | 'unknown'; detail: string },
): string {
  const detail = state.detail ? `. ${state.detail}` : '';
  switch (state.kind) {
    case 'open':
      return `Yes, ${name} is open${detail}`;
    case 'closing-soon':
      return `${name} is open, but closing soon${detail}`;
    case 'closed':
      return `No, ${name} is closed${detail}`;
    default:
      return `I don't have confirmed opening hours for ${name}, so I can't say for sure`;
  }
}

/** What the assistant says while it looks something up. */
export const lookingUpReply = (name: string): string => `Checking ${name}…`;

/** Said when a spoken business name matched nothing. */
export const notFoundReply = (name: string): string =>
  `I couldn't find a business called ${name}. Searching instead`;

const HELP_REPLY = [
  'You can say: what’s open near me,',
  'is Mama Put open,',
  'find a barber near me,',
  'call Golden Gem,',
  'directions to Lens and Light,',
  'or open my dashboard.',
].join(' ');

/** What the assistant says back, so the user knows it understood. */
export function replyFor(intent: VoiceIntent, location?: string | null): string {
  switch (intent.kind) {
    case 'search':
      return intent.nearMe && location
        ? `Looking for ${intent.query} near ${location}`
        : `Searching for ${intent.query}`;
    case 'navigate':
      return `Opening ${intent.label}`;
    case 'open-now': {
      const what = intent.query ? `${intent.query} ` : '';
      return intent.nearMe && location
        ? `Finding ${what}open near ${location} right now`
        : `Finding ${what}open right now`;
    }
    case 'business':
      switch (intent.action) {
        case 'call': return `Calling ${intent.name}`;
        case 'directions': return `Getting directions to ${intent.name}`;
        default: return lookingUpReply(intent.name);
      }
    case 'help':
      return HELP_REPLY;
    default:
      return "Sorry, I didn't catch that. Try “what’s open near me”.";
  }
}
