import { describe, it, expect } from 'vitest';

import { sizeSummary, toUsdPerDay, type SizeSpec } from './sizeSpec';
import { readAdDimensions } from './adDimensions';

describe('sizeSummary', () => {
  it('writes each kind as the legacy dimensions text', () => {
    const cases: [SizeSpec, string][] = [
      [{ kind: 'area', widthM: 12, heightM: 6 }, '12m × 6m'],
      [{ kind: 'area', widthM: 4.5, heightM: 3 }, '4.5m × 3m'],
      [{ kind: 'screen', resolution: '1920x1080', orientation: 'landscape' }, '1920x1080 screen · landscape'],
      [{ kind: 'screen', resolution: ' 1080x1920 ', orientation: 'portrait' }, '1080x1920 screen · portrait'],
      [{ kind: 'airtime', seconds: 30, spotsPerDay: 4 }, '30s spot · 4 a day'],
      [{ kind: 'vehicle', extent: 'one_flank' }, 'One flank'],
      [{ kind: 'vehicle', extent: 'both_flanks' }, 'Both flanks'],
      [{ kind: 'vehicle', extent: 'full_wrap' }, 'Full wrap'],
      [{ kind: 'other', text: '  10 lightboxes  ' }, '10 lightboxes'],
    ];
    for (const [spec, text] of cases) expect(sizeSummary(spec), spec.kind).toBe(text);
  });

  it('an area summary still reads as a size to the existing dimensions reader', () => {
    expect(readAdDimensions(sizeSummary({ kind: 'area', widthM: 12, heightM: 6 }))).toMatchObject({ kind: 'size', width: 12, height: 6, unit: 'm' });
    expect(readAdDimensions(sizeSummary({ kind: 'airtime', seconds: 30, spotsPerDay: 4 }))).toMatchObject({ kind: 'duration', seconds: 30 });
  });
});

describe('toUsdPerDay', () => {
  // rates are currency per 1 USD, as loadRates returns them.
  const rates = { USD: 1, NGN: 1500, KES: 130 };

  it('NGN per month → USD per day (a month is 30 days, as the Promote mix costs it)', () => {
    expect(toUsdPerDay(450_000, 'NGN', 'month', rates)).toBe(10);
  });

  it('KES per week → USD per day', () => {
    expect(toUsdPerDay(9_100, 'KES', 'week', rates)).toBe(10);
  });

  it('USD per day passes through, rounded to cents', () => {
    expect(toUsdPerDay(12.345, 'USD', 'day', rates)).toBe(12.35);
  });

  it('is null when the currency has no rate or the amount is not a price', () => {
    expect(toUsdPerDay(100, 'XYZ', 'day', rates)).toBeNull();
    expect(toUsdPerDay(Number.NaN, 'NGN', 'day', rates)).toBeNull();
    expect(toUsdPerDay(-5, 'NGN', 'day', rates)).toBeNull();
    expect(toUsdPerDay(100, 'NGN', 'day', { NGN: 0 })).toBeNull();
  });
});
