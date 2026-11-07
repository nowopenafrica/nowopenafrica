#!/usr/bin/env node
/**
 * First signal, in seconds rather than minutes.
 *
 * ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────
 *
 * `npm run verify` checks the whole repository, which is correct and which is
 * why it stays exactly as it is. MEASURED, 2026-10-20, cold:
 *
 *   typecheck 31.9s · lint 15.0s · nine guards 6.9s · tests 77.9s
 *                                              ── 132s before the first word
 *
 * Nearly all of that work is unrelated to any one change. A one-line edit to
 * a pricing helper paid the same 132s as a rewrite of the router, so the gate
 * stopped being run between edits and started being run at the end — which is
 * the expensive place to discover a mistake.
 *
 * This runs the same KINDS of check, scoped to what changed:
 *
 *   typecheck   incremental (whole project — tsc has no useful file scope,
 *               but with a build info file it reuses what it already knows)
 *   lint        the changed files only, with the cache
 *   guards      all nine; they cost 0.4s together, so scoping them is pointless
 *   tests       the test files that actually reach the changed modules
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────
 *
 * It is NOT a release gate and it does not replace `npm run verify`. It cannot
 * see a test that breaks through a path the import graph does not describe —
 * a snapshot of rendered output, a fixture, a route table read at runtime. It
 * is the fast first read, and the full gate still has to pass before a deploy.
 *
 * Usage:
 *   npm run verify:quick                  changed against HEAD
 *   npm run verify:quick -- src/lib/x.ts  those paths
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/*
 * Above this many changed files, "what changed" has stopped meaning anything:
 * the related-test graph widens to most of the suite and the fast path is
 * slower than the real gate while proving less. Say so rather than grind.
 */
const TOO_BROAD = 60;

const CHECKABLE = /\.(ts|tsx)$/;

function changedFiles() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (args.length) return args;

  /*
   * Tracked edits and new files both count. A brand-new module with a
   * brand-new test is exactly the case where the fast path earns its keep,
   * and `git diff` alone would miss it entirely.
   */
  const tracked = spawnSync('git', ['diff', '--name-only', 'HEAD'], { encoding: 'utf8' });
  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (tracked.status !== 0) {
    console.error('Could not read the working tree from git. Pass paths explicitly instead.');
    process.exit(1);
  }
  return [...(tracked.stdout + untracked.stdout).split('\n')]
    .map((l) => l.trim())
    .filter(Boolean);
}

/*
 * Every tool is launched as `node <its javascript entrypoint>`.
 *
 * The obvious spelling is `npx tsc`, which on Windows needs `shell: true`,
 * and a shell re-splits the command on spaces. This repository lives under
 * "C:\\Program Files\\..."-style paths with spaces in them, and the first
 * attempt died on `'C:\\Program' is not recognized` — the shell had chopped
 * Node's own path in half. Calling the entrypoints directly needs no shell,
 * so no quoting rule can break it, and it drops a deprecation warning too.
 */
const BIN = {
  tsc: 'node_modules/typescript/bin/tsc',
  eslint: 'node_modules/eslint/bin/eslint.js',
  vitest: 'node_modules/vitest/vitest.mjs',
};

function run(label, args) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => resolve({ label, code: 1, ms: Date.now() - started, out: `${out}\n${e.message}` }));
    child.on('close', (code) => resolve({ label, code: code ?? 1, ms: Date.now() - started, out }));
  });
}

const all = changedFiles();
/* Only files that still exist: a deleted file cannot be linted or tested. */
const source = all.filter((f) => CHECKABLE.test(f) && existsSync(f));

if (!source.length) {
  console.log('No changed TypeScript files. Running the guards only.\n');
}

if (source.length > TOO_BROAD) {
  console.error(`\n${source.length} changed TypeScript files — too many for a scoped check to mean anything.`);
  console.error('Run the real gate instead:  npm run verify\n');
  process.exit(1);
}

if (source.length) {
  console.log(`Checking ${source.length} changed file${source.length === 1 ? '' : 's'}:`);
  for (const f of source.slice(0, 12)) console.log(`  ${f}`);
  if (source.length > 12) console.log(`  … and ${source.length - 12} more`);
  console.log('');
}

const jobs = [
  run('guards', ['scripts/check-all.mjs']),
  run('typecheck', [BIN.tsc, '--noEmit', '-p', 'tsconfig.app.json']),
];

if (source.length) {
  jobs.push(run('lint', [
    BIN.eslint, '--cache', '--cache-location', 'node_modules/.cache/eslint/.eslintcache', ...source,
  ]));
  jobs.push(run('tests', [BIN.vitest, 'related', ...source, '--run']));
}

const wall = Date.now();
const results = await Promise.all(jobs);
const elapsed = Date.now() - wall;
const failed = results.filter((r) => r.code !== 0);

for (const r of results) {
  const mark = r.code === 0 ? '✓' : '✗';
  console.log(`${mark} ${r.label.padEnd(10)} ${String(r.ms).padStart(6)}ms`);
}

if (failed.length) {
  for (const r of failed) {
    console.error(`\n──────── ${r.label} ────────`);
    console.error(r.out.trimEnd());
  }
  console.error(`\n✗ ${failed.map((r) => r.label).join(', ')} failed.\n`);
  process.exit(1);
}

console.log(`\n✓ scoped checks passed in ${(elapsed / 1000).toFixed(1)}s.`);
console.log('  This is the fast read, not the gate. Run `npm run verify` before deploying.\n');
