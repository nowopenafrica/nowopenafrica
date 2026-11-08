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
