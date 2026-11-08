import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { SUPPORTED_CHARS, UPSTREAM_GAPS, codepointsOf, missingChars } from './fontCoverage';
import { GLYPH_FALLBACK, TYPEFACES, typefaceOf, type TypefaceKey } from './typefaces';
import { resolveLook, slotFace } from './look';
import {
  DESIGN_TEMPLATES, MIN_TYPE_PX, fitSlotSize, isListRole,
} from '../designTemplates';
import { sampleFor } from '../create/sampleCopy';
import type { TemplateContent } from '../../components/studio/TemplateSurface';
// The coverage rule (face OR its glyph fallback) and "what a slot draws" are
// shared with the quality scorer's C3 check, so they live there.
import { gapsOf, inFallbackRange, readPublic as read } from './quality/checks/glyphs';
import { LONGEST_SAMPLE_NAME, slotText } from './quality/checks/copy';

const cp = (ch: string) => `U+${(ch.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, '0')}`;

describe('the cmap reader', () => {
  it('reads the same code points from a WOFF2 as from the OTF it was made from', () => {
    // Coolvetica ships both, from the same source: a reader that disagrees with
    // itself across containers is reading the container, not the font.
    for (const w of ['Light', 'Regular', 'Bold']) {
      const woff2 = codepointsOf(readFileSync(`public/fonts/coolvetica/Coolvetica-${w}.woff2`));
      const otf = codepointsOf(readFileSync(`public/fonts/coolvetica/Coolvetica-${w}.otf`));
      expect(woff2.size, w).toBeGreaterThan(100);
      expect([...woff2].sort((a, b) => a - b), w).toEqual([...otf].sort((a, b) => a - b));
    }
  });

  it('reads the Studio WOFF2 files', () => {
    const outfit = codepointsOf(read(typefaceOf('sans').files[400]));
    expect(outfit.has(0x41)).toBe(true); // A
    expect(outfit.has(0x1eb8)).toBe(false); // Ẹ: Outfit has none upstream
    const sourceSans = codepointsOf(read(typefaceOf('humanist').files[400]));
    for (const ch of '₦₵ẸọṢɓɗƐɔŊ') expect(sourceSans.has(ch.codePointAt(0) as number), ch).toBe(true);
  });

  it('refuses a file that is not a font', () => {
    expect(() => codepointsOf(Buffer.from('<!doctype html><html></html>'))).toThrow(/not a font/);
  });

  it('names each missing character once, in order, and ignores line breaks', () => {
    const file = readFileSync('public/fonts/coolvetica/Coolvetica-Regular.otf');
    expect(missingChars(file, 'Abc\n')).toBe('');
    expect(missingChars(file, '☃A☃☄')).toBe('☃☄');
  });
});

