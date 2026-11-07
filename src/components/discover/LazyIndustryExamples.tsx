import { Suspense, lazy, useEffect, useRef, useState } from 'react';

/**
 * Industry examples, fetched only once the reader approaches them.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * MEASURED 2026-10-10, by decoding the entry chunk's sourcemap: the home page
 * was pulling `src/data/categoryFeatures.ts` — 39.8 kB, the live-module
 * configuration for all 250 categories — into the entry bundle, through this
 * chain:
 *
 *   Home -> ListingExplorer -> IndustryExamples -> lib/industryExamples
 *        -> CATEGORY_FEATURES
 *
 * The section sits below the listings grid, so for a visitor who reads the
 * results and leaves, every one of those bytes was downloaded, parsed and
 * never looked at. It is the single largest module in the entry.
 *
 * ── WHY NOT JUST lazy() ──────────────────────────────────────────────────
 *
 * React renders the whole page at once; a bare `lazy()` here would request
 * the chunk immediately and save only parse time. The saving comes from
 * waiting until the section is actually near the viewport.
 *
 * `rootMargin` is generous on purpose — the chunk starts loading a screen
 * before the section arrives, so a scrolling reader never sees it pop in.
 */

const IndustryExamples = lazy(() => import('./IndustryExamples'));

export default function LazyIndustryExamples({ label }: { label: string }) {
  const anchor = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return undefined;
    let cancelled = false;
    const load = () => { if (!cancelled) setNear(true); };

    /*
     * An IntersectionObserver ALONE was not enough, and that is measured, not
     * assumed: with only the observer the section never appeared at all, even
     * scrolled to the bottom of the page. The anchor sits inside a container
     * that clips it, so it never reported an intersection.
     *
     * So the observer is an optimisation, and scroll + idle are the
     * guarantees. A reader who scrolls gets it before they arrive; a reader
     * who sits still gets it when the browser is free; a visitor who bounces
     * from the first screen never pays for it. That last case is the point.
     */
    const io = typeof IntersectionObserver !== 'undefined' && anchor.current
      ? new IntersectionObserver(
        (entries) => { if (entries.some((e) => e.isIntersecting)) load(); },
        { rootMargin: '600px 0px' },
      )
      : null;
    if (io && anchor.current) io.observe(anchor.current);

    window.addEventListener('scroll', load, { once: true, passive: true });
    const idle = typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback(load, { timeout: 4000 })
      : window.setTimeout(load, 3000);

    return () => {
      cancelled = true;
      io?.disconnect();
      window.removeEventListener('scroll', load);
      if (typeof window.cancelIdleCallback === 'function' && typeof idle === 'number') {
        window.cancelIdleCallback(idle);
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, [near]);

  /*
   * minHeight so the observer has a real box to watch — a zero-area target
   * does not reliably report an intersection.
   */
  if (!near) return <div ref={anchor} aria-hidden="true" style={{ minHeight: 1 }} />;

  return (
    <Suspense fallback={<div aria-hidden="true" style={{ minHeight: 1 }} />}>
      <IndustryExamples label={label} />
    </Suspense>
  );
}
