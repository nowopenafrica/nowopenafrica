/**
 * The NowOpen ring: a business's photo, lit while it is open.
 *
 * ── WHAT IT MEANS ────────────────────────────────────────────────────────
 *
 * A glowing ring around a shop's logo says "open, right now". So it is gated
 * on the one open/closed engine, and "hours not confirmed" counts as off —
 * see src/lib/openRing.ts for why that matters when 4,006 of 4,050 listings
 * have unconfirmed hours.
 *
 * ── HOW IT IS DRAWN ──────────────────────────────────────────────────────
 *
 * A conic gradient behind the photo, inset by the ring's thickness so the
 * photo covers the middle and leaves a clean band. Two copies: a sharp one
 * for the ring and a blurred one underneath for the glow.
 *
 * The gradient rotates, not the photo. Rotating the wrapper would spin the
 * business's own logo, which is both ugly and, for a logo with text in it,
 * unreadable. The spinning layers are siblings of the photo, not its parent.
 *
 * ── MOTION IS AN ENHANCEMENT, NEVER THE MESSAGE ──────────────────────────
 *
 * `motion-reduce` stops the rotation and keeps the colour, because somebody
 * who has asked for less motion should still be told the shop is open. And
 * the state is carried in text for a screen reader: colour and movement are
 * no information at all if you cannot see them.
 */

import type { ReactNode } from 'react';

import { ringState, ringLabel } from '../../lib/openRing';
import type { Business } from '../../types';

/**
 * The NowOpen wheel, as a conic gradient.
 *
 * Starts and ends on the same hue so the seam does not show while it turns —
 * a gradient that stops at violet and restarts at red draws a visible line
 * sweeping round the ring.
 */
const WHEEL = 'conic-gradient(from 0deg, #f97316, #facc15, #22c55e, #3b82f6, #8b5cf6, #ec4899, #f97316)';

export interface OpenRingProps {
  business: Business | null | undefined;
  children: ReactNode;
  /**
   * Ring thickness in pixels.
   *
   * Explicit px, not a Tailwind size: the root font size here is under 16px,
   * so a rem-based width renders thinner than it reads in the class name.
   */
  thickness?: number;
  /** Seconds per rotation. Slow enough to read as alive, not as loading. */
  seconds?: number;
  className?: string;
  /** For tests and stories; defaults to now. */
  now?: Date;
}

export default function OpenRing({
  business, children, thickness = 3, seconds = 8, className = '', now,
}: OpenRingProps) {
  const state = ringState(business, now ?? new Date());
  const label = ringLabel(state);

  /*
   * Off is the common case by a long way, so it costs nothing: no extra
   * elements, no animation, no stacking context. The photo is returned as it
   * would have been rendered without this component.
   */
  if (state === 'off') {
    return <span className={`relative inline-block ${className}`}>{children}</span>;
  }

  return (
    <span className={`relative inline-block ${className}`}>
      {/*
        * The glow. Blurred and scaled slightly past the ring so the colour
        * bleeds outward rather than over the photo.
        */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 rounded-full blur-md opacity-70 animate-[spin_8s_linear_infinite] motion-reduce:animate-none"
        style={{ background: WHEEL, animationDuration: `${seconds}s` }}
      />
      {/* The ring itself. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full animate-[spin_8s_linear_infinite] motion-reduce:animate-none"
        style={{ background: WHEEL, animationDuration: `${seconds}s` }}
      />
      {/*
        * The photo, inset by the thickness so the gradient shows as a band.
        * `overflow-hidden` keeps a square logo inside the circle, and the
        * ring edge stays clean because the photo is a sibling layer above the
        * gradient rather than a child of it.
        */}
      <span
        className="relative block rounded-full overflow-hidden"
        style={{ margin: thickness }}
      >
        {children}
      </span>
      {/*
        * The same fact, in words. A ring that only exists as colour and
        * motion tells a screen-reader user nothing.
        */}
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
