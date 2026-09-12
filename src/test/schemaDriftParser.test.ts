/**
 * The drift report's SQL parser.
 *
 * WHY THIS TEST EXISTS
 *
 * `npm run check:drift` is the tool that answers "is the live database missing
 * something the migrations create". It has now been wrong twice, and each time
 * the wrong answer pointed at production:
 *
 *   - It read INSERTs inside `$$ … $$` function bodies as seed data, so it
 *     warned that a migration would write invented rows when it writes none.
 *   - It read the continuation line of a wrapped CHECK constraint as a column,
 *     so it reported `claimreach_suppressions.or` missing from a live database
 *     that was completely correct.
 *
 * The second is the dangerous shape: the report's own advice is "fix by
 * applying the migration that creates them", so a false positive invites a
 * DDL change against a healthy database. A diagnostic that lies is worse than
 * no diagnostic, hence these tests.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseSchemaSql, seedInserts, stripComments } from '../../scripts/lib/parseSchemaSql.mjs';

const cols = (sql: string, table: string): string[] =>
  [...(parseSchemaSql(sql).get(table) ?? [])].sort();

describe('parseSchemaSql — tables and columns', () => {
  it('reads a plain create table', () => {
    const t = parseSchemaSql(`
      create table things (
        id uuid primary key,
        name text not null,
        created_at timestamptz default now()
      );
    `);
    expect([...t.keys()]).toEqual(['things']);
    expect([...t.get('things')!].sort()).toEqual(['created_at', 'id', 'name']);
  });

  it('does not read the continuation line of a wrapped constraint as a column', () => {
    /*
     * The exact regression. Before the paren-depth fix this yielded a column
     * called `or`, because line two starts with a word followed by a word.
     */
    const sql = `
      create table suppressions (
        contact text not null,
        expires_at timestamptz,
        constraint suppressions_permanent check (
          expires_at is null or reason not in ('opt_out', 'complaint'))
      );
    `;
    expect(cols(sql, 'suppressions')).toEqual(['contact', 'expires_at']);
  });

  it('handles a multi-line constraint that closes on its own line', () => {
    const sql = `
      create table t (
        a text,
        check (
          a is null
          or length(a) > 2
        ),
        b text
      );
    `;
    expect(cols(sql, 't')).toEqual(['a', 'b']);
  });

  it('skips table-level constraints of every keyword', () => {
    const sql = `
      create table t (
        a text,
        primary key (a),
        unique (a),
        foreign key (a) references other (a),
        check (a <> ''),
        exclude using gist (a with =),
        constraint named_one check (a <> 'x')
      );
    `;
    expect(cols(sql, 't')).toEqual(['a']);
  });

  it('keeps a column whose own definition contains an inline check', () => {
    const sql = `
      create table t (
        status text not null check (status in ('a', 'b')),
        b int
      );
    `;
    expect(cols(sql, 't')).toEqual(['b', 'status']);
  });

  it('reads columns added by alter table', () => {
    const t = parseSchemaSql(`
      alter table things add column if not exists colour text;
      alter table things add column size int;
    `);
    expect([...t.get('things')!].sort()).toEqual(['colour', 'size']);
  });

  it('strips the public. prefix and quotes so one table is not counted twice', () => {
    const t = parseSchemaSql(`
      create table public."things" (
        "id" uuid primary key
      );
      alter table public.things add column extra text;
    `);
    expect([...t.keys()]).toEqual(['things']);
    expect([...t.get('things')!].sort()).toEqual(['extra', 'id']);
  });

  it('ignores tables that are only mentioned in comments', () => {
    const t = parseSchemaSql(`
      -- create table imaginary (id uuid);
      /* create table also_imaginary (id uuid); */
      create table real_one (id uuid primary key);
    `);
    expect([...t.keys()]).toEqual(['real_one']);
  });

  it('reads a create table written on one line', () => {
    /*
     * Legal SQL that the line-based version could not see at all, because it
     * required a newline before the closing paren. A table the parser cannot
     * see is a table the drift report cannot check.
     */
    const t = parseSchemaSql('create table b (id uuid primary key, n text);');
    expect([...t.keys()]).toEqual(['b']);
    expect([...t.get('b')!].sort()).toEqual(['id', 'n']);
  });

  it('survives a trailing comment containing an apostrophe', () => {
    /*
     * The third regression, and the worst-behaved one. Only line-leading `--`
     * comments were stripped, so the apostrophe in "admin's" below opened a
     * phantom string literal, quote parity inverted for the rest of the file,
     * and the table's closing paren was swallowed. The parser then reported NO
     * table — and the drift report calls a table it cannot see "clean".
     */
    const sql = [
      'create table public.business_evidence (',
      '  id uuid primary key,',
      '  extraction_method text not null check (extraction_method in (',
      "    'api',",
      "    'csv_import',        -- an admin's file",
      "    'ai_inferred'",
      '  )),',
      '  status text not null',
      ');',
    ].join('\n');
    expect(cols(sql, 'business_evidence')).toEqual(['extraction_method', 'id', 'status']);
  });

  it('is not confused by a comma or paren inside a string default', () => {
    const sql = `
      create table t (
        a text default 'x,(y',
        b text
      );
    `;
    expect(cols(sql, 't')).toEqual(['a', 'b']);
  });

  it('accumulates into a caller-supplied map across files', () => {
    const acc = new Map<string, Set<string>>();
    parseSchemaSql('create table a (id uuid primary key);', acc);
    parseSchemaSql('create table b (id uuid primary key);', acc);
    parseSchemaSql('alter table a add column x text;', acc);
    expect([...acc.keys()].sort()).toEqual(['a', 'b']);
    expect([...acc.get('a')!].sort()).toEqual(['id', 'x']);
  });
});

