/**
 * What a migration's SQL claims the schema contains — as a pure function.
 *
 * WHY THIS IS ITS OWN FILE
 *
 * It used to live inside `check-schema-drift.mjs`, which reaches the network
 * and calls `process.exit` at import time, so nothing could test it. It then
 * produced three wrong answers, each of which cost a full diagnosis:
 *
 *   1. INSERT statements inside `$$ … $$` function bodies were read as seed
 *      data, so the ledger report warned about migrations that seed nothing.
 *   2. The continuation line of a wrapped `check (a is null or b not in (…))`
 *      was read as a column, so the drift report demanded a column named `or`
 *      and a completely correct live database looked broken.
 *   3. A `create table t (id uuid primary key);` written on ONE line was not
 *      matched at all, because the pattern required a newline before the
 *      closing paren. That failure is the dangerous direction: the table is
 *      invisible to the report, which then says the database is clean.
 *
 * A diagnostic that lies is worse than no diagnostic — (2) was one step from
 * "apply a migration to fix the drift" against a database with nothing wrong
 * with it, and (3) is how real drift goes unnoticed. Extracted so
 * `schemaDriftParser.test.ts` can pin all three.
 *
 * IT IS A REGEX PARSER, NOT A SQL PARSER
 *
 * Deliberately: a real parser is a dependency and a maintenance burden for a
 * report that reads DDL this project writes itself. But the structural parts —
 * finding a statement's matching paren, and splitting a table body on its
 * top-level commas — are done by scanning rather than by regex, because that
 * is precisely where the regex version kept being wrong.
 *
 * KNOWN BLIND SPOT
 *
 * `create table` inside a plpgsql body is treated as real. Dollar-quoted
 * bodies are NOT stripped here, because this repo's migrations routinely wrap
 * conditional DDL in `do $$ … $$` blocks that do execute, and stripping them
 * would lose columns that genuinely exist.
 */

/**
 * Advance past a single-quoted literal starting at `i` (the opening quote).
 *
 * Returns the index of its closing quote. Literals are skipped whole so that a
 * paren or comma inside `default 'a,(b'` cannot be mistaken for structure.
 *
 * `E'\''`-style backslash escapes are not handled; this project's migrations do
 * not use them, and guessing at them would be worse than the known limit.
 */
function endOfLiteral(sql, i) {
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === "'") {
      if (sql[j + 1] === "'") { j += 2; continue; }  // '' is an escaped quote
      return j;
    }
    j += 1;
  }
  return sql.length - 1;   // unterminated; treat the rest as literal
}

/**
 * Remove comments, which mention tables that are not being created.
 *
 * A SCANNER, NOT TWO REGEXES, and that is not gold-plating.
 *
 * The regex version only removed `--` comments that began a line, so a
 * TRAILING one survived:
 *
 *     'csv_import',        -- an admin's file
 *
 * The apostrophe in "admin's" then opened a string literal that ran to the
 * next quote, the quote parity inverted for the rest of the file, and the
 * closing paren of the table was swallowed inside a phantom literal. The
 * parser found no table at all — and `business_evidence` and everything after
 * it in that file vanished from the drift report, which then said the database
 * was clean. Losing a table silently is the worst failure this script has.
 *
 * Dollar-quoted bodies are copied through verbatim: their contents are code,
 * and `--` inside them is that code's comment, not ours to remove. Later
 * passes handle them.
 */
export function stripComments(sql) {
  let out = '';
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];

    // $$ … $$ or $tag$ … $tag$ — copy whole, comments and all.
    if (ch === '$') {
      const tag = /^\$[a-z_]*\$/i.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        if (end >= 0) {
          out += sql.slice(i, end + tag[0].length);
          i = end + tag[0].length - 1;
          continue;
        }
      }
    }

    // A string literal: copy whole, so a `--` inside it stays.
    if (ch === "'") {
      const end = endOfLiteral(sql, i);
      out += sql.slice(i, end + 1);
      i = end;
      continue;
    }

    // -- to end of line. The newline itself is kept.
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      if (nl < 0) break;
      i = nl - 1;
      continue;
    }

    // /* … */
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }

    out += ch;
  }
  return out;
}

