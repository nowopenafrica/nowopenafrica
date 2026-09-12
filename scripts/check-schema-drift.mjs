// Does the live database actually have what the migrations say it has?
//
// WHY THIS EXISTS
//
// This repo holds 106 migrations. Nothing verified that any of them had been
// applied, and the live schema has drifted from them before — repeatedly, and
// always with the same symptom: a feature that works locally and silently does
// nothing in production, because the column or policy it needs is not there.
// "Delete doesn't work", "the plan change doesn't save", "the module never
// appears" have all turned out to be this.
//
// The failure is quiet by nature. Supabase returns an error for the missing
// column, the client swallows it (or reports it as a generic failure), and the
// page looks fine. So the drift is invisible until somebody goes looking.
//
// WHAT IT DOES
//
// Extracts every table and column the migrations claim to create, asks the
// live database what it actually has, and prints the difference. Deliberately
// a REPORT rather than a gate: it needs live credentials, so it cannot run in
// CI without secrets, and a founder running it before a release is worth more
// than a check nobody can execute.
//
//   npm run check:drift
//
// It does NOT apply anything. Fixing drift means applying the migration, which
// is a decision, not a side effect of a diagnostic.
//
// IT ALSO CHECKS THE LEDGER
//
// Postgres knows which migrations it has run, in
// `supabase_migrations.schema_migrations`. On this project that ledger is far
// behind the files on disk, because most migrations were applied by hand
// instead of through the CLI. That matters for one specific reason:
//
//   `supabase db push` runs everything the ledger does not list.
//
// So a command that looks routine would REPLAY dozens of already-applied
// migrations. Most are idempotent and would be harmless. A few are not — they
// insert seed rows with no guard, and replaying those puts invented data into
// a production database that has deliberately been emptied of it.
//
// That hazard is invisible from the schema alone: every table and column is
// present, so the drift check above says "clean" while `db push` remains
// actively dangerous. Hence the second half of this script.

import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parseSchemaSql, seedInserts } from './lib/parseSchemaSql.mjs';

const DIR = 'supabase/migrations';

/**
 * Tables and columns the migrations claim to create.
 *
 * The parsing itself lives in ./lib/parseSchemaSql.mjs so it can be tested —
 * this script reaches the network and exits at import time, so nothing here
 * is reachable from a test file.
 */
function expectedFromMigrations() {
  const tables = new Map(); // table -> Set<column>
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    parseSchemaSql(readFileSync(`${DIR}/${file}`, "utf8"), tables);
  }
  return tables;
}

/**
 * Run one read-only query against the linked project and return its rows.
 *
 * `fatal: false` lets a caller treat failure as "unknown" rather than fatal —
 * used by the ledger check below, which must not stop the schema report from
 * printing merely because the migrations schema could not be read.
 */