describe('stripComments', () => {
  it('removes a trailing comment as well as a whole-line one', () => {
    const out = stripComments("a text, -- note\n-- whole line\nb int");
    expect(out).not.toContain('note');
    expect(out).not.toContain('whole line');
    expect(out).toContain('a text,');
    expect(out).toContain('b int');
  });

  it('keeps a -- that is inside a string literal', () => {
    // Removing it would change the value the migration writes.
    expect(stripComments("insert into t (a) values ('x -- y');")).toContain("'x -- y'");
  });

  it('keeps the contents of a dollar-quoted body', () => {
    const sql = 'create function f() as $$ begin -- inner note\n end; $$ language plpgsql;';
    expect(stripComments(sql)).toContain('inner note');
  });

  it('removes a block comment', () => {
    expect(stripComments('a /* gone */ b')).not.toContain('gone');
  });
});

describe('seedInserts — would replaying this migration write rows?', () => {
  it('returns null for a migration that only changes structure', () => {
    expect(seedInserts('create table t (id uuid primary key);')).toBeNull();
  });

  it('ignores an INSERT inside a dollar-quoted function body', () => {
    /*
     * The first false positive. This defines a trigger function; replaying it
     * is `create or replace function` and writes nothing.
     */
    const sql = [
      'create or replace function notify_owner() returns trigger as $$',
      'begin',
      "  insert into notifications (user_id, body) values (new.owner_id, 'hi');",
      '  return new;',
      'end;',
      '$$ language plpgsql;',
    ].join('\n');
    expect(seedInserts(sql)).toBeNull();
  });

  it('ignores an INSERT inside a tagged dollar-quoted body', () => {
    const sql = [
      'create function f() returns void as $body$',
      'begin',
      '  insert into t (a) values (1);',
      'end;',
      '$body$ language plpgsql;',
    ].join('\n');
    expect(seedInserts(sql)).toBeNull();
  });

  it('reports an unguarded insert', () => {
    const found = seedInserts("insert into site_settings (key, value) values ('a', 'b');");
    expect(found).toEqual({ tables: ['site_settings'], guard: 'none' });
  });

  it('reports on conflict as idempotent', () => {
    const found = seedInserts(
      "insert into site_settings (key) values ('a') on conflict (key) do nothing;",
    );
    expect(found?.guard).toBe('idempotent');
  });

  it('reports where-not-exists as if-empty rather than safe', () => {
    /*
     * The trap this whole report exists for. "Seed if empty" reads as
     * defensive and is a no-op only while the table has rows — against a
     * deliberately emptied table it inserts. So the guard is REPORTED, and the
     * caller compares it with the live row count.
     */
    const found = seedInserts(`
      insert into businesses (name)
      select 'Invented Ltd'
      where not exists (select 1 from businesses);
    `);
    expect(found?.guard).toBe('if-empty');
    expect(found?.guard).not.toBe('idempotent');
  });

  it('does not treat a commented-out insert as a seed', () => {
    expect(seedInserts("-- insert into businesses (name) values ('x');")).toBeNull();
  });

  it('strips the public. prefix from the table it names', () => {
    expect(seedInserts("insert into public.site_settings (key) values ('a');")?.tables)
      .toEqual(['site_settings']);
  });
});

