/**
 * The review queue must page, and must never hide the discovery panel.
 *
 * ── WHAT THESE TESTS ARE FOR ─────────────────────────────────────────────
 *
 * REPORTED 2026-09-24: "after generating new data discovery manually, it
 * doesn't seem to send all new to review queue, just keeps loading for long
 * then stop."
 *
 * Two separate defects produced that one sentence, and neither was in the
 * staging code the sentence points at:
 *
 *   1. The loader asked for `.limit(50000)`. PostgREST caps every response at
 *      1,000 rows and reports no error, so a run that staged 1,326 candidates
 *      produced a list that could not show them — while fetching `profile`
 *      (a jsonb of services, FAQs and socials) on every one of the thousand it
 *      did fetch, and rendering them all at once.
 *
 *   2. `if (loading) return <spinner/>` ran on EVERY load, including the reload
 *      that fires when staging finishes. So the moment staging completed, the
 *      discovery panel and its results were unmounted and replaced by "Loading
 *      the queue…". Nothing had failed. The screen had thrown away the evidence
 *      that it had worked.
 *
 * A row-count assertion catches the first. The second is only catchable by
 * asserting that the discovery panel is STILL THERE during a refresh, which is
 * what the last test does.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** How many candidates the fake database holds — deliberately over 1,000. */
const TOTAL = 1326;

const ALL = Array.from({ length: TOTAL }, (_, i) => ({
  id: `cand-${String(i).padStart(4, '0')}`,
  source_key: 'wikidata',
  name: `Candidate ${i}`,
  category: 'restaurants',
  city: 'Lagos',
  address: null,
  phone: null,
  whatsapp: null,
  website: null,
  email: null,
  description: null,
  confidence: 70,
  status: 'pending',
  created_at: '2026-09-24T10:00:00.000Z',
  profile: {},
}));

/** Every `.range()` the component asked for, in order. */
const ranges: Array<[number, number]> = [];
/** Did anything ask for more rows than PostgREST will ever return? */
let overLimit = 0;

