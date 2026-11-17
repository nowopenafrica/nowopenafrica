#!/usr/bin/env node
// Behaviour checks for Business Updates.
//
// Usage:  node scripts/check-business-updates.mjs [--dry-run]
//
// SAFE TO RUN: scripts/check-business-updates.sql is a single transaction that
// ends in ROLLBACK, so its throwaway "zz-updates-check" rows are never
// persisted. It talks to the linked project (production) through
// `supabase db query --linked`.
//
//   --dry-run  Before the migrations are applied. Runs both migrations AND the
//              checks inside one transaction that ends in ROLLBACK, so the
//              tables, bucket and cron job exist only for the length of the run.
//   (none)     After the apply. Runs the checks alone.
//
// Exits non-zero on ERROR or an assertion failure, or unless all 37 checks
// are confirmed passed.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: this project's path contains spaces.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXPECTED = 37;
const dryRun = process.argv.includes('--dry-run');

const CHECKS = 'scripts/check-business-updates.sql';
// All re-runnable, so a dry run may replay the ones already applied.
const MIGRATIONS = [
  'supabase/migrations/20261110010000_business_updates.sql',
  'supabase/migrations/20261110020000_business_update_alerts_reports.sql',
  'supabase/migrations/20261112010000_business_update_publish_rpc.sql',
  // Phase 5: the event names the stats checks insert, then the stats function.
  'supabase/migrations/20260908120000_analytics_event_integrity.sql',
  'supabase/migrations/20261117010000_business_update_stats.sql',
];

let file = CHECKS;
let tmp = null;
if (dryRun) {
  const checks = readFileSync(join(ROOT, CHECKS), 'utf8');
  // The checks' own BEGIN; and final ROLLBACK; are replaced by the outer pair.
  const body = checks.replace(/^BEGIN;[ \t]*$/m, '').replace(/^ROLLBACK;[ \t]*\s*$/m, '');
  if (body === checks || /^ROLLBACK;/m.test(body) || /^BEGIN;/m.test(body)) {
    console.error('Could not unwrap the check transaction; refusing to run.');
    process.exit(1);
  }
  const migrations = MIGRATIONS.map((m) => readFileSync(join(ROOT, m), 'utf8')).join('\n\n');
  tmp = mkdtempSync(join(tmpdir(), 'bu-check-'));
  file = join(tmp, 'dry-run.sql');
  writeFileSync(file, `BEGIN;\n\n${migrations}\n\n${body}\n\nROLLBACK;\n`);
}

// Through a shell: on Windows the CLI is a .cmd shim spawn cannot resolve.
const result = spawnSync(`npx supabase db query --linked -f "${file}"`, {
  cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
if (tmp) rmSync(tmp, { recursive: true, force: true });

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const passed = Number(/"n_passed":\s*(\d+)/.exec(output)?.[1] ?? 0);

const failed = /ERROR|assert/i.test(output) || result.status !== 0 || passed !== EXPECTED;
if (failed) {
  console.error(`\nFAILED (${passed}/${EXPECTED} confirmed). Output follows.\n`);
  console.error(output.trim());
  process.exit(1);
}

console.log(/"checks_passed":\s*"([^"]*)"/.exec(output)?.[1].split(', ').map((n) => `ok: ${n}`).join('\n'));
console.log(`\nAll ${EXPECTED} business updates checks passed (transaction rolled back${dryRun ? ', migrations included' : ''}).`);
