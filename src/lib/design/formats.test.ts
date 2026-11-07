import { describe, it, expect } from 'vitest';

import { FORMATS, formatOf, needsReverify, sameRatio } from './formats';
import { DELIVERABLES } from './deliverables';
import { PHYSICAL } from './printSpec';
import { DESIGN_FORMATS } from '../../data/studioPresets';
import { PRESETS, PRINT_DPI } from '../studio/formats';

describe('format registry', () => {
  it('resolves every deliverable format', () => {
    for (const [k, d] of Object.entries(DELIVERABLES)) {
      if (d.format) expect(formatOf(d.format), `${k} -> ${d.format}`).not.toBeNull();
    }
  });

  it('agrees with DESIGN_FORMATS on pixels', () => {
    for (const f of DESIGN_FORMATS) {
      expect(formatOf(f.key), f.key).toMatchObject({ w: f.w, h: f.h });
    }
  });

  it('has a DESIGN_FORMATS canvas for every registry key', () => {
    const keys = new Set(DESIGN_FORMATS.map((f) => f.key));
    for (const k of Object.keys(FORMATS)) expect(keys.has(k), k).toBe(true);
  });

  it('PHYSICAL keeps the sizes it had before the registry', () => {
    const was: Record<string, [number, number]> = {
      a4: [210, 297], a3: [297, 420], letter: [215.9, 279.4], 'half-a4': [210, 148.5],
      'business-card': [85.6, 54], 'business-card-portrait': [54, 85.6],
      letterhead: [210, 297], 'compliment-slip': [210, 99], postcard: [148, 105],
    };
    expect(Object.keys(PHYSICAL).sort()).toEqual(Object.keys(was).sort());
    for (const [k, [w, h]] of Object.entries(was)) {
      expect(PHYSICAL[k], k).toMatchObject({ widthMm: w, heightMm: h });
    }
  });

  it('px and mm ratios agree within 1%', () => {
    for (const f of Object.values(FORMATS)) {
      if (f.mm) expect(sameRatio(f.w / f.h, f.mm.w / f.mm.h), f.key).toBe(true);
    }
  });

  it('defines the 48-sheet and keeps the legacy billboard', () => {
    expect(FORMATS['board-48-sheet']).toMatchObject({
      w: 3600, h: 1800, mm: { w: 6096, h: 3048 }, medium: 'large-format', targetDpi: 150,
    });
    expect(FORMATS.billboard).toMatchObject({ w: 4500, h: 1500 });
  });

  it('gives every named-platform screen format a source', () => {
    const platform = /^(instagram|facebook|linkedin|youtube|tiktok|x-|whatsapp|story$)/;
    const hits = Object.values(FORMATS).filter((f) => f.medium === 'screen' && platform.test(f.key));
    expect(hits.length).toBeGreaterThan(5);
    for (const f of hits) expect(f.source, f.key).toMatch(/^https:\/\//);
  });

  /*
   * Studio PRESETS use their own keys, so the match is explicit. Two real
   * disagreements are KNOWN and left alone (other templates depend on both
   * sizes): the Studio business card is 85x55mm against the registry's ISO
   * 85.6x54, and the Studio Facebook cover is 820x312 against the registry's
   * 1640x859 (2.63 vs 1.91 ratio).
   */
  it('agrees with the Studio PRESETS where they describe the same format', () => {
    const match: Record<string, string> = {
      'ig-square': 'instagram-post', 'ig-portrait': 'instagram-portrait', 'ig-story': 'story',
      'facebook-post': 'facebook-post', 'linkedin-post': 'linkedin-post', 'linkedin-banner': 'linkedin-cover',
      'x-post': 'x-post', pinterest: 'pinterest', 'youtube-thumb': 'youtube-thumbnail',
      'youtube-art': 'youtube-banner', 'web-hero': 'website-banner', 'web-leaderboard': 'display-leaderboard',
      a3: 'a3', a4: 'a4', a5: 'a5', postcard: 'postcard',
    };
    const knownExceptions = new Set(['business-card', 'facebook-cover']);
    for (const p of PRESETS) {
      const key = match[p.id];
      if (!key) continue;
      const f = FORMATS[key];
      const [w, h] = [p.width, p.height];
      const target = p.unit === 'mm' && f.mm ? f.mm : { w: f.w, h: f.h };
      expect(sameRatio(w / h, target.w / target.h), `${p.id} vs ${key}`).toBe(true);
      if (p.unit === 'mm') expect(Math.abs(w - target.w) / target.w, `${p.id} mm`).toBeLessThan(0.01);
      else expect([w, h], `${p.id} px`).toEqual([f.w, f.h]);
    }
    for (const id of knownExceptions) expect(PRESETS.some((p) => p.id === id)).toBe(true);
    expect(sameRatio(85 / 55, 85.6 / 54)).toBe(false);
    expect(PRINT_DPI).toBe(300);
  });

  it('needs re-verification after 180 days, or when never verified', () => {
    const f = { ...FORMATS['instagram-post'], verifiedAt: '2026-01-01' };
    expect(needsReverify(f, '2026-06-30')).toBe(false); // 180 days
    expect(needsReverify(f, '2026-07-01')).toBe(true); // 181 days
    expect(needsReverify({ ...f, verifiedAt: undefined }, '2026-01-02')).toBe(true);
    expect(needsReverify({ ...f, verifiedAt: 'soon' }, '2026-01-02')).toBe(true);
    expect(needsReverify(f, 'today')).toBe(true);
  });

  it('sameRatio respects tolerance', () => {
    expect(sameRatio(1, 1.005)).toBe(true);
    expect(sameRatio(1, 1.05)).toBe(false);
  });
});
