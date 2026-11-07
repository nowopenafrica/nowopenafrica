import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { SUPPORTED_CHARS, UPSTREAM_GAPS, codepointsOf, missingChars } from './fontCoverage';
import { TYPEFACES, typefaceOf, type Typeface, type TypefaceKey } from './typefaces';
import { resolveLook, slotFace } from './look';
import {
  DESIGN_TEMPLATES, MIN_TYPE_PX, fitSlotSize, isListRole, type SlotSpec,
} from '../designTemplates';
import { sampleFor } from '../create/sampleCopy';
import type { TemplateContent } from '../../components/studio/TemplateSurface';

const read = (publicPath: string): Buffer => readFileSync(`public${publicPath}`);

/** Everything a face's fallback can draw for it: the union of its files. */
function fallbackCodepoints(face: Typeface): Set<number> {
  if (!face.fallback || face.coverage === 'latin-basic') return new Set();
  const fb = typefaceOf(face.fallback);
  return new Set(fb.weights.flatMap((w) => [...codepointsOf(read(fb.files[w]))]));
}

/** What the face cannot draw, even with its fallback, from `chars`. */
function gapsOf(face: Typeface, weight: number, chars: string): string {
  const fb = fallbackCodepoints(face);
  return [...missingChars(read(face.files[weight]), chars)]
    .filter((ch) => !fb.has(ch.codePointAt(0) as number))
    .join('');
}

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

  it('reads the WOFF 1.0 Studio files', () => {
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

  it('names its fallback second in the stack, and the fallback needs none of its own', () => {
    for (const face of TYPEFACES) {
      if (!face.fallback) continue;
      const fb = typefaceOf(face.fallback);
      expect(fb.key, face.key).toBe(face.fallback);
      expect(fb.fallback, `${fb.key} chains`).toBeUndefined();
      expect(fb.coverage, fb.key).not.toBe('latin-basic');
      const names = face.stack.split(',').map((s) => s.trim().replace(/"/g, ''));
      expect(names.slice(0, 2), face.key).toEqual([face.family, fb.family]);
    }
  });
});

/* ── The copy each template actually sets, in the face that sets it ─────── */

/** Every string a slot draws, with the case transform applied. */
function slotText(slot: SlotSpec, content: TemplateContent): string[] {
  const out: string[] = [];
  switch (slot.role) {
    case 'services': out.push(...(content.services ?? [])); break;
    case 'contact': out.push(...(content.contact ?? [])); break;
    case 'price':
      for (const r of content.price ?? []) out.push(r.label, r.price, r.was ?? '');
      break;
    case 'stats':
      // Stat labels are always set in capitals.
      for (const s of content.stats ?? []) out.push(s.value, s.label.toUpperCase());
      break;
    case 'qr': break;
    default: out.push(String(content[slot.role as keyof TemplateContent] ?? ''));
  }
  return out.filter(Boolean).map((t) => (slot.upper ? t.toUpperCase() : t));
}

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

/**
 * The longest name the demo copy sets: the longest brand or headline of any
 * template's sample. Put into both name-bearing slots of every listed design.
 */
const LONGEST_SAMPLE_NAME = DESIGN_TEMPLATES
  .flatMap((t) => { const c = sampleFor(t); return [c.brand ?? '', c.headline ?? '']; })
  .reduce((a, b) => (b.length > a.length ? b : a), '');

describe('Review Focus 4: no listed design shrinks below MIN_TYPE_PX', () => {
  it('there are 67 listed designs', () => {
    expect(LISTED).toHaveLength(67);
  });

  /*
   * fitSlotSize reasons with a per-face advance table, not the font files, so
   * the new files cannot move these numbers; the snapshot pins them so any
   * change to the fitter or the copy that does is reviewed. Real line breaks
   * in the new faces can only be seen in a browser.
   */
  it('holds with the demo copy and with the longest sample name', () => {
    expect(LONGEST_SAMPLE_NAME.length).toBeGreaterThan(15);
    const sizes: Record<string, Record<string, number>> = {};
    const below: string[] = [];
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
          if (px < MIN_TYPE_PX) below.push(`${tpl.key}.${slot.role} ${label}: ${px}px`);
        }
      }
      sizes[tpl.key] = row;
    }
    expect(below).toEqual([]);
    expect({ name: LONGEST_SAMPLE_NAME, sizes }).toMatchSnapshot();
  });
});
