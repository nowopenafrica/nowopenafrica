import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';

/*
 * MEASURED 2026-10-10: the brand face shipped as OTF — 3 weights at ~108 kB
 * each — while every Studio font was already woff2 at 13–34 kB. The Regular
 * weight was also PRELOADED, so every visitor downloaded 108 kB at high
 * priority before anything else could load.
 *
 * Converted: 322.3 kB -> 121.4 kB, 62% smaller, with identical glyph counts
 * (701), identical metrics and no missing characters.
 */
const CSS = readFileSync('src/index.css', 'utf8');
const HTML = readFileSync('index.html', 'utf8');
const WEIGHTS = ['Light', 'Regular', 'Bold'] as const;

describe('the brand font is served in a web format', () => {
  it('ships a woff2 for every Coolvetica weight', () => {
    for (const w of WEIGHTS) {
      expect(existsSync(`public/fonts/coolvetica/Coolvetica-${w}.woff2`)).toBe(true);
    }
  });

  /*
   * The saving is the point. If a future conversion silently produced
   * something close to the OTF size, the file would exist and prove nothing.
   */
  it('each woff2 is substantially smaller than its OTF', () => {
    for (const w of WEIGHTS) {
      const otf = statSync(`public/fonts/coolvetica/Coolvetica-${w}.otf`).size;
      const woff2 = statSync(`public/fonts/coolvetica/Coolvetica-${w}.woff2`).size;
      expect(woff2).toBeLessThan(otf * 0.6);
    }
  });

  it('offers woff2 before the OTF fallback in every @font-face', () => {
    for (const w of WEIGHTS) {
      const woff2At = CSS.indexOf(`Coolvetica-${w}.woff2`);
      const otfAt = CSS.indexOf(`Coolvetica-${w}.otf`);
      expect(woff2At).toBeGreaterThan(-1);
      // Order is the whole point: the browser takes the first format it knows.
      expect(woff2At).toBeLessThan(otfAt);
      expect(CSS).toContain(`Coolvetica-${w}.woff2') format('woff2'),`);
    }
  });

  /*
   * Preloading the OTF would re-create the whole problem while the CSS looked
   * correct: the browser would fetch 108 kB at high priority and then never
   * use it, because the @font-face prefers the woff2.
   */
  it('never preloads the OTF', () => {
    expect(HTML).toMatch(/rel="preload"[^>]*Coolvetica-Regular\.woff2[^>]*type="font\/woff2"/);
    expect(HTML).not.toMatch(/rel="preload"[^>]*\.otf/);
  });

  it('keeps font-display: swap so text is never invisible while loading', () => {
    const block = CSS.slice(CSS.indexOf("font-family: 'Coolvetica'"), CSS.indexOf("font-family: 'Coolvetica'") + 1200);
    expect(block).toMatch(/font-display:\s*swap/);
  });
});
