import { describe, it, expect } from 'vitest';

import {
  ACCEPTED_IMAGE_TYPES, assetPath, assetUrl, checkImageFile, MAX_UPLOAD_BYTES, placeImage, imageTypeOf,
} from './designAssets';

const file = (over: Partial<{ type: string; size: number; name: string }> = {}) => ({
  type: 'image/png', size: 1024, name: 'photo.png', ...over,
});

describe('which files may be used', () => {
  it('accepts the types a browser can draw', () => {
    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(checkImageFile(file({ type })).ok, type).toBe(true);
    }
  });

  /*
   * An iPhone hands over HEIC without being asked. Most browsers cannot draw
   * it, so accepting it means a successful upload that renders as nothing —
   * the user sees an empty box and no reason for it.
   */
  it('refuses a format that would upload and then render as nothing', () => {
    const r = checkImageFile(file({ type: 'image/heic', name: 'IMG_0042.HEIC' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/PNG, JPEG, WebP or GIF/);
  });

  it('refuses things that are not images at all', () => {
    for (const type of ['application/pdf', 'text/html', 'video/mp4', '']) {
      expect(checkImageFile(file({ type })).ok, type).toBe(false);
    }
  });

  it('refuses an empty file', () => {
    expect(checkImageFile(file({ size: 0 })).ok).toBe(false);
  });

  it('refuses one that is too large, and says how large it was', () => {
    const r = checkImageFile(file({ size: MAX_UPLOAD_BYTES + 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/25 MB/);
  });

  it('allows a file right on the limit', () => {
    expect(checkImageFile(file({ size: MAX_UPLOAD_BYTES })).ok).toBe(true);
  });
});

describe('where an upload is stored', () => {
  it('is kept under the owner and the studio folder', () => {
    expect(assetPath('user-123', 'image/png', 1700000000000, 'abcdef'))
      .toBe('user-123/studio/1700000000000-abcdef.png');
  });

  it('uses the extension the type implies, not the one the file claimed', () => {
    expect(assetPath('u', 'image/jpeg', 1, 'aa')).toMatch(/\.jpg$/);
    expect(assetPath('u', 'image/webp', 1, 'aa')).toMatch(/\.webp$/);
  });

  /*
   * The filename the user chose never reaches the path. It is user input,
   * and the bucket's policies are enforced on the PREFIX — a path that
   * escaped the user's own folder would land where another person's policy
   * applies.
   */
  it('cannot be escaped by a hostile tail', () => {
    const p = assetPath('u', 'image/png', 1, '../../etc');
    expect(p).not.toMatch(/\.\./);
    expect(p.startsWith('u/studio/')).toBe(true);
    expect(p.split('/')).toHaveLength(3);
  });

  it('never produces an empty tail', () => {
    expect(assetPath('u', 'image/png', 1, '!!!!')).toMatch(/-x\.png$/);
  });

  it('does not collide within the same millisecond', () => {
    const paths = new Set(Array.from({ length: 200 }, () => assetPath('u', 'image/png', 1)));
    expect(paths.size).toBeGreaterThan(190);
  });
});

describe('resolving an asset to something drawable', () => {
  const resolve = (p: string) => `https://cdn.example/${p}`;

  it('turns a stored path into a public URL', () => {
    expect(assetUrl('u/studio/1-a.png', resolve)).toBe('https://cdn.example/u/studio/1-a.png');
  });

  /* Stock images and template artwork already arrive as absolute URLs. */
  it('passes an absolute URL straight through', () => {
    for (const url of ['https://images.pexels.com/a.jpg', 'http://x.test/a.png', '//cdn.test/a.png']) {
      expect(assetUrl(url, resolve), url).toBe(url);
    }
  });

  it('passes data and blob URLs through, so a local preview still draws', () => {
    expect(assetUrl('data:image/png;base64,AAA', resolve)).toBe('data:image/png;base64,AAA');
    expect(assetUrl('blob:http://x/1', resolve)).toBe('blob:http://x/1');
  });
});

describe('where a picture lands on the page', () => {
  const page = { width: 1080, height: 1080 };

  /*
   * The thing a user notices immediately. A 16:9 photo dropped into a square
   * box is visibly stretched, and a stretched photo of someone's shop is the
   * last thing they will forgive.
   */
  it('keeps the picture in proportion on a square page', () => {
    const p = placeImage({ width: 1600, height: 900 }, page);
    const rendered = (p.w * page.width) / (p.h * page.height);
    expect(rendered).toBeCloseTo(1600 / 900, 3);
  });

  it('keeps it in proportion on a portrait page too', () => {
    const story = { width: 1080, height: 1920 };
    const p = placeImage({ width: 900, height: 1600 }, story);
    const rendered = (p.w * story.width) / (p.h * story.height);
    expect(rendered).toBeCloseTo(900 / 1600, 3);
  });

  it('centres it and keeps it on the page', () => {
    for (const natural of [{ width: 4000, height: 100 }, { width: 100, height: 4000 }, { width: 50, height: 50 }]) {
      const p = placeImage(natural, page);
      expect(p.x).toBeCloseTo((1 - p.w) / 2, 6);
      expect(p.y).toBeCloseTo((1 - p.h) / 2, 6);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(1.0001);
      expect(p.y + p.h).toBeLessThanOrEqual(1.0001);
    }
  });

  /* A natural size of zero means the browser could not measure it. */
  it('still produces a usable box when the size is unknown', () => {
    const p = placeImage({ width: 0, height: 0 }, page);
    expect(p.w).toBeGreaterThan(0);
    expect(p.h).toBeGreaterThan(0);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe('a file that arrived without a type', () => {
  it('reads the type from the name', () => {
    expect(imageTypeOf('ppt/media/image1.PNG')).toBe('image/png');
    expect(imageTypeOf('image2.jpg')).toBe('image/jpeg');
    expect(imageTypeOf('image3.jpeg')).toBe('image/jpeg');
  });

  /*
   * PowerPoint still writes EMF and WMF. Uploading one would store a file no
   * browser can draw and render it as a broken box.
   */
  it('refuses a format no browser will draw', () => {
    expect(imageTypeOf('ppt/media/image4.emf')).toBeNull();
    expect(imageTypeOf('ppt/media/image5.wmf')).toBeNull();
    expect(imageTypeOf('ppt/media/image6.tiff')).toBeNull();
    expect(imageTypeOf('noextension')).toBeNull();
  });
});
