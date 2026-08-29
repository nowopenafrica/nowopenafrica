/**
 * Offers: what is running, what is about to end, and what to say about it.
 *
 * The public RLS policy already filters expired offers, so nothing here is a
 * security boundary — it is presentation. But the same rules live here as
 * well, because a page that renders whatever the API returned will show a
 * dead offer the moment the policy changes or a cached response is reused.
 */

export interface Offer {
  id: string;
  business_id: string;
  title: string;
  description?: string | null;
  /** The headline claim: "20% OFF", "Buy 2 get 1". */
  headline?: string | null;
  code?: string | null;
  image_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  active?: boolean | null;
}

const time = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};

/** Running right now: switched on, started, and not yet finished. */
export function isRunning(o: Offer, now: Date = new Date()): boolean {
  if (o.active === false) return false;
  const at = now.getTime();
  const from = time(o.starts_at);
  const to = time(o.ends_at);
  if (from !== null && from > at) return false;
  if (to !== null && to < at) return false;
  return true;
}

export function runningOffers(list: Offer[], now: Date = new Date()): Offer[] {
  return list.filter((o) => isRunning(o, now));
}

/** Starts later — worth showing an owner, never a customer as if it were live. */
export function isUpcoming(o: Offer, now: Date = new Date()): boolean {
  const from = time(o.starts_at);
  return o.active !== false && from !== null && from > now.getTime();
}

export function hasExpired(o: Offer, now: Date = new Date()): boolean {
  const to = time(o.ends_at);
  return to !== null && to < now.getTime();
}

/**
 * "Ends today" / "3 days left", or null when it runs indefinitely.
 *
 * Urgency is the whole value of a deadline, so it is stated in the unit a
 * person acts on: hours near the end, days before that. "Ends in 47 hours"
 * makes nobody hurry.
 */
export function endsLabel(o: Offer, now: Date = new Date()): string | null {
  const to = time(o.ends_at);
  if (to === null) return null;
  const ms = to - now.getTime();
  if (ms < 0) return 'Ended';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Ends within the hour';
  if (hours < 24) return `Ends in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Ends tomorrow';
  if (days <= 14) return `${days} days left`;
  return null;
}

/** Ending inside a day — the ones worth a louder badge. */
export function isEndingSoon(o: Offer, now: Date = new Date()): boolean {
  const to = time(o.ends_at);
  if (to === null) return false;
  const ms = to - now.getTime();
  return ms >= 0 && ms <= 24 * 3_600_000;
}

/** Soonest deadline first; open-ended offers last. */
export function byUrgency(list: Offer[]): Offer[] {
  return [...list].sort((a, b) => {
    const ta = time(a.ends_at);
    const tb = time(b.ends_at);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb;
  });
}

/** What the card shouts. Falls back to the title so a card is never blank. */
export function offerHeadline(o: Offer): string {
  const h = (o.headline ?? '').trim();
  return h || o.title;
}
