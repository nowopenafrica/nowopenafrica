import { describe, it, expect } from 'vitest';
import { designCoachReport, contrastRatio, DesignCoachInput } from './designCoach';

function report(over: Partial<DesignCoachInput> = {}): ReturnType<typeof designCoachReport> {
  return designCoachReport({
    headline: 'Weekend Specials Are Live',
    subline: 'Save big — this weekend only',
    badge: 'BOOK NOW',
    accent: '#dc2626',
    bgColor: null,
    qr: 'data:image/png;base64,xx',
    hasLogo: true,
    hasBackground: true,
    brandAccent: '#dc2626',
    ...over,
  });
}

describe('design coach', () => {
  it('gives a strong report to a complete design', () => {
    const r = report();
    expect(r.overall).toBeGreaterThanOrEqual(80);
    expect(['A', 'B']).toContain(r.grade);
    expect(r.metrics.map((m) => m.score).every((s) => s >= 75)).toBe(true);
  });

  it('flags a design with no headline, CTA or QR', () => {
    const r = report({ headline: '', subline: '', badge: '', qr: '', hasLogo: false });
    expect(r.overall).toBeLessThan(60);
    const read = r.metrics.find((m) => m.key === 'readability')!;
    const cta = r.metrics.find((m) => m.key === 'cta')!;
    expect(read.score).toBe(0);
    expect(cta.score).toBe(0);
    expect(r.tips.filter((t) => t.level !== 'good').length).toBeGreaterThan(0);
  });

  it('rewards a brand-colour match and offers to apply a mismatch', () => {
    expect(report({ brandAccent: '#dc2626' }).brandMatch).toBe(100);
    const mismatch = report({ brandAccent: '#7c3aed' });
    expect(mismatch.brandMatch).toBe(55);
    expect(mismatch.canApplyBrand).toBe(true);
  });

  it('keeps the score neutral when no brand colour is saved', () => {
    const r = report({ brandAccent: '' });
    expect(r.brandMatch).toBe(80);
    expect(r.canApplyBrand).toBe(false);
  });

  it('scores contrast correctly for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeGreaterThan(15);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
  });
});
