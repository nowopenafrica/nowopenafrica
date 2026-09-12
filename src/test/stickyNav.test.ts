import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * The nav is sticky. It does not hide, and it does not move.
 *
 * An earlier instruction was read as "reveal on scroll" and built as
 * `useHideOnScroll` — the bar sliding away going down and returning coming
 * up. The intent was simply a sticky nav, and the misreading cost more than
 * it looked:
 *
 *   - a sub-nav pinned beneath it needed a CSS rule (`.nav-offset-sticky`)
 *     to chase the gap the nav left behind
 *   - a keyboard user tabbing into an off-screen bar had to be rescued with
 *     an `onFocus` handler
 *   - the open mobile menu lives inside the bar, so it had to pin the bar to
 *     stop the menu leaving with it
 *
 * A bar that does not move needs none of that. All four pieces were removed
 * together rather than switched off, because a dormant hook and a CSS rule
 * keyed on an attribute nothing sets read as live behaviour to the next
 * person — and one of them eventually gets "fixed" back on.
 */

const nav = readFileSync('src/components/layout/Navigation.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

describe('the nav stays put', () => {
  it('is sticky on the <header>, which is where it can actually travel', () => {
    /*
     * MEASURED ON PRODUCTION, and the reason this test is specific about
     * WHERE the sticky lives: with `sticky top-0` on the <nav>, the nav's top
     * was -900 at scroll 900. It never stuck at all.
     *
     * A sticky element travels only within its containing block, and the
     * <header> wrapper — added later, for the banner landmark — is exactly as
     * tall as the nav. So the sticky had a range of zero pixels.
     *
     * The hide-on-scroll animation had masked it completely: a bar that
     * deliberately slides away does not look wrong when it also scrolls away.
     */
    expect(app).toMatch(/<header className="sticky top-0 z-50">/);
  });

  it('does not put the sticky back on the nav, where it cannot work', () => {
    expect(nav).not.toMatch(/sticky top-0/);
  });

  it('has no scroll-driven transform', () => {
    expect(nav).not.toMatch(/-translate-y-full/);
    expect(nav).not.toMatch(/transition-transform/);
  });

  it('does not use a hide-on-scroll hook', () => {
    expect(nav).not.toMatch(/useHideOnScroll/);
    expect(nav).not.toMatch(/\bhidden \?/);
  });

  it('needs no onFocus rescue, because it is never off screen', () => {
    // The handler existed only to bring an off-screen bar back for a keyboard
    // user. With nothing to bring back, keeping it would be cargo.
    expect(nav).not.toMatch(/onFocus=\{reveal\}/);
  });
});

describe('the machinery went with it', () => {
  it('the hook is gone', () => {
    expect(existsSync('src/hooks/useHideOnScroll.ts')).toBe(false);
    expect(existsSync('src/hooks/useHideOnScroll.test.ts')).toBe(false);
  });

  it('the CSS that chased the gap is gone', () => {
    /*
     * `.nav-offset-sticky` only ever existed to pull sub-navs up while the
     * nav was away. Left in place it would be a rule keyed on a data
     * attribute nothing sets — inert, and misleading to read.
     */
    expect(css).not.toMatch(/\.nav-offset-sticky\s*\{/);
    expect(css).not.toMatch(/data-nav-hidden/);
  });

  it('nothing still asks for the class', () => {
    const founder = readFileSync('src/pages/Founder.tsx', 'utf8');
    expect(founder).not.toMatch(/nav-offset-sticky/);
    // The sub-nav is still sticky beneath the nav — that part was always right.
    expect(founder).toMatch(/className="sticky top-16/);
  });

  it('explains why, so the request is not misread a second time', () => {
    expect(nav).toMatch(/Positioning lives on the <header>/);
    expect(app).toMatch(/range of zero pixels/);
  });
});
