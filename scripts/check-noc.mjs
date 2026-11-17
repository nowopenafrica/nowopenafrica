#!/usr/bin/env node
// Behaviour checks for the NowOpen Credits (NOC) migrations.
//
// Usage:  node scripts/check-noc.mjs
//
// SAFE TO RUN: scripts/check-noc.sql is a single transaction that
// ends in ROLLBACK, so its throwaway "zz-noc-check" rows are never
// persisted (nor are its throwaway auth users and businesses). It must only be
// run AFTER supabase/migrations/20261116020000…040000 (NOC) have been
// applied; it talks to the linked project (production) through
// `supabase db query --linked`.
//
// Exits non-zero if the output contains ERROR or an assertion failure, or if
// no passing check could be confirmed.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname: this project's path contains spaces.
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Through a shell: on Windows the CLI is a .cmd shim spawn cannot resolve.
const result = spawnSync(
  'npx supabase db query --linked -f scripts/check-noc.sql',
  { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
const okLines = output.split(/\r?\n/).filter((l) => /ok: [a-z0-9_]+/.test(l));

for (const line of okLines) console.log(line.trim());

const failed = /ERROR|assert/i.test(output) || result.status !== 0;
if (failed) {
  console.error('\nFAILED. Output follows.\n');
  console.error(output.trim());
  process.exit(1);
}

if (okLines.length === 0 && !/checks_passed/.test(output)) {
  console.error('\nNo passing check could be confirmed in the output:\n');
  console.error(output.trim());
  process.exit(1);
}

if (okLines.length === 0) console.log(output.trim());
console.log('\nAll NOC financial-path checks passed (transaction rolled back).');
