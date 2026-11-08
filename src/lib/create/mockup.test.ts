import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatOf, sameRatio } from '../design/formats';

/*
 * No test touches the network or writes to the database: the anon client is a
 * stub whose one read path (surfaces joined to their scene asset) is scripted.
 */
const db = vi.hoisted(() => ({
  result: { data: [] as unknown, error: null as unknown },
  selected: [] as string[],
  from: [] as string[],
  throws: false,
}));
vi.mock('../supabase', () => {
  const chain = {
    select: (cols: string) => { db.selected.push(cols); return chain; },
    order: () => chain,
    limit: () => (db.throws ? Promise.reject(new Error('offline')) : Promise.resolve(db.result)),
  };
  return { supabase: { from: (t: string) => { db.from.push(t); return chain; } } };
});

import {
  cachedScenes, fetchScenes, loadScenes, refreshScenes, resetScenesCache, scenesFor, type MockupScene,
} from './mockup';

const QUAD = { tl: { x: 0.1, y: 0.1 }, tr: { x: 0.9, y: 0.12 }, br: { x: 0.9, y: 0.6 }, bl: { x: 0.1, y: 0.58 } };

const scene = (ratio: number, over: Partial<MockupScene> = {}): MockupScene => ({
  assetId: `a-${ratio}`, url: `https://x/${ratio}.jpg`, quad: QUAD, ratio, formatKeys: [], label: 'Board',
  width: 1600, height: 1000, title: null, ...over,
});

const row = (id: string, ratio: number, over: Record<string, unknown> = {}) => ({
  id: `s-${id}`, asset_id: id, ratio, format_keys: [], label: 'Board',
  tl_x: 0.1, tl_y: 0.1, tr_x: 0.9, tr_y: 0.12, br_x: 0.9, br_y: 0.6, bl_x: 0.1, bl_y: 0.58,
  design_assets: { id, kind: 'mockup_scene', title: 'Roadside board', storage_path: 'scenes/a b.jpg', width_px: 1600, height_px: 1000 },
  ...over,
});

beforeEach(() => { db.result = { data: [], error: null }; db.selected = []; db.from = []; db.throws = false; resetScenesCache(); });
afterEach(() => vi.unstubAllEnvs());

describe('ratio tolerance', () => {
  /*
   * sameRatio(a, b, tol) is RELATIVE: |a - b| / max(a, b) <= tol. For the
   * 48-sheet (3600 x 1800 = 2.00), 2.019 is 0.94% off (kept) and 2.021 is
   * 1.04% off (dropped). The brief's three numbers straddle the 1% line only
   * because the divisor is the larger ratio, not the format's.
   */
  it('is the relative definition the numbers below rely on', () => {
    expect(Math.abs(2.019 - 2) / Math.max(2.019, 2)).toBeLessThan(0.01);
    expect(Math.abs(2.021 - 2) / Math.max(2.021, 2)).toBeGreaterThan(0.01);
    expect(sameRatio(2.019, 2)).toBe(true);
    expect(sameRatio(2.021, 2)).toBe(false);
  });
});

describe('scenesFor', () => {
  it('uses a real 2:1 format for the board', () => {
    const f = formatOf('board-48-sheet')!;
    expect(f.w / f.h).toBe(2);
  });

  it('keeps 2.00 and 2.019 and drops 2.021 for board-48-sheet', () => {
    const kept = scenesFor('board-48-sheet', [scene(2.0), scene(2.019), scene(2.021)]);
    expect(kept.map((s) => s.ratio)).toEqual([2.0, 2.019]);
  });

  it('drops a scene whose quad is not usable', () => {
    const bowtie = { ...QUAD, tr: QUAD.br, br: QUAD.tr }; // crossed edges
    const degenerate = { tl: QUAD.tl, tr: QUAD.tl, br: QUAD.tl, bl: QUAD.tl };
    expect(scenesFor('board-48-sheet', [scene(2, { quad: bowtie }), scene(2, { quad: degenerate })])).toEqual([]);
  });

  it('keeps a scene that lists the format or lists none, and drops one that lists others', () => {
    const out = scenesFor('board-48-sheet', [
      scene(2, { assetId: 'any', formatKeys: [] }),
      scene(2, { assetId: 'yes', formatKeys: ['board-48-sheet', 'led'] }),
      scene(2, { assetId: 'no', formatKeys: ['led'] }),
    ]);
    expect(out.map((s) => s.assetId)).toEqual(['any', 'yes']);
  });

  it('offers nothing for an unknown format, and never mutates its input', () => {
    const pool = [scene(2)];
    expect(scenesFor('no-such-format', pool)).toEqual([]);
    expect(pool).toHaveLength(1);
  });
});

