#!/usr/bin/env node
/**
 * Supabase calls that throw away the error.
 *
 * ── THE BUG THIS CATCHES ─────────────────────────────────────────────────
 *
 * supabase-js does not reject. It RESOLVES, with `{ data, error }`. So this:
 *
 *     const { data } = await supabase.from('business_products').select('*');
 *     setProducts(data ?? []);
 *
 * is not an unhandled promise and no `catch` will ever fire. When the query
 * fails — a policy the user does not satisfy, a column renamed in a migration,
 * a PostgREST select killed by one bad field name — `data` is null, the list
 * renders empty, and the screen says the business has no products.
 *
 * A permissions failure, a schema mistake and "there genuinely are none" are
 * the same picture. That is why these are hard to find: nothing is red.
 *
 * ── WHY A BASELINE INSTEAD OF A CLEAN SWEEP ──────────────────────────────
 *
 * There are dozens of these already. Fixing them all in one change means
 * touching dozens of components at once, and each one needs a decision about
 * what the UI should say when the query fails — which is design work, not a
 * find-and-replace. Rewriting them blind would be worse than leaving them.
 *
 * So the existing sites are recorded, and this guard's only job is that the
 * number does not grow. New code handles its errors.
 *
 *   node scripts/check-query-errors.mjs            check (exits 1 on a new one)
 *   node scripts/check-query-errors.mjs --record   re-record after fixing some
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, 'scripts', 'baselines', 'query-errors.json');

/*
 * `const { data } = await …` or `const { data: rows } = await …`, where the
 * awaited expression is a Supabase call. `error` is simply not in the pattern:
 * a destructuring that names it is handling it, whatever it then does, and
 * that is a judgement for review rather than for a regular expression.
 */
const DISCARDS = /const\s*\{\s*data(\s*:\s*[A-Za-z0-9_$]+)?\s*\}\s*=\s*await\s+/;
/* The awaited expression has to actually be Supabase, on this line or the next. */
const IS_SUPABASE = /supabase[.\s]|\.rpc\(|\.from\(|\.auth\./;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function scan() {
  const found = [];
  for (const file of walk(SRC)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!DISCARDS.test(lines[i])) continue;
      /* The chain often breaks across lines; look at this one and the next. */
      const context = lines[i] + '\n' + (lines[i + 1] ?? '');
      if (!IS_SUPABASE.test(context)) continue;
      found.push(`${relative(ROOT, file).split(sep).join('/')}:${i + 1}`);
    }
  }
  return found.sort();
}

const found = scan();

if (process.argv.includes('--record')) {
  writeFileSync(BASELINE, `${JSON.stringify({ sites: found }, null, 2)}\n`, 'utf8');
  console.log(`Recorded ${found.length} existing site(s) in ${relative(ROOT, BASELINE)}.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`No baseline at ${relative(ROOT, BASELINE)}. Run: node scripts/check-query-errors.mjs --record`);
  process.exit(1);
}

const baseline = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).sites);

/*
 * Line numbers move when a file is edited above the call, and a site that has
 * only shifted down is not a new bug. So a site counts as new when its FILE
 * has more of them than the baseline recorded, not when a line number changed.
 */
const countBy = (sites) => {
  const m = new Map();
  for (const s of sites) {
    const file = s.slice(0, s.lastIndexOf(':'));
    m.set(file, (m.get(file) ?? 0) + 1);
  }
  return m;
};

const now = countBy(found);
const was = countBy([...baseline]);

const grown = [];
const shrunk = [];
for (const [file, n] of now) {
  const before = was.get(file) ?? 0;
  if (n > before) grown.push({ file, before, now: n });
}
for (const [file, before] of was) {
  const n = now.get(file) ?? 0;
  if (n < before) shrunk.push({ file, before, now: n });
}

if (grown.length) {
  console.error('\n✗ New Supabase calls that discard the error:\n');
  for (const g of grown) {
    console.error(`    ${g.file}  (was ${g.before}, now ${g.now})`);
    for (const s of found.filter((x) => x.startsWith(`${g.file}:`))) console.error(`        ${s}`);
  }
  console.error('\n  supabase-js resolves with { data, error } — it does not throw.');
  console.error('  Destructure `error` and show the user that something failed, rather');
  console.error('  than rendering an empty list that looks like a correct answer.\n');
  process.exit(1);
}

if (shrunk.length) {
  const fixed = shrunk.reduce((n, s) => n + (s.before - s.now), 0);
  console.log(`✓ no new discarded Supabase errors (${found.length} known).`);
  console.log(`  ${fixed} fewer than the baseline — re-record it so the ground does not shift:`);
  console.log('    node scripts/check-query-errors.mjs --record');
  process.exit(0);
}

console.log(`✓ no new discarded Supabase errors (${found.length} known, unchanged).`);
