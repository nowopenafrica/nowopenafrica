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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'lib', 'design', 'assetManifest.json');
const PAGE = 1000; // PostgREST's silent row cap; page below it.
const COLUMNS = 'id,kind,storage_path,width_px,height_px,licence_key,attribution_text,tags,contains_people,icon_set';

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

/** Sorted by id, two-space JSON, LF endings, trailing newline. */
export function serialise(rows) {
  const assets = rows.map(toManifestAsset).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return `${JSON.stringify({ assets }, null, 2)}\n`;
}

async function fetchApproved(url, key) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(
      `${url}/rest/v1/design_assets?status=eq.approved&select=${COLUMNS}&order=id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' } },
    );
    if (res.status === 404) fail('design_assets not found: has the migration been applied?');
    if (!res.ok) {
      const body = await res.text();
      if (/PGRST205|42P01|does not exist|schema cache/i.test(body)) fail('design_assets not found: has the migration been applied?');
      fail(`HTTP ${res.status} reading design_assets: ${body.slice(0, 200)}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
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
  writeFileSync(OUT, serialise(rows), 'utf8');
  console.log(`assets:manifest: wrote ${rows.length} approved asset${rows.length === 1 ? '' : 's'} to src/lib/design/assetManifest.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`assets:manifest: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  });
}
