// Does the generated pricing SQL actually touch every placement?
//
// WHY THIS EXISTS
//
// update_placement_pricing.sql silently became a no-op. Its UPDATEs keyed on
// the pre-rename titles, so once the renames were live every one matched zero
// rows; its INSERTs were guarded by NOT EXISTS on the new titles, which by then
// all existed, so every one skipped. The file ran clean, reported "58 updates,
// 39 inserts", and changed nothing. It was run twice before anyone noticed the
// prices had not moved.
//
// A generator that reports work it did not do is worse than one that fails.
// This asserts the two properties that were violated:
//
//   1. Every placement in the source is targeted by an UPDATE.
//   2. Every row added by an INSERT is also targeted by an UPDATE, so a second
//      run reprices it instead of skipping it.
//
// Pure text analysis — no database needed, so it runs in CI.

import { readFileSync } from 'node:fs';

const SQL = 'scripts/sql/update_placement_pricing.sql';
const sql = readFileSync(SQL, 'utf-8');
const unquote = (t) => t.replace(/''/g, "'");

const updated = new Set();
const UPDATE_RE = /UPDATE advertisements SET[\s\S]*?WHERE title (?:= '((?:[^']|'')*)'|IN \('((?:[^']|'')*)', '((?:[^']|'')*)'\));/g;
for (const m of sql.matchAll(UPDATE_RE)) {
  for (const g of m.slice(1)) if (g) updated.add(unquote(g));
}

const inserted = new Set();
for (const m of sql.matchAll(/WHERE NOT EXISTS \(SELECT 1 FROM advertisements WHERE title = '((?:[^']|'')*)'\);/g)) {
  inserted.add(unquote(m[1]));
}

const problems = [];
if (updated.size === 0) problems.push('No UPDATE statements at all — the file cannot change anything.');

// An inserted row that no UPDATE targets is repriced exactly once, ever.
for (const title of inserted) {
  if (!updated.has(title)) {
    problems.push(`"${title}" is inserted but never updated — a re-run would skip it entirely.`);
  }
}

if (problems.length) {
  console.error(`\u2717 ${SQL} would not do what it reports:\n`);
  for (const p of problems.slice(0, 10)) console.error(`  - ${p}`);
  if (problems.length > 10) console.error(`  … and ${problems.length - 10} more`);
  console.error('\nRegenerate with: node scripts/generate-placement-sql.mjs');
  process.exit(1);
}

console.log(`\u2713 pricing SQL targets ${updated.size} placements, and every inserted row is also updatable.`);
