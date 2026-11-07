import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * A tiny fake of the supabase client, just enough for the plan helpers.
 * The helper's own logic is under test (create vs reuse, stop at the first
 * error, the unavailable reason, the count), so the fake records what was
 * written rather than pretending to be a database.
 */
const state = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  listError: null as { code?: string; message: string } | null,
  user: { id: 'u1' } as { id: string } | null,
  createdCampaigns: [] as Array<Record<string, unknown>>,
  placements: [] as Array<Record<string, unknown>>,
  /** 1-based placement insert number that fails, if any. */
  failPlacementAt: null as number | null,
  existingAdvertIds: [] as string[],
  existingProductIds: [] as string[],
  /** advert or product ids whose insert reports a duplicate key. */
  duplicateIds: [] as string[],
  /** Public catalogue rows the local-plan reads return. */
  adverts: [] as Array<Record<string, unknown>>,
  products: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  uploads: [] as Array<{ bucket: string; path: string; opts: unknown }>,
  designs: [] as Array<Record<string, unknown>>,
  designsError: null as { message: string } | null,
}));

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _f: unknown, opts: unknown) => {
          state.uploads.push({ bucket, path, opts });
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string, secs: number) => ({
          data: { signedUrl: `https://signed/${path}?t=${secs}` },
          error: null,
        }),
      }),
    },
    from: (table: string) => {
      if (table === 'ad_campaigns') {
        return {
          select: () => ({
            neq: () => ({
              order: () => ({
                limit: async () => ({ data: state.campaigns, error: state.listError }),
              }),
            }),
          }),
          insert: (rows: Array<Record<string, unknown>>) => {
            state.createdCampaigns.push(...rows);
            return {
              select: () => ({
                single: async () => ({ data: { id: 'new-plan' }, error: null }),
              }),
            };
          },
        };
      }
      if (table === 'advertisements' || table === 'revenue_products') {
        const rows = () => (table === 'advertisements' ? state.adverts : state.products);
        return {
          select: () => ({
            in: async (_c: string, ids: string[]) => ({
              data: rows().filter((r) => ids.includes(String(r.id))),
              error: null,
            }),
          }),
        };
      }
      if (table === 'design_projects') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                order: () => ({
                  limit: async () => ({ data: state.designs, error: state.designsError }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: [
                ...state.existingAdvertIds.map((a, i) => ({
                  id: `l${i}`, advert_id: a, product_id: null, price_basis: 'indicative', currency: 'NGN',
                  advertisements: { title: 't' }, revenue_products: null,
                })),
                ...state.existingProductIds.map((p, i) => ({
                  id: `lp${i}`, advert_id: null, product_id: p, price_basis: 'fixed', price_minor: 100, currency: 'NGN',
                  advertisements: null, revenue_products: { name: 'P', slug: 'p', active: true, duration_days: 7 },
                })),
              ],
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_c: string, id: string) => {
            state.updates.push({ id, patch });
            return { error: null };
          },
        }),
        insert: async (rows: Array<Record<string, unknown>>) => {
          if (state.duplicateIds.includes(String(rows[0].advert_id ?? rows[0].product_id))) {
            return { error: { code: '23505', message: 'dup' } };
          }
          const n = state.placements.length + 1;
          if (state.failPlacementAt === n) return { error: { code: 'XX', message: 'boom' } };
          state.placements.push(...rows);
          return { error: null };
        },
      };
    },
  },
}));

import {
  addAdvertsToPlan, addToPlan, fetchLocalPlanLines, migrateLocalPlan, setLineArtwork,
  uploadLineArtwork, artworkUrlFor, fetchOwnDesigns,
} from './campaigns';
import { readLocalPlan, addLocalLines, clearLocalPlan, replaceLocalPlan } from './localPlan';

beforeEach(() => {
  state.campaigns = [];
  state.listError = null;
  state.user = { id: 'u1' };
  state.createdCampaigns = [];
  state.placements = [];
  state.failPlacementAt = null;
  state.existingAdvertIds = [];
  state.existingProductIds = [];
  state.duplicateIds = [];
  state.adverts = [];
  state.products = [];
  state.updates = [];
  state.uploads = [];
  state.designs = [];
  state.designsError = null;
  clearLocalPlan();
});

