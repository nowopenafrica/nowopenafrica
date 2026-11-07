import { describe, it, expect } from 'vitest';

import { importSummary, importSvg, svgSize, type SvgImport } from './importSvg';

const parse = (text: string) => new DOMParser().parseFromString(text, 'image/svg+xml');
const run = (svg: string) => importSvg(svg, parse) as SvgImport;

const wrap = (inner: string, attrs = 'viewBox="0 0 400 200"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

describe('the artboard', () => {
  it('comes from the viewBox', () => {
    expect(svgSize(parse(wrap('')).documentElement)).toEqual({ width: 400, height: 200 });
  });

  it('falls back to width and height', () => {
    expect(svgSize(parse(wrap('', 'width="300" height="150"')).documentElement))
      .toEqual({ width: 300, height: 150 });
  });

  /* A file with no stated size still has to land on a canvas. */
  it('never returns nothing', () => {
    const size = svgSize(parse(wrap('', '')).documentElement);
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});

describe('what becomes editable', () => {
  it('turns text into a real text object with its words', () => {
    const r = run(wrap('<text x="40" y="100" font-size="20" fill="#0a7d4b">Opening Saturday</text>'));
    const text = r.objects.find((o) => o.type === 'text');
    expect(text).toBeTruthy();
    expect((text as { text: string }).text).toBe('Opening Saturday');
    expect(r.editable).toBe(1);
  });

  it('places text by its box, not its baseline', () => {
    /* SVG text sits ON y; the box starts a line-height above it. */
    const r = run(wrap('<text x="0" y="100" font-size="20">Hello</text>'));
    const text = r.objects[0];
    expect(text.y).toBeCloseTo((100 - 20) / 200, 3);
  });

  it('turns rectangles, circles, ellipses and lines into shapes', () => {
    const r = run(wrap(`
      <rect x="20" y="20" width="100" height="50" fill="#fff"/>
      <circle cx="200" cy="100" r="40"/>
      <ellipse cx="300" cy="100" rx="30" ry="20"/>
      <line x1="0" y1="190" x2="400" y2="190"/>
    `));
    expect(r.editable).toBe(4);
    expect(r.objects.map((o) => (o as { shape?: string }).shape).sort())
      .toEqual(['ellipse', 'ellipse', 'line', 'rect']);
  });

  it('converts coordinates into the document space', () => {
    const r = run(wrap('<rect x="40" y="20" width="200" height="100"/>'));
    expect(r.objects[0]).toMatchObject({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });

  it('keeps the colours', () => {
    const r = run(wrap('<rect x="0" y="0" width="10" height="10" fill="#0a7d4b" stroke="#111"/>'));
    expect(r.objects[0]).toMatchObject({ fill: '#0a7d4b', stroke: '#111' });
  });
});

describe('what honestly cannot', () => {
  /*
   * The document model has no path. Counting these is the difference between
   * "imported successfully" and telling somebody which half of their logo
   * they can actually edit.
   */
  it('counts paths and polygons as flattened rather than dropping them silently', () => {
    const r = run(wrap('<path d="M0 0 L10 10"/><polygon points="0,0 5,5 10,0"/>'));
    expect(r.editable).toBe(0);
    expect(r.flattened).toBe(2);
  });

  /*
   * A shape inside a transformed group needs the transform composed before
   * its coordinates mean anything here. Placing it anyway puts it in the
   * wrong place, which is worse than leaving it in the picture.
   */
  it('does not misplace shapes inside a transformed group', () => {
    const r = run(wrap('<g transform="translate(100,50) rotate(30)"><rect x="0" y="0" width="10" height="10"/></g>'));
    expect(r.editable).toBe(0);
    expect(r.flattened).toBe(1);
  });

  it('still returns the artwork so nothing is lost', () => {
    const r = run(wrap('<path d="M0 0 L10 10"/>'));
    expect(r.artwork).toContain('<path');
  });
});

describe('the file is made safe before anything renders it', () => {
  /*
   * An SVG is a document, not an image. Rendered in this app, a script in it
   * runs with the app's origin and the signed-in user's session.
   */
  it('removes scripts', () => {
    const r = run(wrap('<script>alert(1)</script><rect x="0" y="0" width="10" height="10"/>'));
    expect(r.artwork).not.toContain('<script');
    expect(r.removed).toContain('script');
  });

  it('removes event handlers', () => {
    const r = run(wrap('<rect x="0" y="0" width="10" height="10" onload="alert(1)" onclick="alert(2)"/>'));
    expect(r.artwork).not.toMatch(/onload|onclick/);
    expect(r.removed.some((x) => x.startsWith('on'))).toBe(true);
  });

  it('removes foreignObject, which can carry arbitrary HTML', () => {
    const r = run(wrap('<foreignObject><div>hi</div></foreignObject>'));
    expect(r.artwork.toLowerCase()).not.toContain('foreignobject');
  });

  /*
   * ── THE ONE THAT ALMOST SHIPPED ──────────────────────────────────────
   *
   * SVG is parsed as XML, where selectors are CASE-SENSITIVE. The sanitiser
   * removed tags with querySelectorAll('foreignobject') and the element is
   * spelled foreignObject — so it matched nothing, reported success, and
   * left the element in the file.
   */
  it('removes dangerous elements whatever their capitalisation', () => {
    for (const tag of ['foreignObject', 'FOREIGNOBJECT', 'ForeignObject', 'Script', 'SCRIPT']) {
      const r = run(wrap(`<${tag}>x</${tag}>`));
      expect(r.artwork.toLowerCase(), tag).not.toContain(tag.toLowerCase());
    }
  });

  it('removes references that would fetch from elsewhere', () => {
    const r = run(wrap('<image href="https://evil.test/x.png" x="0" y="0" width="10" height="10"/>'));
    expect(r.artwork).not.toContain('evil.test');
  });

  it('keeps internal references, which are how gradients work', () => {
    const r = run(wrap('<defs><linearGradient id="g"/></defs><rect x="0" y="0" width="10" height="10" fill="url(#g)"/>'));
    expect(r.artwork).toContain('url(#g)');
  });
});

describe('refusals', () => {
  it('refuses a file that is not an SVG', () => {
    const r = importSvg('{"not":"svg"}', parse);
    expect('error' in r).toBe(true);
  });

  it('refuses an empty file', () => {
    expect('error' in importSvg('', parse)).toBe(true);
  });
});

describe('what the user is told', () => {
  it('says how much is editable and how much is not', () => {
    const r = run(wrap('<text x="0" y="20">Hi</text><path d="M0 0 L1 1"/>'));
    const summary = importSummary(r);
    expect(summary).toMatch(/1 element is editable/);
    expect(summary).toMatch(/1 stayed part of the artwork/);
  });

  it('mentions anything that was stripped', () => {
    const r = run(wrap('<script>x</script><text x="0" y="20">Hi</text>'));
    expect(importSummary(r)).toMatch(/removed/);
  });
});
