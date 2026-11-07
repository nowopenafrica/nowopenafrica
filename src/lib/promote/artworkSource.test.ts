import { describe, it, expect } from 'vitest';
import { classifyArtworkFile, classifyArtworkUrl, MAX_IMAGE_BYTES } from './artworkSource';

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('classifyArtworkFile', () => {
  it('accepts the usual images', () => {
    for (const [name, type] of [['a.png', 'image/png'], ['a.jpg', 'image/jpeg'], ['a.webp', 'image/webp'], ['a.svg', 'image/svg+xml'], ['a.gif', 'image/gif'], ['a.avif', 'image/avif']]) {
      expect(classifyArtworkFile(f(name, type))).toEqual({ ok: true, kind: 'image' });
    }
  });

  it('accepts video', () => {
    for (const [name, type] of [['a.mp4', 'video/mp4'], ['a.webm', 'video/webm'], ['a.mov', 'video/quicktime']]) {
      expect(classifyArtworkFile(f(name, type))).toEqual({ ok: true, kind: 'video' });
    }
  });

  it('falls back to the extension when the browser sends no type', () => {
    expect(classifyArtworkFile(f('advert.JPG', ''))).toEqual({ ok: true, kind: 'image' });
    expect(classifyArtworkFile(f('advert.jfif', 'application/octet-stream'))).toEqual({ ok: true, kind: 'image' });
    expect(classifyArtworkFile(f('spot.mov', ''))).toEqual({ ok: true, kind: 'video' });
  });

  it('explains HEIC rather than calling it not an image', () => {
    const v = classifyArtworkFile(f('IMG_0001.HEIC', 'image/heic'));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.problem).toMatch(/HEIC/);
  });

  it('says what would work for anything else', () => {
    const v = classifyArtworkFile(f('brief.pdf', 'application/pdf'));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.problem).toMatch(/MP4/);
  });

  it('keeps separate size limits for images and video', () => {
    expect(classifyArtworkFile(f('big.png', 'image/png', MAX_IMAGE_BYTES + 1)).ok).toBe(false);
    expect(classifyArtworkFile(f('big.mp4', 'video/mp4', MAX_IMAGE_BYTES + 1)).ok).toBe(true);
  });
});

describe('classifyArtworkUrl', () => {
  it('reads the kind from the file extension', () => {
    expect(classifyArtworkUrl('https://cdn.example.com/ads/spot.mp4')).toMatchObject({ ok: true, kind: 'video', name: 'spot.mp4' });
    expect(classifyArtworkUrl('https://cdn.example.com/ads/board.webp?v=2')).toMatchObject({ ok: true, kind: 'image', name: 'board.webp' });
    expect(classifyArtworkUrl('https://cdn.example.com/render/123')).toMatchObject({ ok: true, kind: 'unknown' });
  });

  it('refuses pages that are not the file', () => {
    for (const u of ['https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', 'https://www.instagram.com/p/xyz/']) {
      const v = classifyArtworkUrl(u);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.problem).toMatch(/direct link/);
    }
  });

  it('refuses things that are not web links', () => {
    expect(classifyArtworkUrl('').ok).toBe(false);
    expect(classifyArtworkUrl('not a url').ok).toBe(false);
    expect(classifyArtworkUrl('javascript:alert(1)').ok).toBe(false);
    expect(classifyArtworkUrl('ftp://x.com/a.png').ok).toBe(false);
  });
});
