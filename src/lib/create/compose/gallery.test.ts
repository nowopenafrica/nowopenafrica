import { describe, expect, it } from 'vitest';
import { formatOf, type Format } from '../../design/formats';
import type { TextObject } from '../../studio/designDocument';
import { SUBCATEGORIES } from '../catalogueTaxonomy';
import { INDUSTRIES } from '../intel';
import { checkConcept, describeFindings } from './conceptChecks';
import { GALLERY_KITS, GENERAL_HEADS, galleryCovers, galleryFor, photosFor, showsFacts } from './gallery';
import { PHOTO_BASE, PILOT_PHOTOS } from './photoSet';
import { refuseLine } from './ideas';
import { MANIFEST } from '../../design/assetManifest';
import { ENGINE_ITEMS } from '../engineItems';

const ITEMS = Object.keys(GALLERY_KITS);
const TRADES = [undefined, ...INDUSTRIES.map((i) => i.key)];
const texts = (d: { doc: { pages: { objects: unknown[] }[] } }) =>
  (d.doc.pages[0].objects as TextObject[]).filter((o) => o.type === 'text').map((o) => o.text.replace(/\s+/g, ' '));

describe('the category gallery', () => {
  it('lists the same items as the light list the Create page reads without loading the engine', () => {
    expect([...ENGINE_ITEMS].sort()).toEqual(Object.keys(GALLERY_KITS).sort());
  });

  it('covers only items that exist, each on one of its own formats', () => {
    for (const item of ITEMS) {
      expect(galleryCovers(item), item).toBe(true);
      expect(SUBCATEGORIES.find((s) => s.key === item)!.formats.length, item).toBeGreaterThan(0);
    }
    /* Document and multi-part items keep their templates until the engine can make them properly. */
    for (const item of ['letterhead', 'invoice', 'carousel', 'packaging', 'company-profile']) expect(galleryCovers(item), item).toBe(false);
    expect(galleryFor('letterhead')).toEqual([]);
  });

  it('gives every item at least eight designs for any business and for every trade', () => {
    const short: string[] = [];
    for (const item of ITEMS) for (const trade of TRADES) {
      const n = galleryFor(item, { trade, count: 8 }).length;
      if (n < 8) short.push(`${item} / ${trade ?? 'any'}: ${n}`);
    }
    expect(short).toEqual([]);
  });

  it('offers only designs that pass every measured check, at the item’s real shape', () => {
    const failures: string[] = [];
    for (const item of ITEMS) for (const trade of [undefined, 'restaurant-dining', 'real-estate', 'events-conferences']) {
      const sub = SUBCATEGORIES.find((s) => s.key === item)!;
      const format = formatOf(sub.formats[0]) as Format;
      const distance = /^(billboard|board-)/.test(sub.formats[0]);
      for (const d of galleryFor(item, { trade, count: 16 })) {
        const page = d.doc.pages[0];
        expect(Math.abs(page.width / page.height - format.w / format.h), `${item} shape`).toBeLessThan(0.01);
        for (const line of describeFindings(checkConcept(d.doc, { format, distance }))) failures.push(`${item}/${trade ?? 'any'}/${d.archetype}: ${line}`);
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('is varied: different compositions, headline faces and headlines', () => {
    for (const item of ITEMS) {
      const g = galleryFor(item, { count: 8 });
      expect(new Set(g.map((d) => d.archetype)).size, `${item} compositions`).toBeGreaterThanOrEqual(5);
      expect(new Set(g.map((d) => d.type.replace(/,.*/, ''))).size, `${item} headline faces`).toBeGreaterThanOrEqual(6);
      expect(new Set(g.map((d) => `${d.archetype}/${d.pairing}`)).size, item).toBe(g.length);
      /* A business card and a speaker card lead with the person's name: the one headline that should repeat. */
      if (!['business-card', 'speaker-card'].includes(item)) {
        const heads = g.map((d) => texts(d).find((t) => t === t) ?? '').length;
        const distinct = new Set(g.map((d) => (d.doc.pages[0].objects as TextObject[]).find((o) => o.type === 'text' && o.slotRole === 'headline')?.text.replace(/\s+/g, ' '))).size;
        /* Eight designs, eight different headlines: a gallery that repeats itself looks like a template pack. */
        expect(distinct, `${item} headlines`).toBe(heads);
      }
    }
  });

  it('shows the facts an item exists to carry: a card its phone, an event its date', () => {
    for (const item of ITEMS) for (const d of galleryFor(item, { count: 16 })) expect(showsFacts(d.doc, GALLERY_KITS[item]), `${item}/${d.archetype}`).toBe(true);
    const card = galleryFor('business-card', { count: 16 });
    for (const d of card) expect(texts(d).join(' | '), d.archetype).toMatch(/Your phone/);
    for (const d of galleryFor('event-poster', { count: 16 })) expect(texts(d).join(' | '), d.archetype).toMatch(/Your date/);
  });

  it('says nothing a business did not say: no filler, no invented facts', () => {
    const filler = /lorem|your story line|one-line promise|00%|your headline here|\[/i;
    for (const item of ITEMS) for (const trade of [undefined, 'restaurant-dining']) for (const d of galleryFor(item, { trade, count: 8 })) {
      for (const o of (d.doc.pages[0].objects as TextObject[]).filter((x) => x.type === 'text')) {
        const t = o.text.replace(/\s+/g, ' ');
        expect(t, `${item}: "${t}"`).not.toMatch(filler);
        /* The grid layout numbers its rows ("01", "02"): ornament, named as such. Any other figure would be invented. */
        if (!/ number$/.test(o.name)) expect(t, `${item}: "${t}"`).not.toMatch(/\d/);
      }
    }
    /* The general headlines are held to the same gate as the bank. */
    for (const [goal, heads] of Object.entries(GENERAL_HEADS)) for (const h of heads ?? []) expect(refuseLine(h, 'headline', new Set()), `${goal}: ${h}`).toBeNull();
    for (const [item, kit] of Object.entries(GALLERY_KITS)) for (const h of kit.heads ?? []) expect(refuseLine(h, 'headline', new Set()), `${item}: ${h}`).toBeNull();
  });

  it('uses the chosen trade’s own words', () => {
    const g = galleryFor('flyer', { trade: 'restaurant-dining', count: 8 });
    expect(g.some((d) => texts(d).some((t) => /Pull up a chair\.|The table is set\.|Stay for another course\./.test(t)))).toBe(true);
  });

  it('is quick enough to build on every visit', () => {
    const t = performance.now();
    for (const item of ITEMS) galleryFor(item, { count: 16 });
    expect(performance.now() - t).toBeLessThan(4000);
  });

  describe('with the pilot photographs', () => {
    const photos = 'http://127.0.0.1:5197';
    /* A library with nothing approved: the state before the photo intake cleared them. */
    const NONE = { assets: [] };

    it('is type-led when nothing is approved and no photo folder is given, and tests never get one', () => {
      expect(PHOTO_BASE).toBe('');
      for (const item of ITEMS) expect(galleryFor(item, { count: 8, manifest: NONE }).some((d) => d.photo), item).toBe(false);
    });

    it('draws every pilot photograph from its approved copy in the committed library, editable', () => {
      const approved = new Set(MANIFEST.assets.filter((a) => a.kind === 'photo').map((a) => a.sourceId));
      for (const p of PILOT_PHOTOS) expect(approved.has(p.file.match(/(\d+)\./)![1]), p.file).toBe(true);
      const failures: string[] = [];
      for (const item of ITEMS) {
        const sub = SUBCATEGORIES.find((s) => s.key === item)!;
        const format = formatOf(sub.formats[0]) as Format;
        const distance = /^(billboard|board-)/.test(sub.formats[0]);
        const led = galleryFor(item, { count: 8 }).filter((d) => d.photo);
        if (led.length < 1) failures.push(`${item}: no photo-led design`);
        for (const d of led) {
          if (d.preview) failures.push(`${item}: an approved photo was marked as a preview`);
          const img = (d.doc.pages[0].objects as { type: string; assetId?: string }[]).find((o) => o.type === 'image');
          if (!/\/storage\/v1\/object\/public\/design-assets\/web\//.test(img?.assetId ?? '')) failures.push(`${item}: not the public web copy`);
          for (const line of describeFindings(checkConcept(d.doc, { format, distance }))) failures.push(`${item}/${d.archetype}: ${line}`);
        }
      }
      expect(failures.slice(0, 10)).toEqual([]);
    });

    it('mixes photo-led designs into every item, each still passing every check and carrying its facts', () => {
      const failures: string[] = [];
      for (const item of ITEMS) for (const trade of [undefined, 'restaurant-dining', 'skincare-beauty']) {
        const sub = SUBCATEGORIES.find((s) => s.key === item)!;
        const format = formatOf(sub.formats[0]) as Format;
        const distance = /^(billboard|board-)/.test(sub.formats[0]);
        const g = galleryFor(item, { trade, count: 8, photos, manifest: NONE });
        const led = g.filter((d) => d.photo);
        if (g.length < 8) failures.push(`${item}/${trade ?? 'any'}: only ${g.length}`);
        if (led.length < (item === 'business-card' ? 1 : 2)) failures.push(`${item}/${trade ?? 'any'}: ${led.length} photo-led`);
        for (const d of led) {
          if (!d.preview) failures.push(`${item}: an unapproved photo was not marked as a preview`);
          const img = (d.doc.pages[0].objects as { type: string; assetId?: string }[]).find((o) => o.type === 'image');
          if (!img?.assetId?.startsWith(`${photos}/pexels-`)) failures.push(`${item}: photo not drawn`);
          if (!showsFacts(d.doc, GALLERY_KITS[item])) failures.push(`${item}/${d.archetype}: facts missing`);
          for (const line of describeFindings(checkConcept(d.doc, { format, distance }))) failures.push(`${item}/${d.archetype}: ${line}`);
        }
      }
      expect(failures.slice(0, 10)).toEqual([]);
    });

    it('uses an approved copy everywhere, editable, and keeps the rest as development previews', () => {
      const food = PILOT_PHOTOS.filter((p) => p.subjects.includes('food'));
      const manifest = { assets: food.map((p, k) => ({
        id: `00000000-0000-4000-8000-00000000000${k}`, kind: 'photo', path: `abc${k}.jpg`, w: 4000, h: 3000,
        licence: 'pexels', attribution: p.credit, tags: [], people: false, iconSet: null, sourceId: p.file.match(/(\d+)\./)![1],
      })) };
      /* No photo folder (production): only the approved photographs appear, from the public bucket, not as previews. */
      const live = galleryFor('menu', { count: 8, manifest });
      const led = live.filter((d) => d.photo);
      expect(led.length).toBeGreaterThanOrEqual(2);
      for (const d of led) {
        expect(d.preview).toBe(false);
        const img = (d.doc.pages[0].objects as { type: string; assetId?: string }[]).find((o) => o.type === 'image')!;
        expect(img.assetId).toMatch(/\/storage\/v1\/object\/public\/design-assets\/abc\d\.jpg$/);
      }
      /* In development the unapproved ones join as previews. */
      const dev = galleryFor('flyer', { count: 8, manifest, photos });
      expect(dev.some((d) => d.photo && d.preview)).toBe(true);
      expect(dev.filter((d) => d.photo && !d.preview).every((d) => d.photo!.subjects.includes('food'))).toBe(true);
    });

    it('picks photographs that fit: the trade’s own, a person on a card, food on a menu', () => {
      expect(photosFor('flyer', 'restaurant-dining').every((p) => p.groups.includes('Food & Hospitality'))).toBe(true);
      expect(photosFor('speaker-card').every((p) => p.people)).toBe(true);
      expect(photosFor('menu').every((p) => p.subjects.includes('food'))).toBe(true);
      /* Textures are not photographs of anything; they are not in the set. */
      expect(PILOT_PHOTOS.some((p) => /marble|wood grain|fabric|paper|metal/i.test(p.title))).toBe(false);
      for (const p of PILOT_PHOTOS) expect(p.credit, p.file).toMatch(/^Photo by .+ on Pexels$/);
    });
  });
});
