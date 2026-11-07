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
  /** advert ids whose insert reports a duplicate key. */
  duplicateIds: [] as string[],
}));

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
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
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: state.existingAdvertIds.map((a, i) => ({ id: `l${i}`, advert_id: a, price_basis: 'indicative', currency: 'NGN', advertisements: { title: 't' } })),
              error: null,
            }),
          }),
        }),
        insert: async (rows: Array<Record<string, unknown>>) => {
          if (state.duplicateIds.includes(String(rows[0].advert_id))) return { error: { code: '23505', message: 'dup' } };
          const n = state.placements.length + 1;
          if (state.failPlacementAt === n) return { error: { code: 'XX', message: 'boom' } };
          state.placements.push(...rows);
          return { error: null };
        },
      };
    },
  },
}));

import { addAdvertsToPlan } from './campaigns';

beforeEach(() => {
  state.campaigns = [];
  state.listError = null;
  state.user = { id: 'u1' };
  state.createdCampaigns = [];
  state.placements = [];
  state.failPlacementAt = null;
  state.existingAdvertIds = [];
  state.duplicateIds = [];
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
    expect(out).toEqual({ ok: false, error: 'boom', added: 1 });
    expect(state.placements).toHaveLength(1);
  });

  it('is told to sign in when genuinely signed out', async () => {
    state.user = null;
    const out = await addAdvertsToPlan([{ id: 'a1', pricing: 1 }]);
    expect(out).toEqual({ ok: false, error: 'Sign in to save a plan.', added: 0 });
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
