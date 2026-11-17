// Pure row -> manifest mapping for scripts/assets/manifest.mjs, kept separate
// so it can be tested (see manifestRows.d.mts for the types).

/** Kinds drawn from pixels: a missing or zero size makes them unusable. */
export const RASTER_KINDS = ['photo', 'illustration', 'texture', 'pattern', 'mockup_scene', 'device_frame', 'overlay'];

/** Why a row cannot enter the manifest, or null when it can. */
export function rowProblem(r) {
  if (RASTER_KINDS.includes(r.kind) && !(r.width_px > 0 && r.height_px > 0)) {
    return `${r.kind} has no pixel size (width_px=${r.width_px ?? 'null'}, height_px=${r.height_px ?? 'null'})`;
  }
  return null;
}

/** A manifest entry from a design_assets row (ManifestAsset in assetManifestTypes.ts). */
export const toManifestAsset = (r) => ({
  id: r.id,
  kind: r.kind,
  path: r.storage_path,
  w: r.width_px ?? 0,
  h: r.height_px ?? 0,
  licence: r.licence_key,
  attribution: r.attribution_text ?? null,
  tags: [...(r.tags ?? [])],
  people: r.contains_people === true,
  iconSet: r.icon_set ?? null,
  /* The source's own id (a Pexels photo number), so code can find an approved copy of a known photo. */
  sourceId: r.source_asset_id ?? null,
});

/** Splits rows into those that can enter the manifest and those refused (with reasons). */
export function partitionRows(rows) {
  const ok = [];
  const skipped = [];
  for (const r of rows) {
    const problem = rowProblem(r);
    if (problem) skipped.push({ id: r.id, problem });
    else ok.push(r);
  }
  return { ok, skipped };
}

/** Sorted by id, two-space JSON, LF endings, trailing newline. */
export function serialise(rows) {
  const assets = rows.map(toManifestAsset).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return `${JSON.stringify({ assets }, null, 2)}\n`;
}

/** The total from a PostgREST Content-Range header ("0-999/1234" or "star/0"), or null when absent. */
export function totalFromContentRange(header) {
  const m = /\/(\d+)\s*$/.exec(header ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * What to do after one page of a Range-paged read.
 *
 * `got` is the rows held after adding this page, `iteration` the pages fetched
 * so far (1 for the first), `total` the count from Content-Range (or null).
 * `rangeNotSatisfiable` reports an HTTP 416 (page is then empty): that is the
 * end of the table only if every row has already arrived.
 * Returns {action: 'continue' | 'done'} or {action: 'error', reason}. Bounded
 * so a server that ignores Range and replays the table cannot loop forever:
 * every non-empty page adds at least one row, so more than total + 1 pages
 * cannot be legitimate whatever page size the server serves.
 */
export function nextPageDecision({ page, prevFirstId = null, got, total = null, iteration, rangeNotSatisfiable = false }) {
  if (total === 0) return { action: 'done' };
  if (rangeNotSatisfiable) {
    return total !== null && got >= total
      ? { action: 'done' }
      : { action: 'error', reason: `range not satisfiable before all rows arrived (${got} of ${total ?? 'unknown'})` };
  }
  if (page.length === 0) {
    return total !== null && got < total
      ? { action: 'error', reason: `server returned an empty page after ${got} of ${total} rows` }
      : { action: 'done' };
  }
  if (prevFirstId !== null && page[0].id === prevFirstId) {
    return { action: 'error', reason: 'the server repeated a page: it is ignoring the Range header' };
  }
  if (total !== null && got >= total) return { action: 'done' };
  const limit = total === null ? 1000 : total + 1;
  if (iteration >= limit) return { action: 'error', reason: `still paging after ${iteration} pages (limit ${limit})` };
  return { action: 'continue' };
}

/** Whether the manifest may be written: only when no row was refused. */
export const mayWrite = (skipped) => skipped.length === 0;
