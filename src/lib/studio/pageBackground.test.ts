import { describe, it, expect } from 'vitest';

import { clampDim, exportNote, isUsableUrl, kindOfUrl, mediaStyle } from './pageBackground';

describe('telling a picture from a film', () => {
  it('reads common image addresses', () => {
    for (const url of ['https://x.test/a.jpg', 'https://x.test/a.PNG', 'https://x.test/a.webp?v=2', 'u/studio/1-a.png']) {
      expect(kindOfUrl(url), url).toBe('image');
    }
  });

  it('reads common video addresses', () => {
    for (const url of ['https://x.test/a.mp4', 'https://x.test/clip.webm?t=1', 'u/studio/1-a.mov']) {
      expect(kindOfUrl(url), url).toBe('video');
    }
  });

  /*
   * An address that says neither is NOT guessed. A video treated as an image
   * renders a broken icon; an image treated as a video renders nothing — and
   * both look like the upload failed.
   */
  it('returns nothing when the address does not say', () => {
    for (const url of ['https://x.test/photo', 'https://x.test/', '', '   ']) {
      expect(kindOfUrl(url), url).toBeNull();
    }
  });
});

describe('addresses the renderer will load', () => {
  it('accepts http(s) and stored paths', () => {
    expect(isUsableUrl('https://x.test/a.jpg')).toBe(true);
    expect(isUsableUrl('http://x.test/a.jpg')).toBe(true);
    expect(isUsableUrl('user-id/studio/1-a.png')).toBe(true);
  });

  /*
   * `javascript:` is a script injection with a picture's job title, and a
   * blob: URL cannot be fetched under this app's CSP — it works in
   * development and fails on the live site.
   */
  it('refuses anything that is not a fetchable address', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'blob:http://localhost/abc',
      'file:///etc/passwd',
      '',
      '   ',
    ]) {
      expect(isUsableUrl(bad), bad).toBe(false);
    }
  });
});

describe('dimming', () => {
  it('stays between clear and nearly black', () => {
    expect(clampDim(-1)).toBe(0);
    expect(clampDim(5)).toBe(0.9);
    expect(clampDim(0.35)).toBe(0.35);
  });

  /* A fully black veil is just a black page; 0.9 leaves the picture present. */
  it('never blacks the picture out entirely', () => {
    expect(clampDim(1)).toBeLessThan(1);
  });

  it('copes with an empty field', () => {
    expect(clampDim(Number.NaN)).toBe(0);
  });
});

describe('what the user is warned about before exporting', () => {
  /*
   * ── THE ONE THAT MATTERS ─────────────────────────────────────────────
   *
   * html-to-image draws DOM, and a playing video is not DOM. Without this
   * note the export comes back with the colour behind it and no explanation,
   * and the person finds out when a customer does.
   */
  it('says a video background will not be in the file', () => {
    const note = exportNote({ assetId: 'a.mp4', kind: 'video' });
    expect(note).toMatch(/cannot be written into a PNG or PDF/i);
  });

  it('says nothing when there is nothing to warn about', () => {
    expect(exportNote({ assetId: 'a.jpg', kind: 'image' })).toBeNull();
    expect(exportNote(null)).toBeNull();
    expect(exportNote(undefined)).toBeNull();
  });
});

describe('how the media sits on the page', () => {
  it('covers by default and never catches a click', () => {
    const s = mediaStyle({ assetId: 'a.jpg', kind: 'image' });
    expect(s.objectFit).toBe('cover');
    expect(s.pointerEvents).toBe('none');
    expect(s.inset).toBe(0);
  });

  it('honours a contain fit', () => {
    expect(mediaStyle({ assetId: 'a.jpg', kind: 'image', fit: 'contain' }).objectFit).toBe('contain');
  });
});
