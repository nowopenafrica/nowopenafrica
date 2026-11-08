import { describe, it, expect } from 'vitest';

import { PREVIEW_PHOTOS, previewPhotoFor, previewPhotoForTemplate } from './previewMedia';
import { diversify } from './taxonomy';
import { DESIGN_TEMPLATES } from '../designTemplates';

/**
 * The gallery's preview photography — where it comes from, and what it is not.
 *
 * The rule this platform has held to repeatedly is that nothing is lifted from
 * another design tool's library, and that a gallery image never implies a real
 * business. These are Pexels URLs already present in this repository's sample
 * content, shown behind placeholder copy reading "Your headline here", on
 * template previews only. No profile in the directory renders one.
 */
describe('preview photography', () => {
  it('comes only from Pexels, which licences commercial use', () => {
    for (const p of PREVIEW_PHOTOS) {
      expect(p.url, p.url).toMatch(/^https:\/\/images\.pexels\.com\/photos\//);
      expect(p.licence).toBe('Pexels');
    }
  });

  it('names no other design tool', () => {
    // The standing rule, asserted rather than trusted to memory.
    const all = PREVIEW_PHOTOS.map((p) => p.url).join(' ').toLowerCase();
    for (const banned of ['canva', 'freepik', 'shutterstock', 'envato', 'getty', 'adobe']) {
      expect(all, banned).not.toContain(banned);
    }
  });

  it('is served over https from a host the CSP allows', () => {
    // img-src lists images.pexels.com explicitly; an http URL would be blocked
    // and the card would render a blank rectangle.
    for (const p of PREVIEW_PHOTOS) expect(p.url.startsWith('https://')).toBe(true);
  });

  it('gives a template the same photograph every time', () => {
    /*
     * A gallery that reshuffles its imagery on every paint looks broken, and an
     * export taken a moment after a preview would not match it.
     */
    for (const t of DESIGN_TEMPLATES) {
      expect(previewPhotoFor(t.key)).toBe(previewPhotoFor(t.key));
    }
  });

  it('only dresses the layouts built around a picture', () => {
    /*
     * Opt-in, not automatic. A dense price list or a certificate is worse with
     * a photograph behind it, and a remote image costs bandwidth on exactly the
     * connections this audience uses.
     */
    const photoLed = DESIGN_TEMPLATES.filter((t) => t.photoLed);
    expect(photoLed.length).toBeGreaterThan(0);
    expect(photoLed.length).toBeLessThan(DESIGN_TEMPLATES.length / 2);

    // The ones that must never carry one, by name.
    for (const key of ['price-list', 'certificate', 'opening-hours', 'price-block']) {
      const t = DESIGN_TEMPLATES.find((x) => x.key === key);
      if (t) expect(t.photoLed ?? false, key).toBe(false);
    }
  });

  it('spreads across the set rather than picking one image for everything', () => {
    const used = new Set(DESIGN_TEMPLATES.filter((t) => t.photoLed).map((t) => previewPhotoFor(t.key)));
    expect(used.size).toBeGreaterThan(1);
  });
});

describe('the first screen shows what the library can do', () => {
  /*
   * The gallery shows twelve at a time and that is the whole impression. The
   * ordering interleaves by scheme and mood; before photography was part of
   * that key, the photo-led layouts clustered and the opening screen could
   * come up almost entirely flat colour — which is what "it looks basic"
   * meant.
   */
  it('puts photography in the first twelve', () => {
    const first = diversify().slice(0, 12).filter((t) => t.photoLed);
    expect(first.length).toBeGreaterThanOrEqual(4);
  });

  it('does not cluster them all at the top either', () => {
    const first = diversify().slice(0, 12).filter((t) => t.photoLed);
    expect(first.length).toBeLessThanOrEqual(9);
  });
});

describe('a template that names a photo subject', () => {
  it('changes no existing template: without photoSubject the pick is the key hash', () => {
    for (const t of DESIGN_TEMPLATES.filter((x) => !x.photoSubject)) {
      expect(previewPhotoForTemplate(t), t.key).toBe(previewPhotoFor(t.key));
    }
    // Only the Task 18 pilot names a subject so far.
    for (const t of DESIGN_TEMPLATES.filter((x) => x.photoSubject)) expect(t.key.startsWith('pilot-'), t.key).toBe(true);
  });

  it('gets a photograph of that subject, or none when the pool has none', () => {
    const named = DESIGN_TEMPLATES.filter((t) => t.photoSubject);
    expect(named.length).toBeGreaterThan(0);
    for (const t of named) {
      const url = previewPhotoForTemplate(t);
      const has = PREVIEW_PHOTOS.some((p) => p.subject === t.photoSubject);
      if (has) expect(PREVIEW_PHOTOS.find((p) => p.url === url)?.subject, t.key).toBe(t.photoSubject);
      else expect(url, t.key).toBeNull();
    }
  });

  it('picks within the subject, stably, and misses to no photo rather than to the hash', () => {
    const work = previewPhotoForTemplate({ key: 'qa-work', photoSubject: 'work' });
    expect(PREVIEW_PHOTOS.find((p) => p.url === work)?.subject).toBe('work');
    expect(previewPhotoForTemplate({ key: 'qa-work', photoSubject: 'work' })).toBe(work);
    // Ruling AH: the pool holds no food photograph, so the dish post shows none (not a gavel).
    expect(PREVIEW_PHOTOS.some((p) => p.subject === 'food')).toBe(false);
    expect(previewPhotoForTemplate({ key: 'pilot-ig-industry', photoSubject: 'food' })).toBeNull();
    const dish = DESIGN_TEMPLATES.find((t) => t.key === 'pilot-ig-industry')!;
    expect(previewPhotoForTemplate(dish)).toBeNull();
  });

  it('is named on every photo-led pilot design', () => {
    for (const t of DESIGN_TEMPLATES.filter((x) => x.key.startsWith('pilot-') && x.photoLed)) {
      expect(t.photoSubject, t.key).toBeDefined();
    }
  });
});
