import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The sitemap must contain every eligible page, not the first thousand.
 *
 * WHAT WENT WRONG, AND WHY NOTHING CAUGHT IT
 *
 * api/sitemap.xml.ts asked PostgREST for `limit=5000`. PostgREST has its own
 * server-side ceiling — `db-max-rows` — and this project's is 1000. Measured
 * against production on 2026-09-14:
 *
 *   ?limit=5000 → 1000 rows
 *   ?limit=2000 → 1000 rows
 *
 * No error. No header anybody was reading. No flag. Asking for five thousand
 * and receiving a thousand is indistinguishable, from the caller's side, from a
 * directory that contains a thousand businesses.
 *
 * The cost: the live sitemap held exactly 1000 business profiles while 2,980
 * cleared the indexability bar. Roughly two thousand real, qualifying African
 * businesses — two thirds of the directory — had never once been submitted to
 * a search engine. For a product whose entire proposition is being findable,
 * that is the most expensive bug on the site, and it looked like success.
 *
 * It compounded downstream too: discoveryPages() decides which city and
 * category pages are dense enough to exist by counting listings, so it was
 * making that call on a third of the data. 56 place pages existed against 277
 * distinct locations on file.
 *
 * These tests pin the paging, and they pin it against a fake server that
 * enforces the same 1000-row cap — so the test fails for the real reason
 * rather than passing because the mock was more generous than the server.
 */

const SERVER_ROW_CAP = 1000;

/** Businesses that all clear isIndexableProfile: claimed, so score is irrelevant. */
function fakeBusinesses(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${String(i).padStart(5, '0')}`,
    username: `biz-${i}`,
    category: 'Restaurants',
    // Three places, so every one of them clears MIN_LISTINGS_PER_PAGE and the
    // discovery pages are a function of how many rows actually arrived.
    location: `${['Lagos', 'Nairobi', 'Accra'][i % 3]}, Country`,
    updated_at: '2026-09-01T00:00:00Z',
    created_at: '2026-09-01T00:00:00Z',
    claim_status: 'claimed',
    data_status: 'imported_authorized',
    listing_score: 90,
  }));
}

/** A PostgREST that honours limit and offset — and caps every response at 1000. */
function fakeServer(tables: Record<string, Record<string, unknown>[]>) {
  return vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/rest/v1/')[1] ?? '';
    const rows = tables[table] ?? [];
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const asked = Number(url.searchParams.get('limit') ?? SERVER_ROW_CAP);
    // The whole point: the server gives you what IT decides, not what you asked.
    const take = Math.min(asked, SERVER_ROW_CAP);
    return {
      ok: true,
      json: async () => rows.slice(offset, offset + take),
    } as unknown as Response;
  });
}

/** Load the handler fresh, since it reads env at module scope. */
async function loadHandler() {
  vi.resetModules();
  process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  process.env.APP_BASE_URL = 'https://www.nowopenafrica.com';
  const mod = await import('../../api/sitemap.xml.js');
  return mod.default as (req: unknown, res: unknown) => Promise<void>;
}

/** Run the handler and return the XML it sent. */
async function render(): Promise<string> {
  const handler = await loadHandler();
  let body = '';
  const res = {
    status: () => res,
    setHeader: () => {},
    send: (b: string) => { body = b; },
  };
  await handler({ method: 'GET' }, res);
  return body;
}

const locsOf = (xml: string) => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);

const realFetch = globalThis.fetch;

beforeEach(() => { vi.resetModules(); });
afterEach(() => { globalThis.fetch = realFetch; vi.unstubAllEnvs(); });

describe('the sitemap pages past the server row cap', () => {
  it('lists 2,500 businesses when 2,500 exist, not 1,000', async () => {
    globalThis.fetch = fakeServer({
      businesses: fakeBusinesses(2500),
      advertisements: [],
      media_services: [],
    }) as unknown as typeof fetch;

    const locs = locsOf(await render());
    const profiles = locs.filter((u) => /\/biz-\d+$/.test(u));

    // The exact number that was wrong before: 1000.
    expect(profiles.length).toBe(2500);
  });

  it('asks for the next page instead of a bigger one', async () => {
    const server = fakeServer({
      businesses: fakeBusinesses(2500), advertisements: [], media_services: [],
    });
    globalThis.fetch = server as unknown as typeof fetch;
    await render();

    const businessCalls = server.mock.calls
      .map((c) => new URL(String(c[0])))
      .filter((u) => u.pathname.endsWith('/businesses'));

    // 2500 rows over a 1000-row cap is three requests, at offsets 0, 1000, 2000.
    expect(businessCalls.map((u) => u.searchParams.get('offset'))).toEqual(['0', '1000', '2000']);
    // And never asks for more than the server will give, which is what made the
    // truncation invisible in the first place.
    for (const u of businessCalls) {
      expect(Number(u.searchParams.get('limit'))).toBeLessThanOrEqual(SERVER_ROW_CAP);
    }
  });

  it('stops as soon as a page comes back short', async () => {
    const server = fakeServer({
      businesses: fakeBusinesses(1200), advertisements: [], media_services: [],
    });
    globalThis.fetch = server as unknown as typeof fetch;
    await render();

    const businessCalls = server.mock.calls
      .map((c) => new URL(String(c[0])))
      .filter((u) => u.pathname.endsWith('/businesses'));

    // Two requests, not five: the second returns 200 rows and that is the end.
    expect(businessCalls.length).toBe(2);
  });

  it('orders by a unique tiebreaker, or offset paging loses rows', async () => {
    const server = fakeServer({ businesses: fakeBusinesses(10), advertisements: [], media_services: [] });
    globalThis.fetch = server as unknown as typeof fetch;
    await render();

    for (const call of server.mock.calls) {
      const order = new URL(String(call[0])).searchParams.get('order') ?? '';
      /*
       * updated_at and created_at are not unique — a bulk import stamps
       * hundreds of rows with the same second — so a sort on them alone leaves
       * the page boundaries undefined, and rows fall between requests.
       */
      expect(order, order).toMatch(/id\.(asc|desc)$/);
    }
  });

  it('never emits the same URL twice', async () => {
    globalThis.fetch = fakeServer({
      businesses: fakeBusinesses(2500), advertisements: [], media_services: [],
    }) as unknown as typeof fetch;

    const locs = locsOf(await render());
    expect(new Set(locs).size).toBe(locs.length);
  });

  it('builds discovery pages from all the rows, not the first page', async () => {
    globalThis.fetch = fakeServer({
      businesses: fakeBusinesses(2500), advertisements: [], media_services: [],
    }) as unknown as typeof fetch;

    const locs = locsOf(await render());
    // Three places, each well past MIN_LISTINGS_PER_PAGE.
    for (const place of ['lagos', 'nairobi', 'accra']) {
      expect(locs, place).toContain(`https://www.nowopenafrica.com/businesses/in/${place}`);
    }
  });
});

