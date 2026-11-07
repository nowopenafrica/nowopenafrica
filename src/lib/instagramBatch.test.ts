/**
 * Reading a handle list out of a spreadsheet.
 *
 * Batch work fails quietly: a column picked wrongly looks up two hundred
 * business names as handles, reports them all missing, and nobody can tell
 * that from an account list that genuinely is stale.
 */

import { readFileSync } from 'node:fs';

import { describe, it, expect } from 'vitest';

import { planBatch, pickHandleColumn, readHandle, BATCH_LIMIT } from './instagramBatch';

describe('finding the column', () => {
  it('prefers a handle column over anything else in the file', () => {
    // A file with both must not look up the business names.
    expect(pickHandleColumn(['name', 'city', 'instagram'])).toBe('instagram');
    expect(pickHandleColumn(['Business Name', 'IG Handle'])).toBe('IG Handle');
    expect(pickHandleColumn(['username'])).toBe('username');
  });

  it('takes the only column when there is only one', () => {
    // People paste a bare list; whatever it is called, it is the list.
    expect(pickHandleColumn(['anything at all'])).toBe('anything at all');
  });

  it('refuses to guess when nothing looks like handles', () => {
    /*
     * Returning the first column would look up two hundred business names and
     * report every one missing — indistinguishable from a stale list.
     */
    expect(pickHandleColumn(['name', 'city', 'phone'])).toBeNull();
  });
});

