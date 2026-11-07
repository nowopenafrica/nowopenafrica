import { describe, expect, it } from 'vitest';

import type { DesignPage, TextObject } from './designDocument';
import { applyPatch } from './designPatch';
import { brandKitOps, describeBrandKit, resolveBrandKit } from './brandKit';

const base = { rotation: 0, opacity: 1, visible: true, locked: false };

const text = (id: string, role: string, extra: Partial<TextObject> = {}): TextObject => ({
  id, type: 'text', name: role, slotRole: role,
  x: 0.1, y: 0.1, w: 0.6, h: 0.1, z: 1, ...base,
  text: 'Your business', size: 0.05, ...extra,
});

const PAGE: DesignPage = {
  id: 'p', name: 'Page 1', width: 1080, height: 1080, background: '#ffffff',
  objects: [
    text('b', 'brand'),
    text('e', 'eyebrow', { y: 0.3 }),
    text('h', 'headline', { y: 0.45, size: 0.09 }),
    text('c', 'cta', { y: 0.8 }),
  ],
};

describe('a logo is used only when the business supplied it', () => {
  /*
   * 209 of the 528 logos on production have source 'unknown' and no
   * licence. Printing one on a customer's flyer is a rights risk created on
   * their behalf in exchange for saving them one upload.
   */
  it('uses a logo the business put there', () => {
    const kit = resolveBrandKit({ name: 'Mama Chi', logoUrl: 'https://x/l.png', logoSource: 'business' });
    expect(kit.logoUrl).toBe('https://x/l.png');
    expect(kit.logoWithheld).toBeNull();
  });

  it('withholds one of unknown provenance, and says why', () => {
    const kit = resolveBrandKit({ name: 'Mama Chi', logoUrl: 'https://x/l.png', logoSource: 'unknown' });
    expect(kit.logoUrl).toBeNull();
    expect(kit.logoWithheld).toMatch(/not supplied by the business/i);
    expect(kit.logoWithheld).toMatch(/upload your own/i);
  });

  /*
   * `undefined` and `'unknown'` are different facts. A business fetched by
   * the public directory carries no provenance at all, so passing one gives
   * `undefined` — and calling that "unknown" would hide a caller bug behind
   * a sentence about the business. Both withhold; only one is our mistake.
   */
  it('distinguishes provenance that was never loaded from one recorded as unknown', () => {
    const notLoaded = resolveBrandKit({ name: 'Mama Chi', logoUrl: 'https://x/l.png' });
    expect(notLoaded.logoUrl).toBeNull();
    expect(notLoaded.logoWithheld).toMatch(/source was not loaded/i);

    const recordedNull = resolveBrandKit({ name: 'Mama Chi', logoUrl: 'https://x/l.png', logoSource: null });
    expect(recordedNull.logoUrl).toBeNull();
    expect(recordedNull.logoWithheld).toMatch(/no recorded source/i);
  });

  /* A future source must opt IN, not inherit permission by existing. */
  it('does not trust a source it has never heard of', () => {
    for (const src of ['wikidata', 'importer', 'instagram', 'scraped', 'BUSINESS_PARTNER']) {
      expect(resolveBrandKit({ name: 'X', logoUrl: 'u', logoSource: src }).logoUrl, src).toBeNull();
    }
  });

  it('says nothing about a logo when there is none', () => {
    const kit = resolveBrandKit({ name: 'Mama Chi' });
    expect(kit.logoUrl).toBeNull();
    expect(kit.logoWithheld).toBeNull();
  });
});

describe('it never claims to know a brand colour', () => {
  /*
   * There is no brand-colour column on `businesses` and no field for one in
   * BrandIdentity. The colour on a design is whatever was picked for that
   * design, and calling that "your brand colour" teaches the owner the
   * platform knows something it does not.
   */
  it('reports the colour as chosen, never as the business\'s', () => {
    const kit = resolveBrandKit({ name: 'Mama Chi' }, '#2563eb');
    expect(kit.accent).toBe('#2563eb');
    expect(kit.accentSource).toBe('chosen');
  });

  it('lists a saved brand colour and typeface as missing, always', () => {
    const kit = resolveBrandKit({ name: 'Mama Chi', logoUrl: 'u', logoSource: 'business' }, '#2563eb');
    expect(kit.missing).toContain('a saved brand colour');
    expect(kit.missing).toContain('a saved brand typeface');
    /* The logo it DOES have is not listed as missing. */
    expect(kit.missing).not.toContain('a logo you own');
  });

  it('refuses a colour that is not one', () => {
    expect(resolveBrandKit({ name: 'X' }, 'url(javascript:1)').accent).toBeNull();
    expect(resolveBrandKit({ name: 'X' }, 'chartreuse').accentSource).toBe('none');
  });
});

describe('applying a kit uses the same validated operations as everything else', () => {
  const kit = resolveBrandKit(
    { name: 'Mama Chi Kitchen', logoUrl: 'u', logoSource: 'business', tagline: 'Fresh daily' },
    '#16a34a',
  );

  it('puts the real business name in the brand slot', () => {
    const ops = brandKitOps(kit, PAGE);
    const { page, rejected } = applyPatch(PAGE, ops);
    expect(rejected).toEqual([]);
    expect((page.objects.find((o) => o.id === 'b') as TextObject).text).toBe('Mama Chi Kitchen');
  });

  it('colours only what the template already marked as accent', () => {
    const { page } = applyPatch(PAGE, brandKitOps(kit, PAGE));
    const colourOf = (id: string) => (page.objects.find((o) => o.id === id) as TextObject).colour;
    expect(colourOf('e')).toBe('#16a34a');
    expect(colourOf('c')).toBe('#16a34a');
    /* A headline is a design decision, not a brand token. */
    expect(colourOf('h')).toBeUndefined();
  });

  /*
   * Pressing "use my brand" must not rearrange somebody's artwork. A feature
   * that does is one they press once.
   */
  it('leaves the layout, background and sizes alone', () => {
    const { page } = applyPatch(PAGE, brandKitOps(kit, PAGE));
    expect(page.background).toBe(PAGE.background);
    for (const before of PAGE.objects) {
      const after = page.objects.find((o) => o.id === before.id)!;
      expect([after.x, after.y, after.w, after.h]).toEqual([before.x, before.y, before.w, before.h]);
      expect((after as TextObject).size).toBe((before as TextObject).size);
    }
  });

  it('produces nothing at all for an empty kit', () => {
    expect(brandKitOps(resolveBrandKit({ name: '' }), PAGE)).toEqual([]);
  });

  it('skips a locked object rather than being refused by the validator', () => {
    const locked: DesignPage = { ...PAGE, objects: PAGE.objects.map((o) => ({ ...o, locked: true })) };
    const { rejected } = applyPatch(locked, brandKitOps(kit, locked));
    expect(rejected).toEqual([]);
  });
});

describe('what it tells the owner', () => {
  it('names what it used and what is still missing', () => {
    const kit = resolveBrandKit({ name: 'Mama Chi', logoUrl: 'u', logoSource: 'business' }, '#2563eb');
    const said = describeBrandKit(kit);
    expect(said).toContain('Mama Chi');
    expect(said).toContain('logo');
    expect(said).toMatch(/still to add/i);
    expect(said).toContain('a saved brand colour');
  });

  it('says plainly when there is no business', () => {
    expect(describeBrandKit(resolveBrandKit({ name: '' }))).toMatch(/no business selected/i);
  });
});