/**
 * The text between the `(` at `open` and its MATCHING `)`.
 *
 * Returns null when the parens do not balance, which is a refusal rather than
 * a guess: half a table definition produces half a column list, and a report
 * built on half a column list is worse than one that says it could not read
 * the file.
 */
function balanced(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'") { i = endOfLiteral(sql, i); continue; }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * A table body split into its definitions, on TOP-LEVEL commas only.
 *
 * Splitting on commas rather than on newlines is what makes a single-line
 * `create table t (a text, b int)` and a wrapped multi-line constraint both
 * come out right — the two shapes that each broke the line-based version.
 */
function splitDefinitions(body) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "'") { i = endOfLiteral(body, i); continue; }
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out;
}

/** Definitions that describe the table rather than a column. */
const NOT_A_COLUMN = /^\s*(constraint|primary|unique|foreign|check|exclude|like|partition)\b/i;

/**
 * Add every table and column `sql` creates to `tables` (table -> Set<column>).
 *
 * Accumulates into a caller-supplied Map so a whole migration directory folds
 * into one result without merging Maps afterwards.
 */
export function parseSchemaSql(rawSql, tables = new Map()) {
  const add = (table, column) => {
    const t = table.replace(/^public\./i, '').replace(/"/g, '');
    if (!tables.has(t)) tables.set(t, new Set());
    if (column) tables.get(t).add(column.replace(/"/g, ''));
  };

  const sql = stripComments(rawSql);

  // CREATE TABLE [IF NOT EXISTS] <name> ( <definitions> )
  const head = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)\s*\(/gi;
  for (const m of sql.matchAll(head)) {
    const open = m.index + m[0].length - 1;   // the '(' itself
    const body = balanced(sql, open);
    if (body === null) continue;              // unbalanced: read nothing

    add(m[1], null);
    for (const def of splitDefinitions(body)) {
      if (NOT_A_COLUMN.test(def)) continue;
      const col = /^\s*("?[a-z_][a-z0-9_]*"?)\s+[a-z"]/i.exec(def);
      if (col) add(m[1], col[1]);
    }
  }

  // ALTER TABLE <name> ADD COLUMN [IF NOT EXISTS] <col>
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)([\s\S]*?);/gi)) {
    for (const c of m[2].matchAll(
      /add\s+column\s+(?:if\s+not\s+exists\s+)?("?[a-z_][a-z0-9_]*"?)/gi,
    )) {
      add(m[1], c[1]);
    }
  }

  return tables;
}

/**
 * Does replaying this migration INSERT rows, and is that insert guarded?
 *
 * Two subtleties, both learned the hard way:
 *
 * 1. `$$ … $$` bodies are stripped first. A trigger function containing an
 *    INSERT does not write a row when the migration runs — replaying it is
 *    `create or replace function`. Reading those bodies flagged
 *    20260829010000_keep_notifications.sql as a seed when it writes nothing.
 *
 * 2. The guard is reported, never trusted. `where not exists (…)` reads as
 *    defensive but is a no-op ONLY while the table has rows; against an
 *    emptied table it inserts. The caller must compare it with the live row
 *    count, which is why this returns the guard rather than a verdict.
 *
 * Returns null when the migration inserts nothing.
 */
export function seedInserts(rawSql) {
  const sql = stripComments(rawSql)
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, '')
    .toLowerCase();

  const inserts = [...sql.matchAll(/insert\s+into\s+([a-z0-9_."]+)/g)];
  if (!inserts.length) return null;

  const tables = [
    ...new Set(inserts.map((m) => m[1].replace(/^public\./, '').replace(/"/g, ''))),
  ];

  let guard = 'none';
  if (/on\s+conflict/.test(sql)) guard = 'idempotent';
  else if (/where\s+not\s+exists/.test(sql)) guard = 'if-empty';

  return { tables, guard };
}
