import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DESIGN_TEMPLATES, templateByKey, type DesignTemplate, type SlotSpec, type SurfaceSpec,
} from '../../designTemplates';
import { clearUploadedDeliverables, registerUploadedDeliverable } from '../deliverables';
import type { AssetManifest, ManifestAsset } from '../assetManifestTypes';
import type { TemplateContent } from '../../../components/studio/TemplateSurface';
import { CUSTOMISER_TEXT_FIELDS } from '../../create/customiserFields';
import { typefaceOf } from '../typefaces';
import { LONG_BRAND, LONG_HEADLINE } from './checks/copy';
import {
  NOT_CHECKED, automatedCriticals, type CriticalCode, type QualityOptions,
} from './critical';

const EMPTY: AssetManifest = { assets: [] };
const KEY = 'qa-fixture';

/** Industry-example copy: no placeholder, no fake number, ₦ included. */
const CLEAN: TemplateContent = {
  brand: 'Mama Put Kitchen',
  eyebrow: 'Ikeja, Lagos',
  headline: 'Jollof from ₦3,500',
  subline: 'Smoky party jollof, fried plantain and grilled chicken.',
  cta: 'Order today',
  contact: ['Allen Avenue, Ikeja', '@mamaputkitchen'],
  services: ['Party jollof', 'Small chops'],
  stats: [{ value: '12', label: 'Dishes' }],
  price: [{ label: 'Jollof', price: '₦3,500' }],
  logoUrl: null,
  qrUrl: null,
};

/** A business card with both sides, directed, on its own registered deliverable. */
const card = templateByKey('card-front');
const base = (patch: Partial<DesignTemplate> = {}): DesignTemplate => ({
  ...card, key: KEY, direction: 'minimal', ...patch,
});

/*
 * The card set large enough for print: every line at least 6 pt on an
 * 85.6 mm card (25 px at its 300 dpi canvas), and the one-line name wide and
 * untracked enough to hold LONG_BRAND.
 */
const roomy = (): DesignTemplate => {
  const grow = (s: SlotSpec): SlotSpec => ({
    ...s, size: Math.max(s.size ?? 0.05, 0.045), ...(s.role === 'brand' ? { tracking: 0, w: 0.82 } : {}),
  });
  return base({
    slots: card.slots.map(grow),
    extraPages: card.extraPages?.map((p) => ({ ...p, slots: p.slots.map(grow) })),
  });
};

const deliver = (format: string, subcategory: string) =>
  registerUploadedDeliverable(KEY, { category: 'branding', name: 'QA fixture', format, subcategory });

const codes = (
  tpl: DesignTemplate, opts: QualityOptions = { copy: CLEAN }, manifest = EMPTY, siblings: DesignTemplate[] = [],
): CriticalCode[] => automatedCriticals(tpl, siblings, manifest, opts).map((f) => f.code);

const asset = (id: string, patch: Partial<ManifestAsset> = {}): ManifestAsset => ({
  id, kind: 'photo', path: `/assets/${id}.webp`, w: 3000, h: 2000, licence: 'Pexels', attribution: null,
  tags: [], people: false, iconSet: null, ...patch,
});

/** Somewhere a template could hold an image today. Templates have no image field yet. */
const withImage = (tpl: DesignTemplate, src: string): DesignTemplate => ({
  ...tpl, surface: { ...tpl.surface, image: src } as SurfaceSpec,
});

beforeEach(() => deliver('business-card', 'business-card'));
afterEach(() => clearUploadedDeliverables());

