import manifestSource from '../../../scripts/assets/manifest.mjs?raw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import {
  MANIFEST, assetById, assetUrl, missingAssetRefs, templateAssetIds,
  type AssetManifest, type ManifestAsset,
} from './assetManifest';
import { externalUrls } from './quality/checks/assets';
import { automatedCriticals } from './quality/critical';
import {
  mayWrite, nextPageDecision, partitionRows, serialise, toManifestAsset, totalFromContentRange,
} from '../../../scripts/assets/manifestRows.mjs';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

const asset = (id: string, over: Partial<ManifestAsset> = {}): ManifestAsset => ({
  id, kind: 'photo', path: `photos/${id}.webp`, w: 1600, h: 900, licence: 'pexels',
  attribution: null, tags: [], people: false, iconSet: null, ...over,
});

const FIXTURE: AssetManifest = { assets: [asset(ID_A), asset(ID_B)] };

/** A template that references assets in a nested slot and a top-level field. */
const withRefs = (key: string, ...ids: string[]): DesignTemplate => ({
  ...DESIGN_TEMPLATES[0],
  key,
  // Not a real DesignTemplate field: the walker reads every string at any depth.
  ...({ hero: `asset:${ids[0]}`, nested: { pics: ids.slice(1).map((i) => `asset:${i}`) } } as object),
});

afterEach(() => vi.unstubAllEnvs());

describe('lookup', () => {
  it('finds an asset by id and returns null for an unknown one', () => {
    expect(assetById(ID_A, FIXTURE)?.id).toBe(ID_A);
    expect(assetById('nope', FIXTURE)).toBeNull();
  });

  it('ships a manifest whose entries have the right field types', () => {
    expect(Array.isArray(MANIFEST.assets)).toBe(true);
    for (const a of MANIFEST.assets) {
      expect(typeof a.id, a.id).toBe('string');
      expect(typeof a.kind, a.id).toBe('string');
      expect(typeof a.path, a.id).toBe('string');
      expect(typeof a.w, a.id).toBe('number');
      expect(typeof a.h, a.id).toBe('number');
      expect(typeof a.licence, a.id).toBe('string');
      expect(a.attribution === null || typeof a.attribution === 'string', a.id).toBe(true);
      expect(Array.isArray(a.tags) && a.tags.every((x) => typeof x === 'string'), a.id).toBe(true);
      expect(typeof a.people, a.id).toBe('boolean');
      expect(a.iconSet === null || typeof a.iconSet === 'string', a.id).toBe(true);
    }
  });
});

describe('assetUrl', () => {
  it('builds the public design-assets URL from the Supabase URL', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co/');
    expect(assetUrl(ID_A, FIXTURE)).toBe(`https://example.supabase.co/storage/v1/object/public/design-assets/photos/${ID_A}.webp`);
  });

  it('is null for an unknown id, and when no Supabase URL is configured', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    expect(assetUrl('nope', FIXTURE)).toBeNull();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(assetUrl(ID_A, FIXTURE)).toBeNull();
  });

  it('encodes path segments but keeps the slashes', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.test');
    const m = { assets: [asset(ID_A, { path: 'icons/a b/c.svg' })] };
    expect(assetUrl(ID_A, m)).toBe('https://x.test/storage/v1/object/public/design-assets/icons/a%20b/c.svg');
  });
});

describe('templateAssetIds', () => {
  it('lists every asset: reference at any depth, once each, in order', () => {
    expect(templateAssetIds(withRefs('t', ID_A, ID_B, ID_A))).toEqual([ID_A, ID_B]);
  });

  it('is empty for a template that references none', () => {
    expect(templateAssetIds(DESIGN_TEMPLATES[0])).toEqual([]);
  });
});

