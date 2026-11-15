#!/usr/bin/env node
// Behaviour checks for the Instagram owner-handle sync migration.
//
// Usage:
//   node scripts/check-instagram-owner-sync.mjs --with-migration   (before applying: the dry run)
//   node scripts/check-instagram-owner-sync.mjs                    (after applying)
//
// SAFE TO RUN: the SQL sent is BEGIN; [migration;] checks; ROLLBACK; as one
// transaction, so nothing persists, including the pg_net poke the trigger
// queues. It talks to the linked project (production) through
// `supabase db query --linked`.
//
// Exits non-zero on ERROR or an assertion failure, or if no passing check
// could be confirmed.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: this project's path contains spaces.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATION = join(ROOT, 'supabase', 'migrations', '20261118010000_instagram_owner_handle_sync.sql');
const CHECKS = join(ROOT, 'scripts', 'check-instagram-owner-sync.sql');

const withMigration = process.argv.includes('--with-migration');
const parts = ['BEGIN;'];
if (withMigration) parts.push(readFileSync(MIGRATION, 'utf8'));
parts.push(readFileSync(CHECKS, 'utf8'));
parts.push('ROLLBACK;');

const dir = mkdtempSync(join(tmpdir(), 'ig-owner-sync-'));
const file = join(dir, 'run.sql');
writeFileSync(file, parts.join('\n\n'));

// Through a shell: on Windows the CLI is a .cmd shim spawn cannot resolve.
const result = spawnSync(
  `npx supabase db query --linked -f "${file}"`,
  { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
rmSync(dir, { recursive: true, force: true });

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const failed = /ERROR|assert/i.test(output) || result.status !== 0;
if (failed) {
  console.error(`\nFAILED (${withMigration ? 'dry run with migration' : 'checks only'}). Output follows.\n`);
  console.error(output.trim());
  process.exit(1);
}
if (!/checks_passed/.test(output)) {
  console.error('\nNo passing check could be confirmed in the output:\n');
  console.error(output.trim());
  process.exit(1);
}
console.log(output.replace(/"warning"[^\n]*\n?/g, '').trim());
console.log(`\nAll Instagram owner-sync checks passed (${withMigration ? 'migration included, ' : ''}transaction rolled back).`);
