import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ListingExplorer from '../components/home/ListingExplorer';

/**
 * The homepage was the one discovery surface the failure-state work missed —
 * and it is the highest-traffic page on the platform.
 *
 * On a failed read it rendered:
 *
 *     "No businesses listed yet — the directory is being built."
 *
 * That is a statement about the PLATFORM, made when the truth is "we could not
 * reach the database". Two things make it the worst possible wrong answer
 * here: the audience is on connections that drop routinely, and the directory
 * genuinely is nearly empty — so the failure mode confirms exactly the
 * conclusion the platform most needs to avoid.
 *
 * The two underlying bugs were the same ones found elsewhere:
 *
 *   1. `.catch()` never fires — supabase-js RESOLVES with `{ data: null,
 *      error }` on a failed read, so the catch was dead code for the case it
 *      was written for.
 *   2. `res.data && res.data.length > 0 ? res.data : generate(30)` cannot tell
 *      an error from an empty table, and `generate(30)` is `[]` in production
 *      because samples are gated to DEV. Both paths landed on the empty state.
 *
 * These tests render the component rather than grepping for wiring. An earlier
 * round of this work wrote passing tests that only proved `setLoadError` was
 * *present*, and the bug survived them.
 */

const renderExplorer = (props: Partial<React.ComponentProps<typeof ListingExplorer>> = {}) =>
  render(
    <MemoryRouter>
      <ListingExplorer businesses={[]} adverts={[]} mediaServices={[]} {...props} />
    </MemoryRouter>,
  );

describe('the homepage tells a failed read from an empty directory', () => {
  it('says the directory is being built when it genuinely is empty', () => {
    // The honest empty state must survive: this is the platform's real
    // situation today, and it is not an error.
    renderExplorer();
    expect(screen.getByText(/no businesses listed yet/i)).toBeInTheDocument();
  });

  it('says the load failed when the read failed', () => {
    renderExplorer({ loadFailed: { businesses: true, adverts: false, media: false } });
    expect(screen.getByText(/could not load businesses/i)).toBeInTheDocument();
  });

  it('does NOT claim the directory is empty when the read failed', () => {
    /*
     * The actual defect. Both branches produce an empty list, so the only
     * thing that distinguishes them is which one is checked first.
     */
    renderExplorer({ loadFailed: { businesses: true, adverts: false, media: false } });
    expect(screen.queryByText(/no businesses listed yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/the directory is being built/i)).not.toBeInTheDocument();
  });

  it('states outright that this is not an empty list', () => {
    renderExplorer({ loadFailed: { businesses: true, adverts: false, media: false } });
    expect(screen.getByText(/does not mean there is nothing here/i)).toBeInTheDocument();
  });

  it('announces the failure to assistive tech', () => {
    renderExplorer({ loadFailed: { businesses: true, adverts: false, media: false } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('offers a retry that reaches the page', () => {
    const onRetry = vi.fn();
    renderExplorer({
      loadFailed: { businesses: true, adverts: false, media: false },
      onRetry,
    });
    screen.getByRole('button', { name: /try again/i }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not claim the other tabs failed because one did', () => {
    /*
     * Tracked per type on purpose. The three reads are independent, and
     * telling a visitor that adverts are unreachable because the businesses
     * query failed is its own inaccuracy — a smaller one than the bug being
     * fixed, but the same kind.
     */
    renderExplorer({ loadFailed: { businesses: false, adverts: true, media: false } });
    expect(screen.getByText(/no businesses listed yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
  });
});

describe('Home captures the error rather than relying on a catch', () => {
  const src = readFileSync('src/pages/Home.tsx', 'utf8');

  it('inspects `error`, which is where a failed supabase read reports itself', () => {
    expect(src).toMatch(/adverts:\s*!!advertRes\.error/);
    expect(src).toMatch(/businesses:\s*!!businessRes\.error/);
    expect(src).toMatch(/media:\s*!!mediaRes\.error/);
  });

  it('no longer calls a failed read "showing sample data"', () => {
    /*
     * The old comment and log said the page would fall back to samples. In
     * production it cannot: samples are DEV-gated, so the fallback was `[]`
     * and the claim was untrue exactly where it mattered.
     */
    expect(src).not.toMatch(/showing sample data/);
  });

  it('re-runs the fetch when retried', () => {
    expect(src).toMatch(/\}, \[[^\]]*\breloadNonce\b[^\]]*\]\)/);
    expect(src).toMatch(/setReloadNonce\(\(n\) => n \+ 1\)/);
  });
});
