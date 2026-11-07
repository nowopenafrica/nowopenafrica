import { describe, expect, it } from 'vitest';

import type { DesignPage, TextObject, ShapeObject } from './designDocument';
import { applyPatch } from './designPatch';
import { opsFromPrompt } from './promptOps';

const base = { rotation: 0, opacity: 1, visible: true, locked: false };

const text = (id: string, role: string, extra: Partial<TextObject> = {}): TextObject => ({
  id, type: 'text', name: role, slotRole: role,
  x: 0.1, y: 0.1, w: 0.6, h: 0.1, z: 1, ...base,
  text: 'Your business', size: 0.06, ...extra,
});

const band: ShapeObject = {
  id: 'band', type: 'shape', name: 'Band', x: 0, y: 0, w: 1, h: 0.3, z: 0, ...base,
  shape: 'rect', fill: '#2563eb',
};

const PAGE: DesignPage = {
  id: 'p', name: 'Page 1', width: 1080, height: 1080, background: '#ffffff',
  objects: [
    text('h', 'headline', { size: 0.09 }),
    text('s', 'subline', { y: 0.4, size: 0.03, text: 'Open late' }),
    text('p1', 'price', { y: 0.6, size: 0.05, text: '₦2,500' }),
    band,
  ],
};

const ask = (prompt: string, selected: string | null = null) => opsFromPrompt(prompt, PAGE, selected);
const after = (prompt: string, selected: string | null = null) =>
  applyPatch(PAGE, ask(prompt, selected).ops).page;
const obj = (p: DesignPage, id: string) => p.objects.find((o) => o.id === id)!;

describe('it finds the thing being talked about', () => {
  it('matches a part by the words people use for it', () => {
    expect(ask('make the heading bigger').ops[0]).toMatchObject({ op: 'scaleText', id: 'h' });
    expect(ask('make the strapline bold').ops[0]).toMatchObject({ id: 's' });
    expect(ask('make the price red').ops[0]).toMatchObject({ id: 'p1' });
  });

  /* "sub heading" must not be read as "heading". */
  it('prefers the longer name when two could match', () => {
    expect(ask('make the sub heading bigger').ops[0]).toMatchObject({ id: 's' });
  });

  it('acts on the selection when the sentence says "it"', () => {
    expect(ask('make it bigger', 's').ops[0]).toMatchObject({ id: 's' });
  });

  it('asks which one when nothing is named or selected', () => {
    const out = ask('make it bigger');
    expect(out.understood).toBe(false);
    expect(out.needsSelection).toBe(true);
    expect(out.say).toMatch(/select something/i);
  });
});

describe('the instructions it genuinely handles', () => {
  it('sizes type up and down, and by how much', () => {
    const big = obj(after('make the headline bigger'), 'h') as TextObject;
    const huge = obj(after('make the headline much bigger'), 'h') as TextObject;
    const small = obj(after('make the headline a bit smaller'), 'h') as TextObject;
    expect(big.size).toBeGreaterThan(0.09);
    expect(huge.size).toBeGreaterThan(big.size);
    expect(small.size).toBeLessThan(0.09);
  });

  it('colours text, and fills a shape instead when it is one', () => {
    expect((obj(after('make the headline white'), 'h') as TextObject).colour).toBe('#ffffff');
    expect((obj(after('make the band red', 'band'), 'band') as ShapeObject).fill).toBe('#dc2626');
  });

  it('takes a hex colour as readily as a name', () => {
    expect((obj(after('headline #ff0000'), 'h') as TextObject).colour).toBe('#ff0000');
  });

  it('changes the background without needing anything selected', () => {
    expect(after('make the background navy').background).toBe('#1e3a8a');
  });

  it('centres, bolds, uppercases and fades', () => {
    expect((obj(after('centre the headline'), 'h') as TextObject).align).toBe('center');
    expect((obj(after('make the subtitle bold'), 's') as TextObject).weight).toBe(800);
    expect((obj(after('headline in caps'), 'h') as TextObject).upper).toBe(true);
    expect(obj(after('fade the band', 'band'), 'band').opacity).toBeLessThan(1);
  });

  it('moves things, further when told to', () => {
    const bit = obj(after('move the headline down a bit'), 'h');
    const lot = obj(after('move the headline down a lot'), 'h');
    expect(bit.y).toBeGreaterThan(0.1);
    expect(lot.y).toBeGreaterThan(bit.y);
  });

  /* Copy the owner typed is a fact: used exactly, never paraphrased. */
  it('replaces copy with exactly what was quoted', () => {
    const page = after('change the price to "₦5,000 flat"');
    expect((obj(page, 'p1') as TextObject).text).toBe('₦5,000 flat');
  });

  it('treats a quote as emphasis, not new copy, when nothing asks to replace', () => {
    const out = ask('make the "headline" bigger');
    expect(out.ops.every((o) => o.op !== 'setText')).toBe(true);
  });

  it('does two things in one sentence', () => {
    const out = ask('make the headline white and bigger');
    expect(out.ops).toHaveLength(2);
    const page = applyPatch(PAGE, out.ops).page;
    expect((obj(page, 'h') as TextObject).colour).toBe('#ffffff');
    expect((obj(page, 'h') as TextObject).size).toBeGreaterThan(0.09);
  });
});

