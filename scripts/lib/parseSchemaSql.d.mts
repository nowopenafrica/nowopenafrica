/**
 * Types for the drift parser, so a test in src/ can import it under `strict`.
 *
 * The implementation stays plain .mjs because it runs as a node script with no
 * build step; this file only describes it.
 */

/** Remove SQL comments, keeping string literals and dollar-quoted bodies intact. */
export function stripComments(sql: string): string;

/** Add every table and column `sql` creates to `tables` (table -> Set<column>). */
export function parseSchemaSql(
  rawSql: string,
  tables?: Map<string, Set<string>>,
): Map<string, Set<string>>;

/** Row-inserting migrations and how (or whether) the insert is guarded. */
export function seedInserts(
  rawSql: string,
): { tables: string[]; guard: 'none' | 'if-empty' | 'idempotent' } | null;
