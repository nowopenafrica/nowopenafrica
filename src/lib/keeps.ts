// Keep — "keep this business on my radar".
//
// The behavioural loop the product needs: DISCOVER → KEEP → GET NOTIFIED →
// VISIT → BUY → RETURN. Without the middle step a directory is somewhere you
// visit once, and every return visit has to be bought again.
//
// WHY TOPICS, AND WHY THEY ARE NOT A SETTING
//
// A Keep is a person handing a business permission to interrupt them. The
// topics are the terms of that permission — a consent record, not a preference
// nicety. A business that sends promotions to someone who only asked for
// opening updates has misused something they were given, and the person's
// remedy is to stop keeping anyone. So the topics are chosen at the moment of
// keeping, stored alongside it, and honoured at send time.
//
// Keeping with NO topics is deliberately allowed. "I want this business in my
// list but do not message me" is a real thing to want, and it is not the same
// as not keeping.

export type KeepTopic =
  | 'promotions' | 'products' | 'events' | 'locations' | 'openings' | 'announcements';

export interface KeepTopicMeta {
  key: KeepTopic;
  label: string;
  /** What arriving in someone's notifications actually looks like. */
  example: string;
}

export const KEEP_TOPICS: KeepTopicMeta[] = [
  { key: 'promotions', label: 'Promotions and offers', example: '20% off this weekend' },
  { key: 'products', label: 'New products', example: 'New stock just landed' },
  { key: 'events', label: 'Events', example: 'Live from the shop, Friday 6pm' },
  { key: 'locations', label: 'New branches', example: 'Now open in Lekki' },
  { key: 'openings', label: 'Opening updates', example: 'Open now, until 8pm' },
  { key: 'announcements', label: 'Important announcements', example: 'Closed Monday for a public holiday' },
];

export const ALL_TOPICS: KeepTopic[] = KEEP_TOPICS.map((t) => t.key);

/**
 * What a new Keep opts into.
 *
 * Everything except opening updates. Those fire whenever a shop opens or
 * closes, which for a daily trader is fourteen notifications a week — the
 * fastest way to teach someone to turn all of this off. It is offered, not
 * assumed.
 */
export const DEFAULT_TOPICS: KeepTopic[] = ALL_TOPICS.filter((t) => t !== 'openings');

export const topicLabel = (key: string): string =>
  KEEP_TOPICS.find((t) => t.key === key)?.label ?? key;

/** Accept only topics we understand; anything else is dropped, never stored. */
export function normaliseTopics(value: unknown): KeepTopic[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<KeepTopic>();
  for (const v of value) {
    if (typeof v === 'string' && (ALL_TOPICS as string[]).includes(v)) seen.add(v as KeepTopic);
  }
  // Returned in the canonical order so the UI never reshuffles between renders.
  return ALL_TOPICS.filter((t) => seen.has(t));
}

export function toggleTopic(topics: KeepTopic[], topic: KeepTopic): KeepTopic[] {
  const has = topics.includes(topic);
  return normaliseTopics(has ? topics.filter((t) => t !== topic) : [...topics, topic]);
}

// --- What the interface says --------------------------------------------------

/**
 * The state of the button.
 *
 * "Keeping" rather than "Kept": the relationship is ongoing, and the past tense
 * would read as something already finished.
 */
export const keepLabel = (keeping: boolean): string => (keeping ? 'Keeping' : 'Keep');

/**
 * The line under a person's list.
 *
 * Counts the relationships, not the notifications, because that is the number
 * someone recognises as theirs.
 */
export function keepsSummary(count: number): string {
  if (count <= 0) return 'You are not keeping any businesses yet';
  if (count === 1) return 'You are keeping 1 business';
  return `You are keeping ${count} businesses`;
}

/**
 * What a business owner sees about its audience.
 *
 * Silent below a handful, on purpose: "Kept by 2 people" is a discouraging
 * number to publish about yourself, and a new listing showing it looks
 * abandoned rather than new.
 */
export const KEEPS_SHOWN_FROM = 5;

export function audienceSummary(count: number): string {
  if (count < KEEPS_SHOWN_FROM) return '';
  return `Kept by ${count} ${count === 1 ? 'person' : 'people'}`;
}

/** How many of an audience agreed to hear about one topic. */
export function reachFor(rows: { topics?: unknown }[], topic: KeepTopic): number {
  return (rows || []).filter((r) => normaliseTopics(r.topics).includes(topic)).length;
}

// --- Keeping the intent across a sign-in --------------------------------------

const PENDING_KEY = 'nowopen_pending_keep';

/**
 * Remember a Keep that could not happen because nobody was signed in.
 *
 * Someone who taps Keep, is sent to sign in, comes back and finds nothing
 * happened has been made to do the work twice and will not do it again. The
 * intent survives the round trip and completes itself on return.
 */
export function rememberPendingKeep(businessId: string): void {
  try { localStorage.setItem(PENDING_KEY, businessId); } catch { /* storage may be off */ }
}

export function takePendingKeep(businessId: string): boolean {
  try {
    const pending = localStorage.getItem(PENDING_KEY);
    if (pending !== businessId) return false;
    // Taken, not read: it must fire once, not on every render of the profile.
    localStorage.removeItem(PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearPendingKeep(): void {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
}
