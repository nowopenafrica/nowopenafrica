import { describe, it, expect } from 'vitest';
import { normName, normDomain, normPhoneE164, matchIdentity, sameValue } from './identity';

describe('normName', () => {
  it('strips suffixes and treats them as equal', () => {
    expect(normName('Abdul & Sons Limited')).toBe(normName('Abdul & Sons'));
    expect(normName('Lagos Kitchen Ltd')).toBe('lagos kitchen');
  });

  it('collapses spacing and case', () => {
    expect(normName('  A  B  ')).toBe('a b');
  });
});

describe('normDomain', () => {
  it('extracts a bare hostname', () => {
    expect(normDomain('https://www.example.com/path')).toBe('example.com');
    expect(normDomain('EXAMPLE.COM')).toBe('example.com');
  });
  it('returns null for junk', () => {
    expect(normDomain('')).toBeNull();
    expect(normDomain('not a url')).toBeNull();
  });
});

describe('normPhoneE164', () => {
  it('normalises a local Nigerian number', () => {
    expect(normPhoneE164('08031234567')).toBe('+2348031234567');
  });
  it('normalises an already-international number', () => {
    expect(normPhoneE164('+234 803 123 4567')).toBe('+2348031234567');
    expect(normPhoneE164('2348031234567')).toBe('+2348031234567');
  });
  it('returns null for nothing phone-like', () => {
    expect(normPhoneE164('')).toBeNull();
    expect(normPhoneE164(null)).toBeNull();
  });
});

describe('matchIdentity', () => {
  const base = () => ({
    a: { nameKey: 'Green Gardens Restaurant', domain: 'greengardens.ng', phoneE164: '+2348021112222' },
    b: { nameKey: 'Green Gardens Restaurant', domain: 'greengardens.ng', phoneE164: '+2348021112222' },
  });

  it('matches the same entity across every channel', () => {
    const { a, b } = base();
    const m = matchIdentity(a, b);
    expect(m.matched).toBe(true);
    expect(m.score).toBeGreaterThanOrEqual(80);
  });

  it('refuses a different name even with a matching phone', () => {
    const { a, b } = base();
    const m = matchIdentity(a, { ...b, nameKey: 'Green Terrace Hotel' });
    expect(m.matched).toBe(false);
  });

  it('matches a name-plus-domain pair (franchise semantics)', () => {
    const { a, b } = base();
    const m = matchIdentity(a, { ...b, phoneE164: null });
    expect(m.matched).toBe(true);
  });
});

describe('sameValue', () => {
  it('ignores casing and spacing for text compare', () => {
    expect(sameValue(' One  Two ', 'one two')).toBe(true);
    expect(sameValue('a', 'b')).toBe(false);
  });
});