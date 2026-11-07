import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * The universal search box.
 *
 * ── WHY THESE PARTICULAR TESTS ───────────────────────────────────────────
 *
 * A typeahead fails in ways that look like success. It renders, it accepts
 * typing, it shows a list — and the list is for the wrong query, or it is empty
 * because the network died rather than because nothing matched. Each test below
 * pins one of those, because none of them would be noticed by looking at it.
 *
 * The one that replaced a real component is the FIRST one. GlobalSearchInput
 * built its index in the browser with `.limit(300)` per table against 3,141
 * businesses and 22,085 services, so it could not match most of the directory
 * — and it was imported by nothing, so it matched none of it.
 */

const rpc = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock('../lib/telemetry', () => ({ track: vi.fn() }));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

import UniversalSearch from '../components/UniversalSearch';
import { suggest, businessesOffering, MIN_QUERY_LENGTH } from '../lib/universalSearch';

const row = (over: Record<string, unknown> = {}) => ({
  kind: 'business', label: 'Duchess Hotel', sublabel: 'Hotel · Ikeja',
  href: '/duchess', score: 80, hits: 1, ...over,
});

const draw = () => render(<MemoryRouter><UniversalSearch source="test" /></MemoryRouter>);
const box = () => screen.getByRole('combobox');

/*
 * Labels are rendered in three nodes so the matched run can be bold, so
 * getByText never sees a whole one. The accessible name of the row joins them
 * back up, which is also what a screen reader announces — so asserting on it
 * tests the thing a person actually receives.
 */
const option = (label: string) =>
  screen.getByRole('option', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
const findOption = (label: string) => waitFor(() => expect(option(label)).toBeTruthy());
const noOption = (label: string) =>
  expect(screen.queryByRole('option', { name: new RegExp(label) })).toBeNull();

/** Text split across elements — matched on the container's flattened content. */
const hasText = (re: RegExp) =>
  screen.getByText((_, el) => !!el && re.test(el.textContent ?? '') && !el.querySelector('*'));
const lacksText = (re: RegExp) =>
  expect(screen.queryAllByText((_, el) => !!el && re.test(el.textContent ?? '') && !el.querySelector('*'))).toHaveLength(0);

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: [row()], error: null });
});
afterEach(() => vi.useRealTimers());

describe('what the search can reach', () => {
  it('asks the database rather than a client-side slice of it', async () => {
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'duchess');
    await waitFor(() => expect(rpc).toHaveBeenCalled());

    const [fn, args] = rpc.mock.calls[rpc.mock.calls.length - 1];
    expect(fn).toBe('search_suggest');
    expect(args).toMatchObject({ q: 'duchess' });
  });

  it('shows every kind of thing, not only businesses', async () => {
    rpc.mockResolvedValue({
      data: [
        row({ kind: 'business', label: 'Ikeja Clinic', href: '/ikeja-clinic', score: 80 }),
        row({ kind: 'service', label: 'Diagnostic tests', sublabel: '1,600 businesses offer this', href: '/businesses?service=Diagnostic%20tests', score: 78, hits: 1600 }),
        row({ kind: 'place', label: 'Ikeja', sublabel: '210 businesses', href: '/businesses?location=Ikeja', score: 76, hits: 210 }),
        row({ kind: 'category', label: 'Hospital & Clinic', href: '/businesses?category=Hospital%20%26%20Clinic', score: 74, hits: 1654 }),
        row({ kind: 'advert', label: 'Billboard Oshodi', href: '/adverts/a1', score: 60 }),
        row({ kind: 'media', label: 'Wedding Coverage', href: '/media/m1', score: 58 }),
      ],
      error: null,
    });
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'ikeja');

    for (const label of ['Ikeja Clinic', 'Diagnostic tests', 'Hospital & Clinic', 'Billboard Oshodi', 'Wedding Coverage']) {
      await findOption(label);
    }
    // The place row, whose label is also a substring of the clinic's name.
    await waitFor(() => expect(screen.getByRole('option', { name: /210 businesses/ })).toBeTruthy());
  });

  it('offers the app’s own pages, which are in no table', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'offer');
    // "Offers" is a route this build ships, not a row — so it can only come
    // from the local list.
    await findOption('Offers');
  });
});

