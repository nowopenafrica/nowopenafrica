// Pure helpers for scripts/assets/intake.mjs, kept separate so they can be
// tested (see intake-lib.d.mts for the types, src/lib/design/intake.test.ts
// for the tests). No network, no environment, no writes: everything here takes
// values in and gives values out. The only I/O-adjacent imports are node:crypto
// and node:zlib.
//
// What the intake guards, in the order a row meets it (spec sections 6.1, 6.3):
//   - a licence that is not one of the seeded keys (so no Canva, Freepik or
//     unknown source can be recorded at all);
//   - evidence of the licence, which must be a file;
//   - sources the spec bans: canva.com, freepik.com, and the Unsplash API;
//   - kinds, mimes and industries the schema does not know;
//   - contains_brands, which can never be approved, so it is refused here;
//   - an SVG with anything outside the allowlist (validateLibrarySvg refuses,
//     it never repairs: Ruling V).

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { validateLibrarySvg } from '../../src/lib/studio/svgSanitise.mjs';

export { validateLibrarySvg };

/** design_assets.kind CHECK, from the migration. */
export const KINDS = [
  'photo', 'illustration', 'vector', 'icon', 'pattern', 'texture',
  'gradient', 'frame', 'mask', 'shape', 'chart', 'map', 'badge',
  'device_frame', 'overlay', 'mockup_scene',
];

/**
 * Industry values: the category group names from src/data/categories.ts
 * (INDUSTRY_GROUPS in src/lib/design/taxonomy.ts). A .mjs cannot import TS, so
 * the list is copied here and intake.test.ts asserts it equals INDUSTRY_GROUPS.
 */
export const ALLOWED_INDUSTRIES = [
  'Food & Hospitality',
  'Retail & Commerce',
  'Technology & Media',
  'Health & Wellness',
  'Professional Services',
  'Trades & Industry',
  'Home & Personal Services',
  'Education & Community',
  'Arts & Entertainment',
  'Fashion & Beauty',
  'Local & Everyday Business',
  'Logistics & Mobility',
];

/** Extension -> mime. Fonts are not library assets (Ruling S). */
export const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/** The bucket's file_size_limit. */
export const MAX_BYTES = 26214400;

export const CSV_COLUMNS = [
  'file', 'kind', 'title', 'description', 'tags', 'subjects', 'industries', 'regions',
  'source_name', 'source_url', 'source_asset_id', 'creator_name', 'creator_url', 'licence_key',
  'evidence_file', 'attribution_text', 'restrictions', 'contains_people', 'contains_brands',
  'release_on_file',
];

const BANNED_HOSTS = ['canva.com', 'freepik.com'];

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export const extOf = (name) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name ?? '').trim());
  return m ? m[1].toLowerCase() : '';
};

/** The 12 licence keys the migration seeds, read from its SQL text. */
export function seededLicenceKeys(sql) {
  const start = sql.indexOf('INSERT INTO public.design_asset_licences');
  if (start < 0) return [];
  const end = sql.indexOf('ON CONFLICT', start);
  const block = sql.slice(start, end < 0 ? undefined : end);
  return [...block.matchAll(/^\s*\('([a-z0-9][a-z0-9.-]*)'\s*,/gm)].map((m) => m[1]);
}

/* ── CSV ──────────────────────────────────────────────────────────────────── */

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF, optional BOM. */
export function parseCsv(text) {
  const src = String(text).replace(/^\ufeff/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  if (rows.length === 0) return { header: [], rows: [] };
  const header = rows[0].map((h) => h.trim());
  return {
    header,
    rows: rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()]))),
  };
}

/* ── one CSV row ──────────────────────────────────────────────────────────── */

const list = (s) => String(s ?? '').split(';').map((x) => x.trim()).filter(Boolean);
const text = (s) => { const t = String(s ?? '').trim(); return t === '' ? null : t; };

