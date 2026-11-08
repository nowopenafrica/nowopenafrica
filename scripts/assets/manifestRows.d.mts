/** Types for manifestRows.mjs, so a test in src/ can import it under `strict`. */
export interface DesignAssetRow {
  id: string;
  kind: string;
  storage_path: string;
  width_px?: number | null;
  height_px?: number | null;
  licence_key: string;
  attribution_text?: string | null;
  tags?: string[] | null;
  contains_people?: boolean | null;
  icon_set?: string | null;
}
export const RASTER_KINDS: string[];
export function rowProblem(r: DesignAssetRow): string | null;
export function toManifestAsset(r: DesignAssetRow): {
  id: string; kind: string; path: string; w: number; h: number; licence: string;
  attribution: string | null; tags: string[]; people: boolean; iconSet: string | null;
};
export function partitionRows(rows: DesignAssetRow[]): { ok: DesignAssetRow[]; skipped: { id: string; problem: string }[] };
export function serialise(rows: DesignAssetRow[]): string;
export function totalFromContentRange(header: string | null | undefined): number | null;
export function nextPageDecision(a: {
  page: { id: string }[]; prevFirstId?: string | null; got: number; total?: number | null; iteration: number; pageSize: number;
}): { action: 'continue' | 'done' } | { action: 'error'; reason: string };
export function mayWrite(skipped: unknown[]): boolean;