describe('reading a cell', () => {
  it('accepts every form a person pastes', () => {
    for (const v of [
      'adafabrics', '@adafabrics', 'AdaFabrics', ' adafabrics ',
      'instagram.com/adafabrics', 'https://www.instagram.com/adafabrics/',
      'https://instagram.com/AdaFabrics?igsh=xyz',
    ]) {
      expect(readHandle(v), v).toBe('adafabrics');
    }
  });

  it('rejects a POST link rather than looking up "p"', () => {
    /*
     * The common paste mistake. Taking the first path segment would look up a
     * handle called "p" and report it missing, which reads as the account
     * being gone rather than the wrong link being pasted.
     */
    expect(readHandle('https://www.instagram.com/p/Cxyz123/')).toBeNull();
    expect(readHandle('https://www.instagram.com/reel/Cxyz/')).toBeNull();
    expect(readHandle('https://www.instagram.com/stories/someone/123/')).toBeNull();
  });

  it('rejects anything outside Instagram\'s character set', () => {
    for (const v of ['two words', 'a/b', 'a&b', '', '   ', 'x'.repeat(31)]) {
      expect(readHandle(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe('planning the batch', () => {
  const rows = (vals: string[]) => vals.map((instagram) => ({ instagram }));

  it('lists what will actually be looked up', () => {
    const plan = planBatch(['instagram'], rows(['@ada', 'https://instagram.com/bola/', 'chidi']));
    expect(plan.handles).toEqual(['ada', 'bola', 'chidi']);
    expect(plan.column).toBe('instagram');
  });

  it('counts a repeated handle once, however it is written', () => {
    // Otherwise the same account is looked up twice and filed twice.
    const plan = planBatch(['instagram'], rows(['@ada', 'ada', 'https://instagram.com/ADA/']));
    expect(plan.handles).toEqual(['ada']);
    expect(plan.duplicates).toHaveLength(2);
  });

  it('keeps rejected cells with their row number and the text', () => {
    /*
     * "Row 4: 'Ada Fabrics Ltd' is not a handle" is actionable. A count of
     * failures is not.
     */
    const plan = planBatch(['instagram'], rows(['ada', 'Ada Fabrics Ltd']));
    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0].line).toBe(3);
    expect(plan.rejected[0].raw).toBe('Ada Fabrics Ltd');
  });

  it('ignores blank rows without calling them errors', () => {
    // Spreadsheets are full of trailing blanks.
    const plan = planBatch(['instagram'], rows(['ada', '', '   ', 'bola']));
    expect(plan.handles).toEqual(['ada', 'bola']);
    expect(plan.rejected).toHaveLength(0);
  });

  it('does NOT treat a column NAME as an account', () => {
    /*
     * "instagram", "username" and "handle" all pass Instagram's character
     * set, so a file headed `instagram` would otherwise look up the
     * @instagram account and file Meta's own profile as a candidate.
     */
    for (const header of ['instagram', 'username', 'handle', 'ig']) {
      const plan = planBatch([header], [{ [header]: 'ada' }]);
      expect(plan.handles, `header ${header} was read as an account`).toEqual(['ada']);
    }
  });

  it('does not lose the first account when the header IS a handle', () => {
    /*
     * A pasted bare list has no header, so the CSV parser takes the first
     * account as one. Dropping it loses a business silently.
     */
    const plan = planBatch(['adafabrics'], [{ adafabrics: 'bola' }]);
    expect(plan.handles).toEqual(['adafabrics', 'bola']);
  });

  it('numbers rows as a spreadsheet does', () => {
    // So "row 3" means row 3 on screen, header included.
    const plan = planBatch(['instagram'], rows(['ada', 'bola']));
    expect(plan.rows[0].line).toBe(2);
    expect(plan.rows[1].line).toBe(3);
  });
});

describe('the ceiling', () => {
  it('is modest on purpose', () => {
    /*
     * Not a technical limit — Meta would serve more. It caps how much one
     * unattended click can do against somebody else's API and into our review
     * queue; a thousand-row file is usually a mistake or a harvested list.
     */
    expect(BATCH_LIMIT).toBeLessThanOrEqual(1000);
    expect(BATCH_LIMIT).toBeGreaterThan(10);
    /*
     * The guarantee is that a ceiling EXISTS and the file is truncated to it,
     * not the particular number — which is an operator's call. What must not
     * happen is an unbounded file running unattended.
     */
    const plan = planBatch(['instagram'],
      Array.from({ length: BATCH_LIMIT + 5 }, (_, i) => ({ instagram: `acct${i}` })));
    expect(plan.handles.length).toBeGreaterThan(BATCH_LIMIT);
    expect(plan.handles.slice(0, BATCH_LIMIT)).toHaveLength(BATCH_LIMIT);
  });
});

describe('what a batch is forbidden from carrying', () => {
  const PANEL = readFileSync('src/components/admin/businessIntelligence/InstagramBatchExtract.tsx', 'utf8');

  /*
   * ── THIS RULE CHANGED ON 2026-10-09, AND WHY ───────────────────────────
   *
   * It used to read "files facts only — never services, products or a logo",
   * reasoning that in single mode an operator ticks each item having looked
   * at the account, and in a batch nobody is looking.
   *
   * That caution was right about the risk and wrong about where it lives. The
   * danger was never that `readCaptions` would make something up — it cannot.
   * Every value it returns is a literal substring of a line the business
   * itself wrote under a marker it chose, and a caption that lists nothing
   * yields nothing. The danger is the LABEL the database then puts on it:
   * `business_services.content_status` DEFAULTS to 'owner_confirmed', so a
   * service nobody confirmed was recorded as confirmed by the owner — and
   * ClaimReach reads that tier as evidence of trust.
   *
   * The fix therefore belongs in the projection, not in a ban on extraction:
   * 20261025010000 stamps these rows source_derived + requires_confirmation.
   * These assertions pin what must still never change.
   */
  it('carries only what the account itself published, and never prose or prices', () => {
    const call = PANEL.match(/buildInstagramCandidate\([\s\S]*?\n\s*\}\);/)?.[0] ?? '';
    expect(call).toBeTruthy();

    /*
     * The biography is the owner's own writing, and `authoredConfirmed` means
     * "an operator has confirmed there is a right to carry it". Nobody can
     * make that confirmation for a thousand strangers at once.
     */
    expect(call).toMatch(/authoredConfirmed: false/);

    // Offerings come from the caption reader, never from anything that could
    // infer a trade from a category.
    expect(PANEL).toMatch(/readCaptions\(/);
    expect(call).toMatch(/confirmedOfferings: services/);
    expect(call).toMatch(/confirmedProducts: products/);
    // Split on the business's own word, not on a guess about the item.
    expect(PANEL).toMatch(/findings\.productOfferings/);

    /*
     * A caption's price is true the week it was posted and misleading after,
     * so the reader returns no amounts and the batch must not look for any.
     */
    expect(PANEL).not.toMatch(/findings\.prices/);
  });

  it('copies a logo only when the operator left that choice on', () => {
    /*
     * The one option that puts a copy of somebody's image on our servers
     * rather than a link to it, so it stays a visible, declinable choice.
     */
    expect(PANEL).toMatch(/if \(carryLogos\)/);
    /*
     * Via the function that fetches the bytes — never Meta's own address,
     * which is signed and expires within days.
     */
    expect(PANEL).toMatch(/instagram-logo/);
    expect(PANEL).not.toMatch(/profilePictureUrl/);
  });

  it('disables the run button until a source is given, rather than refusing after the click', () => {
    /*
     * Reported by an operator: they chose a file, saw the plan, pressed the
     * button and were told no. The guard was right and the moment was wrong —
     * the cause sat above the fold and read as a bug.
     */
    /*
     * Matched loosely on purpose. The button also disables while the
     * preflight is still reading, and when every account in the file is
     * already on NowOpen — so pinning the exact expression would fail every
     * time another honest reason to disable is added, without the guarantee
     * having changed.
     */
    expect(PANEL).toMatch(/disabled=\{![\s\S]{0,120}listSource\.trim\(\)/);
    expect(PANEL).toMatch(/sourceRef\.current\?\.focus\(\)/);
  });

  it('will not spend a lookup on an account NowOpen already holds', () => {
    /*
     * MEASURED 2026-10-09: a single business_discovery call took the app to
     * 86% of its hourly TIME budget. The cheapest possible saving is not
     * asking about accounts already in the database, so the file is checked
     * against published listings, the review queue and the handle ledger
     * BEFORE the run, and the button offers only what is new.
     */
    expect(PANEL).toMatch(/loadKnownHandles/);
    expect(PANEL).toMatch(/classifyHandles/);
    expect(PANEL).toMatch(/run\(toLookUp\)/);
    // The count on the button is of what will be looked up, not rows in the file.
    expect(PANEL).toMatch(/new account/);
  });

  it('lets the operator look the held accounts up anyway', () => {
    /*
     * Skipping is the default because quota is scarce, but it must not be the
     * only behaviour: re-reading an account is the ONLY way a listing's bio,
     * services, products or category are refreshed. The gallery sync brings
     * in new posts and nothing else re-reads the profile, so an operator
     * deliberately refreshing a list has to be able to say so.
     */
    expect(PANEL).toMatch(/skipExisting/);
    expect(PANEL).toMatch(/setSkipExisting/);
    /*
     * Default ON, asserted against THIS state rather than any `useState(true)`
     * in the file -- the logo toggle is also useState(true), so a loose match
     * would pass whatever this one defaulted to.
     */
    expect(PANEL).toMatch(/skipExisting, setSkipExisting\] = useState\(true\)/);
    // And the run honours it.
    expect(PANEL).toMatch(/preflight && skipExisting\)\s*\? preflight\.newHandles/);
  });

  it('requires a stated source for the list', () => {
    // Provenance is what separates a list somebody holds from a harvested
    // one, so it is required and written onto every row filed.
    expect(PANEL).toMatch(/listSource\.trim\(\)/);
    expect(PANEL).toMatch(/list source:/);
  });

  it('will not overwrite a decision somebody already made', () => {
    expect(PANEL).toMatch(/'published', 'merged', 'rejected'/);
  });

  it('stops on a rate limit rather than hammering through it', () => {
    /*
     * Continuing would spend the app's shared budget on calls that cannot
     * succeed, and leave the rest of the list looking like accounts that do
     * not exist.
     */
    expect(PANEL).toMatch(/rate limit/i);
    expect(PANEL).toMatch(/break;/);
  });

  it('paces the calls instead of bursting', () => {
    expect(PANEL).toMatch(/BATCH_DELAY_MS/);
  });

  it('does not .select() after the insert', () => {
    // RLS would evaluate a read the writer may not have and kill the write.
    expect(PANEL).not.toMatch(/\.insert\(row\)[\s\S]{0,40}\.select\(/);
  });
});