function bool(s, name) {
  const t = String(s ?? '').trim().toLowerCase();
  if (t === '' || ['false', 'no', 'n', '0'].includes(t)) return { v: false };
  if (['true', 'yes', 'y', '1'].includes(t)) return { v: true };
  return { error: `${name} must be true or false (got "${s}")` };
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

const onHost = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/**
 * Validate one CSV row against the schema and the sourcing rules.
 * Returns { ok: true, value } or { ok: false, reason }.
 */
export function parseRow(row, licenceKeys) {
  const fail = (reason) => ({ ok: false, reason });
  const get = (k) => String(row?.[k] ?? '').trim();

  const file = get('file');
  if (!file) return fail('file is empty');
  const ext = extOf(file);
  const mime = MIME_BY_EXT[ext];
  if (!mime) return fail(`file "${file}" is not PNG, JPEG, WebP or SVG (fonts and other types are not library assets)`);

  const kind = get('kind');
  if (!KINDS.includes(kind)) return fail(`kind "${kind}" is not one of: ${KINDS.join(', ')}`);

  const title = get('title');
  if (!title) return fail('title is empty');

  const sourceName = get('source_name');
  if (!sourceName) return fail('source_name is empty');
  if (/canva|freepik/i.test(sourceName)) return fail(`source_name "${sourceName}": Canva and Freepik content cannot be used`);
  if (/unsplash\s*api/i.test(sourceName)) {
    return fail('Unsplash API is not allowed: Unsplash is manual download only (spec 6.3); set source_name to "Unsplash"');
  }

  const sourceUrl = text(get('source_url'));
  if (sourceUrl) {
    const host = hostOf(sourceUrl);
    if (host === null) return fail(`source_url "${sourceUrl}" is not a valid URL`);
    for (const d of BANNED_HOSTS) {
      if (onHost(host, d)) return fail(`source_url is on ${d}: Canva and Freepik content cannot be used`);
    }
    if (host === 'api.unsplash.com') return fail('Unsplash API is not allowed: Unsplash is manual download only (spec 6.3)');
  }

  const licenceKey = get('licence_key');
  if (!licenceKey || !licenceKeys.includes(licenceKey)) {
    return fail(`licence_key "${licenceKey}" is not an accepted licence (${licenceKeys.join(', ')})`);
  }

  const evidenceFile = get('evidence_file');
  if (!evidenceFile) return fail('evidence_file is missing: every asset needs proof of its licence');
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(extOf(evidenceFile))) {
    return fail(`evidence_file "${evidenceFile}" must be a PNG, JPEG or WebP image (the intake bucket takes images only)`);
  }

  const industries = list(get('industries'));
  const badIndustry = industries.find((i) => !ALLOWED_INDUSTRIES.includes(i));
  if (badIndustry) return fail(`industry "${badIndustry}" is not a category group (${ALLOWED_INDUSTRIES.join('; ')})`);

  const regions = list(get('regions')).map((r) => r.toUpperCase());
  const badRegion = regions.find((r) => !/^[A-Z]{2}$/.test(r));
  if (badRegion) return fail(`region "${badRegion}" is not a two-letter country code`);

  let retrievedAt = null;
  const rawRetrieved = get('retrieved_at');
  if (rawRetrieved) {
    const t = Date.parse(rawRetrieved);
    if (!/^\d{4}-\d{2}-\d{2}/.test(rawRetrieved) || Number.isNaN(t)) return fail(`retrieved_at "${rawRetrieved}" is not an ISO date`);
    retrievedAt = new Date(t).toISOString();
  }

  const people = bool(get('contains_people'), 'contains_people');
  if (people.error) return fail(people.error);
  const brands = bool(get('contains_brands'), 'contains_brands');
  if (brands.error) return fail(brands.error);
  const release = bool(get('release_on_file'), 'release_on_file');
  if (release.error) return fail(release.error);
  if (brands.v) return fail('contains_brands is true: an asset showing third-party brands can never be approved, so it is refused at intake');

  /*
   * People with no release on file can only ever be approved carrying the
   * no-endorsement tag (design_assets_people_no_release_tagged). The licence's
   * condition is what the tag records, so intake adds it rather than leaving
   * every such row to be refused at review.
   */
  const tags = list(get('tags'));
  if (people.v && !release.v && !tags.includes('no-endorsement')) tags.push('no-endorsement');

  return {
    ok: true,
    value: {
      file, ext, mime, kind, title,
      description: text(get('description')),
      tags,
      subjects: list(get('subjects')),
      industries,
      regions,
      source_name: sourceName,
      source_url: sourceUrl,
      source_asset_id: text(get('source_asset_id')),
      creator_name: text(get('creator_name')),
      creator_url: text(get('creator_url')),
      licence_key: licenceKey,
      evidence_file: evidenceFile,
      attribution_text: text(get('attribution_text')),
      restrictions: text(get('restrictions')),
      contains_people: people.v,
      contains_brands: false,
      release_on_file: release.v,
      retrieved_at: retrievedAt,
    },
  };
}

