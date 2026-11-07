import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchAllBusinesses,
  PAGE_SIZE,
  PUBLIC_DIRECTORY_COLUMNS,
  PUBLIC_DIRECTORY_SELECT,
  COLUMNS_THE_CLIENT_NEVER_READS,
  SERVER_ROW_CAP,
} from './fetchAllBusinesses';

/*
 * The behaviour the admin panel and the public directory both depend on.
 *
 * PostgREST caps a single response at 1000 rows whatever the requested limit,
 * with no error and no signal — which is exactly how the Businesses panel got
 * stuck at "1–100 of 1000" while the table held more. These tests pin the walk
 * itself: pages under the cap, stops on an empty page, orders like each caller
 * needs, and reports truncation at its own ceiling instead of pretending.
 */

interface PageRequest {
  from: number;
  to: number;
  eqIsListable: boolean;
  /** Every .eq() the builder received, in order. */
  eqs: [string, unknown][];
  orders: { column: string; ascending: boolean }[];
  /** Exactly what was handed to .select() — '*' or a column list. */
  select: string;
}

/*
 * `vi.hoisted` keeps the capture array in the same scope as the mock factory
 * below no matter how vitest reorders the `vi.mock` call above the imports —
 * the factory and the tests must see the same bindings.
 */
const h = vi.hoisted(() => {
  const requests: PageRequest[] = [];
  const responder = (_req: PageRequest): { data: unknown[] | null; error: { message: string } | null } => ({ data: [], error: null });
  return { requests, responder };
});

const { requests } = h;
const responder = (fn: (req: PageRequest) => { data: unknown[] | null; error: { message: string } | null }) => {
  h.responder = fn;
};

const row = (i: number) => ({ id: `b${i}` });

/** A page of `count` invented rows, or the given error. */
const ok = (count: number) => ({ data: Array.from({ length: count }, (_, i) => row(i)), error: null });

vi.mock('./supabase', () => ({
  supabase: {
    from: () => {
      const state = {
        listable: false,
        eqs: [] as [string, unknown][],
        orders: [] as { column: string; ascending: boolean }[],
        select: '',
      };
      const query = {
        select: (cols: string) => {
          state.select = cols;
          return query;
        },
        eq: (col: string, val: unknown) => {
          state.eqs.push([col, val]);
          if (col === 'is_listable') state.listable = val as boolean;
          return query;
        },
        order: (column: string, opts: { ascending: boolean }) => {
          state.orders.push({ column, ascending: opts.ascending });
          return query;
        },
        range: (from: number, to: number) => {
          const req = { from, to, eqIsListable: state.listable, eqs: state.eqs, orders: state.orders, select: state.select };
          h.requests.push(req);
          return Promise.resolve(h.responder(req));
        },
      };
      return query;
    },
  },
}));

beforeEach(() => {
  requests.length = 0;
  responder(() => ok(0));
});

describe('fetchAllBusinesses', () => {
  it('walks .range() pages until an empty page says the table is over', async () => {
    responder(({ from }) => ok(from === 0 ? PAGE_SIZE : from === PAGE_SIZE ? 50 : 0));
    const result = await fetchAllBusinesses();
    expect(result.error).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.data).toHaveLength(PAGE_SIZE + 50);
  });

  it('never asks for more rows than the exposed PAGE_SIZE, however big the cap', async () => {
    responder(({ to }) => ({ data: Array.from({ length: to + 1 }, (_, i) => row(i)), error: null }));
    await fetchAllBusinesses({ cap: 10_000 });
    for (const req of requests) {
      expect(req.to - req.from + 1).toBeLessThanOrEqual(PAGE_SIZE);
    }
  });

  it('orders newest-first and applies no listing filter for the admin panel', async () => {
    responder(({ from }) => ok(from === 0 ? PAGE_SIZE : 0));
    await fetchAllBusinesses();
    expect(requests[0].eqIsListable).toBe(false);
    expect(requests[0].orders).toEqual([{ column: 'created_at', ascending: false }]);
  });

  it('filters to listable rows and sorts by listing score for the directory', async () => {
    responder(({ from }) => ok(from === 0 ? PAGE_SIZE : 0));
    await fetchAllBusinesses({ isListable: true });
    expect(requests[0].eqIsListable).toBe(true);
    /*
     * And excludes submissions awaiting review.
     *
     * `profile_state` is NOT part of the generated `is_listable` column, so
     * filtering one without the other puts every unreviewed /add-business
     * submission straight into the public directory. See
     * src/test/submissionVisibility.test.ts, which enforces the same pairing
     * across every query site in the codebase.
     */
    expect(requests[0].eqs).toContainEqual(['profile_state', 'published']);
    expect(requests[0].orders).toEqual([
      { column: 'listing_score', ascending: false },
      { column: 'created_at', ascending: false },
    ]);
  });

  it('reports loudly when the walk hits its own ceiling', async () => {
    responder(() => ok(PAGE_SIZE));
    const result = await fetchAllBusinesses({ cap: 2500 });
    expect(result.error).toBeNull();
    expect(result.truncated).toBe(true);
    // The last page is clamped to the cap, not allowed to overshoot it.
    expect(requests[requests.length - 1].to).toBe(2499);
  });

  it('surfaces the first failed request instead of pretending the walk finished', async () => {
    responder(({ from }) => (from === PAGE_SIZE ? { data: null, error: { message: 'boom' } } : ok(PAGE_SIZE)));
    const result = await fetchAllBusinesses();
    expect(result.error).toBe('boom');
    expect(result.truncated).toBe(false);
  });
});

