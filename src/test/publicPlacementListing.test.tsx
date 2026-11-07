import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

/**
 * Every public surface that reads `advertisements` leaves out the placements
 * that are not public: pending_review (an unverified owner's placement
 * waiting for an admin), rejected and archived.
 *
 * "Public can view advertisements" is USING (true), so the database returns
 * those rows to anyone who asks. Each surface must filter, either in the query
 * (`.not('lifecycle', 'in', UNLISTED_LIFECYCLES_IN)`) or with
 * isListedPlacement. The fakes below IGNORE query filters when returning rows,
 * so a surface that only filtered in the query would still have to filter
 * what comes back; the query filter is asserted separately where a count
 * depends on it (a count has no rows to filter).
 */

const ROWS = [
  { id: 'live1', title: 'Live Lekki gantry', category: 'Digital Screen', location: 'Lagos, Nigeria', pricing: 5, status: 'active', created_at: '2026-10-03', lifecycle: 'imported', user_id: 'u1' },
  { id: 'wait1', title: 'Waiting Yaba screen', category: 'Digital Screen', location: 'Lagos, Nigeria', pricing: 5, status: 'active', created_at: '2026-10-02', lifecycle: 'pending_review', user_id: 'u1' },
  { id: 'rej1', title: 'Rejected Ikeja board', category: 'Billboard', location: 'Lagos, Nigeria', pricing: 5, status: 'active', created_at: '2026-10-01', lifecycle: 'rejected', user_id: 'u1' },
  { id: 'arc1', title: 'Archived Ajah board', category: 'Billboard', location: 'Lagos, Nigeria', pricing: 5, status: 'active', created_at: '2026-09-30', lifecycle: 'archived', user_id: 'u1' },
];

interface Q { table: string; ops: unknown[][] }
const queries: Q[] = [];

vi.mock('../lib/supabase', () => {
  const chainFor = (table: string) => {
    const q: Q = { table, ops: [] };
    queries.push(q);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ['select', 'eq', 'neq', 'not', 'in', 'or', 'order', 'limit', 'range', 'ilike', 'is', 'gte', 'lte']) {
      c[m] = vi.fn((...args: unknown[]) => { q.ops.push([m, ...args]); return c; });
    }
    const result = () => ({ data: table === 'advertisements' ? ROWS : [], count: table === 'advertisements' ? ROWS.length : 0, error: null });
    c.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    c.single = vi.fn(async () => ({ data: null, error: null }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c.then = (f?: any, r?: any) => Promise.resolve(result()).then(f, r);
    return c;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => chainFor(t)),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      },
      channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
      removeChannel: vi.fn(),
    },
  };
});

/* ListingExplorer is replaced by a probe that prints the adverts it is given. */
vi.mock('../components/home/ListingExplorer', () => ({
  default: ({ adverts }: { adverts: { id: string; title: string }[] }) => (
    <ul data-testid="home-adverts">{adverts.map((a) => <li key={a.id}>{a.title}</li>)}</ul>
  ),
}));
vi.mock('../components/HeroSlider', () => ({ default: () => null }));
vi.mock('../components/BrandMarquee', () => ({ default: () => null }));
vi.mock('../components/home/HeroSearch', () => ({ default: () => null }));
vi.mock('../components/home/SendYourBusiness', () => ({ default: () => null }));
vi.mock('../lib/heroSettings', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/heroSettings')>();
  return { ...real, loadHeroSettings: async () => real.DEFAULT_HERO };
});

import Home from '../pages/Home';
import { UNLISTED_LIFECYCLES, UNLISTED_LIFECYCLES_IN, isListedPlacement } from '../lib/promote/listing';

const advertQueries = () => queries.filter((q) => q.table === 'advertisements');
const hasLifecycleFilter = (q: Q) => q.ops.some((o) => o[0] === 'not' && o[1] === 'lifecycle' && o[2] === 'in' && o[3] === UNLISTED_LIFECYCLES_IN);

beforeEach(() => { queries.length = 0; });

describe('the unlisted set', () => {
  it('is pending_review, rejected and archived, in one place', () => {
    expect([...UNLISTED_LIFECYCLES].sort()).toEqual(['archived', 'pending_review', 'rejected']);
    expect(UNLISTED_LIFECYCLES_IN).toBe(`(${UNLISTED_LIFECYCLES.join(',')})`);
    expect(ROWS.filter(isListedPlacement).map((r) => r.id)).toEqual(['live1']);
  });
});

describe('Home', () => {
  it('lists only public placements, and counts only those', async () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    const list = await screen.findByTestId('home-adverts');
    await waitFor(() => expect(list.textContent).toContain('Live Lekki gantry'));
    for (const t of ['Waiting Yaba screen', 'Rejected Ikeja board', 'Archived Ajah board']) expect(list.textContent).not.toContain(t);
    // The list read and the head:true count read both carry the lifecycle filter.
    const qs = advertQueries();
    expect(qs.length).toBeGreaterThanOrEqual(2);
    for (const q of qs) expect(hasLifecycleFilter(q), JSON.stringify(q.ops)).toBe(true);
  });
});

describe('Profile', () => {
  it("the public profile's placement count leaves unlisted placements out", () => {
    const src = readFileSync('src/pages/Profile.tsx', 'utf8');
    const read = src.slice(src.indexOf(".from('advertisements')"), src.indexOf(".from('advertisements')") + 300);
    expect(read).toMatch(/\.not\('lifecycle', 'in', UNLISTED_LIFECYCLES_IN\)/);
  });
});

describe('sitemap', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('submits only public placements', async () => {
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      const table = url.pathname.split('/').pop();
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const rows = table === 'advertisements' && offset === 0 ? ROWS : [];
      return { ok: true, json: async () => rows } as unknown as Response;
    }) as unknown as typeof fetch;
    vi.resetModules();
    process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    process.env.APP_BASE_URL = 'https://www.nowopenafrica.com';
    const handler = (await import('../../api/sitemap.xml.js')).default as (req: unknown, res: unknown) => Promise<void>;
    let body = '';
    const res = { status: () => res, setHeader: () => {}, send: (b: string) => { body = b; } };
    await handler({ method: 'GET' }, res);
    expect(body).toContain('/adverts/live1');
    for (const id of ['wait1', 'rej1', 'arc1']) expect(body).not.toContain(`/adverts/${id}`);
  });
});

describe('chatbot advert search (edge function)', () => {
  it('filters unlisted lifecycles in the query, with the same set', () => {
    // Deno code cannot import src/; the set is written out and compared here.
    const src = readFileSync('supabase/functions/chatbot/index.ts', 'utf8');
    const fn = src.slice(src.indexOf('async function searchAdverts'), src.indexOf('async function searchAdverts') + 800);
    expect(fn).toContain(`.not("lifecycle", "in", "${UNLISTED_LIFECYCLES_IN}")`);
  });

  it('gives a price for owner placements: pricing (USD a day) when price_per_day is empty', () => {
    // Owner placements write only pricing (USD per day), never price_per_day.
    const src = readFileSync('supabase/functions/chatbot/index.ts', 'utf8');
    const fn = src.slice(src.indexOf('async function searchAdverts'), src.indexOf('async function searchMedia'));
    expect(fn).toContain('.select("id, title, type, category, location, price_per_day, pricing, status")');
    expect(fn).toMatch(/price_per_day_usd: a\.price_per_day == null \? a\.pricing \?\? null : null/);
  });
});