describe('published project stories', () => {
  const projects = (rows: Record<string, unknown>[]) => rows.map((row, i) => ({
    id: `p${String(i).padStart(5, '0')}`,
    slug: `project-${i}`,
    business_id: 'b00000',
    updated_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
    ...row,
  }));

  it('submits a published project at its shareable URL', async () => {
    globalThis.fetch = fakeServer({
      businesses: fakeBusinesses(3),
      advertisements: [],
      media_services: [],
      business_projects: projects([{}, {}]),
    }) as unknown as typeof fetch;

    const locs = locsOf(await render());
    expect(locs).toContain('https://www.nowopenafrica.com/work/project-0');
    expect(locs).toContain('https://www.nowopenafrica.com/work/project-1');
  });

  it('asks only for published rows, so a draft can never be submitted', async () => {
    const server = fakeServer({
      businesses: fakeBusinesses(3), advertisements: [], media_services: [], business_projects: projects([{}]),
    });
    globalThis.fetch = server as unknown as typeof fetch;
    await render();

    const projectCalls = server.mock.calls
      .map((c) => new URL(String(c[0])))
      .filter((u) => u.pathname.endsWith('/business_projects'));

    expect(projectCalls.length).toBeGreaterThan(0);
    for (const url of projectCalls) {
      expect(url.searchParams.get('published')).toBe('eq.true');
    }
  });

  /*
   * A project page is submitted only when its owner's profile is: asking a
   * crawler to trust a page from a business we would not submit is the wrong
   * order of confidence.
   */
  it('leaves out a project whose business is not in the indexable set', async () => {
    globalThis.fetch = fakeServer({
      businesses: fakeBusinesses(3),
      advertisements: [],
      media_services: [],
      business_projects: projects([
        { id: 'p-orphan', slug: 'orphaned-project', business_id: 'not-in-the-sitemap' },
      ]),
    }) as unknown as typeof fetch;

    const locs = locsOf(await render());
    expect(locs).not.toContain('https://www.nowopenafrica.com/work/orphaned-project');
  });

  it('falls back to the id for a row that predates slugs', async () => {
    globalThis.fetch = fakeServer({
      businesses: fakeBusinesses(3),
      advertisements: [],
      media_services: [],
      business_projects: projects([{ id: 'legacy-row', slug: null }]),
    }) as unknown as typeof fetch;

    const locs = locsOf(await render());
    expect(locs).toContain('https://www.nowopenafrica.com/work/legacy-row');
  });
});

describe('the sitemap degrades rather than fails', () => {
  it('keeps the pages it already fetched when a later request errors', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/businesses')) {
        calls += 1;
        // First page fine, second page a 500.
        if (calls > 1) return { ok: false, json: async () => [] } as unknown as Response;
        return { ok: true, json: async () => fakeBusinesses(1000) } as unknown as Response;
      }
      return { ok: true, json: async () => [] } as unknown as Response;
    }) as unknown as typeof fetch;

    const xml = await render();
    /*
     * A sitemap missing its tail is worth far more to a crawler than one that
     * 500s — the latter reads as a site that is broken in its entirety.
     */
    expect(locsOf(xml).filter((u) => /\/biz-\d+$/.test(u)).length).toBe(1000);
    expect(xml).toContain('<urlset');
  });

  it('still serves the static routes when the database is unreachable', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const locs = locsOf(await render());
    expect(locs).toContain('https://www.nowopenafrica.com/');
    expect(locs).toContain('https://www.nowopenafrica.com/add-business');
  });
});
