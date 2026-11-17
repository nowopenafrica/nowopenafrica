#!/usr/bin/env node
// Generates src/lib/design/assetManifest.json from the approved rows of
// design_assets.
//
// Usage:  npm run assets:manifest
//
// READ-ONLY against the database: a paged GET with the anon key (RLS shows
// anon only approved rows; the filter is repeated here so the intent is
// explicit). It never writes to Supabase. It writes the JSON only after every
// page has been read, so a failure part-way leaves the committed file alone.
//
// Env: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, from process.env or from
// .env.local / .env at the repo root (process.env wins). A fresh worktree has
// no .env; export the two variables, or set NOWOPEN_ENV_FILE to a file that has
// them. With neither, this exits non-zero and writes nothing.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mayWrite, nextPageDecision, partitionRows, serialise, totalFromContentRange } from './manifestRows.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'lib', 'design', 'assetManifest.json');
const PAGE = 1000; // PostgREST's silent row cap; page below it.
const COLUMNS = 'id,kind,storage_path,width_px,height_px,licence_key,attribution_text,tags,contains_people,icon_set,source_asset_id';

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || m[1].startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

function loadEnv() {
  const files = [process.env.NOWOPEN_ENV_FILE, join(ROOT, '.env.local'), join(ROOT, '.env')].filter(Boolean);
  let merged = {};
  for (const f of files.reverse()) if (existsSync(f)) merged = { ...merged, ...parseEnv(readFileSync(f, 'utf8')) };
  return { ...merged, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) };
}

// Throws rather than calling process.exit: exiting with a fetch still closing
// trips a libuv assertion on Windows and turns exit 1 into 127.
function fail(message) {
  throw new Error(message);
}

async function fetchApproved(url, key) {
  const rows = [];
  let prevFirstId = null;
  let total = null;
  for (let iteration = 1; ; iteration += 1) {
    const from = rows.length; // advance by what arrived, not by PAGE
    const res = await fetch(
      `${url}/rest/v1/design_assets?status=eq.approved&select=${COLUMNS}&order=id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items', Prefer: 'count=exact' } },
    );
    if (res.status === 416) {
      // PostgREST: the range starts past the last row. The end of the table only if all rows are in.
      const d = nextPageDecision({ page: [], got: rows.length, total, iteration, rangeNotSatisfiable: true });
      if (d.action === 'error') fail(d.reason);
      return rows;
    }
    if (res.status === 404) fail('design_assets not found: has the migration been applied?');
    if (!res.ok) {
      const body = await res.text();
      if (/PGRST205|42P01|does not exist|schema cache/i.test(body)) fail('design_assets not found: has the migration been applied?');
      fail(`HTTP ${res.status} reading design_assets: ${body.slice(0, 200)}`);
    }
    const page = await res.json();
    total = totalFromContentRange(res.headers.get('content-range')) ?? total;
    rows.push(...page);
    const d = nextPageDecision({ page, prevFirstId, got: rows.length, total, iteration });
    if (d.action === 'error') fail(d.reason);
    if (d.action === 'done') return rows;
    prevFirstId = page[0].id;
  }
}

async function main() {
  const env = loadEnv();
  const url = (env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!url || !key) {
    fail('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set (process.env, .env.local or .env). Nothing written.');
  }
  const rows = await fetchApproved(url, key);
  const { ok, skipped } = partitionRows(rows);
  // All or nothing: a refused row means the committed manifest is left alone.
  if (!mayWrite(skipped)) {
    for (const s of skipped) console.error(`assets:manifest: REFUSED ${s.id}: ${s.problem}`);
    throw new Error(`${skipped.length} approved row${skipped.length === 1 ? '' : 's'} refused (ids above). Nothing written. Fix them in design_assets.`);
  }
  writeFileSync(OUT, serialise(ok), 'utf8');
  console.log(`assets:manifest: wrote ${ok.length} approved asset${ok.length === 1 ? '' : 's'} to src/lib/design/assetManifest.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`assets:manifest: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
