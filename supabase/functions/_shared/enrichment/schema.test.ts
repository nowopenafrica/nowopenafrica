import { describe, it, expect } from 'vitest';
import { validateObservations, OBSERVATION_FIELDS } from './schema';
import { normalizeSocialLinks } from './text';

describe('validateObservations', () => {
  it('keeps only allowlisted, quote-backed fields', () => {
    const out = validateObservations([
      { field: 'description', value: 'Home of the famous jollof', supported_by: 'Home of the famous jollof.' },
      { field: 'services', value: 'catering', supported_by: 'We cater events.' },
    ], 'https://example.com');
    expect(out.map((o) => o.field)).toEqual(['description', 'services']);
    expect(out.every((o) => o.method === 'ai_extracted' && o.confidence === 30 && !o.probablyMadeUp)).toBe(true);
  });

  it('flags values a model emitted without support as made-up, not true', () => {
    const out = validateObservations([{ field: 'about', value: 'Founded in 1950', supported_by: '' }], 'https://x.com');
    expect(out).toHaveLength(1);
    expect(out[0].method).toBe('ai_inferred');
    expect(out[0].confidence).toBe(0);
    expect(out[0].probablyMadeUp).toBe(true);
  });

  it('drops fields not on the allowlist and empty values', () => {
    const out = validateObservations([
      { field: 'profit', value: 'secret' },
      { field: 'tagline', value: '' },
      { field: 'nonsense', value: 'x', supported_by: 'y' },
    ], 'https://x.com');
    expect(out).toHaveLength(0);
  });

  it('handles a bare array or wrapped object', () => {
    expect(validateObservations({ fields: [{ field: 'tagline', value: 'T', supported_by: 'T' }] }, 'u')).toHaveLength(1);
    expect(validateObservations(null, 'u')).toHaveLength(0);
  });

  it('exposes the allowlist so the prompt and validator always agree', () => {
    expect(OBSERVATION_FIELDS).toContain('description');
    expect(OBSERVATION_FIELDS).toContain('faqs');
  });
});

describe('normalizeSocialLinks', () => {
  it('canonicalises twitter → x and drops unknown platforms', () => {
    const out = normalizeSocialLinks([
      { platform: 'instagram', url: 'https://instagram.com/abc' },
      { platform: 'twitter', url: 'https://x.com/abc' },
      { platform: 'linkedin', url: 'https://linkedin.com/company/abc' },
      { platform: 'tiktok', url: '' },
      { platform: 'myspace', url: 'https://myspace.com/abc' },
    ]);
    expect(out).toEqual({
      instagram: 'https://instagram.com/abc',
      x: 'https://x.com/abc',
      linkedin: 'https://linkedin.com/company/abc',
    });
  });

  it('reads a flat object form too', () => {
    expect(normalizeSocialLinks({ facebook: 'f', youtube: 'y', weird: 'w' })).toEqual({ facebook: 'f', youtube: 'y' });
  });
});