describe('addAdvertsToPlan', () => {
  it('creates a plan when there is none and adds every advert', async () => {
    const out = await addAdvertsToPlan([
      { id: 'a1', pricing: 1000 },
      { id: 'a2', pricing: null },
    ]);
    expect(out).toEqual({ ok: true, added: 2, skipped: 0 });
    expect(state.createdCampaigns).toHaveLength(1);
    expect(state.createdCampaigns[0].name).toBe('My advertising plan');
    expect(state.placements.map((p) => p.campaign_id)).toEqual(['new-plan', 'new-plan']);
    expect(state.placements.every((p) => p.days === 30)).toBe(true);
  });

  it('reuses the first plan', async () => {
    state.campaigns = [{ id: 'p1', name: 'First' }, { id: 'p2', name: 'Second' }];
    const out = await addAdvertsToPlan([{ id: 'a1', pricing: 500 }]);
    expect(out).toEqual({ ok: true, added: 1, skipped: 0 });
    expect(state.createdCampaigns).toHaveLength(0);
    expect(state.placements[0].campaign_id).toBe('p1');
  });

  it('returns the unavailable reason when the plans table is missing', async () => {
    state.listError = { code: 'PGRST205', message: 'missing' };
    const out = await addAdvertsToPlan([{ id: 'a1', pricing: 1 }]);
    expect(out).toEqual({ ok: false, error: 'Media plans are not switched on yet.', added: 0 });
    expect(state.placements).toHaveLength(0);
  });

  it('stops and reports the first insert error', async () => {
    state.campaigns = [{ id: 'p1', name: 'First' }];
    state.failPlacementAt = 2;
    const out = await addAdvertsToPlan([
      { id: 'a1', pricing: 1 },
      { id: 'a2', pricing: 2 },
      { id: 'a3', pricing: 3 },
    ]);
    expect(out).toMatchObject({ ok: false, error: 'boom', added: 1 });
    expect(state.placements).toHaveLength(1);
  });

  it('signed out, keeps the plan on this device instead of refusing', async () => {
    state.user = null;
    const out = await addAdvertsToPlan([{ id: 'a1', pricing: 1 }]);
    expect(out).toEqual({ ok: true, added: 1, skipped: 0, local: true });
    expect(state.placements).toHaveLength(0);
  });

  it('skips an advert already in the plan and still adds the rest', async () => {
    state.campaigns = [{ id: 'p1', name: 'First' }];
    state.existingAdvertIds = ['a1'];
    const out = await addAdvertsToPlan([{ id: 'a1', pricing: 1 }, { id: 'a2', pricing: 2 }]);
    expect(out).toEqual({ ok: true, added: 1, skipped: 1 });
    expect(state.placements.map((p) => p.advert_id)).toEqual(['a2']);
  });

  it('counts a duplicate-key error as skipped, not fatal', async () => {
    state.campaigns = [{ id: 'p1', name: 'First' }];
    state.duplicateIds = ['a1'];
    const out = await addAdvertsToPlan([{ id: 'a1', pricing: 1 }, { id: 'a2', pricing: 2 }]);
    expect(out).toEqual({ ok: true, added: 1, skipped: 1 });
  });

  it('dedupes the input list', async () => {
    state.campaigns = [{ id: 'p1', name: 'First' }];
    const out = await addAdvertsToPlan([{ id: 'a1', pricing: 1 }, { id: 'a1', pricing: 1 }]);
    expect(out).toEqual({ ok: true, added: 1, skipped: 0 });
    expect(state.placements).toHaveLength(1);
  });

  it('does nothing for an empty list', async () => {
    const out = await addAdvertsToPlan([]);
    expect(out).toEqual({ ok: true, added: 0, skipped: 0 });
    expect(state.createdCampaigns).toHaveLength(0);
  });
});