function query(sql, { fatal = true } = {}) {
  let out;
  try {
    // Through a shell: on Windows the CLI is `supabase.cmd`, which
    // execFileSync cannot resolve on its own (ENOENT).
    out = execSync(`supabase db query --linked "${sql.replace(/"/g, '\\"')}"`, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (!fatal) return null;
    console.error('\n✗ Could not reach the live database.');
    console.error('  This check needs `supabase link` and network access.');
    console.error(`  ${err.shortMessage ?? err.message}`);
    process.exit(2);
  }

  const json = out.slice(out.indexOf('{'));
  try {
    return JSON.parse(json).rows ?? [];
  } catch {
    if (!fatal) return null;
    console.error('\n✗ Unexpected response from the database.');
    process.exit(2);
  }
}

/** What the live database actually has. */
function liveSchema() {
  const rows = query(
    "select table_name, column_name from information_schema.columns " +
    "where table_schema='public' order by table_name, column_name;",
  );

  const tables = new Map();
  for (const r of rows) {
    if (!tables.has(r.table_name)) tables.set(r.table_name, new Set());
    tables.get(r.table_name).add(r.column_name);
  }
  return tables;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Is `supabase db push` safe to run right now?
 *
 * The schema check above can report "clean" while `db push` is still
 * dangerous, and that is exactly the state this project is in. The two
 * questions are different:
 *
 *   drift  — does the live schema have what the migrations describe?
 *   ledger — does Postgres KNOW it has them?
 *
 * `db push` acts on the second. It runs every migration absent from
 * `supabase_migrations.schema_migrations`, regardless of whether the schema
 * already reflects it. Where migrations were applied by hand — as most of
 * these were — the ledger holds no record of them, and `db push` would run
 * them all again.
 *
 * Replaying an idempotent migration is harmless. Replaying one that inserts
 * seed rows is not: it puts data into production that nobody entered. This
 * platform has deliberately removed invented listings, so that is a real
 * regression rather than a theoretical one.
 *
 * So: report the gap, and name the specific files that would do damage.
 * ──────────────────────────────────────────────────────────────────────── */
function reportLedger() {
  const ledgerRows = query(
    'select version from supabase_migrations.schema_migrations order by version;',
    { fatal: false },
  );

  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

  console.log('');

  if (ledgerRows === null) {
    console.log('? Could not read supabase_migrations.schema_migrations.');
    console.log('  So this script cannot tell you whether supabase db push is safe.');
    console.log('  Do not run it until you can.');
    console.log('');
    return;
  }

  const applied = new Set(ledgerRows.map((r) => String(r.version)));
  const pending = files.filter((f) => !applied.has(f.slice(0, f.indexOf('_'))));

  console.log(
    `Migration ledger: ${applied.size} recorded as applied, ${files.length} files on disk.`,
  );

  if (!pending.length) {
    console.log('\u2713 Ledger matches disk. supabase db push has nothing to replay.');
    console.log('');
    return;
  }

  console.log('');
  console.log(`⚠ supabase db push would run ${pending.length} migrations.`);
  console.log('  The schema check above shows the live database already has'
    + ' almost all of them,');
  console.log('  so most would be replays of work already done.');

  /*
   * What would replaying each pending migration actually DO?
   *
   * Three shapes, and only the first is safe:
   *
   *   ON CONFLICT ...        idempotent. Re-running changes nothing.
   *   WHERE NOT EXISTS (…)   "seed if empty". Re-running is a no-op ONLY while
   *                          the table has rows. If the table is empty — which
   *                          is where an honest empty state lives — it inserts.
   *   no guard               duplicates its rows on every run.
   *
   * The middle one is the trap. It reads as defensive and passes review, and
   * it is precisely the shape that refills a table somebody deliberately
   * emptied. So it is not enough to spot the guard; the live row count decides.
   */
  const seeds = [];
  for (const file of pending) {
    const found = seedInserts(readFileSync(`${DIR}/${file}`, "utf8"));
    if (!found) continue;
    if (found.guard === 'idempotent') continue;
    seeds.push({ file, tables: found.tables, guard: found.guard });
  }

  if (!seeds.length) {
    console.log('  None of them insert rows, so a replay would be noisy rather');
    console.log('  than harmful. Still prefer repairing the ledger.');
    console.log('');
    return;
  }

  // For "if-empty" seeds the row count IS the answer, so ask.
  const needCounts = [...new Set(seeds.filter((s) => s.guard === 'if-empty').flatMap((s) => s.tables))];
  const counts = new Map();
  for (const t of needCounts) {
    // Identifier is taken from our own migration files, not from user input.
    const rows = query(`select count(*)::int as n from ${t};`, { fatal: false });
    if (rows && rows[0]) counts.set(t, rows[0].n);
  }

  const willInsert = seeds.filter(
    (s) => s.guard === 'none' || s.tables.some((t) => counts.get(t) === 0),
  );

  console.log('');
  if (willInsert.length) {
    console.log(`  \u26d4 ${willInsert.length} would insert rows into production.`);
    console.log('     Nobody entered this data. Re-creating it is the fabricated-');
    console.log('     listing problem this platform has spent effort removing.');
    console.log('');
    for (const s of willInsert) {
      console.log(`       - ${s.file}`);
      for (const t of s.tables) {
        const n = counts.get(t);
        const why =
          s.guard === 'none'
            ? 'no guard — duplicates on every run'
            : n === 0
              ? `guarded "if empty", and ${t} has 0 rows — so it WOULD insert`
              : `guarded "if empty", ${t} has ${n} rows — would skip`;
        console.log(`         ${t}: ${why}`);
      }
    }
    console.log('');
    console.log('  DO NOT RUN supabase db push.');
    console.log('  Apply new migrations one at a time in the SQL editor, or repair the');
    console.log('  ledger first:  supabase migration repair --status applied <version>');
  } else {
    console.log(`  ${seeds.length} contain inserts, but each is guarded and its table`);
    console.log('  already has rows, so a replay would skip them. Still prefer');
    console.log('  repairing the ledger rather than relying on that.');
  }
  console.log('');
}


/* ─────────────────────────────────────────────────────────────────────────
 * Do the columns the IMPORTER writes actually exist?
 *
 * A different question from drift, and it has bitten twice.
 *
 * `UPDATABLE_FIELDS` in src/lib/imports/matchExisting.ts is the allowlist of
 * fields an import may change on a business it recognises. Twice now it has
 * named a column that does not exist — `city` (the column is `location`) and
 * `cover_image_url` (it is `image_url`) — and both times the failure was
 * invisible in exactly the same way:
 *
 *   the DIFF worked, because both sides used the same wrong label;
 *   the UPDATE failed, because PostgREST rejects an unknown column and takes
 *   the whole write with it;
 *   and supabase-js reports that as a RESOLVED error, so a caller that only
 *   checks for a thrown exception sees success.
 *
 * The drift check above cannot catch it: these are columns the migrations
 * never claimed to create, so nothing is "missing" — the importer is simply
 * writing to somewhere that is not there.
 * ──────────────────────────────────────────────────────────────────────── */
function reportImporterFields() {
  let declared;
  let selected;
  try {
    const src = readFileSync('src/lib/imports/matchExisting.ts', 'utf8');
    const start = src.indexOf('export const UPDATABLE_FIELDS = [');
    if (start < 0) throw new Error('UPDATABLE_FIELDS not found');
    const end = src.indexOf('] as const', start);
    declared = [...src.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

    /*
     * EXISTING_SELECT matters just as much, and fails WORSE.
     *
     * UPDATABLE_FIELDS naming a bad column loses one write. EXISTING_SELECT
     * naming one loses the whole SELECT — PostgREST rejects the request, the
     * matcher compares the file against nothing, and every duplicate in it is
     * offered to an admin as a new business. That is precisely what happened
     * with `city`, `cover_image_url`, `latitude` and `longitude`.
     */
    const sStart = src.indexOf('export const EXISTING_SELECT = [');
    if (sStart < 0) throw new Error('EXISTING_SELECT not found');
    const sEnd = src.indexOf('].join', sStart);
    selected = [...src.slice(sStart, sEnd).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  } catch (err) {
    console.log('');
    console.log('? Could not read the importer field lists:', err.message);
    return;
  }

  if (!declared.length) {
    console.log('');
    console.log('? Parsed no fields from UPDATABLE_FIELDS — the parser is wrong.');
    return;
  }

  const live = query(
    "select column_name from information_schema.columns " +
    "where table_schema='public' and table_name='businesses';",
    { fatal: false },
  );
  if (!live) {
    console.log('');
    console.log('? Could not read the businesses columns; importer fields unverified.');
    return;
  }

  const columns = new Set(live.map((r) => r.column_name));
  const missing = declared.filter((f) => !columns.has(f));
  const missingSelect = (selected ?? []).filter((f) => !columns.has(f));

  console.log('');

  if (missingSelect.length) {
    console.log(`⛔ ${missingSelect.length} column(s) in EXISTING_SELECT do NOT exist on businesses:`);
    for (const f of missingSelect) console.log(`     - ${f}`);
    console.log('');
    console.log('  This is the worse one: PostgREST rejects the whole SELECT, so the');
    console.log('  matcher compares the file against NOTHING and offers every');
    console.log('  duplicate in it as a new business.');
    console.log('  Fix EXISTING_SELECT in src/lib/imports/matchExisting.ts.');
    console.log('');
  }

  if (!missing.length) {
    console.log(`✓ All ${declared.length} importer-updatable fields exist on businesses.`);
    if (!missingSelect.length) {
      console.log(`✓ All ${(selected ?? []).length} columns EXISTING_SELECT reads exist too.`);
    }
    return;
  }

  console.log(`⛔ ${missing.length} field(s) the importer would write do NOT exist on businesses:`);
  for (const f of missing) console.log(`     - ${f}`);
  console.log('');
  console.log('  Every update touching one of these fails silently — PostgREST');
  console.log('  rejects the unknown column and discards the whole write.');
  console.log('  Fix UPDATABLE_FIELDS in src/lib/imports/matchExisting.ts.');
}

const expected = expectedFromMigrations();
const live = liveSchema();

const missingTables = [];
const missingColumns = [];

for (const [table, columns] of expected) {
  if (!live.has(table)) {
    missingTables.push(table);
    continue;
  }
  const actual = live.get(table);
  for (const col of columns) {
    if (!actual.has(col)) missingColumns.push(`${table}.${col}`);
  }
}

console.log(`\nMigrations describe ${expected.size} tables. Live database has ${live.size}.`);

if (!missingTables.length && !missingColumns.length) {
  console.log('✓ No drift: every table and column the migrations create is present.');
  reportLedger();
  reportImporterFields();
  process.exit(0);
}

console.log('\n⚠ DRIFT — the live database is missing things the migrations create.');
console.log('  Anything below will fail silently at runtime: the query errors, the');
console.log('  client swallows it, and the page looks fine.\n');

if (missingTables.length) {
  console.log(`  Missing tables (${missingTables.length}):`);
  for (const t of missingTables.sort()) console.log(`    - ${t}`);
}
if (missingColumns.length) {
  console.log(`\n  Missing columns (${missingColumns.length}):`);
  for (const c of missingColumns.sort()) console.log(`    - ${c}`);
}

console.log('\n  Fix by applying the migrations that create them. This script');
console.log('  deliberately changes nothing — applying a migration is a decision.\n');

reportLedger();
reportImporterFields();

// Exit 0: this is a report, not a gate. Failing the build on drift would block
// work on a condition the developer may not be able to fix from where they are.
process.exit(0);