vi.mock('../lib/supabase', () => {
  const build = (): any => {
    /*
     * State ACCUMULATES on the builder, exactly as postgrest-js does. An
     * earlier version of this mock returned the count from `select()` itself,
     * which meant `.select('id', {head:true}).in(...)` threw the count away and
     * the component looked broken when it was not. A mock that does not chain
     * the way the client chains tests the mock.
     */
    const state: { head: boolean; from: number; to: number } = { head: false, from: -1, to: -1 };
    const chain: any = {
      select: vi.fn((_c?: string, opts?: { head?: boolean; count?: string }) => {
        if (opts?.head) state.head = true;
        return chain;
      }),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      not: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn((n: number) => {
        // PostgREST silently truncates to 1,000. A caller asking for more has
        // misunderstood what it will get back.
        if (n > 1000) overLimit += 1;
        return chain;
      }),
      range: vi.fn((from: number, to: number) => {
        ranges.push([from, to]);
        state.from = from; state.to = to;
        return chain;
      }),
      update: vi.fn(() => chain),
      insert: vi.fn(async () => ({ error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: (f?: any, r?: any) => {
        if (state.head) return Promise.resolve({ data: null, error: null, count: TOTAL }).then(f, r);
        const rows = state.from >= 0 ? ALL.slice(state.from, state.to + 1) : [];
        return Promise.resolve({ data: rows, error: null }).then(f, r);
      },
    };
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(() => build()),
      rpc: vi.fn(async () => ({ error: null })),
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    },
  };
});

/*
 * The discovery panel is stubbed to a marker. What matters here is only
 * whether it is MOUNTED while the queue reloads — its own behaviour is covered
 * in discoverySources.smoke.test.tsx.
 */
vi.mock('../components/admin/DiscoveryPanel', () => ({
  default: ({ onStaged }: { onStaged?: () => void }) => (
    <div>
      <p>DISCOVERY PANEL</p>
      <button onClick={() => onStaged?.()}>finish staging</button>
    </div>
  ),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import ReviewQueue from '../components/admin/ReviewQueue';

describe('review queue paging', () => {
  beforeEach(() => { ranges.length = 0; overLimit = 0; });

  it('never asks for more rows than PostgREST will return', async () => {
    render(<ReviewQueue />);
    await screen.findByText('Review Queue');
    // The cap is silent, so asking past it is a bug that reports success.
    expect(overLimit).toBe(0);
  });

  it('fetches one bounded page, not the whole queue', async () => {
    render(<ReviewQueue />);
    await screen.findByText('Review Queue');

    expect(ranges.length).toBeGreaterThan(0);
    const [from, to] = ranges[0];
    expect(from).toBe(0);
    // Whatever the page size is, it has to stay under the cap.
    expect(to - from + 1).toBeLessThanOrEqual(1000);
    expect(to - from + 1).toBeLessThan(TOTAL);
  });

  it('states the true total, not the number of rows it happened to fetch', async () => {
    render(<ReviewQueue />);
    // The count comes from the database. Reporting rows.length here is exactly
    // how a truncated query reads as a complete queue.
    await waitFor(() => {
      expect(screen.getByText(/of 1326 waiting/i)).toBeInTheDocument();
    });
  });

  it('loads the next page on request and keeps the rows already shown', async () => {
    const user = userEvent.setup();
    render(<ReviewQueue />);
    await waitFor(() => expect(screen.getByText(/of 1326 waiting/i)).toBeInTheDocument());

    const before = screen.getAllByRole('checkbox').length;
    await user.click(screen.getByRole('button', { name: /load \d+ more/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(before);
    });
    // Appended, not replaced: the first page's first row is still on screen.
    expect(screen.getByText('Candidate 0')).toBeInTheDocument();
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    // The second page starts where the first ended — no gap, no overlap.
    expect(ranges[1][0]).toBe(ranges[0][1] + 1);
  });

  it('lets the operator choose 100, 500, 1,000 or 5,000 rows per page', async () => {
    render(<ReviewQueue />);
    await screen.findByText('Review Queue');

    const select = screen.getByLabelText(/show/i) as HTMLSelectElement;
    expect(select.value).toBe('100');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['100', '500', '1000', '5000']);
  });

  it('fetches a 5,000-row page in contiguous chunks, not one capped request', async () => {
    /*
     * PostgREST would answer a bare range(0, 4999) with 1,000 rows and no
     * error, and the next page would then start at 5,000 — skipping 4,000
     * candidates without a word. The page is therefore assembled from
     * contiguous chunks of at most 1,000.
     */
    const user = userEvent.setup();
    render(<ReviewQueue />);
    await waitFor(() => expect(screen.getByText(/of 1326 waiting/i)).toBeInTheDocument());
    ranges.length = 0;

    await act(async () => {
      await user.selectOptions(screen.getByLabelText(/show/i), '5000');
    });
    await waitFor(() => expect(screen.getByText(/1326 waiting/i)).toBeInTheDocument());

    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges[0][0]).toBe(0);
    for (const [from, to] of ranges) expect(to - from + 1).toBeLessThanOrEqual(1000);
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i][0]).toBe(ranges[i - 1][1] + 1);
    }
  }, 20000);

  it('orders by a unique tiebreaker so a row cannot land on two pages', async () => {
    const { supabase } = await import('../lib/supabase');
    render(<ReviewQueue />);
    await screen.findByText('Review Queue');

    /*
     * Candidates staged in one bulk insert share a created_at to the
     * millisecond and usually a confidence too. Without `id` in the sort,
     * Postgres may order ties differently per page — duplicating some rows and
     * dropping others.
     */
    const orders = (supabase.from as any).mock.results
      .flatMap((r: any) => r.value.order.mock.calls.map((c: any[]) => c[0]));
    expect(orders).toContain('id');
  });

  it('keeps the discovery panel mounted while the queue reloads', async () => {
    const user = userEvent.setup();
    render(<ReviewQueue />);
    await waitFor(() => expect(screen.getByText('DISCOVERY PANEL')).toBeInTheDocument());

    /*
     * This is the reported symptom. Staging finishes, calls onStaged, the queue
     * reloads — and the panel showing what was just found must survive it.
     * It used to be replaced by a full-screen "Loading the queue…", which is
     * indistinguishable from a hang.
     */
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /finish staging/i }));
    });
    expect(screen.getByText('DISCOVERY PANEL')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/of 1326 waiting/i)).toBeInTheDocument();
    });
    expect(screen.getByText('DISCOVERY PANEL')).toBeInTheDocument();
  });
});