describe('every referenced id resolves', () => {
  it('passes when all are present', () => {
    expect(missingAssetRefs([withRefs('t', ID_A, ID_B)], FIXTURE)).toEqual([]);
  });

  it('names the template and the id when one is removed', () => {
    const without: AssetManifest = { assets: FIXTURE.assets.filter((a) => a.id !== ID_B) };
    expect(missingAssetRefs([withRefs('keeps-a', ID_A), withRefs('needs-b', ID_A, ID_B)], without))
      .toEqual([{ template: 'needs-b', id: ID_B }]);
  });

  it('holds for every shipped template against the shipped manifest', () => {
    expect(missingAssetRefs(DESIGN_TEMPLATES, MANIFEST)).toEqual([]);
  });
});

describe('no external image URLs in templates', () => {
  /**
   * Today's 8 previewMedia.ts Pexels photos are injected by the gallery at
   * render time; no template stores them (Task 6). The allowlist is therefore
   * empty. Task 17 removes the injection.
   */
  const ALLOWED: readonly string[] = [];

  it('holds no http(s) image URL, outside the allowlist', () => {
    const found = DESIGN_TEMPLATES.flatMap((t) =>
      externalUrls(t).filter((u) => !ALLOWED.includes(u.value)).map((u) => `${t.key} ${u.where}: ${u.value}`));
    expect(found).toEqual([]);
  });
});

describe('C11: no mockup_scene baked into a template', () => {
  const SCENE = '33333333-3333-4333-8333-333333333333';
  const withScene: AssetManifest = { assets: [asset(SCENE, { kind: 'mockup_scene' }), asset(ID_A)] };

  it('flags a template that references a mockup_scene asset', () => {
    const tpl = withRefs('bakes-scene', SCENE);
    const c11 = automatedCriticals(tpl, [tpl], withScene).filter((f) => f.code === 'C11');
    expect(c11).toHaveLength(1);
    expect(c11[0].detail).toContain(SCENE);
  });

  it('does not flag an ordinary photo', () => {
    const tpl = withRefs('plain', ID_A);
    expect(automatedCriticals(tpl, [tpl], withScene).filter((f) => f.code === 'C11')).toEqual([]);
  });

  it('holds for the whole shipped library', () => {
    const baked = DESIGN_TEMPLATES.flatMap((t) => templateAssetIds(t)
      .filter((id) => assetById(id)?.kind === 'mockup_scene').map((id) => `${t.key}: ${id}`));
    expect(baked).toEqual([]);
  });
});

