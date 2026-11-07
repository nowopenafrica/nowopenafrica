#!/usr/bin/env node
/**
 * Every repository guard, in one process.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * There are nine of these. Each one is fast — the slowest does its real work
 * in well under a tenth of a second — but each was being launched through its
 * own `npm run`, and on Windows that wrapper costs roughly 600ms before a line
 * of the script executes.
 *
 * MEASURED, 2026-10-20, nine guards launched one `npm run` at a time:
 *
 *   csp 859ms · events 766 · api-imports 653 · self-category 665 · wa-link 693
 *   edge-syntax 836 · migrations 872 · placements 787 · templates 745
 *                                                         ── total 6,876ms
 *
 * Almost all of that is the wrapper, paid nine times over, in series. Running
 * the nine scripts directly and concurrently pays it once.
 *
 * ── WHY THIS IS SAFE TO PARALLELISE ──────────────────────────────────────
 *
 * Three of these scripts (gen-event-constraint, sync-self-category,
 * sync-wa-link) generate a file when run without `--check`. Every one of them
 * is invoked here WITH `--check`, and in that mode each returns before it
 * reaches its `writeFileSync`. So this runner is read-only: nine processes
 * reading the same files and writing none of them, which cannot race.
 *
 * If you add a guard here, check that it is read-only in the mode you invoke.
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────
 *
 * Nine processes writing to one terminal would interleave into nonsense, so
 * each guard's output is buffered and replayed in the declared order. A guard
 * that passes is reduced to one line; a guard that fails prints everything it
 * said, because that is the moment the detail matters.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));

/** The guards, in the order `npm run verify` has always listed them. */
const GUARDS = [
  { name: 'csp', file: 'check-csp.mjs', args: [] },
  { name: 'events', file: 'gen-event-constraint.mjs', args: ['--check'] },
  { name: 'api-imports', file: 'check-api-imports.mjs', args: [] },
  { name: 'self-category', file: 'sync-self-category.mjs', args: ['--check'] },
  { name: 'wa-link', file: 'sync-wa-link.mjs', args: ['--check'] },
  { name: 'brand-social', file: 'sync-brand-social.mjs', args: ['--check'] },
  { name: 'edge-syntax', file: 'check-edge-syntax.mjs', args: [] },
  { name: 'migrations', file: 'check-migrations.mjs', args: [] },
  { name: 'placements', file: 'check-placement-sql.mjs', args: [] },
  { name: 'templates', file: 'audit-templates.mjs', args: ['--check'] },
  { name: 'query-errors', file: 'check-query-errors.mjs', args: [] },
  { name: 'sw-version', file: 'check-sw-version.mjs', args: [] },
  { name: 'spa-fallback', file: 'check-spa-fallback.mjs', args: [] },
];

function run(guard) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(SCRIPTS, guard.file), ...guard.args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    /*
     * A guard that cannot start at all (renamed, deleted, syntax error in the
     * script itself) must fail the run rather than be counted as a pass. An
     * absent guard is not a satisfied one.
     */
    child.on('error', (err) => {
      resolve({ ...guard, code: 1, ms: Date.now() - started, out: `${out}\n${err.message}` });
    });
    child.on('close', (code) => {
      resolve({ ...guard, code: code ?? 1, ms: Date.now() - started, out });
    });
  });
}

const wall = Date.now();
const results = await Promise.all(GUARDS.map(run));
const elapsed = Date.now() - wall;

const failed = results.filter((r) => r.code !== 0);

for (const r of results) {
  if (r.code === 0) {
    /* The guard's own last line of output is its summary; keep that, drop the rest. */
    const summary = r.out.trim().split('\n').filter(Boolean).pop() ?? '(no output)';
    console.log(`  ${String(r.ms).padStart(5)}ms  ${summary.replace(/^[✓✔]\s*/, '✓ ')}`);
  }
}

if (failed.length) {
  for (const r of failed) {
    console.error(`\n──────── ${r.name} failed (exit ${r.code}) ────────`);
    console.error(r.out.trimEnd());
  }
  console.error(`\n✗ ${failed.length} of ${GUARDS.length} guards failed: ${failed.map((r) => r.name).join(', ')}\n`);
  process.exit(1);
}

console.log(`✓ all ${GUARDS.length} guards passed in ${elapsed}ms.`);