describe('automatedCriticals', () => {
  it('C1: an external image URL fails; a manifest id passes; an unknown id fails', () => {
    expect(codes(withImage(base(), 'https://images.pexels.com/photos/1/a.jpeg'))).toContain('C1');
    const manifest = { assets: [asset('abc')] };
    expect(codes(withImage(base(), 'asset:abc'), undefined, manifest)).not.toContain('C1');
    expect(codes(withImage(base(), 'asset:missing'), undefined, manifest)).toContain('C1');
  });

  it('C2: a missing direction fails, as does icon use without an iconSet', () => {
    expect(codes(base({ direction: undefined }))).toContain('C2');
    expect(codes(base())).not.toContain('C2');
    const icons = { assets: [asset('i1', { kind: 'icon', iconSet: 'lucide' })] };
    expect(codes(withImage(base(), 'asset:i1'), undefined, icons)).toContain('C2');
    expect(codes(withImage(base({ iconSet: 'lucide' }), 'asset:i1'), undefined, icons)).not.toContain('C2');
  });

  it('C2: no subcategory or no format resolving fails', () => {
    registerUploadedDeliverable('qa-unfiled', { category: 'branding', name: 'Unfiled' });
    expect(codes(base({ key: 'qa-unfiled' }))).toContain('C2');
    deliver('not-a-format', 'business-card');
    expect(codes(base())).toContain('C2');
  });

  it('C3: ₦ in copy set in a face that cannot draw it fails', () => {
    const unlooked = (font: DesignTemplate['font']): DesignTemplate => base({
      look: undefined, font,
      slots: card.slots.map((s): SlotSpec => ({ ...s, font: undefined })),
      extraPages: card.extraPages?.map((p) => ({ ...p, slots: p.slots.map((s) => ({ ...s, font: undefined })) })),
    });
    const naira = { copy: { ...CLEAN, headline: 'From ₦2,500' } };
    const c3 = automatedCriticals(unlooked('coolvetica'), [], EMPTY, naira).filter((f) => f.code === 'C3');
    expect(c3.length).toBeGreaterThan(0);
    expect(c3.map((f) => f.detail).join('\n')).toMatch(/Coolvetica.*₦/);
    expect(codes(unlooked('humanist'), naira)).not.toContain('C3');
  });

  it('C4: a billboard canvas filed as a 48-sheet fails; the 48-sheet canvas passes', () => {
    deliver('billboard', 'billboard-48-sheet');
    expect(codes(base())).toContain('C4');
    deliver('board-48-sheet', 'billboard-48-sheet');
    expect(codes(base())).not.toContain('C4');
  });

  it('C4: a front-back product with no back fails', () => {
    expect(codes(base({ extraPages: undefined }))).toContain('C4');
    expect(codes(base())).not.toContain('C4');
  });

  it('C5: body text at about 3:1 in one style fails', () => {
    // A half-ink veil over the paper-ink card puts its muted body lines near 3:1.
    const pale = base({
      shapes: [...(card.shapes ?? []), { kind: 'rect', x: 0, y: 0, w: 1, h: 1, tone: 'ink', alpha: 0.5 }],
    });
    const c5 = automatedCriticals(pale, [], EMPTY, { copy: CLEAN }).filter((f) => f.code === 'C5');
    expect(c5.length).toBeGreaterThan(0);
    const m = c5[0].detail.match(/is ([\d.]+):1, needs 4\.5/);
    expect(m, c5[0].detail).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(2.9);
    expect(Number(m![1])).toBeLessThan(3.5);
    expect(codes(roomy())).not.toContain('C5');
  });

  it('C5: a 120-character name squeezed to MIN_TYPE_PX, or clipped, fails', () => {
    const long = 'A'.repeat(60) + ' ' + 'B'.repeat(59);
    expect(long).toHaveLength(120);
    const named = { copy: { ...CLEAN, brand: long, headline: long } };
    // A supporting line just under the headline leaves it one line of room.
    const tight = roomy();
    const crowded = { ...tight, slots: [...tight.slots, { role: 'subline' as const, x: 0.09, y: 0.2, w: 0.6, size: 0.03 }] };
    const all = automatedCriticals(crowded, [], EMPTY, named).filter((f) => f.code === 'C5').map((f) => f.detail).join(' | ');
    expect(all).toMatch(/front\.headline with copy is at MIN_TYPE_PX/);
    // The name line never wraps: a long name is cut off with an ellipsis.
    expect(all).toMatch(/front\.brand with copy is clipped/);
    expect(codes(roomy())).not.toContain('C5');
  });

  it("C5: an essential below the format's minimum fails (6 pt on a business card, not 9 px)", () => {
    // card-front sets its brand and contact at about 19 px; 6 pt on this card is 25 px.
    const all = automatedCriticals(base(), [], EMPTY, { copy: CLEAN })
      .filter((f) => f.code === 'C5').map((f) => f.detail).join(' | ');
    expect(all).toMatch(/front\.brand with copy is 19px, below the format's 25\.0px minimum/);
    // contact is a required role of a business card, and a list.
    expect(all).toMatch(/\.contact with copy is \d+px, below the format's 25\.0px minimum/);
    // eyebrow is not a required role, so its size is the access score's business, not C5's.
    expect(all).not.toMatch(/eyebrow/);
  });

  it('C5: the long-copy trial puts LONG_BRAND in the brand and LONG_HEADLINE in the headline', () => {
    expect(LONG_BRAND).toHaveLength(40);
    expect(LONG_HEADLINE).toHaveLength(60);
    const narrow = roomy();
    const squeezed = { ...narrow, slots: narrow.slots.map((s) => (s.role === 'brand' ? { ...s, w: 0.4 } : s)) };
    const all = automatedCriticals(squeezed, [], EMPTY, { copy: CLEAN })
      .filter((f) => f.code === 'C5').map((f) => f.detail).join(' | ');
    expect(all).toMatch(/front\.brand with long copy is clipped/);
    expect(all).not.toMatch(/with copy is clipped/);
  });

  it('C3: a registered font file that is missing is reported, not thrown', () => {
    const face = typefaceOf('script');
    const real = face.files[400];
    face.files[400] = '/fonts/studio/no-such-face-400.woff2';
    try {
      const scripted = base({
        look: undefined, font: 'script',
        slots: card.slots.map((s): SlotSpec => ({ ...s, font: undefined })),
        extraPages: undefined,
      });
      const c3 = automatedCriticals(scripted, [], EMPTY, { copy: CLEAN }).filter((f) => f.code === 'C3');
      expect(c3.map((f) => f.detail).join(' | ')).toMatch(/Dancing Script 400 file \/fonts\/studio\/no-such-face-400\.woff2 is missing/);
    } finally {
      face.files[400] = real;
    }
  });

  it('C7: a text role the customiser cannot edit fails', () => {
    expect(Object.keys(CUSTOMISER_TEXT_FIELDS)).not.toContain('meta');
    const withMeta = base({ slots: [...card.slots, { role: 'meta', x: 0.09, y: 0.6, w: 0.5, size: 0.03 }] });
    expect(codes(withMeta)).toContain('C7');
    expect(codes(base())).not.toContain('C7');
  });

  it('C8 is never returned in P1-P2 and is listed as not checked', () => {
    for (const tpl of DESIGN_TEMPLATES.slice(0, 10)) expect(codes(tpl, {})).not.toContain('C8');
    expect(NOT_CHECKED).toEqual(['C8']);
  });

  it('C9: placeholder copy and fake phone numbers fail; industry examples pass', () => {
    expect(codes(base(), { copy: { ...CLEAN, headline: 'Your headline here' } })).toContain('C9');
    expect(codes(base(), { copy: { ...CLEAN, contact: ['080 0000 0000'] } })).toContain('C9');
    expect(codes(base(), { copy: { ...CLEAN, contact: ['0800 000 0000'] } })).toContain('C9');
    expect(codes(base(), { copy: { ...CLEAN, contact: ['Call 123-456'] } })).toContain('C9');
    expect(codes(base(), { copy: { ...CLEAN, contact: ['hello@example.com'] } })).toContain('C9');
    // card-front has no subline slot, so the eyebrow carries it.
    expect(codes(base(), { copy: { ...CLEAN, eyebrow: 'Lorem ipsum dolor sit amet.' } })).toContain('C9');
    expect(codes(base())).not.toContain('C9');
  });

  it('C10 is reviewer-only and never automated', () => {
    for (const tpl of DESIGN_TEMPLATES.slice(0, 10)) expect(codes(tpl, {})).not.toContain('C10');
  });

  it('C11: a referenced mockup_scene asset fails', () => {
    const scene = { assets: [asset('m1', { kind: 'mockup_scene' }), asset('p1')] };
    expect(codes(withImage(base(), 'asset:m1'), undefined, scene)).toContain('C11');
    expect(codes(withImage(base(), 'asset:p1'), undefined, scene)).not.toContain('C11');
  });

  it('C12: a slot inside the 5 mm safe margin of a press format fails', () => {
    // 5 mm of an 85.6 mm card is 5.8% of its width.
    const edge = base({ slots: card.slots.map((s) => (s.role === 'headline' ? { ...s, x: 0.02 } : s)) });
    expect(codes(edge)).toContain('C12');
    const inside = base({
      slots: card.slots.map((s) => ({ ...s, x: 0.12, w: Math.min(s.w, 0.7), y: Math.max(s.y, 0.2) })),
      extraPages: [{ name: 'Back', slots: [{ role: 'contact', x: 0.12, y: 0.4, w: 0.7, size: 0.03 }] }],
    });
    expect(codes(inside)).not.toContain('C12');
  });

  it('C13: two icon sets fail', () => {
    const icons = { assets: [asset('i1', { kind: 'icon', iconSet: 'lucide' }), asset('i2', { kind: 'icon', iconSet: 'tabler' })] };
    const two: DesignTemplate = {
      ...base({ iconSet: 'lucide' }),
      shapes: [...(card.shapes ?? []), { kind: 'rect', x: 0, y: 0, w: 0.1, h: 0.1, tone: 'ink', image: 'asset:i1' } as never,
        { kind: 'rect', x: 0, y: 0, w: 0.1, h: 0.1, tone: 'ink', image: 'asset:i2' } as never],
    };
    expect(codes(two, undefined, icons)).toContain('C13');
    expect(codes(withImage(base({ iconSet: 'lucide' }), 'asset:i1'), undefined, icons)).not.toContain('C13');
  });

  it('C13: a sibling at distance below 3 in the same product fails', () => {
    registerUploadedDeliverable('qa-twin', { category: 'branding', name: 'Twin', format: 'business-card', subcategory: 'business-card' });
    const twin = base({ key: 'qa-twin', direction: 'luxury' });
    const c13 = automatedCriticals(base(), [twin], EMPTY, { copy: CLEAN }).filter((f) => f.code === 'C13');
    expect(c13.map((f) => f.detail).join('\n')).toMatch(/qa-twin.*distance 0/);
    expect(codes(base(), undefined, EMPTY, [])).not.toContain('C13');
  });

  it("today's library: no external image, no font gap, no baked mockup, nothing outside a press safe area", () => {
    // The 8 previewMedia photos are passed by the gallery at render time, never stored on a template.
    const listed = DESIGN_TEMPLATES.filter((t) => t.look);
    const found = DESIGN_TEMPLATES.flatMap((t) => automatedCriticals(t, listed, EMPTY)
      .filter((f) => ['C1', 'C3', 'C11', 'C12'].includes(f.code))
      .map((f) => `${t.key} ${f.code}: ${f.detail}`));
    expect(found).toEqual([]);
  });

  it('returns each failure with a detail', () => {
    for (const f of automatedCriticals(templateByKey('tiered-sale'), DESIGN_TEMPLATES, EMPTY)) {
      expect(f.detail.length, f.code).toBeGreaterThan(0);
    }
  });
});
