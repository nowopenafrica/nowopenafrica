import { afterEach, describe, expect, it, vi } from 'vitest';

import { DESIGN_TEMPLATES, type DesignTemplate } from '../designTemplates';
import {
  MANIFEST, assetById, assetUrl, missingAssetRefs, templateAssetIds,
  type AssetManifest, type ManifestAsset,
} from './assetManifest';
import { externalUrls } from './quality/checks/assets';

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

  it('ships a manifest that is a well-formed list', () => {
    expect(Array.isArray(MANIFEST.assets)).toBe(true);
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
