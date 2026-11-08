#!/usr/bin/env node
// Behaviour checks for the design asset library.
//
// Usage:  node scripts/check-design-assets.mjs [--dry-run]
//
// SAFE TO RUN: scripts/check-design-assets.sql is a single transaction that
// ends in ROLLBACK, so its throwaway "zz-asset-check" rows are never
// persisted. It talks to the linked project (production) through
// `supabase db query --linked`.
//
//   --dry-run  Before the migration is applied. Runs the migration AND the
//              checks inside one transaction that ends in ROLLBACK, so the
//              tables, buckets and policies exist only for the length of the run.
//   (none)     After the apply. Runs the checks alone.
//
// The Supabase CLI link lives in one checkout only, so the CLI runs with that
// folder as its working directory and an absolute -f path. Set
// NOWOPEN_SUPABASE_CWD to point somewhere else. Nothing is written there.
//
// Exits non-zero on ERROR or an assertion failure, or unless all 12 checks are
// confirmed passed.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: this project's path contains spaces.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXPECTED = 12;
const dryRun = process.argv.includes('--dry-run');

const SUPABASE_CWD = process.env.NOWOPEN_SUPABASE_CWD
  ?? 'C:\\Users\\itsup\\Documents\\YemzoArts\\NowOpen Africa\\NowOpen Business\\Latest Web UI Updates\\NowOpen Africa - (OpenCode) - Claude - edit';

const CHECKS = join(ROOT, 'scripts', 'check-design-assets.sql');
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20261114010000_design_asset_library.sql');

let file = CHECKS;
let tmp = null;
if (dryRun) {
  const checks = readFileSync(CHECKS, 'utf8');
  // The checks' own BEGIN; and final ROLLBACK; are replaced by the outer pair.
  const body = checks.replace(/^BEGIN;[ \t]*$/m, '').replace(/^ROLLBACK;[ \t]*\s*$/m, '');
  const migration = readFileSync(MIGRATION, 'utf8');
  if (body === checks || /^ROLLBACK;/m.test(body) || /^BEGIN;/m.test(body)
      || /^(COMMIT|BEGIN|ROLLBACK)\s*;/im.test(migration)) {
    console.error('Could not unwrap the check transaction, or the migration controls its own; refusing to run.');
    process.exit(1);
  }
  tmp = join(tmpdir(), `design-assets-dry-run-${randomUUID()}.sql`);
  writeFileSync(tmp, `BEGIN;\n\n${migration}\n\n${body}\n\nROLLBACK;\n`);
  file = tmp;
}

// Through a shell: on Windows the CLI is a .cmd shim spawn cannot resolve.
const result = spawnSync(`npx supabase db query --linked -f "${file}"`, {
  cwd: SUPABASE_CWD, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
if (tmp) unlinkSync(tmp);

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const passed = Number(/"n_passed":\s*(\d+)/.exec(output)?.[1] ?? 0);

const failed = /ERROR|assert/i.test(output) || result.status !== 0 || passed !== EXPECTED;
if (failed) {
  console.error(`\nFAILED (${passed}/${EXPECTED} confirmed). Output follows.\n`);
  console.error(output.trim());
  process.exit(1);
}

console.log(/"checks_passed":\s*"([^"]*)"/.exec(output)?.[1].split(', ').map((n) => `ok: ${n}`).join('\n'));
console.log(`\nAll ${EXPECTED} design asset checks passed (transaction rolled back${dryRun ? ', migration included' : ''}).`);
