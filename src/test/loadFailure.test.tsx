import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import LoadFailure from '../components/LoadFailure';

/**
 * "We could not load this" versus "there is nothing here".
 *
 * Every discovery surface swallowed its fetch failures:
 *
 *   })().catch(() => { if (!cancelled) setLoading(false); });
 *
 * The spinner stopped, the list stayed empty, and the visitor was shown the
 * empty state. So a dropped connection was indistinguishable from an empty
 * directory — and the page confidently said "no businesses listed yet" to
 * somebody whose signal had simply gone.
 *
 * Two things make that worse here than it would be elsewhere. The audience is
 * on mobile connections that drop routinely, and the directory genuinely IS
 * nearly empty — so a network blink produced exactly the impression the
 * platform most needs to avoid, which is that it is dead. A customer who sees
 * that once does not come back to check.
 */

const PAGES = [
  ['src/pages/Businesses.tsx', 'the directory'],
  ['src/pages/Offers.tsx', 'offers'],
  ['src/pages/OpenNow.tsx', 'open now'],
  ['src/pages/Nearby.tsx', 'nearby'],
  ['src/pages/Discover.tsx', 'discover'],
  ['src/pages/Media.tsx', 'create'],
  ['src/pages/BusinessDetail.tsx', 'a business profile'],
] as const;

describe('the failure state says what happened', () => {
  it('names what could not be loaded', () => {
    render(<LoadFailure what="businesses" onRetry={() => {}} offline={false} />);
    expect(screen.getByText(/could not load businesses/i)).toBeInTheDocument();
  });

  it('states plainly that this is not an empty list', () => {
    /*
     * The entire point of the component. Worded without embedding the noun,
     * because "not an empty what is open now list" is what interpolation
     * produced — caught by reading the rendered page rather than the test.
     */
    render(<LoadFailure what="businesses" onRetry={() => {}} offline={false} />);
    expect(screen.getByText(/does not mean there is nothing here/i)).toBeInTheDocument();
  });

  it('gives different advice when the device is offline', () => {
    render(<LoadFailure what="offers" onRetry={() => {}} offline />);
    expect(screen.getByText(/device looks offline/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is lost/i)).toBeInTheDocument();
  });

  it('offers a retry that actually calls back', () => {
    const onRetry = vi.fn();
    render(<LoadFailure what="offers" onRetry={onRetry} offline={false} />);
    screen.getByRole('button', { name: /try again/i }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('announces itself to assistive tech', () => {
    // A visitor using a screen reader gets told the load failed, rather than
    // being left to infer it from an empty list.
    render(<LoadFailure what="offers" onRetry={() => {}} offline={false} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('has a reachable touch target', () => {
    const { container } = render(<LoadFailure what="offers" onRetry={() => {}} offline={false} />);
    // Explicit px, because this app's root font size is under 16px and
    // rem-based Tailwind sizes come out ~10% short.
    expect(container.querySelector('button')?.className).toMatch(/min-h-\[44px\]/);
  });
});

describe('every discovery surface distinguishes failure from emptiness', () => {
  for (const [path, label] of PAGES) {
    const src = readFileSync(path, 'utf8');

    it(`${label} records the failure instead of swallowing it`, () => {
      expect(src, path).toMatch(/setLoadError\(true\)/);
    });

    it(`${label} renders the failure, not the empty state`, () => {
      expect(src, path).toContain('<LoadFailure');
    });

    it(`${label} can be retried`, () => {
      expect(src, path).toMatch(/setReloadKey\(\(k\) => k \+ 1\)/);
      /*
       * The retry has to actually re-run the fetch, so reloadKey must be IN
       * the dependency array — not necessarily alone in it. BusinessDetail's
       * reads on [id, username, reloadKey], which the stricter form missed.
       */
      expect(src, path).toMatch(/\}, \[[^\]]*\breloadKey\b[^\]]*\]\)/);
    });

    it(`${label} clears the failure when retrying`, () => {
      // Otherwise the failure state sticks and the retry appears to do nothing.
      expect(src, path).toMatch(/setLoadError\(false\)/);
    });
  }

  it('no longer pretends a failed fetch is an empty directory', () => {
    /*
     * The specific line that caused it. `generateBusinesses(30)` returns `[]`
     * in production — samples are gated to DEV — so the old catch handed the
     * page an empty list and the empty state rendered.
     */
    const src = readFileSync('src/pages/Businesses.tsx', 'utf8');
    expect(src).not.toMatch(/showing sample data/);
    // The failure branch is evaluated BEFORE the empty-directory branch.
    expect(src.indexOf('loadError && businesses.length === 0'))
      .toBeLessThan(src.indexOf('<IndustryDirectory />'));
  });
});

describe('a business profile is the worst place to get this wrong', () => {
  const src = readFileSync('src/pages/BusinessDetail.tsx', 'utf8');

  it('does not tell a customer a real business does not exist', () => {
    /*
     * The catch only logged, `business` stayed null, and a null business
     * renders the 404 — which this route also serves as the site catch-all.
     * So a dropped connection said "Business not found": to a customer, that
     * the business is not on NowOpen; to the owner, that their page is gone.
     * On the page SEO exists to drive traffic to.
     */
    expect(src).toContain('if (!business && loadError)');
    // Evaluated BEFORE the 404 branch.
    expect(src.indexOf('if (!business && loadError)'))
      .toBeLessThan(src.indexOf("doubles as the 404 page"));
  });

  it('records the error from the response, not only from a throw', () => {
    // supabase-js resolves with { data: null, error } rather than throwing, so
    // both read branches have to check it.
    const occurrences = src.match(/setLoadError\(true\)/g) ?? [];
    expect(occurrences.length, 'both username and id branches, plus the catch')
      .toBeGreaterThanOrEqual(3);
  });
});

describe("the create marketplace's real emptiness is not a licence to lie", () => {
  const src = readFileSync('src/pages/Media.tsx', 'utf8');

  it('does not report "nobody listed yet" when the read failed', () => {
    /*
     * This page is genuinely empty in production, which is precisely why a
     * network failure here is so easy to mistake for the honest empty state.
     */
    expect(src).toContain('!loading && !loadError && services.length === 0');
  });
});