describe('addToPlan', () => {
  it('signed out writes only to the local plan and says so', async () => {
    state.user = null;
    const out = await addToPlan([
      { kind: 'placement', id: 'a1', pricing: 10 },
      { kind: 'product', id: 'pr1', priceMinor: 5000, days: 7 },
    ]);
    expect(out).toEqual({ ok: true, added: 2, skipped: 0, local: true });
    expect(state.createdCampaigns).toHaveLength(0);
    expect(state.placements).toHaveLength(0);
    expect(readLocalPlan()).toHaveLength(2);
  });

  it('signed in, a product insert is fixed-price with its kobo amount', async () => {
    state.campaigns = [{ id: 'p1', name: 'First' }];
    const out = await addToPlan([{ kind: 'product', id: 'pr1', priceMinor: 5000, days: 7 }]);
    expect(out).toEqual({ ok: true, added: 1, skipped: 0 });
    expect(state.placements[0]).toMatchObject({
      campaign_id: 'p1', product_id: 'pr1', days: 7, price_basis: 'fixed', price_minor: 5000, currency: 'NGN',
    });
    expect(state.placements[0].advert_id).toBeUndefined();
  });

  it('skips a product already in the plan', async () => {
    state.campaigns = [{ id: 'p1', name: 'First' }];
    state.existingProductIds = ['pr1'];
    const out = await addToPlan([{ kind: 'product', id: 'pr1', priceMinor: 5000, days: null }]);
    expect(out).toEqual({ ok: true, added: 0, skipped: 1 });
  });
});

describe('migrateLocalPlan', () => {
  const seed = () => {
    state.adverts = ['a1', 'a2', 'a3'].map((id) => ({
      id, title: id, type: 'billboard', location: 'Lagos', dimensions: null, pricing: 10,
    }));
    addLocalLines([
      { kind: 'placement', advertId: 'a1', days: 30 },
      { kind: 'placement', advertId: 'a2', days: 14 },
      { kind: 'placement', advertId: 'a3', days: 30 },
    ]);
  };

  it('is null when nothing is local', async () => {
    expect(await migrateLocalPlan()).toBeNull();
  });

  it('moves what it can, keeps the rest, and a rerun adds no duplicates', async () => {
    seed();
    state.campaigns = [{ id: 'p1', name: 'First' }];
    state.failPlacementAt = 2;
    expect(await migrateLocalPlan()).toEqual({ moved: 1, kept: 2 });
    expect(readLocalPlan().map((l) => (l.kind === 'placement' ? l.advertId : ''))).toEqual(['a2', 'a3']);
    expect(state.placements.map((p) => p.advert_id)).toEqual(['a1']);

    state.failPlacementAt = null;
    state.existingAdvertIds = ['a1'];
    expect(await migrateLocalPlan()).toEqual({ moved: 2, kept: 0 });
    expect(readLocalPlan()).toEqual([]);
    expect(state.placements.map((p) => p.advert_id)).toEqual(['a1', 'a2', 'a3']);
    expect(state.placements[1].days).toBe(14);
  });

  it('counts a line already in the account as moved', async () => {
    seed();
    state.campaigns = [{ id: 'p1', name: 'First' }];
    state.existingAdvertIds = ['a1'];
    expect(await migrateLocalPlan()).toEqual({ moved: 3, kept: 0 });
    expect(state.placements.map((p) => p.advert_id)).toEqual(['a2', 'a3']);
  });

  it('keeps an offered:false line local', async () => {
    seed();
    replaceLocalPlan([...readLocalPlan(), { kind: 'product', productId: 'gone' }]);
    state.campaigns = [{ id: 'p1', name: 'First' }];
    expect(await migrateLocalPlan()).toEqual({ moved: 3, kept: 1 });
    expect(readLocalPlan()).toEqual([{ kind: 'product', productId: 'gone' }]);
  });

  it('leaves the local plan alone when signed out', async () => {
    seed();
    state.user = null;
    expect(await migrateLocalPlan()).toBeNull();
    expect(readLocalPlan()).toHaveLength(3);
  });
});