describe('every face draws every supported language and currency (spec §12, C3)', () => {
  it('lists the eleven languages and the currencies', () => {
    expect(Object.keys(SUPPORTED_CHARS)).toEqual([
      'english', 'french', 'portuguese', 'swahili', 'yoruba', 'igbo', 'hausa',
      'twi_akan', 'ewe', 'zulu', 'kinyarwanda', 'currency',
    ]);
    expect(SUPPORTED_CHARS.currency).toContain('₦');
    expect(SUPPORTED_CHARS.currency).toContain('₵');
    expect(SUPPORTED_CHARS.yoruba).toContain('̀');
    expect(SUPPORTED_CHARS.yoruba).toContain('́');
  });

  it('every file of every full-coverage face, with its fallback, covers every entry', () => {
    const gaps: string[] = [];
    for (const face of TYPEFACES) {
      if (face.coverage === 'latin-basic') continue;
      for (const w of face.weights) {
        for (const [lang, chars] of Object.entries(SUPPORTED_CHARS)) {
          const miss = [...gapsOf(face, w, chars)].filter((ch) => !UPSTREAM_GAPS.includes(ch)).join('');
          if (miss) gaps.push(`${face.label} ${w} (${face.files[w]}) ${lang}: ${miss}`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it('the upstream gaps are real: no file we ship draws any of them', () => {
    // The day a face that has them is added, this fails and the list shrinks.
    const all = Object.values(SUPPORTED_CHARS).join('');
    for (const ch of UPSTREAM_GAPS) expect(all, `${ch} is a supported character`).toContain(ch);
    const drawn: string[] = [];
    for (const face of TYPEFACES) {
      for (const w of face.weights) {
        const has = codepointsOf(read(face.files[w]));
        for (const ch of UPSTREAM_GAPS) if (has.has(ch.codePointAt(0) as number)) drawn.push(`${face.label} ${w} has ${ch}`);
      }
    }
    expect(drawn).toEqual([]);
  });

  it('only the faces that genuinely cannot are exempt', () => {
    // An exemption is a restriction, not a pass: see the copy test below.
    expect(TYPEFACES.filter((f) => f.coverage === 'latin-basic').map((f) => f.key)).toEqual(['coolvetica']);
  });

  it('names the glyph fallback second, and never lets Latin fall to it', () => {
    const src = typefaceOf(GLYPH_FALLBACK.source);
    expect(src.coverage).not.toBe('latin-basic');
    expect(src.glyphFallback, 'the source face needs no fallback of its own').toBeUndefined();
    for (const face of TYPEFACES) {
      const names = face.stack.split(',').map((s) => s.trim().replace(/"/g, ''));
      if (!face.glyphFallback) {
        expect(names, face.key).not.toContain(GLYPH_FALLBACK.family);
        continue;
      }
      expect(names.slice(0, 2), face.key).toEqual([face.family, GLYPH_FALLBACK.family]);
      // A failed load must land on the web-safe face of the same shape.
      expect(names[2], face.key).not.toBe(src.family);
    }
    // Nothing in Basic Latin or Latin-1 is in the range.
    for (let c = 0; c <= 0xff; c++) expect(inFallbackRange(c), `U+${c.toString(16)}`).toBe(false);
    for (const ch of '₦₵ẹɛʼ\u0301') expect(inFallbackRange(ch.codePointAt(0) as number), ch).toBe(true);
  });
});

/* ── The copy each template actually sets, in the face that sets it ─────── */

interface Use { face: TypefaceKey; text: string; where: string }

/** Which face draws which words, across every template's demo copy and every page. */
function copyByFace(): Use[] {
  const uses: Use[] = [];
  for (const tpl of DESIGN_TEMPLATES) {
    const resolved = resolveLook(tpl, { accent: '#2563eb', width: 1080, height: 1080 });
    const content = sampleFor(tpl);
    const slots = [...tpl.slots, ...(tpl.extraPages ?? []).flatMap((p) => p.slots)];
    for (const slot of slots) {
      const face = slotFace(tpl, slot, resolved);
      for (const text of slotText(slot, content)) uses.push({ face, text, where: `${tpl.key}.${slot.role}` });
    }
  }
  return uses;
}

/** Every character some face is given and cannot draw, with where it is used. */
function copyGaps(uses: Use[]): string[] {
  const gaps: string[] = [];
  for (const key of new Set(uses.map((u) => u.face))) {
    const mine = uses.filter((u) => u.face === key);
    const face = typefaceOf(key);
    for (const w of face.weights) {
      for (const ch of gapsOf(face, w, mine.map((u) => u.text).join(''))) {
        const where = [...new Set(mine.filter((u) => u.text.includes(ch)).map((u) => u.where))];
        gaps.push(`${face.label} ${w} lacks ${ch} (${cp(ch)}) used by ${where.join(', ')}`);
      }
    }
  }
  return gaps;
}

describe('every character of the demo copy is drawn by the face its template uses', () => {
  const uses = copyByFace();

  it('covers all of it, ₦ included', () => {
    expect(uses.length).toBeGreaterThan(500);
    expect(uses.filter((u) => u.text.includes('₦')).length).toBeGreaterThan(30);
    expect(copyGaps(uses)).toEqual([]);
  });

  it('gives a latin-basic face only copy it can draw, from its own glyphs', () => {
    // Coolvetica has no ₦, ₵ or Hausa/Akan/Ewe letters upstream and no
    // fallback is counted for it. It is kept for the wordmark and short
    // display Latin, and this is what holds it to that.
    const basic = new Set(TYPEFACES.filter((f) => f.coverage === 'latin-basic').map((f) => f.key));
    expect(copyGaps(uses.filter((u) => basic.has(u.face)))).toEqual([]);
  });

  it('would catch a ₦ price set in a latin-basic face', () => {
    // The guard above is only worth having if it can fail.
    const planted: Use[] = [{ face: 'coolvetica', text: 'From ₦2,500', where: 'planted.price' }];
    expect(copyGaps(planted).join('\n')).toMatch(/Coolvetica \d+ lacks ₦ \(U\+20A6\) used by planted\.price/);
  });
});

/* ── Review Focus 4: the fitter, over every listed design ─────────────────── */

const TEXT_ROLES = new Set(['brand', 'eyebrow', 'headline', 'subline', 'meta', 'cta']);
const LISTED = DESIGN_TEMPLATES.filter((t) => t.look);

/*
 * The slots of listed designs that sit at the MIN_TYPE_PX floor today
 * (2026-11-07), with demo copy and with the longest sample name alike. Each is
 * a small meta, CTA or brand line. A slot not on this list reaching the floor
 * is a design that has run out of room, and fails.
 */
const AT_FLOOR_TODAY = new Set([
  'brand-intro-reveal.meta',
  'campaign-key-visual.cta',
  'event-lineup.meta',
  'insight-stat.brand',
  'tiered-sale.cta',
]);

describe('Review Focus 4: no listed design is squeezed to MIN_TYPE_PX', () => {
  it('there are 67 listed designs', () => {
    expect(LISTED).toHaveLength(67);
  });

  /*
   * fitSlotSize reasons with a per-face advance table, not the font files, so
   * the new files cannot move these numbers; the snapshot pins them so any
   * change to the fitter or the copy that does is reviewed. Real line breaks
   * in the new faces can only be seen in a browser.
   *
   * fitSlotSize clamps at MIN_TYPE_PX, so "at or above" cannot fail. What can
   * is a slot landing ON the floor: that is where text stops shrinking and
   * starts overrunning.
   */
  it('holds with the demo copy and with the longest sample name', () => {
    expect(LONGEST_SAMPLE_NAME.length).toBeGreaterThan(15);
    const sizes: Record<string, Record<string, number>> = {};
    const atFloor: string[] = [];
    const seen = new Set<string>();
    for (const tpl of LISTED) {
      const demo = sampleFor(tpl);
      const named = { ...demo, brand: LONGEST_SAMPLE_NAME, headline: LONGEST_SAMPLE_NAME };
      const row: Record<string, number> = {};
      for (const slot of tpl.slots) {
        if (isListRole(slot.role) || !TEXT_ROLES.has(slot.role)) continue;
        for (const [label, content] of [['demo', demo], ['longest', named]] as const) {
          const text = String(content[slot.role as keyof TemplateContent] ?? '');
          if (!text) continue;
          const px = fitSlotSize(slot, tpl.slots, text, 1080, 1080);
          row[`${slot.role}.${label}`] = px;
          const where = `${tpl.key}.${slot.role}`;
          if (px <= MIN_TYPE_PX) {
            seen.add(where);
            if (!AT_FLOOR_TODAY.has(where)) atFloor.push(`${where} ${label}: ${px}px`);
          }
        }
      }
      sizes[tpl.key] = row;
    }
    expect(atFloor).toEqual([]);
    // The allowlist only shrinks: an entry that no longer hits the floor goes.
    expect([...seen].sort()).toEqual([...AT_FLOOR_TODAY].sort());
    expect({ name: LONGEST_SAMPLE_NAME, sizes }).toMatchSnapshot();
  });
});
