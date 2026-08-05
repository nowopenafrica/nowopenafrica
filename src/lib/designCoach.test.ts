import { describe, it, expect } from 'vitest';
import { designCoachReport, contrastRatio, channelReadiness, DesignCoachInput, ChannelInput } from './designCoach';

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

describe('channel readiness', () => {
  const base: ChannelInput = {
    width: 1080,
    height: 1080,
    headline: 'Weekend Specials Are Live',
    subline: 'Save big — this weekend only',
    badge: 'BOOK NOW',
    accent: '#dc2626',
    bgColor: '#ffffff',
  };
  const by = (rows: ReturnType<typeof channelReadiness>, key: string) =>
    rows.find((r) => r.key === key)!;

  it('returns a score and a stated basis for every channel', () => {
    const rows = channelReadiness(base);
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.basis.trim()).not.toBe('');
      expect(r.note.trim()).not.toBe('');
    }
  });

  it('rates a square canvas better for the feed than for stories', () => {
    const rows = channelReadiness(base);
    expect(by(rows, 'feed').score).toBeGreaterThan(by(rows, 'story').score);
  });

  it('rates a 9:16 canvas better for stories than a square one', () => {
    const square = by(channelReadiness(base), 'story').score;
    const vertical = by(channelReadiness({ ...base, width: 1080, height: 1920 }), 'story').score;
    expect(vertical).toBeGreaterThan(square);
  });

  it('computes print DPI from the short edge, not the long one', () => {
    // 1748px short edge / 5.83in ≈ 300 DPI
    const good = by(channelReadiness({ ...base, width: 1748, height: 2480 }), 'print');
    expect(good.score).toBe(100);
    expect(good.basis).toMatch(/29\d|30\d DPI/);

    const poor = by(channelReadiness({ ...base, width: 480, height: 480 }), 'print');
    expect(poor.score).toBeLessThan(35);
    expect(poor.note).toMatch(/too low/i);
  });

  it('penalises a wall of text on outdoor', () => {
    const wordy = { ...base, headline: 'x'.repeat(160), subline: 'y'.repeat(160) };
    expect(by(channelReadiness(wordy), 'billboard').score)
      .toBeLessThan(by(channelReadiness(base), 'billboard').score);
  });

  it('reports exact WCAG contrast when a solid background is set', () => {
    const aaa = by(channelReadiness({ ...base, accent: '#000000', bgColor: '#ffffff' }), 'accessibility');
    expect(aaa.score).toBe(100);
    expect(aaa.note).toMatch(/AAA/);

    const fail = by(channelReadiness({ ...base, accent: '#eeeeee', bgColor: '#ffffff' }), 'accessibility');
    expect(fail.score).toBeLessThan(40);
    expect(fail.note).toMatch(/Fails WCAG AA/);
  });

  it('is honest that contrast is unknown over media', () => {
    const r = by(channelReadiness({ ...base, bgColor: null }), 'accessibility');
    expect(r.basis).toMatch(/no solid background/);
    expect(r.note).toMatch(/varies/i);
  });

  it('never claims to predict sales or reach', () => {
    const keys = channelReadiness(base).map((r) => r.key);
    expect(keys).not.toContain('sales');
    expect(keys).not.toContain('reach');
  });
});

describe('channel notes agree with the score band', () => {
  // A note that says "legible" while the bar is amber is a trust bug: the words
  // and the number must tell the same story.
  it('never gives an unqualified pass below the green band', () => {
    const sizes: [number, number][] = [
      [1080, 1080], [1080, 1920], [1200, 630], [1600, 900], [480, 480], [2400, 800],
    ];
    for (const [width, height] of sizes) {
      for (const row of channelReadiness({
        width, height,
        headline: 'Weekend Specials Are Live',
        subline: 'Save big — this weekend only',
        badge: 'BOOK NOW',
        accent: '#dc2626',
        bgColor: '#ffffff',
      })) {
        if (row.score < 75) {
          expect(row.note, `${row.key} @ ${width}x${height} (${row.score})`)
            .not.toMatch(/^(Legible at a distance|Reads well in-feed|Print-ready|Sits well|Fills a phone)/);
        }
      }
    }
  });
});
