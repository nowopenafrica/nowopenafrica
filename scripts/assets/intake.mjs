#!/usr/bin/env node
// Asset intake: reads a folder of files plus a metadata CSV, uploads each file
// to the PRIVATE bucket design-assets-intake and inserts a DRAFT design_assets
// row. Nothing is approved here; staff review and approve in the admin.
//
// Usage:  node scripts/assets/intake.mjs <folder> <metadata.csv> [--dry-run]
//
// CSV columns (spec 6.1): file, kind, title, description, tags, subjects,
// industries, regions, source_name, source_url, source_asset_id, creator_name,
// creator_url, licence_key, evidence_file, attribution_text, restrictions,
// contains_people, contains_brands, release_on_file. Tags, subjects, industries
// and regions are ';'-separated. `file` and `evidence_file` are paths inside
// <folder>.
//
// --dry-run   Parses, hashes and measures every row and prints what it would
//             insert. It makes NO network calls and needs no credentials.
//
// Real mode needs, in the environment only (never a file, never printed):
//   VITE_SUPABASE_URL           the project URL
//   SUPABASE_SERVICE_ROLE_KEY   the service key (bypasses RLS: keep it secret)
//
// Storage paths in design-assets-intake:
//   <sha256>.<ext>             the asset (an SVG is sanitised first, and the
//                              hash is of the sanitised bytes that are stored)
//   evidence/<sha256>.<ext>    the licence evidence
// A sha256 already in design_assets is reported and skipped, not an error.
//
// Exit code: 0 when every row was accepted (or skipped as a duplicate), 1 when
// any row was rejected or failed, 2 for a usage or credentials problem.

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import {
  MAX_BYTES, extOf, imageInfo, parseCsv, parseRow, sanitiseSvg, seededLicenceKeys, sha256,
  svgInfo, toInsertRow, CSV_COLUMNS, MIME_BY_EXT,
} from './intake-lib.mjs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MIGRATION = join(HERE, '..', '..', 'supabase', 'migrations', '20261114010000_design_asset_library.sql');
const BUCKET = 'design-assets-intake';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [folderArg, csvArg] = args.filter((a) => !a.startsWith('--'));

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/assets/intake.mjs <folder> <metadata.csv> [--dry-run]');
  process.exitCode = 2;
}

/** A path under the folder, or null (stops "../" in a CSV reaching elsewhere). */
function inside(folder, name) {
  const full = resolve(folder, name);
  const rel = relative(folder, full);
  return rel && !rel.startsWith('..') && !rel.includes(`..${sep}`) && resolve(rel) !== rel ? full : null;
}

function readInside(folder, name) {
  const full = inside(folder, name);
  if (!full) return { error: `"${name}" is outside the folder` };
  if (!existsSync(full)) return { error: `"${name}" not found in the folder` };
  const buf = readFileSync(full);
  if (buf.length === 0) return { error: `"${name}" is empty` };
  if (buf.length > MAX_BYTES) return { error: `"${name}" is ${buf.length} bytes; the bucket limit is ${MAX_BYTES}` };
  return { buf };
}

/** Everything the intake can learn about one CSV row without the network. */
function prepare(folder, csvRow, licenceKeys, now) {
  const parsed = parseRow(csvRow, licenceKeys);
  if (!parsed.ok) return { error: parsed.reason };
  const v = parsed.value;

  const main = readInside(folder, v.file);
  if (main.error) return { error: main.error };
  let bytes = main.buf;
  let measured;
  let sanitisedAt = null;
  let removed = [];

  if (v.mime === 'image/svg+xml') {
    const clean = sanitiseSvg(bytes.toString('utf8'));
    if (!clean.ok) return { error: `SVG rejected: ${clean.reason}` };
    bytes = Buffer.from(clean.svg, 'utf8');
    removed = clean.removed;
    sanitisedAt = now;
    measured = svgInfo(clean.svg);
  } else {
    measured = imageInfo(bytes, v.mime);
    if (!measured) return { error: `"${v.file}" is not a valid ${v.mime} file` };
  }

  const evidence = readInside(folder, v.evidence_file);
  if (evidence.error) return { error: `evidence: ${evidence.error}` };
  const evidenceMime = MIME_BY_EXT[extOf(v.evidence_file)];
  if (!imageInfo(evidence.buf, evidenceMime)) return { error: `evidence "${v.evidence_file}" is not a valid ${evidenceMime} file` };

  const hash = sha256(bytes);
  const evidenceHash = sha256(evidence.buf);
  const storagePath = `${hash}.${v.ext === 'jpeg' ? 'jpg' : v.ext}`;
  const evidencePath = `evidence/${evidenceHash}.${extOf(v.evidence_file) === 'jpeg' ? 'jpg' : extOf(v.evidence_file)}`;

  const row = toInsertRow(v, {
    sha256: hash, ext: v.ext, mime: v.mime, bytes: bytes.length,
    width: measured.width, height: measured.height, colours: measured.colours,
    storagePath, evidencePath, sanitisedAt, now,
  });
  return {
    row, hash, removed,
    uploads: [
      { path: storagePath, mime: v.mime, body: bytes },
      { path: evidencePath, mime: evidenceMime, body: evidence.buf },
    ],
  };
}

