/**
 * The shape of the approved-asset manifest (spec §6).
 *
 * Types only. The manifest itself, its loader and `assetById` arrive in Task 10
 * (assetManifest.ts), which imports and re-exports these so there is one
 * definition. The quality scorer (design/quality) takes a manifest as an
 * argument, so it can be tested against fixtures before the real one exists.
 *
 * Templates reference a library asset as the string `asset:<uuid>` wherever
 * they hold an image. Anything else that looks like an image source (an
 * http(s) URL) is not from the library and fails C1.
 */

export interface ManifestAsset {
  id: string;
  /** photo, illustration, vector, icon, pattern, texture, … mockup_scene (spec §6.1). */
  kind: string;
  path: string;
  /** Source pixels. */
  w: number;
  h: number;
  licence: string;
  attribution: string | null;
  tags: string[];
  people: boolean;
  /** For kind 'icon': the set it belongs to. Null otherwise. */
  iconSet: string | null;
  /** The source's own id (e.g. a Pexels photo number). Absent in manifests written before it was added. */
  sourceId?: string | null;
  /** A web-size copy (at most 1200 px), drawn in galleries. The editor and print use `path`. */
  web?: string | null;
}

export interface AssetManifest {
  assets: ManifestAsset[];
}

/** The prefix a template uses to reference a manifest asset. */
export const ASSET_REF_PREFIX = 'asset:';
