import { describe, expect, it } from 'vitest';

import { DEFAULT_PLATFORM, PLATFORM_MARKS, SIMPLE_ICONS_VERSION, isPlatformKey, platformMark } from './platformMarks';

describe('the platform marks', () => {
  it('are the nine approved platforms, LinkedIn deliberately absent', () => {
    expect(PLATFORM_MARKS.map((m) => m.key)).toEqual([
      'instagram', 'tiktok', 'x', 'youtube', 'facebook', 'whatsapp', 'threads', 'snapchat', 'pinterest',
    ]);
    // Removed from Simple Icons at 14.0.0: LinkedIn's guidelines do not permit third-party use.
    expect(isPlatformKey('linkedin')).toBe(false);
    expect(platformMark('linkedin')).toBeNull();
    expect(isPlatformKey(DEFAULT_PLATFORM)).toBe(true);
  });

  it('carry X, the current mark, and not the old bird', () => {
    expect(platformMark('x')).toMatchObject({ name: 'X', slug: 'x' });
    expect(isPlatformKey('twitter')).toBe(false);
  });

  it('record where every path came from and under what terms', () => {
    expect(SIMPLE_ICONS_VERSION).toBe('16.37.0');
    for (const m of PLATFORM_MARKS) {
      expect(m.source, m.key).toBe('simple-icons');
      expect(m.sourceVersion, m.key).toBe(SIMPLE_ICONS_VERSION);
      expect(m.slug, m.key).toMatch(/^[a-z0-9]+$/);
      expect(m.licence, m.key).toMatch(/^CC0-1\.0 \(artwork\); trademark of \S.+$/);
      expect(m.guidelinesUrl, m.key).toMatch(/^https:\/\/[^\s?#]+$/);
    }
  });

  it('are one square, single-colour path each: nothing to stretch, nothing to recolour', () => {
    for (const m of PLATFORM_MARKS) {
      expect(m.viewBox, m.key).toBe('0 0 24 24');
      expect(m.path, m.key).toMatch(/^M[\d\s.,\-A-Za-z]+$/);
      expect(m.path, m.key).not.toMatch(/fill|#|url\(/i);
    }
  });
});
