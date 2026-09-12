import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * The Import Center must offer to UPDATE what NowOpen already has, not create
 * it again.
 *
 * `findInternalDuplicates` catches the same shop twice inside one file. Nothing
 * compared the file against the database, so re-uploading a corrected export —
 * or a second file from the same source — created every business a second
 * time. The directory's whole promise is that a name on NowOpen can be
 * reached; two of the same, one stale, breaks that directly.
 *
 * The matcher itself is tested in src/lib/imports/matchExisting.test.ts, where
 * the behaviour lives. This file pins the wiring that would otherwise let a
 * correct matcher sit unused behind a button that still says "import
 * everything".
 */

const src = readFileSync('src/components/admin/ImportCenter.tsx', 'utf8');

describe('the file is compared against the database', () => {
  it('fetches what NowOpen already has', () => {
    expect(src).toMatch(/matchExisting/);
    expect(src).toMatch(/setExisting/);
  });

  it('reads the fields the matcher needs to build keys', () => {
    for (const f of ['phone', 'website', 'user_id', 'claim_status']) {
      expect(src).toContain(f);
    }
  });

  it('fetches once rather than querying per row', () => {
    /*
     * A per-row lookup is 10,000 round trips on a large file. The keys are
     * small enough to hold in memory well past current scale, and the comment
     * says where that stops being true.
     */
    expect(src).toMatch(/Fetched once rather than queried per row/);
    expect(src).toMatch(/at six figures of businesses/);
  });

  it('treats a claimed business as owner-owned', () => {
    // An owner's own edits must never be overwritten by a spreadsheet.
    expect(src).toMatch(/ownedByUser: Boolean\(b\.user_id\) \|\| b\.claim_status === 'claimed'/);
  });
});

describe('the create button stops promising the thing to avoid', () => {
  it('counts only rows that would genuinely create something', () => {
    /*
     * THE DEFECT. The button offered to import every valid row, matched or
     * not — so the honest fix to duplicate creation had to change what the
     * button counts, not just add a panel beside it.
     */
    expect(src).toMatch(/const newRowCount = useMemo/);
    expect(src).toMatch(/&& !dbMatches\.has\(r\.lineNo\)/);
    expect(src).toMatch(/&& !internalDupes\.has\(r\.lineNo\)/);
  });

  it('labels itself as new businesses, not as rows', () => {
    expect(src).toMatch(/Import \{newRowCount\.toLocaleString\(\)\} new/);
    expect(src).not.toMatch(/Import \{\(summary\.valid \+ summary\.review\)\.toLocaleString\(\)\} rows/);
  });

  it('disables on the new count, not the raw valid count', () => {
    expect(src).toMatch(/disabled=\{busy \|\| missing\.length > 0 \|\| newRowCount === 0/);
  });
});

describe('nothing is approved blind', () => {
  it('reports the four outcomes separately', () => {
    // One combined "duplicates" number tells an admin nothing about which
    // action to take.
    for (const k of ['toUpdate', 'toReview', 'ownerClaimed', 'unchanged']) {
      expect(src).toContain(`matchStats.${k}`);
    }
  });

  it('shows the field-level diff before the update is applied', () => {
    expect(src).toMatch(/See what would change/);
    expect(src).toMatch(/c\.from \|\| '\(blank\)'/);
  });

  it('explains the weak match rather than just counting it', () => {
    expect(src).toMatch(/two different\s*\n?\s*\*?\s*businesses can share those/);
  });
});

describe('the update writes safely', () => {
  it('applies only rows marked update', () => {
    expect(src).toMatch(/filter\(\(m\) => m\.action === 'update'\)/);
  });

  it('goes through updatePatch, so a forbidden field cannot reach the database', () => {
    expect(src).toMatch(/const patch = updatePatch\(match\)/);
  });

  it('uses update, never upsert', () => {
    /*
     * An upsert needs the full row and would write NULL over every column the
     * file does not carry — which is how an enriching import becomes a
     * destructive one.
     */
    expect(src).toMatch(/\.update\(patch\)\.eq\('id', match\.businessId\)/);
    expect(src).not.toMatch(/from\('businesses'\)\.upsert/);
  });

  it('checks `error` rather than relying on a catch', () => {
    /*
     * supabase-js RESOLVES with { error } on failure, so a try/catch around
     * these writes would report success on every failed one.
     */
    expect(src).toMatch(/if \(error\) failed \+= 1; else done \+= 1;/);
    expect(src).toMatch(/supabase-js resolves with \{ error \} on failure/);
  });

  it('reports partial failure honestly', () => {
    expect(src).toMatch(/\$\{done\} updated, \$\{failed\} could not be saved/);
  });
});
