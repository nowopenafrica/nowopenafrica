#!/usr/bin/env node
// Behaviour checks for the design asset library.
//
// Usage:  node scripts/check-design-assets.mjs [--dry-run | --dry-run-only]
//
// SAFE TO RUN: every mode sends one transaction that ends in ROLLBACK, so
// nothing is persisted (the checks' throwaway rows are "zz-asset-check"). It
// talks to the linked project (production) through `supabase db query --linked`.
//
//   --dry-run-only  Before the apply. BEGIN, the migration file as it is on
//                   disk, one summary SELECT, ROLLBACK. Proves the migration
//                   runs and shows what it would create.
//   --dry-run       Before the apply. The migration AND the checks inside one
//                   transaction that ends in ROLLBACK.
//   (none)          After the apply. Runs the checks alone.
//
// The Supabase CLI link lives in one checkout only, so the CLI runs with that
// folder as its working directory and an absolute -f path. Set
// NOWOPEN_SUPABASE_CWD to point somewhere else. Nothing is written there.
//
// Exits non-zero on ERROR or an assertion failure, or (for the check modes)
// unless all 20 checks are confirmed passed.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: this project's path contains spaces.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXPECTED = 20;
const migrationOnly = process.argv.includes('--dry-run-only');
const dryRun = migrationOnly || process.argv.includes('--dry-run');

const SUPABASE_CWD = process.env.NOWOPEN_SUPABASE_CWD
  ?? 'C:\\Users\\itsup\\Documents\\YemzoArts\\NowOpen Africa\\NowOpen Business\\Latest Web UI Updates\\NowOpen Africa - (OpenCode) - Claude - edit';

const CHECKS = join(ROOT, 'scripts', 'check-design-assets.sql');
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20261114010000_design_asset_library.sql');

// The CLI returns only the last result set, so the migration-only run ends in
// this one row.
const SUMMARY = `
SELECT
  (SELECT count(*) FROM public.design_asset_licences) AS licences,
  (SELECT string_agg(key, ',' ORDER BY key) FROM public.design_asset_licences) AS licence_keys,
  (SELECT string_agg(key, ',' ORDER BY key) FROM public.design_asset_licences
    WHERE permits_people_without_release) AS people_without_release_ok,
  (SELECT count(*) FROM public.design_assets) AS assets,
  (SELECT count(*) FROM public.design_mockup_surfaces) AS surfaces,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('design_asset_licences', 'design_assets', 'design_mockup_surfaces')) AS table_policies,
  (SELECT string_agg(policyname, ',' ORDER BY policyname) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'design\\_assets%') AS storage_policies,
  (SELECT json_agg(json_build_object('id', id, 'public', public, 'limit', file_size_limit,
          'mimes', allowed_mime_types) ORDER BY id)
     FROM storage.buckets WHERE id IN ('design-assets', 'design-assets-intake')) AS buckets,
  (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.design_assets'::regclass AND contype = 'c') AS asset_checks,
  (SELECT string_agg(tgname, ',' ORDER BY tgname) FROM pg_trigger
    WHERE tgrelid IN ('public.design_assets'::regclass, 'public.design_asset_licences'::regclass,
                      'public.design_mockup_surfaces'::regclass) AND NOT tgisinternal) AS triggers,
  has_column_privilege('anon', 'public.design_assets', 'created_by', 'SELECT') AS anon_reads_created_by,
  has_column_privilege('anon', 'public.design_assets', 'reviewed_by', 'SELECT') AS anon_reads_reviewed_by,
  has_column_privilege('anon', 'public.design_asset_licences', 'reviewed_by', 'SELECT') AS anon_reads_licence_reviewer,
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.search_design_assets(text,text,text,text,text,text,integer,integer)'::regprocedure) AS search_is_definer,
  (SELECT count(*) FROM public.search_design_assets('anything')) AS search_rows;
`;

const migration = readFileSync(MIGRATION, 'utf8');
if (/^(COMMIT|BEGIN|ROLLBACK)\s*;/im.test(migration)) {
  console.error('The migration controls its own transaction; refusing to wrap it.');
  process.exit(1);
}

let file = CHECKS;
let tmp = null;
if (dryRun) {
  let inner = SUMMARY;
  if (!migrationOnly) {
    const checks = readFileSync(CHECKS, 'utf8');
    // The checks' own BEGIN; and final ROLLBACK; are replaced by the outer pair.
    inner = checks.replace(/^BEGIN;[ \t]*$/m, '').replace(/^ROLLBACK;[ \t]*\s*$/m, '');
    if (inner === checks || /^ROLLBACK;/m.test(inner) || /^BEGIN;/m.test(inner)) {
      console.error('Could not unwrap the check transaction; refusing to run.');
      process.exit(1);
    }
  }
  tmp = join(tmpdir(), `design-assets-dry-run-${randomUUID()}.sql`);
  writeFileSync(tmp, `BEGIN;\n\n${migration}\n\n${inner}\n\nROLLBACK;\n`);
  file = tmp;
}

// Through a shell: on Windows the CLI is a .cmd shim spawn cannot resolve.
const result = spawnSync(`npx supabase db query --linked -f "${file}"`, {
  cwd: SUPABASE_CWD, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
if (tmp) unlinkSync(tmp);

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

if (migrationOnly) {
  if (/ERROR/i.test(output) || result.status !== 0 || !/"licences"/.test(output)) {
    console.error('\nDRY RUN FAILED. Output follows.\n');
    console.error(output.trim());
    process.exit(1);
  }
  console.log(output.trim());
  console.log('\nMigration dry run clean (transaction rolled back).');
  process.exit(0);
}

const passed = Number(/"n_passed":\s*(\d+)/.exec(output)?.[1] ?? 0);

const failed = /ERROR|assert/i.test(output) || result.status !== 0 || passed !== EXPECTED;
if (failed) {
  console.error(`\nFAILED (${passed}/${EXPECTED} confirmed). Output follows.\n`);
  console.error(output.trim());
  process.exit(1);
}

console.log(/"checks_passed":\s*"([^"]*)"/.exec(output)?.[1].split(', ').map((n) => `ok: ${n}`).join('\n'));
console.log(`\nAll ${EXPECTED} design asset checks passed (transaction rolled back${dryRun ? ', migration included' : ''}).`);
