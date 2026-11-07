import { describe, it, expect } from 'vitest';

import { FORMATS, formatOf, needsReverify, sameRatio } from './formats';
import { DELIVERABLES } from './deliverables';
import { PHYSICAL } from './printSpec';
import { DESIGN_FORMATS } from '../../data/studioPresets';

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

  it('PHYSICAL equals the registry mm', () => {
    for (const [k, p] of Object.entries(PHYSICAL)) {
      expect(FORMATS[k].mm).toEqual({ w: p.widthMm, h: p.heightMm });
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

  it('needs re-verification after 180 days, or when never verified', () => {
    const f = { ...FORMATS['instagram-post'], verifiedAt: '2026-01-01' };
    expect(needsReverify(f, '2026-06-30')).toBe(false); // 180 days
    expect(needsReverify(f, '2026-07-01')).toBe(true); // 181 days
    expect(needsReverify({ ...f, verifiedAt: undefined }, '2026-01-02')).toBe(true);
  });

  it('sameRatio respects tolerance', () => {
    expect(sameRatio(1, 1.005)).toBe(true);
    expect(sameRatio(1, 1.05)).toBe(false);
  });
});
