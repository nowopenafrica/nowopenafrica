/**
 * The approved-asset manifest (spec §6).
 *
 * Templates never hold an image URL. They hold `asset:<uuid>`, which resolves
 * here, through `assetManifest.json`. That file is generated from the approved
 * rows of `design_assets` by `npm run assets:manifest` and committed, so a
 * template's pictures change in review, not behind its back, and the quality
 * gate (C1) can check every reference without a network call.
 *
 * The types live in assetManifestTypes.ts so the scorer can import them
 * without pulling in the JSON; they are re-exported here.
 */
import type { DesignTemplate } from '../designTemplates';
import { ASSET_REF_PREFIX, type AssetManifest, type ManifestAsset } from './assetManifestTypes';
import { templateStrings } from './quality/checks/assets';
import raw from './assetManifest.json';

export type { AssetManifest, ManifestAsset } from './assetManifestTypes';

export const MANIFEST: AssetManifest = raw as AssetManifest;

/** The public bucket approved files are copied into (migration 20261114010000). */
export const DESIGN_ASSETS_BUCKET = 'design-assets';

export function assetById(id: string, manifest: AssetManifest = MANIFEST): ManifestAsset | null {
  return manifest.assets.find((a) => a.id === id) ?? null;
}

/**
 * The public URL of an approved asset, or null when the id is unknown or no
 * Supabase URL is configured. Built from VITE_SUPABASE_URL at call time, so
 * nothing about today's host is stored in a template or the manifest.
 */
export function assetUrl(id: string, manifest: AssetManifest = MANIFEST): string | null {
  const asset = assetById(id, manifest);
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  if (!asset || !base) return null;
  const path = asset.path.split('/').map(encodeURIComponent).join('/');
  return `${base}/storage/v1/object/public/${DESIGN_ASSETS_BUCKET}/${path}`;
}

/** Every `asset:<id>` a template holds, once each, in the order first found. */
export function templateAssetIds(tpl: DesignTemplate): string[] {
  const ids = templateStrings(tpl)
    .filter((s) => s.value.startsWith(ASSET_REF_PREFIX))
    .map((s) => s.value.slice(ASSET_REF_PREFIX.length));
  return [...new Set(ids)];
}

export interface MissingAssetRef { template: string; id: string }

/** References that do not resolve, each naming the template that holds it. */
export function missingAssetRefs(
  templates: readonly DesignTemplate[],
  manifest: AssetManifest = MANIFEST,
): MissingAssetRef[] {
  const known = new Set(manifest.assets.map((a) => a.id));
  return templates.flatMap((t) =>
    templateAssetIds(t).filter((id) => !known.has(id)).map((id) => ({ template: t.key, id })));
}
