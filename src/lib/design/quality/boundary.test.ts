import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Ruling P: the browser gate must not pull the Node-only modules into the bundle. */
const FORBIDDEN = /^(?:critical|score|glyphs|fs)$|^node:/;

function specifiers(src: string): string[] {
  const found = [
    ...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g),
    ...src.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]/g),
    ...src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
  ];
  return found.map((m) => m[1]);
}
const forbidden = (src: string) =>
  specifiers(src).filter((s) => FORBIDDEN.test((s.split('/').pop() ?? s).replace(/\.[jt]sx?$/, '')));

describe('browser-safe modules', () => {
  for (const file of ['gate.ts', 'ledger.ts', 'hash.ts']) {
    it(`${file} imports no critical, score, glyphs or fs`, () => {
      expect(forbidden(readFileSync(resolve(__dirname, file), 'utf8'))).toEqual([]);
    });
  }

  it('the detector sees forbidden imports', () => {
    const fake = [
      "import { x } from './critical';",
      "import fs from 'fs';",
      "import { y } from 'node:fs';",
      "const z = await import('./checks/glyphs');",
      "import { ok } from './hash';",
    ].join('\n');
    expect(forbidden(fake)).toEqual(['./critical', 'fs', 'node:fs', './checks/glyphs']);
  });
});