describe('fetchScenes', () => {
  it('returns { scenes: [], ok: false } on a Supabase error', async () => {
    db.result = { data: null, error: { message: 'permission denied' } };
    expect(await fetchScenes()).toEqual({ scenes: [], ok: false });
  });

  it('returns { scenes: [], ok: false } when the client throws', async () => {
    db.throws = true;
    expect(await fetchScenes()).toEqual({ scenes: [], ok: false });
  });

  it('is ok with no scenes while the table is empty', async () => {
    expect(await fetchScenes()).toEqual({ scenes: [], ok: true });
  });

  it('names every column (anon has column-level SELECT; * is refused) and reads only the surfaces table', async () => {
    await fetchScenes();
    expect(db.from).toEqual(['design_mockup_surfaces']);
    const cols = db.selected[0];
    expect(cols).not.toMatch(/\*/);
    for (const c of ['asset_id', 'tl_x', 'tl_y', 'tr_x', 'tr_y', 'br_x', 'br_y', 'bl_x', 'bl_y', 'ratio', 'format_keys', 'label', 'storage_path', 'title']) {
      expect(cols, c).toContain(c);
    }
  });

  it('builds the public URL from the scene storage_path and maps the corners', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co/');
    db.result = { data: [row('a1', 2)], error: null };
    const { scenes, ok } = await fetchScenes();
    expect(ok).toBe(true);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].url).toBe('https://proj.supabase.co/storage/v1/object/public/design-assets/scenes/a%20b.jpg');
    expect(scenes[0].quad).toEqual(QUAD);
    expect(scenes[0]).toMatchObject({ assetId: 'a1', ratio: 2, label: 'Board', title: 'Roadside board', width: 1600, height: 1000 });
  });

  it('skips a row that is not a mockup scene, has no file, or has no size', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    const asset = (over: Record<string, unknown>) => ({
      id: 'x', kind: 'mockup_scene', title: 't', storage_path: 'p.jpg', width_px: 10, height_px: 10, ...over,
    });
    db.result = {
      data: [
        row('ok', 2),
        row('photo', 2, { design_assets: asset({ id: 'photo', kind: 'photo' }) }),
        row('nofile', 2, { design_assets: asset({ id: 'nofile', storage_path: null }) }),
        row('nosize', 2, { design_assets: asset({ id: 'nosize', width_px: null }) }),
        row('orphan', 2, { design_assets: null }),
      ],
      error: null,
    };
    expect((await fetchScenes()).scenes.map((s) => s.assetId)).toEqual(['ok']);
  });
});

describe('the scene cache', () => {
  it('fetches once, shares the result, and refreshes only on demand', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    db.result = { data: [row('a1', 2)], error: null };
    expect(cachedScenes()).toEqual([]);
    const [a, b] = await Promise.all([loadScenes(), loadScenes()]);
    await loadScenes();
    expect(db.from).toHaveLength(1);
    expect(a).toBe(b);
    expect(cachedScenes()).toHaveLength(1);

    db.result = { data: [row('a1', 2), row('a2', 2)], error: null };
    await refreshScenes();
    expect(db.from).toHaveLength(2);
    expect(cachedScenes()).toHaveLength(2);
  });

  it('does not cache a failure, so the next ask tries again', async () => {
    db.result = { data: null, error: { message: 'down' } };
    expect((await loadScenes()).ok).toBe(false);
    db.result = { data: [], error: null };
    expect((await loadScenes()).ok).toBe(true);
    expect(db.from).toHaveLength(2);
  });
});