/* ── measuring files ──────────────────────────────────────────────────────── */

const hex2 = (n) => n.toString(16).padStart(2, '0');

/**
 * The most common colours of an RGBA buffer: 4 bits per channel, counted,
 * sorted by count (ties by hex), as lowercase #rrggbb. Mostly transparent
 * pixels (alpha < 128) are ignored.
 */
export function dominantColours(rgba, n = 5) {
  const counts = new Map();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const hex = (key) => `#${hex2(((key >> 8) & 15) * 17)}${hex2(((key >> 4) & 15) * 17)}${hex2((key & 15) * 17)}`;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (hex(a[0]) < hex(b[0]) ? -1 : 1))
    .slice(0, n)
    .map(([key]) => hex(key));
}

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** Decodes an 8-bit, non-interlaced PNG to sampled RGBA; null when it cannot. */
function decodePng(buf, width, height) {
  if (buf.length < 33 || !PNG_SIG.every((b, i) => buf[i] === b)) return null;
  const depth = buf[24];
  const colourType = buf[25];
  const interlace = buf[28];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colourType];
  if (depth !== 8 || interlace !== 0 || !channels) return null;
  if (width * height > 100_000_000 || width > 30000 || height > 30000) return null;

  const idat = [];
  let plte = null;
  for (let p = 8; p + 8 <= buf.length;) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    else if (type === 'PLTE') plte = buf.subarray(p + 8, p + 8 + len);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (idat.length === 0 || (colourType === 3 && !plte)) return null;

  const stride = width * channels;
  let raw;
  try { raw = inflateSync(Buffer.concat(idat), { maxOutputLength: (stride + 1) * height }); } catch { return null; }
  if (raw.length < (stride + 1) * height) return null;

  // Un-filter row by row, keeping only the previous row.
  let prev = Buffer.alloc(stride);
  let cur = Buffer.alloc(stride);
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 250_000)));
  const out = [];
  for (let y = 0; y < height; y += 1) {
    const at = y * (stride + 1);
    const filter = raw[at];
    for (let x = 0; x < stride; x += 1) {
      const v = raw[at + 1 + x];
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) return null;
      cur[x] = (v + add) & 255;
    }
    if (y % step === 0) {
      for (let x = 0; x < width; x += step) {
        const o = x * channels;
        if (colourType === 6) out.push(cur[o], cur[o + 1], cur[o + 2], cur[o + 3]);
        else if (colourType === 2) out.push(cur[o], cur[o + 1], cur[o + 2], 255);
        else if (colourType === 0) out.push(cur[o], cur[o], cur[o], 255);
        else if (colourType === 4) out.push(cur[o], cur[o], cur[o], cur[o + 1]);
        else out.push(plte[cur[o] * 3] ?? 0, plte[cur[o] * 3 + 1] ?? 0, plte[cur[o] * 3 + 2] ?? 0, 255);
      }
    }
    [prev, cur] = [cur, prev];
  }
  return Uint8Array.from(out);
}

function pngInfo(buf) {
  if (buf.length < 33 || !PNG_SIG.every((b, i) => buf[i] === b) || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!(width > 0 && height > 0)) return null;
  const rgba = decodePng(buf, width, height);
  return { width, height, colours: rgba ? dominantColours(rgba) : [] };
}

function jpegInfo(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let p = 2;
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff) return null;
    const marker = buf[p + 1];
    if (marker === 0xff) { p += 1; continue; } // fill byte
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { p += 2; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (p + 9 > buf.length) return null;
      const height = buf.readUInt16BE(p + 5);
      const width = buf.readUInt16BE(p + 7);
      return width > 0 && height > 0 ? { width, height, colours: [] } : null;
    }
    p += 2 + buf.readUInt16BE(p + 2);
  }
  return null;
}