describe('the ways a typeahead lies', () => {
  it('never paints an older answer over a newer one', async () => {
    /*
     * THE ORDERING BUG. Type "lag", then "lagos". If the first request resolves
     * last, the visitor reads results for a query they have already replaced —
     * and nothing on screen says so.
     */
    let releaseFirst: (v: unknown) => void = () => {};
    rpc
      .mockImplementationOnce(() => new Promise((res) => { releaseFirst = res; }))
      .mockResolvedValue({ data: [row({ label: 'Lagos Oriental Hotel', href: '/lagos-oriental' })], error: null });

    const user = userEvent.setup();
    draw();
    await user.type(box(), 'lag');
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    await user.type(box(), 'os');
    await findOption('Lagos Oriental Hotel');

    // The stale request answers only now.
    releaseFirst({ data: [row({ label: 'STALE RESULT', href: '/stale' })], error: null });

    await findOption('Lagos Oriental Hotel');
    noOption('STALE RESULT');
  });

  it('says the search failed instead of saying nothing matched', async () => {
    /*
     * supabase-js RESOLVES with { data: null, error }. A failure and an empty
     * directory are the same shape, so without checking `error` the box tells
     * somebody their business is not on NowOpen when the connection dropped —
     * a confident wrong answer, which is worse than an obvious error.
     */
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'duchess');

    await waitFor(() => expect(hasText(/not reachable right now/i)).toBeTruthy());
    lacksText(/nothing matched/i);
  });

  it('distinguishes that failure from a genuine empty result', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'zzzqqq');

    await waitFor(() => expect(hasText(/nothing matched/i)).toBeTruthy());
    lacksText(/not reachable/i);
  });

  it('drops the list when the query falls under the floor', async () => {
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'duchess');
    await findOption('Duchess Hotel');

    await user.clear(box());
    // Otherwise the previous answer sits under an empty box looking current.
    await waitFor(() => noOption('Duchess Hotel'));
  });

  it('does not query at all for one character', async () => {
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'd');
    await new Promise((r) => setTimeout(r, 250));
    expect(rpc).not.toHaveBeenCalled();
    expect(MIN_QUERY_LENGTH).toBe(2);
  });

  it('sends one request for a burst of typing, not one per key', async () => {
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'duchess hotel');
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    // Debounced: a dozen keystrokes must not be a dozen round trips.
    expect(rpc.mock.calls.length).toBeLessThan(4);
  });
});

describe('choosing a suggestion', () => {
  it('goes where the suggestion points', async () => {
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'duchess');
    await findOption('Duchess Hotel');
    await user.click(option('Duchess Hotel'));
    expect(navigate).toHaveBeenCalledWith('/duchess');
  });

  it('is reachable with the keyboard alone', async () => {
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'duchess');
    await findOption('Duchess Hotel');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(navigate).toHaveBeenCalledWith('/duchess');
  });

  it('falls back to a directory search when nothing is highlighted', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const user = userEvent.setup();
    draw();
    await user.type(box(), 'something nobody listed{Enter}');
    expect(navigate).toHaveBeenCalledWith('/businesses?search=something%20nobody%20listed');
  });
});

describe('a service suggestion leads somewhere real', () => {
  it('resolves the businesses offering it server-side', async () => {
    /*
     * /businesses filters on name, description and category. A service is in
     * none of those, so a "Diagnostic tests" suggestion that ran an ordinary
     * text search would return zero results — the platform sending somebody to
     * an empty page from its own suggestion.
     */
    // One row holding a uuid[], not one row per business — see the note on
    // businessesOffering. A row-per-business shape is silently truncated at
    // 1,000 by PostgREST, which is how "1,707 businesses" became a page of
    // 1,000 with nothing saying so.
    rpc.mockResolvedValue({ data: ['b1', 'b2'], error: null });
    const { ids, failed } = await businessesOffering('Diagnostic tests', 'service');

    expect(rpc).toHaveBeenCalledWith('businesses_offering', {
      offering_name: 'Diagnostic tests',
      offering_kind: 'service',
    });
    expect(failed).toBe(false);
    expect([...ids].sort()).toEqual(['b1', 'b2']);
  });

  it('reports a failed lookup rather than returning an empty set', async () => {
    /*
     * An empty set would render "no business offers this" — a claim about the
     * directory manufactured by a network error. The caller drops the filter
     * instead.
     */
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    const { ids, failed } = await businessesOffering('Diagnostic tests', 'service');
    expect(failed).toBe(true);
    expect(ids.size).toBe(0);
  });

  it('treats a genuinely empty answer as an answer, not a failure', async () => {
    /*
     * The two are different and must stay different. A service nobody offers
     * yields an empty filter, which correctly shows no businesses. A failed
     * lookup drops the filter and shows everything. Conflating them would
     * either hide the whole directory or claim everything matched.
     */
    rpc.mockResolvedValue({ data: [], error: null });
    const { ids, failed } = await businessesOffering('Nobody offers this', 'service');
    expect(failed).toBe(false);
    expect(ids.size).toBe(0);
  });
});

describe('the library on its own', () => {
  it('returns nothing, and asks nothing, below the floor', async () => {
    const r = await suggest('d');
    expect(r.suggestions).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('still answers with app pages when the database is down', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    const r = await suggest('offers');
    expect(r.degraded).toBe(true);
    // Degraded, but not useless: the local targets never needed the database.
    expect(r.suggestions.some((s) => s.href === '/offers')).toBe(true);
  });

  it('points industry suggestions at a URL that exists', async () => {
    /*
     * REGRESSION. These first pointed at `/platform/<slug>`, which is not a
     * route — App.tsx has `/platform` only, so every one of them would have
     * fallen through to the `/:username` catch-all and rendered a missing
     * business. /platform now reads ?industry=.
     */
    rpc.mockResolvedValue({ data: [], error: null });
    const r = await suggest('hospitals');
    const industry = r.suggestions.find((s) => s.href.startsWith('/platform'));
    expect(industry, 'no industry suggestion produced').toBeTruthy();
    expect(industry!.href).toMatch(/^\/platform\?industry=[a-z-]+$/);
  });
});
