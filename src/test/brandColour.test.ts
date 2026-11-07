/**
 * Every brand colour a component asks for must exist.
 *
 * ── WHY THIS TEST EXISTS ─────────────────────────────────────────────────
 *
 * `nowopen-*` was used at 75 call sites across 10 files — every button in
 * Business Intelligence, and the submit button on the PUBLIC /add-business
 * page — and was never defined in tailwind.config.js.
 *
 * Tailwind emits nothing for an unknown colour. It does not warn, it does not
 * fail the build, and the class simply never appears in the CSS. So
 * `bg-nowopen-500 text-white` rendered as white text on no background: an
 * invisible button, on a page whose whole purpose is that button.
 *
 * Nothing caught it because nothing could: typecheck does not read class
 * strings, and a test that renders a component sees the class name in the DOM
 * whether or not any CSS backs it. The only honest check is against the
 * config, which is what this does.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every `nowopen-<shade>` written anywhere under src. */
function shadesUsed(dir: string, found = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { shadesUsed(full, found); continue; }
    if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
    const src = readFileSync(full, 'utf8');
    for (const m of src.matchAll(/nowopen-(\d{2,3})/g)) found.add(m[1]);
  }
  return found;
}

const config = readFileSync('tailwind.config.js', 'utf8');

/** The shades the config actually defines, read from the nowopen block. */
function shadesDefined(): Set<string> {
  const block = config.match(/nowopen:\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  return new Set([...block.matchAll(/(\d{2,3}):\s*'#[0-9a-f]{6}'/gi)].map((m) => m[1]));
}

describe('the brand colour is defined', () => {
  it('has a nowopen palette at all', () => {
    expect(config).toMatch(/colors:\s*\{/);
    expect(config).toMatch(/nowopen:\s*\{/);
  });

  it('defines every shade any component uses', () => {
    const used = shadesUsed('src');
    const defined = shadesDefined();
    expect(used.size, 'no nowopen classes found — has the brand class been renamed?').toBeGreaterThan(0);

    const missing = [...used].filter((s) => !defined.has(s)).sort();
    expect(
      missing,
      `these shades are used in components but absent from tailwind.config.js, so they render as nothing: `
      + missing.map((s) => `nowopen-${s}`).join(', '),
    ).toEqual([]);
  });

  it('anchors on the brand colours the site already declares', () => {
    /*
     * Not invented: 600 is the #2563eb in index.html's theme-color, and 500 is
     * the #3b82f6 the hero gradient starts from. If someone changes these,
     * the site's chrome and its buttons should move together.
     */
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('#2563eb');
    expect(config).toMatch(/600:\s*'#2563eb'/);
    expect(config).toMatch(/500:\s*'#3b82f6'/);
  });
});