function webpInfo(buf) {
  if (buf.length < 25 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('latin1', 12, 16);
  const d = 20;
  let width; let height;
  if ((kind === 'VP8 ' || kind === 'VP8X') && buf.length < d + 10) return null;
  if (kind === 'VP8 ') {
    if (buf[d + 3] !== 0x9d || buf[d + 4] !== 0x01 || buf[d + 5] !== 0x2a) return null;
    width = buf.readUInt16LE(d + 6) & 0x3fff;
    height = buf.readUInt16LE(d + 8) & 0x3fff;
  } else if (kind === 'VP8L') {
    if (buf[d] !== 0x2f) return null;
    const bits = buf.readUInt32LE(d + 1);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (kind === 'VP8X') {
    width = buf.readUIntLE(d + 4, 3) + 1;
    height = buf.readUIntLE(d + 7, 3) + 1;
  } else return null;
  return width > 0 && height > 0 ? { width, height, colours: [] } : null;
}

/**
 * { width, height, colours } for a PNG, JPEG or WebP, read from the file
 * itself (no image library is a dependency). Colours are decoded for PNG only
 * (node:zlib is enough); JPEG and WebP need a codec, so colours is []. Null
 * when the bytes are not the claimed format.
 */
export function imageInfo(buf, mime) {
  if (mime === 'image/png') return pngInfo(buf);
  if (mime === 'image/jpeg') return jpegInfo(buf);
  if (mime === 'image/webp') return webpInfo(buf);
  return null;
}

/** Width and height an SVG declares: viewBox first, then width/height. */
export function svgInfo(svgText) {
  const tag = /<svg\b(?:"[^"]*"|'[^']*'|[^>"'])*>/i.exec(svgText)?.[0] ?? '';
  const attr = (name) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  const vb = attr('viewBox');
  if (vb) {
    const n = (vb[1] ?? vb[2]).trim().split(/[\s,]+/).map(Number);
    if (n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0) {
      return { width: Math.round(n[2]), height: Math.round(n[3]), colours: [] };
    }
  }
  const dim = (name) => {
    const m = attr(name);
    const v = m ? Number.parseFloat(m[1] ?? m[2]) : NaN;
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  };
  return { width: dim('width'), height: dim('height'), colours: [] };
}

export function orientationOf(width, height) {
  if (!(width > 0 && height > 0)) return null;
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

/**
 * The design_assets row to insert for a parsed CSV row plus what was measured.
 * Always a draft: review, approval and the people-without-release rules are
 * for staff in the admin, never for the intake.
 */
export function toInsertRow(v, m) {
  return {
    kind: v.kind,
    title: v.title,
    description: v.description,
    tags: v.tags,
    subjects: v.subjects,
    industries: v.industries,
    regions: v.regions,
    dominant_colours: m.colours,
    orientation: orientationOf(m.width, m.height),
    width_px: m.width ?? null,
    height_px: m.height ?? null,
    bytes: m.bytes,
    mime: m.mime,
    storage_path: m.storagePath,
    sha256: m.sha256,
    sanitised_at: m.sanitisedAt ?? null,
    source_name: v.source_name,
    source_url: v.source_url,
    source_asset_id: v.source_asset_id,
    creator_name: v.creator_name,
    creator_url: v.creator_url,
    licence_key: v.licence_key,
    licence_evidence_path: m.evidencePath,
    retrieved_at: v.retrieved_at ?? m.now,
    attribution_text: v.attribution_text,
    restrictions: v.restrictions,
    contains_people: v.contains_people,
    contains_brands: v.contains_brands,
    release_on_file: v.release_on_file,
    status: 'draft',
  };
}

/**
 * How to read the storage API's answer to an upload.
 *   'uploaded'  2xx: this call created the object.
 *   'exists'    the object is already there. Paths are content-addressed
 *               (<sha>.<ext>), so the same path means the same bytes and that
 *               counts as success. Accepted ONLY from a JSON body with
 *               error === 'Duplicate' or statusCode === '409' (Supabase Storage
 *               answers 400 with that body); any other 400 is a failure.
 *   'failed'    anything else.
 */
export function classifyUploadResponse(status, bodyText) {
  if (status >= 200 && status < 300) return 'uploaded';
  let body = null;
  try { body = JSON.parse(bodyText); } catch { /* not JSON: a failure */ }
  if (body && typeof body === 'object' && (body.error === 'Duplicate' || String(body.statusCode) === '409')) return 'exists';
  return 'failed';
}