describe('what it refuses, and how', () => {
  /*
   * The honest line. "More premium" is not a document operation, and
   * guessing produces a random change the person then has to undo.
   */
  it('refuses taste instructions instead of inventing a change', () => {
    for (const prompt of [
      'make it more premium',
      'make this look editorial',
      'improve the design',
      'make it pop',
    ]) {
      const out = opsFromPrompt(prompt, PAGE, 'h');
      expect(out.understood, prompt).toBe(false);
      expect(out.ops, prompt).toHaveLength(0);
      expect(out.say, prompt).toMatch(/can't do that one yet/i);
    }
  });

  it('says what it CAN do when it refuses', () => {
    expect(opsFromPrompt('make it more premium', PAGE, 'h').say).toMatch(/bigger|price|background/i);
  });

  it('will not try to put words into a shape', () => {
    const out = opsFromPrompt('change the band to say "Hello"', PAGE, 'band');
    expect(out.understood).toBe(false);
    expect(out.say).toMatch(/not text/i);
  });

  it('refuses an empty prompt plainly', () => {
    expect(opsFromPrompt('   ', PAGE, 'h').say).toMatch(/type what you want/i);
  });
});

describe('every instruction survives the validator', () => {
  /*
   * This file decides WHAT to change; designPatch decides whether it is
   * allowed. If a phrasing produced an operation the validator rejects,
   * the screen would report success and nothing would move.
   */
  it('produces only operations the patch layer accepts', () => {
    const prompts = [
      'make the headline bigger', 'make the headline much smaller',
      'make the headline white', 'make the background navy',
      'centre the headline', 'make the subtitle bold', 'headline in caps',
      'move the headline down', 'fade the band', 'change the price to "₦9,000"',
      'make the price red and bigger',
    ];
    for (const prompt of prompts) {
      const out = opsFromPrompt(prompt, PAGE, 'band');
      expect(out.understood, prompt).toBe(true);
      const { rejected } = applyPatch(PAGE, out.ops);
      expect(rejected.map((r) => `${prompt}: ${r.why}`), prompt).toEqual([]);
    }
  });
});

describe('another size, beside the original', () => {
  it('recognises the sizes people ask for by name', () => {
    const cases: [string, string][] = [
      ['create a matching Story version', 'ig-story'],
      ['make a WhatsApp status version', 'whatsapp-status'],
      ['resize for Instagram', 'ig-square'],
      ['I need an A4 version', 'a4'],
      ['make a business card version', 'business-card'],
      ['adapt this for LinkedIn', 'linkedin-post'],
    ];
    for (const [prompt, id] of cases) {
      const out = opsFromPrompt(prompt, PAGE, null);
      expect(out.understood, prompt).toBe(true);
      expect(out.variant?.presetId, prompt).toBe(id);
      expect(out.variant!.width, prompt).toBeGreaterThan(0);
      expect(out.variant!.height, prompt).toBeGreaterThan(0);
    }
  });

  /* "facebook cover" must not be read as "facebook". */
  it('prefers the longer size name', () => {
    expect(opsFromPrompt('make a facebook cover version', PAGE, null).variant?.presetId)
      .toBe('facebook-cover');
    expect(opsFromPrompt('make an instagram story version', PAGE, null).variant?.presetId)
      .toBe('ig-story');
  });

  /*
   * A size word alone is not a request for one. "Make the card bigger" names
   * a format AND a size change and is plainly an edit to the design in front
   * of you — nothing should silently gain a page.
   */
  it('does not add a page just because a size word appeared', () => {
    for (const prompt of ['make the card bigger', 'make the headline bigger', 'poster headline white']) {
      expect(opsFromPrompt(prompt, PAGE, 'h').variant, prompt).toBeUndefined();
    }
  });

  it('answers the size alone, without also editing this page', () => {
    const out = opsFromPrompt('make a Story version and the headline bigger', PAGE, 'h');
    expect(out.variant?.presetId).toBe('ig-story');
    /* The new page does not exist yet, so the edit would land on the old one. */
    expect(out.ops).toHaveLength(0);
  });

  it('says "an" before a vowel', () => {
    expect(opsFromPrompt('make an A4 version', PAGE, null).say).toMatch(/Added an A4/);
    expect(opsFromPrompt('make a Story version', PAGE, null).say).toMatch(/Added an Instagram/);
    expect(opsFromPrompt('make a business card version', PAGE, null).say).toMatch(/Added a Business/);
  });
});
