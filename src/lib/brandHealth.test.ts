import { describe, it, expect } from 'vitest';
import { computeBrandHealth } from './brandHealth';
import { DEFAULT_BRAND_IDENTITY, voicePreview } from './brandIdentity';

function business(over: Partial<Parameters<typeof computeBrandHealth>[0]> = {}) {
  return {
    id: 'b1', name: 'Meat Club', description: '', category: 'Restaurant', location: '',
    ...over,
  } as Parameters<typeof computeBrandHealth>[0];
}

describe('brand health', () => {
  it('scores a bare profile low', () => {
    const h = computeBrandHealth(business(), { ...DEFAULT_BRAND_IDENTITY });
    expect(h.score).toBeLessThan(50);
    expect(h.suggestions.length).toBeGreaterThan(5);
  });

  it('scores a complete profile high', () => {
    const b = business({
      logo_url: 'https://x/logo.png', image_url: 'https://x/cover.png',
      description: 'A long, complete description that easily clears eighty characters.',
      phone: '0800', website: 'meatclub.ng', location: 'Lagos',
      hours: '9-5', rating: 4.8,
    });
    const id = {
      ...DEFAULT_BRAND_IDENTITY,
      tagline: 'Fresh', mission: 'Serve', story: 'Started', brandPromise: 'Always fresh',
      established: '2020', voice: ['friendly'], writingStyle: 'luxury',
    };
    const h = computeBrandHealth(b, id);
    expect(h.score).toBeGreaterThanOrEqual(80);
    expect(h.suggestions.filter((s) => s.points > 0).length).toBeLessThanOrEqual(4);
  });

  it('recommendations match the points still on the table', () => {
    const h = computeBrandHealth(business(), { ...DEFAULT_BRAND_IDENTITY });
    const maxEarnable = h.suggestions.reduce((sum, s) => sum + s.points, 0);
    expect(maxEarnable).toBe(100 - h.score);
  });

  it('derives tier from verification signals', () => {
    const b = business({ email_verified: true, phone_verified: true, id_verified: true, registration_verified: true });
    const h = computeHealthWith(b);
    const verified = h.items.find((i) => i.label === 'Verification');
    expect(verified?.earned).toBe(10);
  });
});

function computeHealthWith(b: Parameters<typeof computeBrandHealth>[0]) {
  return computeBrandHealth(b, { ...DEFAULT_BRAND_IDENTITY });
}

describe('brand identity', () => {
  it('generates a voice preview for every tone', () => {
    const samples = voicePreview({ name: 'Meat Club', category: 'Restaurant' }, { ...DEFAULT_BRAND_IDENTITY });
    expect(samples.map((s) => s.tone)).toEqual(['Normal', 'Professional', 'Luxury', 'Street', 'Funny']);
    for (const s of samples) expect(s.text.length).toBeGreaterThan(5);
  });

  it('uses the tagline when set', () => {
    const samples = voicePreview({ name: 'Meat Club', category: 'Restaurant' }, { ...DEFAULT_BRAND_IDENTITY, tagline: 'Always fresh' });
    expect(samples[0].text).toBe('Always fresh');
  });
});
