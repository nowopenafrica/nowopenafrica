import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Owner-created placements reach the sitemap (final review I2).
 *
 * The sitemap only submits a placement with an accountable owner. Before the
 * partner portal that meant `user_id`; the portal stores owned placements
 * with `owner_id` set and `user_id` NULL (Task 1 ruling), so a check on
 * user_id alone kept every partner placement out of the index for good.
 * Either one now counts, and the listed-lifecycle rule still applies.
 */

async function render(adverts: Record<string, unknown>[]): Promise<{ xml: string; urls: string[] }> {
  const urls: string[] = [];
  globalThis.fetch = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    urls.push(String(input));
    const table = url.pathname.split('/rest/v1/')[1] ?? '';
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const rows = table === 'advertisements' && offset === 0 ? adverts : [];
    return { ok: true, json: async () => rows } as unknown as Response;
  }) as unknown as typeof fetch;

  vi.resetModules();
  process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  process.env.APP_BASE_URL = 'https://www.nowopenafrica.com';
  const mod = await import('../../api/sitemap.xml.js');
  const handler = mod.default as (req: unknown, res: unknown) => Promise<void>;
  let xml = '';
  const res = { status: () => res, setHeader: () => {}, send: (b: string) => { xml = b; } };
  await handler({ method: 'GET' }, res);
  return { xml, urls };
}

const advertLocs = (xml: string) =>
  [...xml.matchAll(/<loc>[^<]*\/adverts\/([^<]+)<\/loc>/g)].map((m) => m[1]).sort();

const realFetch = globalThis.fetch;
beforeEach(() => { vi.resetModules(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe('sitemap: placements with an accountable owner', () => {
  it('selects owner_id alongside user_id', async () => {
    const { urls } = await render([]);
    const ads = urls.find((u) => u.includes('/rest/v1/advertisements'));
    expect(ads).toBeDefined();
    const select = new URL(ads!).searchParams.get('select')!.split(',');
    expect(select).toEqual(expect.arrayContaining(['id', 'user_id', 'owner_id', 'lifecycle']));
  });

  it('lists a row with user_id OR owner_id, only in a listed lifecycle', async () => {
    const { xml } = await render([
      { id: 'legacy-user', user_id: 'u1', owner_id: null, lifecycle: 'imported' },
      { id: 'owned-verified', user_id: null, owner_id: 'o1', lifecycle: 'partner_verified' },
      { id: 'owned-supplied', user_id: null, owner_id: 'o1', lifecycle: 'partner_supplied' },
      { id: 'owned-pending', user_id: null, owner_id: 'o1', lifecycle: 'pending_review' },
      { id: 'owned-rejected', user_id: null, owner_id: 'o1', lifecycle: 'rejected' },
      { id: 'owned-archived', user_id: null, owner_id: 'o1', lifecycle: 'archived' },
      { id: 'nobody', user_id: null, owner_id: null, lifecycle: 'imported' },
    ]);
    expect(advertLocs(xml)).toEqual(['legacy-user', 'owned-supplied', 'owned-verified']);
  });
});
