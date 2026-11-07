/**
 * Every table the code reads has to be a table that exists.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * MEASURED 2026-10-09: `useCommandData` queried `verification_docs`. The real
 * table is `verification_documents`, and the one it asked for had never
 * existed. PostgREST rejected the whole request, the hook's
 * `docsRes.data ?? []` turned that rejection into an empty array, and the
 * Command Center reported "0 pending verifications" as a fact about the
 * platform.
 *
 * It read correctly only by coincidence — the real table held 0 rows — and it
 * would have gone on reading 0 forever as documents arrived. TrustPanel (where
 * an owner uploads a document) and AdminDashboard (where an admin reviews it)
 * both had the name right. One typo, in one hook, invisible.
 *
 * ── THE SHAPE OF THE BUG ─────────────────────────────────────────────────
 *
 * A wrong table name and an empty table produce the same thing: nothing. This
 * codebase has hit that shape repeatedly — a mistyped COLUMN kills a whole
 * select and returns null, a blocked delete reports success with 0 rows, an
 * empty table gets reported as a missing migration. Nothing in TypeScript
 * checks a string passed to `.from()`, so a test has to.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

/** Every .ts/.tsx file under a directory. */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

/**
 * Table and view names the SQL in this repo creates.
 *
 * Both locations are read on purpose: `supabase/migrations` is the real
 * history, but the `os_*` tables are declared only in the consolidated
 * `scripts/sql/apply_all_migrations.sql`. Reading one and not the other would
 * report four live tables as missing.
 */
function definedObjects(): Set<string> {
  const sql = [
    ...readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(join('supabase/migrations', f), 'utf8')),
    readFileSync('scripts/sql/apply_all_migrations.sql', 'utf8'),
  ].join('\n');

  const out = new Set<string>();
  // CREATE [OR REPLACE] TABLE|VIEW|MATERIALIZED VIEW [IF NOT EXISTS] [public.]name
  const re = /create\s+(?:or\s+replace\s+)?(?:table|view|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi;
  for (const m of sql.matchAll(re)) out.add(m[1].toLowerCase());
  return out;
}

/** Every `supabase.from('x')` / `.from('x')` name in application code. */
function referencedTables(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of [...walk('src'), ...walk('supabase/functions')]) {
    // This test names tables in prose; it is not a caller.
    if (file.includes('tableNamesExist')) continue;
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/\.from\(\s*'([a-z0-9_]+)'\s*\)/g)) {
      const table = m[1];
      found.set(table, [...(found.get(table) ?? []), file]);
    }
  }
  return found;
}

describe('every table the code queries exists', () => {
  it('names no table that the SQL in this repo never creates', () => {
    const defined = definedObjects();
    const offenders: string[] = [];

    for (const [table, files] of referencedTables()) {
      if (!defined.has(table)) offenders.push(`${table} — queried in ${files[0]}`);
    }

    /*
     * If this fails, check the spelling against the migration before adding
     * the table to the migrations: the last time it fired, the table was real
     * and the caller was wrong.
     */
    expect(offenders).toEqual([]);
  });

  it('actually reads both SQL locations, rather than passing on an empty set', () => {
    /*
     * The failure mode of a test like this is finding nothing and reporting
     * success. Pin a table from each source so an extraction that silently
     * stops matching cannot pass.
     */
    const defined = definedObjects();
    expect(defined.size).toBeGreaterThan(100);
    // From supabase/migrations:
    expect(defined).toContain('businesses');
    expect(defined).toContain('verification_documents');
    expect(defined).toContain('instagram_handle_checks');
    // A view, and a table declared only in the consolidated file:
    expect(defined).toContain('discovery_campaign_status');
    expect(defined).toContain('os_documents');
  });

  it('actually finds the call sites, rather than passing on an empty scan', () => {
    const referenced = referencedTables();
    expect(referenced.size).toBeGreaterThan(50);
    expect(referenced.has('businesses')).toBe(true);
  });

  it('is not fooled by the name that caused this', () => {
    // `verification_docs` is not a table. If anything reintroduces it, the
    // first test above must fail rather than shrug.
    expect(definedObjects().has('verification_docs')).toBe(false);
  });
});
