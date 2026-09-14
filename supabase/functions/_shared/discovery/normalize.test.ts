import { describe, it, expect } from 'vitest';
import {
  normalizePhone, normalizeDomain, normalizeUrl, normalizeEmail,
  normalizeName, normalizePlace, normalizeAddress, candidateKeys,
} from './normalize';

describe('normalizePhone', () => {
  it('turns the Nigerian address book into E.164', () => {
    expect(normalizePhone('08012345678')).toBe('+2348012345678');
    expect(normalizePhone('+234 801 234 5678')).toBe('+2348012345678');
    expect(normalizePhone('2348012345678')).toBe('+2348012345678');
    expect(normalizePhone('002348012345678')).toBe('+2348012345678');
    expect(normalizePhone('23408012345678')).toBe('+2348012345678');
    expect(normalizePhone('8012345678')).toBe('+2348012345678');
  });

  it('returns null rather than guessing at a number it cannot dial', () => {
    for (const raw of [null, '', '123', '12345', '0801', '999-words', '011####']) {
      expect(normalizePhone(raw)).toBeNull();
    }
  });
});

describe('normalizeDomain / normalizeUrl / normalizeEmail', () => {
  it('reduces a website to its registrable domain', () => {
    expect(normalizeDomain('https://www.Yemzo.Ng/path')).toBe('yemzo.ng');
    expect(normalizeDomain('yemzo.ng:8080')).toBe('yemzo.ng');
    expect(normalizeDomain('not a host')).toBeNull();
    expect(normalizeDomain('localhost')).toBeNull();
  });

  it('keeps the path in a URL but drops query noise and trailing slashes', () => {
    expect(normalizeUrl('https://yemzo.ng/contact/?utm=x')).toBe('https://yemzo.ng/contact');
    expect(normalizeUrl('yemzo.ng')).toBe('https://yemzo.ng');
  });

  it('normalizes email addresses and rejects junk', () => {
    expect(normalizeEmail('HELLO@Yemzo.NG')).toBe('hello@yemzo.ng');
    expect(normalizeEmail('not-an-email')).toBeNull();
  });
});

describe('normalizeName / normalizePlace / normalizeAddress', () => {
  it('drops company-form suffixes and noise words for comparison', () => {
    expect(normalizeName('Yemzo Foods Nigeria Ltd')).toBe('yemzo foods');
    expect(normalizeName('The Yemzo Group Inc.')).toBe('yemzo'); // group is a legal suffix, like Ltd
    expect(normalizeName('Rest Foods')).toBe('restaurant foods'); // abbrev → word
  });

  it('rejoins initialisms so X.Y.Z. matches XYZ', () => {
    expect(normalizeName('X Y Z Foods')).toBe('xyz foods');
  });

  it('reduces places and addresses the same way as the radar engine', () => {
    expect(normalizePlace('Lagos State')).toBe('lagos');
    expect(normalizeAddress('24 Admiralty Road, Lekki')).toBe('24 admiralty road lekki');
    expect(normalizeAddress('Plot 5, No 2 Crescent')).toBe('5 2 crescent');
  });
});

describe('candidateKeys (the columns radar stores)', () => {
  it('derives every duplicate-detection key from one source record', () => {
    const keys = candidateKeys({
      name: 'Yemzo Foods Nigeria Ltd',
      city: 'Lagos State',
      phone: '08012345678',
      website: 'https://www.yemzo.ng/home',
    });
    expect(keys.name_key).toBe('yemzo foods');
    expect(keys.city_key).toBe('lagos');
    expect(keys.phone_e164).toBe('+2348012345678');
    expect(keys.domain).toBe('yemzo.ng');
  });

  it('an un-dialable phone becomes a null key, never a half-normalised one', () => {
    const keys = candidateKeys({ name: 'X', city: null, phone: '123', website: null });
    expect(keys.phone_e164).toBeNull();
    expect(keys.domain).toBeNull();
  });
});