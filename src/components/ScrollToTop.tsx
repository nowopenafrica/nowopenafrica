import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** How long to wait for a hash target to appear (lazy routes render late). */
const HASH_WAIT_MS = 2000;
/** How long to keep a found target pinned while the layout settles. */
const PIN_MS = 2500;
/** Drift (px) from the scrolled position that counts as the layout moving. */
const PIN_DRIFT_PX = 4;
/** Any of these means the visitor is steering; stop fighting them. */
const USER_INPUT = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * React Router keeps the previous scroll position on navigation; reset to the
 * top whenever the path changes.
 *
 * Unless the address names a place on the page. `/media/services#made-for-you`
 * is linked from the Create page's "Have it made for you", and scrolling to 0
 * dropped the visitor on the creator directory above it. The target is often
 * not in the DOM yet — the route is lazy — so it is looked for on each frame
 * for a short while, then given up on quietly.
 *
 * Finding the target is not the end: a lazy page keeps growing above it as
 * its data arrives (the Promote hub's placements), so the target lands far
 * below the viewport. After the first scroll it is kept pinned for PIN_MS,
 * re-scrolled whenever it drifts, and released the moment the visitor
 * touches the page or the route changes.
 *
 * Not every way of scrolling fires an input event: dragging the scrollbar
 * fires no pointerdown in Firefox. So the pin also remembers where IT last
 * left the window, and if window.scrollY has moved more than PIN_DRIFT_PX
 * from there without the pin doing it, somebody else is scrolling — let go.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    let id = '';
    // A malformed hash (`#%`) must not take the page down with a URIError.
    try { id = hash ? decodeURIComponent(hash.slice(1)) : ''; } catch { id = ''; }
    if (!id) {
      window.scrollTo(0, 0);
      return;
    }
    let frame = 0;
    let pinning = false;
    const started = Date.now();
    const release = () => {
      pinning = false;
      cancelAnimationFrame(frame);
      USER_INPUT.forEach((e) => window.removeEventListener(e, release));
    };
    /** Where the pin last left the window; any other movement is the visitor's. */
    let pinnedY = 0;
    const pin = (target: HTMLElement, pinnedAt: number, baseline: number) => {
      if (!pinning) return;
      if (Date.now() - pinnedAt >= PIN_MS) { release(); return; }
      if (Math.abs(window.scrollY - pinnedY) > PIN_DRIFT_PX) { release(); return; }
      if (Math.abs(target.getBoundingClientRect().top - baseline) > PIN_DRIFT_PX) {
        target.scrollIntoView({ block: 'start' });
        baseline = target.getBoundingClientRect().top;
        pinnedY = window.scrollY;
      }
      frame = requestAnimationFrame(() => pin(target, pinnedAt, baseline));
    };
    const seek = () => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ block: 'start' });
        pinnedY = window.scrollY;
        pinning = true;
        USER_INPUT.forEach((e) => window.addEventListener(e, release, { passive: true }));
        const baseline = target.getBoundingClientRect().top;
        frame = requestAnimationFrame(() => pin(target, Date.now(), baseline));
        return;
      }
      if (Date.now() - started < HASH_WAIT_MS) frame = requestAnimationFrame(seek);
      // Never found: behave like any other navigation rather than leave the old scroll.
      else window.scrollTo(0, 0);
    };
    seek();
    return release;
  }, [pathname, hash]);

  return null;
}
