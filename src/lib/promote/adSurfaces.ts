/**
 * Surfaces a person has marked on a real placement photograph.
 *
 * ── WHAT THIS CHANGES ────────────────────────────────────────────────────
 *
 * Without it, a preview can only use a DRAWN scene, and every preview has
 * to say "illustrative" because it is. With it, a placement whose corners
 * somebody has marked previews on its own photograph — the actual board, on
 * the actual road — and the caveat can honestly come off.
 *
 * The record is four corners as fractions, which is the same `Quad` the
 * drawn scenes use. So the renderer does not change at all: it solves the
 * same homography either way, and the two cannot drift apart.
 *
 * ── WHY THE IMAGE URL IS STORED, NOT FOLLOWED ────────────────────────────
 *
 * Corners are only correct for the picture they were drawn on. If a media
 * owner swaps the advert's photograph, the stored corners now describe a
 * board that is not there — so the row remembers which image it belongs to
 * and `isStale` says when they no longer match.
 */

import { supabase } from '../supabase';
import { isUsableQuad, type Quad } from './surface';

export type SurfaceStatus = 'draft' | 'published';

export interface AdSurface {
  id: string;
  advertId: string;
  imageUrl: string;
  quad: Quad;
  note: string | null;
  status: SurfaceStatus;
}

/** The shape the table stores, flat because SQL has no nested columns. */
export interface SurfaceRow {
  id: string;
  advert_id: string;
  image_url: string;
  tl_x: number; tl_y: number;
  tr_x: number; tr_y: number;
  br_x: number; br_y: number;
  bl_x: number; bl_y: number;
  note: string | null;
  status: SurfaceStatus;
}

export const COLUMNS = 'id,advert_id,image_url,tl_x,tl_y,tr_x,tr_y,br_x,br_y,bl_x,bl_y,note,status';

const n = (v: unknown): number => {
  const parsed = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function toSurface(row: SurfaceRow): AdSurface {
  return {
    id: String(row.id),
    advertId: String(row.advert_id),
    imageUrl: String(row.image_url ?? ''),
    quad: {
      tl: { x: n(row.tl_x), y: n(row.tl_y) },
      tr: { x: n(row.tr_x), y: n(row.tr_y) },
      br: { x: n(row.br_x), y: n(row.br_y) },
      bl: { x: n(row.bl_x), y: n(row.bl_y) },
    },
    note: row.note ?? null,
    status: row.status === 'published' ? 'published' : 'draft',
  };
}

/** The flat columns a quad writes to. */
export const quadColumns = (q: Quad) => ({
  tl_x: q.tl.x, tl_y: q.tl.y,
  tr_x: q.tr.x, tr_y: q.tr.y,
  br_x: q.br.x, br_y: q.br.y,
  bl_x: q.bl.x, bl_y: q.bl.y,
});

/**
 * Do these corners still describe the picture they were drawn on?
 *
 * A media owner replacing the photograph does not touch this table, so the
 * only way to notice is to compare. Stale corners are not shown — a board
 * marked on a different picture is somebody's advert on the wrong wall.
 */
export const isStale = (surface: AdSurface, currentImage: string | null | undefined): boolean =>
  Boolean(currentImage) && surface.imageUrl !== currentImage;

/**
 * Is this worth publishing?
 *
 * Convex, and big enough to be a board rather than a slip of the mouse. A
 * surface covering a fiftieth of the picture is almost certainly a stray
 * click, and publishing it would put an advert on a lamppost.
 */
export function isPublishable(quad: Quad): { ok: true } | { ok: false; why: string } {
  if (!isUsableQuad(quad)) {
    return { ok: false, why: 'The four corners cross over each other. Drag them so they form a simple shape.' };
  }
  const xs = [quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x];
  const ys = [quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y];
  const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  if (area < 0.02) {
    return { ok: false, why: 'That surface is tiny — under 2% of the photograph. Check the corners are on the board.' };
  }
  return { ok: true };
}

export type SurfaceRead =
  | { state: 'ready'; surface: AdSurface | null }
  /** The read failed. NEVER rendered as "no surface configured". */
  | { state: 'unavailable'; reason: string };

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

/**
 * The published surface for one placement, if a person has marked one.
 *
 * Three outcomes, not two. A failed read that looks like "none configured"
 * sends somebody to re-mark a board that was already done, and the drawn
 * scene they get in the meantime is captioned as though it were the best
 * available — which it would not be.
 */
export async function fetchSurface(advertId: string): Promise<SurfaceRead> {
  if (!advertId) return { state: 'ready', surface: null };

  const { data, error } = await supabase
    .from('ad_mockup_surfaces')
    .select(COLUMNS)
    .eq('advert_id', advertId)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    return {
      state: 'unavailable',
      reason: MISSING_TABLE.has(error.code ?? '')
        ? 'Site previews are not switched on yet.'
        : 'We could not check for a site preview just now.',
    };
  }

  return { state: 'ready', surface: data ? toSurface(data as unknown as SurfaceRow) : null };
}

/** Every surface, for the staff screen. Drafts included. */
export async function fetchAllSurfaces(): Promise<Map<string, AdSurface>> {
  const { data, error } = await supabase
    .from('ad_mockup_surfaces')
    .select(COLUMNS)
    .limit(1000);

  if (error || !data) return new Map();
  return new Map((data as unknown as SurfaceRow[]).map((r) => {
    const s = toSurface(r);
    return [s.advertId, s];
  }));
}

/** A sensible starting rectangle, so nobody drags from a single point. */
export const DEFAULT_QUAD: Quad = {
  tl: { x: 0.25, y: 0.3 },
  tr: { x: 0.75, y: 0.3 },
  br: { x: 0.75, y: 0.7 },
  bl: { x: 0.25, y: 0.7 },
};