describe('fetchLocalPlanLines', () => {
  it('builds lines with the live price, and marks missing or inactive rows not on offer', async () => {
    state.adverts = [{ id: 'a1', title: 'Board', type: 'billboard', location: 'Lagos', dimensions: '6x3', pricing: 20 }];
    state.products = [
      { id: 'pr1', name: 'Boost', slug: 'boost', active: true, duration_days: 7, price_minor: 250000, currency: 'NGN' },
      { id: 'pr2', name: 'Old', slug: 'old', active: false, duration_days: 7, price_minor: 100, currency: 'NGN' },
    ];
    const lines = await fetchLocalPlanLines([
      { kind: 'placement', advertId: 'a1', days: 14 },
      { kind: 'placement', advertId: 'a9', days: 30 },
      { kind: 'product', productId: 'pr1' },
      { kind: 'product', productId: 'pr2' },
      { kind: 'product', productId: 'pr3' },
    ]);
    expect(lines.map((l) => l.id)).toEqual(['local:a1', 'local:a9', 'local:pr1', 'local:pr2', 'local:pr3']);
    expect(lines[0]).toMatchObject({ title: 'Board', days: 14, ratePerDay: 20, priceBasis: 'indicative', offered: true, kind: 'placement' });
    expect(lines[1]).toMatchObject({ title: 'No longer on offer', offered: false });
    expect(lines[2]).toMatchObject({ title: 'Boost', kind: 'product', productId: 'pr1', priceMinor: 250000, priceBasis: 'fixed', days: 7, offered: true });
    expect(lines[3]).toMatchObject({ title: 'No longer on offer', offered: false });
    expect(lines[4].offered).toBe(false);
  });
});

describe('artwork', () => {
  it('refuses a video with the quote-request message', async () => {
    const f = new File(['x'], 'ad.mp4', { type: 'video/mp4' });
    expect(await uploadLineArtwork('c1', 'l1', f)).toEqual({
      error: 'Attach an image of the artwork; video adverts are sent with the quote request.',
    });
    expect(state.uploads).toHaveLength(0);
  });

  it('uploads a png under the owner folder', async () => {
    const f = new File(['x'], 'My Ad.png', { type: 'image/png' });
    const out = await uploadLineArtwork('c1', 'l1', f);
    expect(out).toEqual({ path: 'u1/c1/l1-my-ad.png' });
    expect(state.uploads[0]).toMatchObject({ bucket: 'plan-artwork', path: 'u1/c1/l1-my-ad.png', opts: { upsert: true } });
  });

  it('needs sign-in to upload', async () => {
    state.user = null;
    const out = await uploadLineArtwork('c1', 'l1', new File(['x'], 'a.png', { type: 'image/png' }));
    expect('error' in out).toBe(true);
  });

  it('records artwork on the line', async () => {
    expect(await setLineArtwork('l1', { path: 'u1/c1/l1-a.png', width: 1080, height: 1080, designId: 'd1' })).toBe(true);
    expect(state.updates[0]).toEqual({
      id: 'l1',
      patch: { artwork_url: 'u1/c1/l1-a.png', artwork_width: 1080, artwork_height: 1080, artwork_design_id: 'd1' },
    });
  });

  it('signs a url for an hour', async () => {
    expect(await artworkUrlFor('u1/x.png')).toBe('https://signed/u1/x.png?t=3600');
  });
});

describe('fetchOwnDesigns', () => {
  it('reads size from the first page and skips rows without one', async () => {
    state.designs = [
      { id: 'd1', title: 'A', pages: [{ width: 1080, height: 1350 }] },
      { id: 'd2', title: 'B', pages: [] },
      { id: 'd3', title: null, pages: [{ width: '10', height: 20 }] },
      { id: 'd4', title: 'D', pages: [{ width: 800, height: 600 }] },
    ];
    expect(await fetchOwnDesigns()).toEqual({
      state: 'ready',
      designs: [
        { id: 'd1', title: 'A', width: 1080, height: 1350 },
        { id: 'd4', title: 'D', width: 800, height: 600 },
      ],
    });
  });

  it('reports unavailable on error, never as no designs', async () => {
    state.designsError = { message: 'x' };
    expect((await fetchOwnDesigns()).state).toBe('unavailable');
  });
});
