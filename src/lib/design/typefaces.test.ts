import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  FONT_STACKS, TYPEFACES, TYPEFACE_FAMILIES, TYPE_PAIRINGS, ensureTypefacesReady, fontStack,
  nearestWeight, pairingOf, typefaceOf,
} from './typefaces';

const css = readFileSync('src/index.css', 'utf8');

describe('every face is one we are allowed to ship', () => {
  /*
   * An ALLOWLIST, not one literal.
   *
   * This asserted `=== 'SIL OFL 1.1'` because every face came from Google
   * Fonts. Coolvetica does not — it is Ray Larabie's, free for commercial
   * use, and the house face the brand-card studio already ships. The test's
   * real question is "may we redistribute this and may a customer sell what
   * they print with it", and that has more than one right answer. Adding to
   * this list is a deliberate act: a new licence has to be read first.
   */
  const PERMITTED = ['SIL OFL 1.1', 'Free for commercial use'];

  it('carries a licence that permits redistribution and commercial use', () => {
    // A customer prints this and sells it. A face we cannot licence is a face
    // that makes their poster a liability rather than an asset.
    for (const face of TYPEFACES) {
      expect(PERMITTED, face.key).toContain(face.licence);
      expect(face.source, face.key).toBeTruthy();
    }
  });

  it('is actually self-hosted — the file is in the repo', () => {
    // Not a link to a third party: the CSP allows font-src 'self' only, and an
    // export has to be able to prove the face is present.
    for (const face of TYPEFACES) {
      for (const w of face.weights) {
        /* The file the face itself declares, not a filename this test guessed. */
        const declared = face.files[w];
        expect(declared, `${face.key} ${w}`).toBeTruthy();
        const path = `public${declared}`;
        expect(existsSync(path), path).toBe(true);
        expect(statSync(path).size, path).toBeGreaterThan(4000);
      }
    }
  });

  it('is declared in the stylesheet at every weight it claims', () => {
    // A weight in the data with no @font-face gets a synthetic bold, which on a
    // display face at 200px looks like a rendering fault.
    for (const face of TYPEFACES) {
      for (const w of face.weights) {
        const rule = css.slice(css.indexOf(`font-family: '${face.family}'`));
        expect(css, `${face.family} ${w}`).toContain(face.files[w]);
        expect(rule.length, face.family).toBeGreaterThan(0);
      }
    }
  });

  it('stays inside the weight budget', () => {
    const total = TYPEFACES.flatMap((f) => f.weights.map((w) =>
      statSync(`public${f.files[w]}`).size)).reduce((a, b) => a + b, 0);
    // A design tool that costs a megabyte before it draws anything is one
    // nobody opens twice. Drop a weight rather than raising this.
    expect(total).toBeLessThan(600 * 1024);
  });
});

describe('nothing breaks if a download fails', () => {
  it('ends every stack in a web-safe face of the same shape', () => {
    for (const face of TYPEFACES) {
      expect(face.stack, face.key).toContain(face.family);
      // The last entry must be a generic family, so the browser always resolves.
      expect(face.stack.trim(), face.key).toMatch(/(sans-serif|serif|monospace)$/);
    }
  });

  it('resolves a stack for an unknown or missing key rather than returning undefined', () => {
    expect(fontStack(undefined)).toBe(FONT_STACKS.sans);
    // 27 templates say font: 'serif'. That key must never stop resolving.
    expect(fontStack('serif')).toContain('Playfair Display');
  });

  it('keeps the four original keys working, now on real faces', () => {
    // The upgrade had to be invisible to every existing template.
    expect(typefaceOf('sans').family).toBe('Outfit');
    expect(typefaceOf('serif').family).toBe('Playfair Display');
    expect(typefaceOf('mono').family).toBe('Space Mono');
    expect(typefaceOf('condensed').family).toBe('Bebas Neue');
  });
});

describe('weights', () => {
  it('never asks for a weight we do not ship', () => {
    for (const face of TYPEFACES) {
      for (const want of [100, 300, 400, 500, 600, 700, 800, 900]) {
        expect(face.weights, `${face.key} @ ${want}`).toContain(nearestWeight(face.key, want));
      }
    }
  });

  it('picks the closest one', () => {
    expect(nearestWeight('serif', 900)).toBe(900);
    expect(nearestWeight('serif', 400)).toBe(700);
    expect(nearestWeight('condensed', 900)).toBe(400);
  });
});

describe('pairings', () => {
  it('name faces that exist', () => {
    const keys = new Set(TYPEFACES.map((t) => t.key));
    for (const p of TYPE_PAIRINGS) {
      for (const role of ['display', 'text', 'accent'] as const) {
        expect(keys.has(p[role]), `${p.key}.${role}`).toBe(true);
      }
    }
  });

  it('put a display face on the headline', () => {
    // A pairing whose display slot is a body face is not a pairing, it is a
    // missing decision.
    for (const p of TYPE_PAIRINGS) {
      expect(['display', 'text'], p.key).toContain(typefaceOf(p.display).role);
    }
  });

  it('are distinct — no two pairings resolve to the same three faces', () => {
    const seen = TYPE_PAIRINGS.map((p) => `${p.display}/${p.text}/${p.accent}`);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('always resolve, even for a key that no longer exists', () => {
    expect(pairingOf('deleted-style').key).toBe(TYPE_PAIRINGS[0].key);
  });

  it('say what they suit, because that is what somebody is choosing on', () => {
    for (const p of TYPE_PAIRINGS) expect(p.suits.length, p.key).toBeGreaterThan(15);
  });
});

describe('loading', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads each face with its fallback, because the fallback draws its missing glyphs', async () => {
    const load = vi.fn(() => Promise.resolve([]));
    vi.stubGlobal('document', { fonts: { load, ready: Promise.resolve() } });
    await ensureTypefacesReady(['sans']);
    const loaded = load.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(loaded.some((s) => s.includes('"Outfit"'))).toBe(true);
    expect(loaded.some((s) => s.includes('"Source Sans 3"'))).toBe(true);
    expect(loaded.some((s) => s.includes('"Playfair Display"'))).toBe(false);
  });
});

describe('the families list', () => {
  it('covers every face, for preloading and for the smoke test', () => {
    expect(TYPEFACE_FAMILIES).toHaveLength(TYPEFACES.length);
    expect(new Set(TYPEFACE_FAMILIES).size).toBe(TYPEFACES.length);
  });
});