/*
 * ── THE PAYLOAD THE PUBLIC DIRECTORY SENDS ───────────────────────────────
 *
 * MEASURED 2026-10-09 on the live table: 4,010 listable rows, 100 columns,
 * 4,685 kB of JSON per visitor — of which 1,411 kB (30.1%) was columns no
 * browser code reads. `search_vector` alone, a tsvector the browser cannot
 * use for anything, was 477 kB.
 *
 * Naming columns instead of taking `*` is what removes that. The cost of
 * naming them is that a new column no longer arrives on its own, so these
 * tests exist to make the drift loud instead of silent.
 */
describe('the columns the public directory asks for', () => {
  it('names its columns for the public, and still reads everything for admin', async () => {
    responder(({ from }) => ok(from === 0 ? PAGE_SIZE : 0));

    await fetchAllBusinesses({ isListable: true });
    expect(requests[0].select).toBe(PUBLIC_DIRECTORY_SELECT);
    expect(requests[0].select).not.toBe('*');

    requests.length = 0;
    await fetchAllBusinesses();
    // An operator inspecting a record is exactly who needs the provenance.
    expect(requests[0].select).toBe('*');
  });

  it('never sends a column it has decided nothing reads', () => {
    for (const col of COLUMNS_THE_CLIENT_NEVER_READS) {
      expect(PUBLIC_DIRECTORY_COLUMNS, col).not.toContain(col);
    }
  });

  it('asks for each column exactly once', () => {
    const seen = PUBLIC_DIRECTORY_COLUMNS.filter((c, i) => PUBLIC_DIRECTORY_COLUMNS.indexOf(c) !== i);
    expect(seen).toEqual([]);
  });

  /*
   * The guard that matters most.
   *
   * If somebody starts rendering `logo_licence`, the directory would hand
   * them `undefined` with no error anywhere — the same silent shape as a
   * mistyped column killing a whole select. This fails the moment a
   * denylisted name appears in application code, so the choice gets made
   * deliberately: either the column goes back into the payload, or it does
   * not get read.
   */
  it('fails if application code starts reading a column that was dropped', () => {
    const offenders: string[] = [];

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });

    for (const file of walk('src')) {
      // This module and its test name every column on purpose.
      if (file.includes('fetchAllBusinesses')) continue;
      /*
       * Tests assert about schema and migration SQL rather than render a
       * listing, so a column name there is a statement about the database,
       * not a field somebody expects the directory to deliver.
       * `trustAndScale.test.ts` naming `search_vector` is exactly that.
       */
      if (/\.test\.tsx?$/.test(file)) continue;
      const source = readFileSync(file, 'utf8');
      for (const col of COLUMNS_THE_CLIENT_NEVER_READS) {
        /*
         * `\b` after the name keeps `logo_source` from matching
         * `logo_source_url`, which is a separate decision.
         *
         * A name followed by `:` is an object-literal key or a type
         * declaration — that is a WRITE, like the admin importer setting
         * `source_license`, and writing a column the directory does not read
         * back is perfectly coherent. Only reads are the hazard here.
         */
        if (new RegExp(`\\b${col}\\b(?!\\s*\\??\\s*:)`).test(source)) offenders.push(`${col} in ${file}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  /*
   * ── NO `.limit()` MAY EXCEED THE SERVER'S ROW CAP ──────────────────────
   *
   * PostgREST truncates a single response at `db-max-rows` (1000) with no
   * error and no signal, so `.limit(50000)` does not mean "everything" — it
   * means 1000, and the caller believes otherwise.
   *
   * MEASURED 2026-10-09, after an existing guard in trustAndScale.test.ts
   * failed to catch any of this because it only read one file:
   *   - DiscoveryPanel de-duplicated candidates against 1,000 of 4,010
   *     listings, so discovery could re-offer businesses NowOpen already has
   *   - AdminBusinessPicker offered an admin 1,000 of 4,010 businesses
   *   - useCommandData computed every platform figure about businesses —
   *     counts, verified share, category mix — from a quarter of the table
   *
   * The answer is never a bigger number. It is `.range()` paging, which
   * fetchAllBusinesses does, or an honest `.limit(SERVER_ROW_CAP)` where one
   * request genuinely suffices.
   */
  it('has no .limit() anywhere that exceeds what one request can return', () => {
    const offenders: string[] = [];

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });

    for (const file of [...walk('src'), ...walk('supabase/functions')]) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // Prose about the trap is not the trap. Skip comment lines.
        if (/^\s*(\*|\/\/)/.test(line)) return;
        for (const m of line.matchAll(/\.limit\((\d[\d_]*)\)/g)) {
          const asked = Number(m[1].replace(/_/g, ''));
          if (asked > SERVER_ROW_CAP) offenders.push(`${file}:${i + 1} asks for ${asked}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  /*
   * And the drift from the other direction: a migration adds a column, and
   * nobody classifies it. Without this the column simply never reaches the
   * directory, and the bug surfaces as a blank field months later.
   */
  it('has classified every column the migrations add to businesses', () => {
    const known = new Set<string>([...PUBLIC_DIRECTORY_COLUMNS, ...COLUMNS_THE_CLIENT_NEVER_READS]);
    const dir = 'supabase/migrations';
    const unclassified = new Set<string>();

    for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, file), 'utf8');
      // Each `alter table businesses ...` up to its terminating semicolon.
      for (const stmt of sql.match(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?businesses\b[^;]*/gi) ?? []) {
        for (const add of stmt.match(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi) ?? []) {
          const col = add.split(/\s+/).pop()!.toLowerCase();
          if (!known.has(col)) unclassified.add(`${col} (${file})`);
        }
      }
    }

    expect([...unclassified]).toEqual([]);
  });
});