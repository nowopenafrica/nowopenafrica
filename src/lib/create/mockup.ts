import { assetUrl } from '../design/assetManifest';
import { formatOf, sameRatio } from '../design/formats';
import { isUsableQuad, type Quad } from '../promote/surface';

/**
 * Mockups in Create (spec §8).
 *
 * A mockup is a licensed scene photograph with one surface in it (a quad). The
 * rendered artwork is placed onto the scene at DISPLAY time, so the template,
 * its preview and its mockup stay three separate things:
 *
 *   - an export holds the template alone (nothing here is imported by the
 *     customiser; see mockup.export.test.tsx);
 *   - a scene is offered only when its ratio matches the format's within 1%,
 *     so the artwork is never stretched to fit;
 *   - every view carries "Mockup: illustration only" (MockupView).
 *
 * The scenes live in `design_mockup_surfaces`, joined to the `design_assets`
 * row (kind mockup_scene) that holds the file. Anon reads approved scenes
 * only, and only by named column.
 */

export interface MockupScene {
  assetId: string;
  /** The public URL of the scene photograph. */
  url: string;
  /** The surface in the scene, as fractions of its width and height. */
  quad: Quad;
  /** Width over height of the SURFACE, to compare with a format's. */
  ratio: number;
  /** Formats the scene suits. Empty means any whose ratio matches. */
  formatKeys: string[];
  label: string;
  /** The scene image's pixel size: the space the homography is solved in. */
  width: number;
  height: number;
  /** The asset's title, used as the image's alt text. */
  title: string | null;
}

/** Spec §8: a mockup is offered within 1% (relative) of the format's ratio. */
export const MOCKUP_RATIO_TOLERANCE = 0.01;

/**
 * The scenes that may carry this format's artwork. `sameRatio` is relative
 * (|a - b| / max(a, b)), so for a 2:1 board 2.019 is kept and 2.021 is not.
 */
export function scenesFor(formatKey: string, scenes: MockupScene[]): MockupScene[] {
  const format = formatOf(formatKey);
  if (!format || !(format.w > 0) || !(format.h > 0)) return [];
  const target = format.w / format.h;
  return scenes.filter((s) =>
    sameRatio(s.ratio, target, MOCKUP_RATIO_TOLERANCE)
    && (s.formatKeys.length === 0 || s.formatKeys.includes(formatKey))
    && isUsableQuad(s.quad));
}

/* ── reading the scenes ───────────────────────────────────────────────── */

/*
 * Every column is named: anon has column-level SELECT on design_assets, so
 * `select=*` is refused. The surfaces table is granted whole, but is named
 * the same way so the two cannot drift. The nested select is the join through
 * design_mockup_surfaces.asset_id, under the caller's RLS (approved scenes
 * only).
 */
const SURFACE_COLUMNS = [
  'id', 'asset_id', 'ratio', 'format_keys', 'label',
  'tl_x', 'tl_y', 'tr_x', 'tr_y', 'br_x', 'br_y', 'bl_x', 'bl_y',
].join(', ');
const ASSET_COLUMNS = 'id, kind, title, storage_path, width_px, height_px';
const SELECT = `${SURFACE_COLUMNS}, design_assets(${ASSET_COLUMNS})`;

interface AssetRow {
  id: string; kind: string; title: string | null; storage_path: string | null;
  width_px: number | null; height_px: number | null;
}
interface SurfaceRow {
  asset_id: string; ratio: number; format_keys: string[] | null; label: string;
  tl_x: number; tl_y: number; tr_x: number; tr_y: number;
  br_x: number; br_y: number; bl_x: number; bl_y: number;
  design_assets: AssetRow | AssetRow[] | null;
}

/** The public URL of a scene file, through the manifest's own URL builder. */
function sceneUrl(a: AssetRow): string | null {
  if (!a.storage_path) return null;
  return assetUrl(a.id, {
    assets: [{
      id: a.id, kind: a.kind, path: a.storage_path, w: a.width_px ?? 0, h: a.height_px ?? 0,
      licence: '', attribution: null, tags: [], people: false, iconSet: null,
    }],
  });
}

function toScene(r: SurfaceRow): MockupScene | null {
  const a = Array.isArray(r.design_assets) ? r.design_assets[0] : r.design_assets;
  if (!a || a.kind !== 'mockup_scene') return null;
  const url = sceneUrl(a);
  if (!url || !(a.width_px && a.width_px > 0) || !(a.height_px && a.height_px > 0)) return null;
  return {
    assetId: r.asset_id,
    url,
    quad: {
      tl: { x: r.tl_x, y: r.tl_y }, tr: { x: r.tr_x, y: r.tr_y },
      br: { x: r.br_x, y: r.br_y }, bl: { x: r.bl_x, y: r.bl_y },
    },
    ratio: r.ratio,
    formatKeys: r.format_keys ?? [],
    label: r.label,
    width: a.width_px,
    height: a.height_px,
    title: a.title?.trim() ? a.title : null,
  };
}

/** Every approved scene. Never throws: a failed read is `ok: false` with none. */
export async function fetchScenes(): Promise<{ scenes: MockupScene[]; ok: boolean }> {
  try {
    /*
     * Imported here, not at the top: lib/supabase throws without its env vars,
     * and scenesFor / mockupScenesFor are reached from pure libraries and
     * Node scripts that must not need a database client to load.
     */
    const { supabase } = await import('../supabase');
    /* supabase-js resolves with { error }; it does not reject on a bad read. */
    const { data, error } = await supabase
      .from('design_mockup_surfaces')
      .select(SELECT)
      .order('id')
      .limit(500);
    if (error || !Array.isArray(data)) return { scenes: [], ok: false };
    const scenes = (data as unknown as SurfaceRow[]).flatMap((r) => toScene(r) ?? []);
    return { scenes, ok: true };
  } catch {
    return { scenes: [], ok: false };
  }
}

/* ── module cache: fetch once, refresh on demand ──────────────────────── */

let cache: { scenes: MockupScene[]; ok: boolean } | null = null;
let inflight: Promise<{ scenes: MockupScene[]; ok: boolean }> | null = null;
const listeners = new Set<() => void>();

const EMPTY: MockupScene[] = [];

/** What is known right now. Empty until a read has succeeded. */
export const cachedScenes = (): MockupScene[] => cache?.scenes ?? EMPTY;

/** Called when the cache changes. Returns the unsubscribe. */
export function subscribeScenes(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

async function read(): Promise<{ scenes: MockupScene[]; ok: boolean }> {
  const result = await fetchScenes();
  /* A failure is not remembered, so the next ask reads again. */
  cache = result.ok ? result : null;
  listeners.forEach((fn) => fn());
  return result;
}

/** The scenes, read once and shared; concurrent callers share one read. */
export function loadScenes(): Promise<{ scenes: MockupScene[]; ok: boolean }> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) inflight = read().finally(() => { inflight = null; });
  return inflight;
}

/** Read again, after a scene is approved or retired. */
export function refreshScenes(): Promise<{ scenes: MockupScene[]; ok: boolean }> {
  cache = null;
  inflight = read().finally(() => { inflight = null; });
  return inflight;
}

/** For tests. */
export function resetScenesCache(): void {
  cache = null;
  inflight = null;
}
