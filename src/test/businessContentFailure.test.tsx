import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * A business's own content must not silently vanish.
 *
 * `fetchContent` reads four tables in one Promise.all — services, products,
 * gallery, reviews — and coalesced each with `?? []`. Its `catch` never fires,
 * because supabase-js RESOLVES with `{ data: null, error }` on a failed read.
 *
 * So one dropped request emptied the entire profile body, and the page said:
 *
 *     "This business hasn't listed its services yet."
 *     "No reviews yet — be the first to review this business."
 *
 * with nothing where the menu and gallery had been.
 *
 * This is the worst remaining instance of the family, because the modules ARE
 * the product. To a customer the business looks unfinished. To the owner it
 * looks like their catalogue has been deleted — and they would have no way to
 * tell that it had not.
 *
 * WHY ONE FLAG AND NOT FOUR. The four reads go out together, against one
 * business, in a single Promise.all. If the connection dropped, reporting
 * "the gallery loaded but the menu did not" would claim a precision the
 * failure does not actually have.
 *
 * Found by a codebase-wide sweep for the pattern rather than by reading pages
 * one at a time — see the sweep results in Phase 14 of the re-audit. Of the
 * seven public matches, five were correct by design and documented as such
 * (a missing founding badge renders no badge, never a fake one; a missing
 * count hides its tile; referral attribution is best-effort). This was the
 * one that lied.
 */

const src = readFileSync('src/pages/BusinessDetail.tsx', 'utf8');

describe('the profile can tell a failed content read from an empty profile', () => {
  it('inspects every one of the four reads', () => {
    /*
     * `?? []` cannot distinguish them, and the catch never fires. `error` is
     * the only place a failed supabase read reports itself.
     */
    expect(src).toMatch(
      /setContentFailed\(\s*!!svc\.error \|\| !!prod\.error \|\| !!gal\.error \|\| !!rev\.error\s*\)/,
    );
  });

  it('still treats a thrown error as a failure', () => {
    // The catch is not the path that matters, but it must not be the one path
    // that silently reports success.
    const catchBlock = src.slice(src.indexOf('Business content unavailable'));
    expect(catchBlock.slice(0, 200)).toMatch(/setContentFailed\(true\)/);
  });
});

describe('each tab reports the failure instead of an empty state', () => {
  for (const tab of ['services', 'products', 'gallery', 'reviews']) {
    it(`${tab} checks contentFailed before its length`, () => {
      /*
       * Order is the whole fix. Both states leave the array empty, so
       * whichever branch is evaluated first decides what the visitor is told.
       */
      const failIdx = src.indexOf(`contentFailed ? (`);
      expect(failIdx, 'the failure branch exists').toBeGreaterThan(-1);

      const lengthCheck = new RegExp(`contentFailed \\? \\([\\s\\S]{0,400}?${tab}\\.length > 0 \\? \\(`);
      expect(src, `${tab} must be guarded`).toMatch(lengthCheck);
    });
  }

  it('leaves the honest empty-state copy intact', () => {
    /*
     * The empty states are correct FOR THE CASE THEY WERE WRITTEN FOR, and a
     * business with no services really should be told so. The fix inserts a
     * branch ahead of them; it does not replace them.
     */
    expect(src).toMatch(/This business hasn't listed its services yet\./);
    expect(src).toMatch(/No reviews yet/);
  });

  it('offers a retry that re-reads rather than reloading the page', () => {
    expect(src).toMatch(/const retryContent = useCallback\(/);
    expect(src).toMatch(/setContentFailed\(false\);/);
    expect(src).toMatch(/void fetchContent\(String\(business\.id\)\)/);
  });
});

describe('the sweep that found this is recorded', () => {
  it('the five correct-by-design cases still say why they are correct', () => {
    /*
     * These read like the same defect and are not. Pinning the reasoning
     * means a future sweep does not "fix" them into telling a lie — a badge
     * invented because the read failed would be far worse than no badge.
     */
    const badge = readFileSync('src/components/business/FoundingBadge.tsx', 'utf8');
    expect(badge).toMatch(/no badge is the correct failure — never a fake one/);

    const home = readFileSync('src/pages/Home.tsx', 'utf8');
    expect(home).toMatch(/a missing count hides its tile; never blocks the page/);

    const campaign = readFileSync('src/pages/Campaign.tsx', 'utf8');
    expect(campaign).toMatch(/attribution is best-effort; never block the page/);
  });
});
