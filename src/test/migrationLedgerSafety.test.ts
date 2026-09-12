import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { seedInserts } from '../../scripts/lib/parseSchemaSql.mjs';

/**
 * `supabase db push` is not safe on this project, and nothing said so.
 *
 * The runbook used to recommend it. That advice was wrong in a way that no
 * schema check could catch: `npm run check:drift` reports the live database as
 * CLEAN — every table and column the migrations describe is present — while
 * `db push` would still have replayed dozens of migrations.
 *
 * The two questions are different. Drift asks whether the schema HAS the
 * change. The ledger (`supabase_migrations.schema_migrations`) records whether
 * Postgres KNOWS it ran the migration. On this project migrations were applied
 * by hand, so the ledger is nearly empty and `db push` believes almost
 * everything is pending.
 *
 * Replaying an idempotent migration costs nothing. Replaying one that inserts
 * seed rows puts data into production that nobody entered — the fabricated
 * listing problem this platform has spent real effort removing.
 *
 * These tests pin the classification logic against the actual migration files,
 * so a new seed migration cannot be added without this failing.
 */

const DIR = 'supabase/migrations';

/**
 * The classifier the script ACTUALLY runs.
 *
 * This used to be a copy of it, which is the failure mode these tests exist to
 * prevent one level up: a mirrored implementation keeps passing while the
 * shipped one rots. It is importable now because the parsing lives in
 * scripts/lib/parseSchemaSql.mjs rather than inside a script that reaches the
 * network at import time.
 */
const classify = (file: string) => seedInserts(readFileSync(`${DIR}/${file}`, 'utf8'));

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

describe('the migrations that would write rows if replayed', () => {
  const writers = files
    .map((file) => ({ file, ...(classify(file) ?? {}) }))
    .filter((r) => r.guard && r.guard !== 'idempotent');

  it('is a known, small set — a new one must be a deliberate decision', () => {
    expect(writers.map((w) => w.file).sort()).toEqual([
      '20240617000000_seed_advertising_placements.sql',
      '20240618000000_add_billboard_placements.sql',
      '20240702000000_seed_media_services.sql',
    ]);
  });

  it('names the advertising seeds as unguarded', () => {
    for (const f of [
      '20240617000000_seed_advertising_placements.sql',
      '20240618000000_add_billboard_placements.sql',
    ]) {
      const r = classify(f);
      expect(r?.guard).toBe('none');
      expect(r?.tables).toContain('advertisements');
    }
  });

  it('classifies the media-services seed as "if-empty", not safe', () => {
    /*
     * The subtle one. It carries WHERE NOT EXISTS (SELECT 1 FROM
     * media_services), which reads as defensive and passes review — but that
     * guard defends against DUPLICATION, not against FABRICATION. It fires
     * exactly when the table is empty, and `media_services` is empty in
     * production, where the Create page correctly shows an honest empty state.
     *
     * An earlier version of the classifier treated any guard as safe and
     * cleared this file. Only the live row count settles it, which is why the
     * script queries it rather than reasoning from the SQL alone.
     */
    const r = classify('20240702000000_seed_media_services.sql');
    expect(r?.guard).toBe('if-empty');
    expect(r?.tables).toContain('media_services');
  });
});

describe('inserts inside function bodies are not migration-time inserts', () => {
  it('does not flag keep_notifications, whose inserts are plpgsql', () => {
    /*
     * A false positive the first version produced. Both INSERTs sit inside
     * `$$ ... $$` bodies, so replaying the file is CREATE OR REPLACE FUNCTION
     * — it writes no rows. Reading raw SQL cannot tell "performs an insert"
     * from "defines a function that may one day perform one".
     */
    expect(classify('20260829010000_keep_notifications.sql')).toBeNull();
  });
});

describe('the drift script actually carries this check', () => {
  const src = readFileSync('scripts/check-schema-drift.mjs', 'utf8');

  it('reads the ledger', () => {
    expect(src).toContain('supabase_migrations.schema_migrations');
  });

  it('consults the live row count rather than trusting the guard', () => {
    expect(src).toMatch(/select count\(\*\)::int as n from/);
    expect(src).toMatch(/counts\.get\(t\) === 0/);
  });

  it('strips function bodies before looking for inserts', () => {
    /*
     * Behaviour, not source text. The earlier version asserted that the
     * script's file contained the dollar-quote regex, so it failed the moment
     * that regex moved into the shared parser — while the check itself was
     * working perfectly. What matters is the answer, not where the code sits.
     */
    const sql = [
      'create or replace function f() returns trigger as $$',
      'begin',
      "  insert into notifications (body) values ('hi');",
      '  return new;',
      'end;',
      '$$ language plpgsql;',
    ].join('\n');
    expect(seedInserts(sql)).toBeNull();
  });

  it('says plainly not to run db push', () => {
    expect(src).toContain('DO NOT RUN supabase db push');
  });

  it('stays a report and never applies anything', () => {
    /*
     * Assert on what the script EXECUTES, not on what it says.
     *
     * The first version of this test searched the whole file for "db push"
     * and failed — on the console.log that warns you not to run it. Matching
     * text catches the warning as readily as the hazard, so look at the
     * subprocess calls themselves: every one must be a read.
     */
    const calls = [...src.matchAll(/execSync\(([\s\S]*?),\s*\{/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain('supabase db query');
      expect(call).not.toMatch(/push|reset|repair/);
    }

    // And the SQL it builds is read-only.
    const statements = [...src.matchAll(/query\(\s*(['"`])([\s\S]*?)\1/g)].map((m) => m[2]);
    for (const sql of statements) {
      expect(sql.trim().toLowerCase().startsWith('select')).toBe(true);
    }
  });
});

describe('the runbook no longer recommends db push', () => {
  const doc = readFileSync('audits/NOWOPEN_APPLY_RUNBOOK.md', 'utf8');

  it('warns against it explicitly', () => {
    expect(doc).toContain('DO NOT RUN `supabase db push`');
  });

  it('admits the earlier advice was wrong rather than quietly editing it', () => {
    expect(doc).toMatch(/corrects advice I gave in an earlier version/);
  });

  it('names all three files that would write rows', () => {
    for (const f of [
      'seed_advertising_placements',
      'add_billboard_placements',
      'seed_media_services',
    ]) {
      expect(doc).toContain(f);
    }
  });
});