describe('manifest generator rows', () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id, kind: 'photo', storage_path: `p/${id}.webp`, width_px: 100, height_px: 50, licence_key: 'pexels',
    attribution_text: 'Credit', tags: ['a'], contains_people: true, icon_set: null, ...over,
  });

  it('sorts unsorted rows by id', () => {
    const out = JSON.parse(serialise([row('c'), row('a'), row('b')])) as AssetManifest;
    expect(out.assets.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('maps nulls to [] or null and people to a boolean', () => {
    const a = toManifestAsset(row('x', { tags: null, attribution_text: null, icon_set: null, contains_people: null }));
    expect(a).toMatchObject({ tags: [], attribution: null, iconSet: null, people: false, sourceId: null });
    expect(toManifestAsset(row('y', { source_asset_id: '17952748' })).sourceId).toBe('17952748');
    expect(toManifestAsset(row('y', { contains_people: true })).people).toBe(true);
    expect(toManifestAsset(row('z', { icon_set: 'lucide', kind: 'icon' })).iconSet).toBe('lucide');
  });

  it('ends with a newline and has no carriage return', () => {
    const s = serialise([row('a')]);
    expect(s.endsWith('\n')).toBe(true);
    expect(s).not.toContain('\r');
  });

  it('refuses raster rows with a null or zero size and keeps vectors', () => {
    const { ok, skipped } = partitionRows([
      row('nullw', { width_px: null }), row('zeroh', { height_px: 0 }),
      row('svg', { kind: 'icon', width_px: null, height_px: null }), row('fine'),
    ]);
    expect(ok.map((r) => r.id)).toEqual(['svg', 'fine']);
    expect(skipped.map((s) => s.id)).toEqual(['nullw', 'zeroh']);
    expect(skipped[0].problem).toMatch(/no pixel size/);
  });
});

describe('paging decisions', () => {
  const pg = (...ids: string[]) => ids.map((id) => ({ id }));

  it('reads the total from Content-Range', () => {
    expect(totalFromContentRange('0-999/2500')).toBe(2500);
    expect(totalFromContentRange('*/0')).toBe(0);
    expect(totalFromContentRange(null)).toBeNull();
  });

  it('continues through a normal multi-page read, then stops at the total', () => {
    expect(nextPageDecision({ page: pg('a'), got: 1000, total: 2500, iteration: 1 })).toEqual({ action: 'continue' });
    expect(nextPageDecision({ page: pg('b'), prevFirstId: 'a', got: 2000, total: 2500, iteration: 2 })).toEqual({ action: 'continue' });
    expect(nextPageDecision({ page: pg('c'), prevFirstId: 'b', got: 2500, total: 2500, iteration: 3 })).toEqual({ action: 'done' });
  });

  it('keeps going when the server max-rows is below the page size', () => {
    expect(nextPageDecision({ page: pg('a'), got: 100, total: 250, iteration: 1 })).toEqual({ action: 'continue' });
    expect(nextPageDecision({ page: pg('b'), prevFirstId: 'a', got: 200, total: 250, iteration: 2 })).toEqual({ action: 'continue' });
  });

  it('errors when Range is ignored and the same page comes back', () => {
    expect(nextPageDecision({ page: pg('a'), prevFirstId: 'a', got: 2000, total: 5000, iteration: 2 }).action).toBe('error');
  });

  it('errors past total + 1 pages even with distinct ids', () => {
    expect(nextPageDecision({ page: pg('z'), prevFirstId: 'y', got: 2, total: 5000, iteration: 5001 }).action).toBe('error');
  });

  it('does not trip when the served page size shrinks, as long as rows keep arriving', () => {
    expect(nextPageDecision({ page: pg('c'), prevFirstId: 'b', got: 12, total: 40, iteration: 3 })).toEqual({ action: 'continue' });
    expect(nextPageDecision({ page: pg('k'), prevFirstId: 'j', got: 39, total: 40, iteration: 30 })).toEqual({ action: 'continue' });
  });

  it('treats a 416 as the end only when every row has arrived', () => {
    expect(nextPageDecision({ page: [], got: 250, total: 250, iteration: 2, rangeNotSatisfiable: true })).toEqual({ action: 'done' });
    const d = nextPageDecision({ page: [], got: 100, total: 250, iteration: 2, rangeNotSatisfiable: true });
    expect(d).toMatchObject({ action: 'error' });
    expect(d.action === 'error' && d.reason).toMatch(/range not satisfiable before all rows arrived/);
    expect(nextPageDecision({ page: [], got: 100, total: null, iteration: 2, rangeNotSatisfiable: true }).action).toBe('error');
  });

  it('is done at once for a total of 0, and errors on a premature empty page', () => {
    expect(nextPageDecision({ page: [], got: 0, total: 0, iteration: 1 })).toEqual({ action: 'done' });
    expect(nextPageDecision({ page: [], got: 10, total: 50, iteration: 2 }).action).toBe('error');
  });
});

describe('all-or-nothing writing', () => {
  const r = (id: string, over: Record<string, unknown> = {}) => ({
    id, kind: 'photo', storage_path: 'p', width_px: 10, height_px: 10, licence_key: 'l', ...over,
  });

  it('allows a write only when no row is refused', () => {
    expect(mayWrite(partitionRows([r('a'), r('b')]).skipped)).toBe(true);
    const { skipped } = partitionRows([r('a'), r('bad', { width_px: null })]);
    expect(skipped.map((s) => s.id)).toEqual(['bad']);
    expect(mayWrite(skipped)).toBe(false);
  });

  it('the script writes only behind that check', () => {
    const src = manifestSource;
    const guard = src.indexOf('if (!mayWrite(skipped))');
    const write = src.indexOf('writeFileSync(OUT');
    expect(guard).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(guard);
    expect(src.slice(guard, write)).toContain('throw new Error');
  });
});