/* ── real mode (never reached by --dry-run) ───────────────────────────────── */

async function realMode(prepared, url, key) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const base = url.replace(/\/+$/, '');

  const results = [];
  for (const p of prepared) {
    try {
      const dup = await fetch(`${base}/rest/v1/design_assets?sha256=eq.${p.hash}&select=id`, { headers });
      if (!dup.ok) throw new Error(`duplicate check failed (${dup.status})`);
      if ((await dup.json()).length > 0) { results.push({ file: p.file, status: 'duplicate' }); continue; }

      for (const u of p.uploads) {
        const res = await fetch(`${base}/storage/v1/object/${BUCKET}/${u.path}`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': u.mime, 'x-upsert': 'false' },
          body: u.body,
        });
        // The same evidence file can serve many rows; an existing identical path is fine.
        if (!res.ok && !(u.path.startsWith('evidence/') && (res.status === 409 || res.status === 400))) {
          throw new Error(`upload of ${u.path} failed (${res.status})`);
        }
      }

      const ins = await fetch(`${base}/rest/v1/design_assets`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(p.row),
      });
      if (!ins.ok) throw new Error(`insert failed (${ins.status}): ${(await ins.text()).slice(0, 300)}`);
      results.push({ file: p.file, status: 'inserted' });
    } catch (e) {
      results.push({ file: p.file, status: 'failed', reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

/** The licence keys the database actually holds (real mode). */
async function fetchLicenceKeys(url, key) {
  const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/design_asset_licences?select=key`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`could not read design_asset_licences (${res.status})`);
  return (await res.json()).map((r) => r.key);
}

async function main() {
  if (!folderArg || !csvArg) return usage('Missing <folder> or <metadata.csv>.');
  const folder = resolve(folderArg);
  const csvPath = resolve(csvArg);
  if (!existsSync(folder)) return usage(`Folder not found: ${folder}`);
  if (!existsSync(csvPath)) return usage(`CSV not found: ${csvPath}`);

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!url || !key)) {
    return usage('Real mode needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment. Nothing was read or written. (Use --dry-run to check a batch without credentials.)');
  }

  const { header, rows } = parseCsv(readFileSync(csvPath, 'utf8'));
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return usage(`CSV is missing columns: ${missing.join(', ')}`);
  if (rows.length === 0) return usage('CSV has no rows.');

  // Dry-run reads the seeded keys from the migration so it needs no network.
  const licenceKeys = dryRun ? seededLicenceKeys(readFileSync(MIGRATION, 'utf8')) : await fetchLicenceKeys(url, key);
  const now = new Date().toISOString();

  const prepared = [];
  const rejected = [];
  const seen = new Set();
  rows.forEach((csvRow, i) => {
    const label = csvRow.file || `row ${i + 2}`;
    const p = prepare(folder, csvRow, licenceKeys, now);
    if (p.error) { rejected.push({ file: label, reason: p.error }); return; }
    if (seen.has(p.hash)) { rejected.push({ file: label, reason: 'same file content as an earlier row in this CSV' }); return; }
    seen.add(p.hash);
    prepared.push({ ...p, file: label });
  });

  console.log(`${dryRun ? 'DRY RUN (no network calls, nothing written)' : 'INTAKE'}: ${rows.length} row(s), ${prepared.length} parsed, ${rejected.length} rejected.`);
  for (const p of prepared) {
    console.log(`\n+ ${p.file}  sha256 ${p.hash.slice(0, 12)}...${p.removed.length ? `  (sanitiser removed: ${p.removed.join(', ')})` : ''}`);
    console.log(JSON.stringify(p.row, null, 2));
    console.log(`  uploads: ${p.uploads.map((u) => `${BUCKET}/${u.path} (${u.body.length} bytes)`).join('  ')}`);
  }
  for (const r of rejected) console.log(`\n! REJECTED ${r.file}: ${r.reason}`);

  let failed = rejected.length > 0;
  if (!dryRun) {
    const results = await realMode(prepared, url, key);
    console.log('');
    for (const r of results) console.log(`${r.status.toUpperCase()}  ${r.file}${r.reason ? `  ${r.reason}` : ''}`);
    if (results.some((r) => r.status === 'failed')) failed = true;
  } else {
    console.log('\nDry run complete: nothing uploaded, nothing inserted.');
  }
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  // The message only: never an error object that could carry request headers.
  console.error(`Intake stopped: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
