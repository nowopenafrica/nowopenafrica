/**
 * When a business's photo wears the NowOpen ring.
 *
 * ── THE RING IS A CLAIM, NOT A DECORATION ────────────────────────────────
 *
 * A glowing ring around a shop's logo says one thing to a customer: it is
 * open, right now. So it may only appear when we actually know that.
 *
 * MEASURED 2026-10-09 on the live directory: 3 businesses open, 1 closed, and
 * 4,006 whose hours are not confirmed. If "we don't know" glowed, 99% of the
 * rings on this platform would be asserting something nobody has checked —
 * and the three that mean it would be indistinguishable from the rest.
 *
 * That rarity is the point. A signal that is almost always on carries no
 * information; one that is almost always off is worth looking at.
 *
 * ── ONE ENGINE ───────────────────────────────────────────────────────────
 *
 * The answer comes from `publicOpenState` via `resolvePublicStatus`, which is
 * the single open/closed engine. There used to be two, and on Christmas
 * morning one said "Closed for Christmas Day" while the other said "open" —
 * whichever a surface happened to import decided what the customer was told.
 * The ring does not get its own opinion.
 */

import type { Business } from '../types';
import { resolvePublicStatus } from './businessStatus';

export type RingState =
  /** Open now, as far as the one engine knows. The ring turns on. */
  | 'on'
  /** Closed, or hours unknown. No ring. */
  | 'off';

/**
 * Should this business's photo carry the ring?
 *
 * `null` from the engine means "we do not know", and it is treated exactly
 * like closed. Unknown is not a dimmer version of open — a customer walking
 * to a shop on the strength of a glow does not care which of the two we meant.
 */
export function ringState(business: Business | null | undefined, now: Date = new Date()): RingState {
  if (!business) return 'off';
  return resolvePublicStatus(business, now) === 'open' ? 'on' : 'off';
}

/** True when the ring should be shown. Reads better at the call site. */
export function ringIsOn(business: Business | null | undefined, now: Date = new Date()): boolean {
  return ringState(business, now) === 'on';
}

/**
 * What a screen reader is told, or null when there is nothing to say.
 *
 * The ring is colour and motion, which is no information at all to somebody
 * who cannot see it — and "open now" is exactly the kind of fact that must not
 * be carried by decoration alone.
 */
export function ringLabel(state: RingState): string | null {
  return state === 'on' ? 'Open now' : null;
}
