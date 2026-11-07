import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Rows the fake database holds, and the inserts it received. */
const state = {
  services: [] as Array<{ name: string }>,
  products: [] as Array<{ name: string }>,
  readError: null as string | null,
  insertError: null as string | null,
  inserts: [] as Array<{ table: string; rows: Record<string, unknown>[] }>,
};

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({
          data: state.readError ? null : (table === 'business_services' ? state.services : state.products),
          error: state.readError ? { message: state.readError } : null,
        }),
      }),
      insert: async (rows: Record<string, unknown>[]) => {
        if (state.insertError) return { error: { message: state.insertError } };
        state.inserts.push({ table, rows });
        return { error: null };
      },
    }),
  },
}));

import { enrichOneBusiness, enrichBusinesses, summariseRun } from './runner';

const NOW = '2026-09-14T12:00:00.000Z';
const biz = { id: 'b1', name: 'Lagos Flavours', category: 'Restaurant', claim_status: 'unclaimed' };

beforeEach(() => {
  state.services = [];
  state.products = [];
  state.readError = null;
  state.insertError = null;
  state.inserts = [];
});

describe('enrichOneBusiness', () => {
  it('writes suggestions and reports how many', async () => {
    const r = await enrichOneBusiness(biz, NOW);
    expect(r.error).toBeNull();
    expect(r.servicesWritten).toBeGreaterThan(0);
    expect(r.productsWritten).toBeGreaterThan(0);
  });

  it('writes NOTHING published, ever', async () => {
    /*
     * The database refuses generated content that arrives published, so this is
     * belt-and-braces — but a caller that tried would fail loudly in production
     * and silently in a test without this assertion.
     */
    await enrichOneBusiness(biz, NOW);
    for (const { rows } of state.inserts) {
      for (const row of rows) {
        expect(row.published).toBe(false);
        expect(row.content_status).toBe('suggested');
        expect(row.requires_confirmation).toBe(true);
      }
    }
  });

  it('sets only the columns it means to, never a price', async () => {
    await enrichOneBusiness(biz, NOW);
    const row = state.inserts[0].rows[0];
    expect(Object.keys(row).sort()).toEqual([
      'business_id', 'content_status', 'description', 'enrichment_version',
      'generated_at', 'name', 'published', 'requires_confirmation',
      'source_name', 'source_type',
    ]);
  });

  it('does not re-propose what a previous run already wrote', async () => {
    // Reads every row regardless of status, so a second run is not a duplicate
    // factory filling the review queue with copies.
    state.services = [{ name: 'Dine-in' }, { name: 'Takeaway' }];
    const r = await enrichOneBusiness(biz, NOW);
    const written = state.inserts.flatMap((i) => i.rows.map((x) => String(x.name).toLowerCase()));
    expect(written).not.toContain('dine-in');
    expect(r.duplicates).toBe(2);
  });

  it('treats a failed read as a reason to stop, not as "nothing exists"', async () => {
    /*
     * supabase-js resolves with { error } rather than throwing. Reading that as
     * an empty profile would duplicate the entire catalogue on every run.
     */
    state.readError = 'connection reset';
    const r = await enrichOneBusiness(biz, NOW);
    expect(r.error).toMatch(/could not read existing content/i);
    expect(state.inserts).toEqual([]);
  });

  it('reports a write failure instead of claiming success', async () => {
    state.insertError = 'permission denied';
    const r = await enrichOneBusiness(biz, NOW);
    expect(r.error).toMatch(/permission denied/i);
    expect(r.servicesWritten).toBe(0);
  });

  it('writes nothing for a claimed business and says why', async () => {
    const r = await enrichOneBusiness({ ...biz, claim_status: 'claimed' }, NOW);
    expect(state.inserts).toEqual([]);
    expect(r.skipped).toMatch(/claimed/i);
  });

  it('writes nothing for a category with no template', async () => {
    const r = await enrichOneBusiness({ ...biz, category: 'Interdimensional Plumbing' }, NOW);
    expect(state.inserts).toEqual([]);
    expect(r.skipped).toMatch(/no template/i);
  });

  it('writes services for a hospital and no products', async () => {
    const r = await enrichOneBusiness({ ...biz, category: 'Hospital & Clinic' }, NOW);
    expect(r.servicesWritten).toBeGreaterThan(0);
    expect(r.productsWritten).toBe(0);
    expect(state.inserts.map((i) => i.table)).toEqual(['business_services']);
  });
});

describe('enrichBusinesses', () => {
  it('reports progress and returns one outcome per business', async () => {
    const seen: number[] = [];
    const out = await enrichBusinesses(
      [biz, { ...biz, id: 'b2', name: 'Second' }],
      (p) => seen.push(p.done),
    );
    expect(out).toHaveLength(2);
    expect(seen).toEqual([0, 1, 2]);
  });

  it('keeps going after one business fails', async () => {
    // A bulk run that stops at the first failure leaves the operator with no
    // idea which of fifty businesses were done.
    const out = await enrichBusinesses([
      { ...biz, claim_status: 'claimed' },
      biz,
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].skipped).toBeTruthy();
    expect(out[1].servicesWritten).toBeGreaterThan(0);
  });
});

describe('summariseRun', () => {
  it('counts written, skipped and failed separately', async () => {
    const out = await enrichBusinesses([
      biz,
      { ...biz, id: 'b2', name: 'Claimed one', claim_status: 'claimed' },
    ]);
    const s = summariseRun(out);
    expect(s.businesses).toBe(2);
    expect(s.written).toBeGreaterThan(0);
    expect(s.skipped).toBe(1);
    expect(s.failed).toBe(0);
  });
});
