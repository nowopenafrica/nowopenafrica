import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The review queue must show what discovery sourced.
 *
 * ── THE BUG THIS PINS ────────────────────────────────────────────────────
 *
 * MEASURED 2026-09-23. ReviewTab fetched the newest 100 candidates by
 * created_at and then filtered them by status in the browser. With 3,668
 * candidates on file that is a window, not a queue.
 *
 * It failed in a way that looked like nothing was wrong:
 *
 *   · the tab counts were already computed server-side and were CORRECT,
 *     so the header read "Discovery queue · 28"
 *   · the rows came from a 100-row window that contained none of them,
 *     so the list underneath was empty
 *
 * And because staging UPSERTS — re-seeing a business updates the existing row
 * and leaves created_at alone — a freshly sourced candidate could sort near
 * the bottom of the table and never enter the window at all. Which is exactly
 * the report: sourcing runs, and the queue does not show what it found.
 *
 * These assertions are on the SOURCE rather than on rendered output, because
 * what matters is where the filtering happens. A component test would pass
 * just as happily with the filter in the wrong place, so long as the mock
 * returned rows that fitted the window.
 */

const SRC = readFileSync('src/components/admin/businessIntelligence/ReviewTab.tsx', 'utf8');

describe('the queue is filtered in the database', () => {
  it('constrains candidates by status in the query', () => {
    // `.in('status', …)` on the candidate query is the whole fix.
    expect(SRC).toMatch(/rowQuery\s*=\s*rowQuery\.in\('status',\s*statuses\)/);
  });

  it('keeps the fetched statuses and the counted statuses in step', () => {
    /*
     * The header count and the rendered list must answer the same question.
     * They disagreed before, which is why the screen could show a number above
     * an empty list.
     */
    expect(SRC).toMatch(/SEGMENT_STATUSES[\s\S]*?queue:\s*\['pending',\s*'review'\]/);
    expect(SRC).toMatch(/\.in\('status',\s*\['pending',\s*'review'\]\)/);
  });

  it('reloads when the reviewer changes segment', () => {
    // The rows are now segment-specific, so a stale `[]` dependency would show
    // one segment's records under another's tab.
    // Now also depends on `page`, since the range is derived from it.
    expect(SRC).toMatch(/\},\s*\[segment,\s*page\]\)/);
  });
});

describe('nothing asks for columns businesses does not have', () => {
  /*
   * MEASURED: the select asked for city, latitude and longitude and PostgREST
   * answered 42703 — one wrong name fails the WHOLE select, so the duplicate
   * checker had nothing to compare against and every candidate looked new.
   */
  it.each(['city', 'latitude', 'longitude'])('does not select businesses.%s', (col) => {
    const selects = [...SRC.matchAll(/from\('businesses'\)\s*\.select\('([^']+)'/g)].map((m) => m[1]);
    expect(selects.length, 'no businesses select found — has the query moved?').toBeGreaterThan(0);
    for (const sel of selects) {
      expect(sel.split(',').map((c) => c.trim())).not.toContain(col);
    }
  });

  it('uses location, which is the column that exists', () => {
    const selects = [...SRC.matchAll(/from\('businesses'\)\s*\.select\('([^']+)'/g)].map((m) => m[1]);
    expect(selects.some((sel) => sel.includes('location'))).toBe(true);
  });

  it('reports a failed businesses read instead of matching against nothing', () => {
    // Swallowing it is what let the broken column name survive unnoticed.
    // Matched on the behaviour, not one variable name: the point is that a
    // failed read reaches the reviewer, not what the binding is called.
    expect(SRC).toMatch(/bizError|biz\.error/);
    expect(SRC).toMatch(/setBusinesses\(\[\]\)/);
    expect(SRC).toMatch(/duplicate checks are incomplete/i);
  });
});

describe('a large queue is reachable, not capped', () => {
  /*
   * MEASURED 2026-09-23: a discovery run produced 1,326 candidates. A flat
   * limit hides most of a real queue behind a header that states the true
   * total — the same contradiction the status filter fixed, one page down.
   */
  it('pages with range rather than re-reading page one', () => {
    expect(SRC).toMatch(/\.range\(0,\s*\(page \+ 1\) \* ROWS_PER_SEGMENT - 1\)/);
  });

  it('orders by a unique tiebreaker as well as the timestamp', () => {
    /*
     * Rows staged in one bulk insert share created_at to the millisecond.
     * Without `id`, the same candidate can appear on two pages while another
     * appears on none.
     */
    const q = SRC.slice(SRC.indexOf("from('radar_candidates')"));
    expect(q).toMatch(/order\('created_at'[\s\S]{0,120}order\('id'/);
  });

  it('offers more while fewer rows are loaded than the segment holds', () => {
    expect(SRC).toMatch(/rows\.length < \(totals\[segment\] \?\? 0\)/);
    expect(SRC).toMatch(/setPage\(\(n\) => n \+ 1\)/);
  });

  it('restarts paging when the reviewer switches segment', () => {
    // A deep page in one segment must not over-fetch another.
    expect(SRC).toMatch(/setSegment\(s\.key\);\s*setPage\(0\)/);
  });
});

describe('the load stays small', () => {
  it('fetches evidence only for the candidates on screen', () => {
    /*
     * It used to take 500 evidence rows unrelated to what was rendered, so a
     * candidate's evidence appeared or vanished depending on where it fell in
     * the table.
     */
    expect(SRC).toMatch(/radar_candidate_evidence'\)\.select\('\*'\)\.in\('candidate_id',\s*ids\)/);
    expect(SRC).not.toMatch(/radar_candidate_evidence'\)\.select\('\*'\)\.limit\(500\)/);
  });

  it('stays clear of the silent 1,000-row ceiling', () => {
    /*
     * PostgREST truncates at 1,000 with no error, so a limit at or above it
     * would not fail — it would quietly return 1,000 rows and read as the
     * whole queue.
     */
    const m = SRC.match(/const ROWS_PER_SEGMENT = (\d+)/);
    expect(m, 'ROWS_PER_SEGMENT not found').toBeTruthy();
    expect(Number(m![1])).toBeLessThan(1000);
  });

  it('does not hold the queue behind the duplicate-check data', () => {
    /*
     * The businesses list is the largest thing this screen fetches — ~106KB,
     * about a second — and it only feeds the duplicate panels. Awaiting it made
     * a reviewer wait on data they could not act on yet. It must be fetched
     * after `setLoading(false)`, not inside the blocking Promise.all.
     */
    const blocking = SRC.match(/await Promise\.all\(\[([\s\S]*?)\]\);/);
    expect(blocking, 'Promise.all not found').toBeTruthy();
    expect(blocking![1]).not.toMatch(/from\('businesses'\)/);

    const loadingFalse = SRC.indexOf('setLoading(false)');
    const bizFetch = SRC.indexOf("from('businesses')");
    expect(bizFetch, 'businesses fetch not found').toBeGreaterThan(-1);
    expect(bizFetch).toBeGreaterThan(loadingFalse);
  });

  it('no longer pulls two thousand businesses on every load', () => {
    expect(SRC).not.toMatch(/from\('businesses'\)[\s\S]{0,160}?\.limit\(2000\)/);
  });
});
