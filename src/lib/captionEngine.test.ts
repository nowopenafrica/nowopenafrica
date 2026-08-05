import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { generateCaptions, CAPTION_ANGLES, toneOptions } from './captionEngine';

const business: Business = {
  id: 'biz-1',
  name: 'Sunrise Grill',
  description: 'A fast food restaurant serving grilled specials in Lagos.',
  category: 'restaurant',
  location: 'Lagos, Nigeria',
  rating: 4.5,
};

const now = new Date('2026-08-04T10:30:00');

describe('captionEngine', () => {
  it('generates one option per angle by default', () => {
    const options = generateCaptions(business, { now });
    expect(options).toHaveLength(CAPTION_ANGLES.length);
  });

  it('maps the business category to its industry', () => {
    const options = generateCaptions(business, { now });
    expect(options[0].text.length).toBeGreaterThan(0);
    expect(options[0].hashtags).toContain('#NowOpenAfrica');
  });

  it('honours a custom count and tone', () => {
    const options = generateCaptions(business, { count: 2, tone: 'urgent', now });
    expect(options).toHaveLength(2);
    expect(options[0].text.startsWith('Right now,')).toBe(true);
  });

  it('is deterministic per business + day', () => {
    const a = generateCaptions(business, { now });
    const b = generateCaptions(business, { now });
    expect(a.map((o) => o.text)).toEqual(b.map((o) => o.text));
  });

  it('varies the copy across angles', () => {
    const options = generateCaptions(business, { now });
    const texts = new Set(options.map((o) => o.text));
    expect(texts.size).toBe(options.length);
  });

  it('exposes tone choices including neutral', () => {
    const tones = toneOptions();
    expect(tones[0].key).toBe('');
    expect(tones.length).toBeGreaterThan(5);
  });
});
