/**
 * What a template references: library assets (`asset:<id>`) and external URLs.
 *
 * The template is walked whole, every string at every depth, rather than a
 * list of known image fields: DesignTemplate has no image field yet, and a
 * check that only looks where images are expected is a check a new field
 * walks straight past (C1 must not be weakened).
 */
import type { DesignTemplate } from '../../../designTemplates';
import { ASSET_REF_PREFIX, type AssetManifest, type ManifestAsset } from '../../assetManifestTypes';

export interface FoundString { where: string; value: string }

/** Every string in the template, with the path it was found at. */
export function templateStrings(tpl: DesignTemplate): FoundString[] {
  const out: FoundString[] = [];
  const walk = (v: unknown, where: string): void => {
    if (typeof v === 'string') out.push({ where, value: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, where ? `${where}.${k}` : k);
    }
  };
  walk(tpl, '');
  return out;
}

const EXTERNAL = /^https?:\/\//i;

/** http(s) URLs anywhere in the template. None is from the library. */
export const externalUrls = (tpl: DesignTemplate): FoundString[] =>
  templateStrings(tpl).filter((s) => EXTERNAL.test(s.value.trim()));

export interface AssetRef { id: string; where: string; asset: ManifestAsset | null }

/** Every `asset:<id>` the template holds, resolved against the manifest (null when absent). */
export function assetRefs(tpl: DesignTemplate, manifest: AssetManifest): AssetRef[] {
  const byId = new Map(manifest.assets.map((a) => [a.id, a]));
  return templateStrings(tpl)
    .filter((s) => s.value.startsWith(ASSET_REF_PREFIX))
    .map((s) => {
      const id = s.value.slice(ASSET_REF_PREFIX.length);
      return { id, where: s.where, asset: byId.get(id) ?? null };
    });
}

/** Referenced icons that resolved. */
export const iconRefs = (refs: AssetRef[]): (AssetRef & { asset: ManifestAsset })[] =>
  refs.filter((r): r is AssetRef & { asset: ManifestAsset } => r.asset?.kind === 'icon');

const RASTER_EXT = /\.(webp|jpe?g|png|avif|gif)$/i;

/** A raster file, judged by its path rather than its kind: an "illustration" may be either. */
export const isRaster = (a: ManifestAsset): boolean => RASTER_EXT.test(a.path);

/** Licences that require a credit line. */
const NEEDS_ATTRIBUTION = /\bCC[-\s]?BY\b/i;

/** What a resolved asset is missing for the licensing record, or [] when complete. */
export function assetMetadataGaps(a: ManifestAsset): string[] {
  const gaps: string[] = [];
  if (!a.licence) gaps.push('licence');
  if (!a.path) gaps.push('path');
  if (!(a.w > 0) || !(a.h > 0)) gaps.push('pixel size');
  if (NEEDS_ATTRIBUTION.test(a.licence) && !a.attribution) gaps.push('attribution');
  if (a.kind === 'icon' && !a.iconSet) gaps.push('iconSet');
  return gaps;
}
