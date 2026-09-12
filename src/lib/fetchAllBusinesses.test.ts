import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchAllBusinesses, PAGE_SIZE } from './fetchAllBusinesses';

/*
 * The behaviour the admin panel and the public directory both depend on.
 *
 * PostgREST caps a single response at 1000 rows whatever the requested limit,
 * with no error and no signal — which is exactly how the Businesses panel got
 * stuck at "1–100 of 1000" while the table held more. These tests pin the walk
 * itself: pages under the cap, stops on an empty page, orders like each caller
 * needs, and reports truncation at its own ceiling instead of pretending.
 */

interface PageRequest {
  from: number;
  to: number;
  eqIsListable: boolean;
  orders: { column: string; ascending: boolean }[];
}

/*
 * `vi.hoisted` keeps the capture array in the same scope as the mock factory
 * below no matter how vitest reorders the `vi.mock` call above the imports —
 * the factory and the tests must see the same bindings.
 */
const h = vi.hoisted(() => {
  const requests: PageRequest[] = [];
  const responder = (_req: PageRequest): { data: unknown[] | null; error: { message: string } | null } => ({ data: [], error: null });
  return { requests, responder };
});

const { requests } = h;
const responder = (fn: (req: PageRequest) => { data: unknown[] | null; error: { message: string } | null }) => {
  h.responder = fn;
};

const row = (i: number) => ({ id: `b${i}` });

/** A page of `count` invented rows, or the given error. */
const ok = (count: number) => ({ data: Array.from({ length: count }, (_, i) => row(i)), error: null });

vi.mock('./supabase', () => ({
  supabase: {
    from: () => {
      const state = { listable: false, orders: [] as { column: string; ascending: boolean }[] };
      const query = {
        select: () => query,
        eq: (_col: string, val: boolean) => {
          state.listable = val;
          return query;
        },
        order: (column: string, opts: { ascending: boolean }) => {
          state.orders.push({ column, ascending: opts.ascending });
          return query;
        },
        range: (from: number, to: number) => {
          const req = { from, to, eqIsListable: state.listable, orders: state.orders };
          h.requests.push(req);
          return Promise.resolve(h.responder(req));
        },
      };
      return query;
    },
  },
}));

beforeEach(() => {
  requests.length = 0;
  responder(() => ok(0));
});

describe('fetchAllBusinesses', () => {
  it('walks .range() pages until an empty page says the table is over', async () => {
    responder(({ from }) => ok(from === 0 ? PAGE_SIZE : from === PAGE_SIZE ? 50 : 0));
    const result = await fetchAllBusinesses();
    expect(result.error).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.data).toHaveLength(PAGE_SIZE + 50);
  });

  it('never asks for more rows than the exposed PAGE_SIZE, however big the cap', async () => {
    responder(({ to }) => ({ data: Array.from({ length: to + 1 }, (_, i) => row(i)), error: null }));
    await fetchAllBusinesses({ cap: 10_000 });
    for (const req of requests) {
      expect(req.to - req.from + 1).toBeLessThanOrEqual(PAGE_SIZE);
    }
  });

  it('orders newest-first and applies no listing filter for the admin panel', async () => {
    responder(({ from }) => ok(from === 0 ? PAGE_SIZE : 0));
    await fetchAllBusinesses();
    expect(requests[0].eqIsListable).toBe(false);
    expect(requests[0].orders).toEqual([{ column: 'created_at', ascending: false }]);
  });

  it('filters to listable rows and sorts by listing score for the directory', async () => {
    responder(({ from }) => ok(from === 0 ? PAGE_SIZE : 0));
    await fetchAllBusinesses({ isListable: true });
    expect(requests[0].eqIsListable).toBe(true);
    expect(requests[0].orders).toEqual([
      { column: 'listing_score', ascending: false },
      { column: 'created_at', ascending: false },
    ]);
  });

  it('reports loudly when the walk hits its own ceiling', async () => {
    responder(() => ok(PAGE_SIZE));
    const result = await fetchAllBusinesses({ cap: 2500 });
    expect(result.error).toBeNull();
    expect(result.truncated).toBe(true);
    // The last page is clamped to the cap, not allowed to overshoot it.
    expect(requests[requests.length - 1].to).toBe(2499);
  });

  it('surfaces the first failed request instead of pretending the walk finished', async () => {
    responder(({ from }) => (from === PAGE_SIZE ? { data: null, error: { message: 'boom' } } : ok(PAGE_SIZE)));
    const result = await fetchAllBusinesses();
    expect(result.error).toBe('boom');
    expect(result.truncated).toBe(false);
  });
});