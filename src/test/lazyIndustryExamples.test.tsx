import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';

/*
 * MEASURED 2026-10-10 by decoding the entry chunk's sourcemap: the home page
 * dragged src/data/categoryFeatures.ts — 39.8 kB of live-module config for all
 * 250 categories — into the entry, via
 *   Home -> ListingExplorer -> IndustryExamples -> lib/industryExamples.
 * Deferring it moved the entry from 475.75 kB to 421.04 kB
 * (gzip 140.61 -> 129.18).
 */

vi.mock('../components/discover/IndustryExamples', () => ({
  default: ({ label }: { label: string }) => <div data-testid="examples">{label}</div>,
}));

const EXPLORER = readFileSync('src/components/home/ListingExplorer.tsx', 'utf8');
const SYSTEMS = readFileSync('src/data/industrySystems.ts', 'utf8');

async function mount() {
  const { default: Lazy } = await import('../components/discover/LazyIndustryExamples');
  return render(<Lazy label="businesses" />);
}

describe('industry examples load when they are wanted', () => {
  beforeEach(() => vi.resetModules());

  /*
   * The section DID silently vanish once. An IntersectionObserver alone never
   * fired — the anchor sits inside a container that clips it — so the page
   * simply ended early and no test noticed. Scroll and idle are the
   * guarantees; the observer is only an optimisation.
   */
  it('appears when the reader scrolls, even if no observer fires', async () => {
    await mount();
    expect(screen.queryByTestId('examples')).toBeNull();
    fireEvent.scroll(window);
    await waitFor(() => expect(screen.getByTestId('examples')).toBeTruthy());
  });

  it('still arrives for a reader who never scrolls', async () => {
    vi.useFakeTimers();
    try {
      await mount();
      expect(screen.queryByTestId('examples')).toBeNull();
      vi.advanceTimersByTime(4000);
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(screen.getByTestId('examples')).toBeTruthy());
  });

  it('renders rather than hides itself without IntersectionObserver', async () => {
    const original = globalThis.IntersectionObserver;
    // @ts-expect-error — deliberately removing it for this case.
    delete globalThis.IntersectionObserver;
    try {
      await mount();
      fireEvent.scroll(window);
      await waitFor(() => expect(screen.getByTestId('examples')).toBeTruthy());
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });

  it('keeps the home page off the heavy import path', () => {
    expect(EXPLORER).toMatch(/from '\.\.\/discover\/LazyIndustryExamples'/);
    expect(EXPLORER).not.toMatch(/from '\.\.\/discover\/IndustryExamples'/);
    // industrySystems must not re-couple to categoryFeatures either.
    expect(SYSTEMS).not.toContain("from './categoryFeatures'");
  });
});