describe('the real migration directory', () => {
  const DIR = 'supabase/migrations';
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

  const parseAll = (): Map<string, Set<string>> => {
    const tables = new Map<string, Set<string>>();
    for (const f of files) parseSchemaSql(readFileSync(`${DIR}/${f}`, 'utf8'), tables);
    return tables;
  };

  it('has migrations to parse', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never reports a SQL keyword as a column name', () => {
    /*
     * The generic form of the `or` bug. Any of these appearing as a column
     * means the parser has read part of an expression as a definition, and the
     * drift report will demand a column the database cannot have.
     */
    const KEYWORDS = new Set([
      'or', 'and', 'not', 'then', 'else', 'when', 'case', 'end', 'select',
      'from', 'where', 'union', 'exists', 'is', 'null', 'true', 'false',
      'as', 'with', 'order', 'group', 'having', 'limit', 'join', 'values',
      'returning', 'begin', 'declare', 'return', 'if', 'loop', 'raise',
      'coalesce', 'nulls', 'using', 'distinct', 'over', 'partition',
    ]);

    const suspects: string[] = [];
    for (const [t, set] of parseAll()) {
      for (const c of set) if (KEYWORDS.has(c.toLowerCase())) suspects.push(`${t}.${c}`);
    }
    expect(suspects).toEqual([]);
  });

  it('yields a table for every CREATE TABLE statement in every migration', () => {
    /*
     * The invariant that catches the dangerous direction directly, and keeps
     * catching it as migrations are added. A table the parser skips does not
     * show up as an error — it shows up as "no drift", which is the report
     * telling the founder that a missing table is fine.
     */
    const missed: string[] = [];
    for (const f of files) {
      const sql = readFileSync(`${DIR}/${f}`, 'utf8');
      const parsed = parseSchemaSql(sql);
      for (const m of stripComments(sql).matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/gi,
      )) {
        const name = m[1].replace(/^public\./i, '').replace(/"/g, '');
        if (!parsed.has(name)) missed.push(`${f}: ${name}`);
      }
    }
    expect(missed).toEqual([]);
  });

  it('still finds the tables it should, so the parser has not silently stopped', () => {
    const tables = parseAll();

    // A canary: if a parser change breaks CREATE TABLE matching, this fails
    // rather than the report quietly claiming the database is clean.
    expect(tables.has('businesses')).toBe(true);
    expect(tables.has('claimreach_suppressions')).toBe(true);
    // The table the apostrophe bug erased.
    expect(tables.has('business_evidence')).toBe(true);
    expect([...tables.get('claimreach_suppressions')!].sort()).toContain('contact');
    expect(tables.size).toBeGreaterThan(50);
  });
});
