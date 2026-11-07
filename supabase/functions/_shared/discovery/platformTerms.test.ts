import { describe, it, expect } from 'vitest';
import {
  TERMS_REFUSED_HOSTS, termsRefusedBy, termsRefusalMessage, TERMS_REFUSAL_GUIDANCE,
} from './platformTerms';

describe('termsRefusedBy', () => {
  it('refuses the platforms that prohibit automated access', () => {
    for (const host of ['instagram.com', 'facebook.com', 'tiktok.com', 'x.com', 'linkedin.com']) {
      expect(termsRefusedBy(host), host).toBe(host);
    }
  });

  it('refuses a subdomain, because that is the same platform', () => {
    // The obvious way round a naive list.
    expect(termsRefusedBy('m.facebook.com')).toBe('facebook.com');
    expect(termsRefusedBy('business.instagram.com')).toBe('instagram.com');
    expect(termsRefusedBy('www.linkedin.com')).toBe('linkedin.com');
  });

  it('refuses the short-link domains too', () => {
    // wa.me and fb.me are the same refusal reached by a different spelling.
    expect(termsRefusedBy('wa.me')).toBe('wa.me');
    expect(termsRefusedBy('fb.me')).toBe('fb.me');
    expect(termsRefusedBy('lnkd.in')).toBe('lnkd.in');
  });

  it('is case-insensitive and tolerates surrounding space', () => {
    expect(termsRefusedBy('  INSTAGRAM.com ')).toBe('instagram.com');
  });

  it('allows an ordinary business website', () => {
    for (const host of ['duchess.example', 'lagosflavours.ng', 'www.example.co.za']) {
      expect(termsRefusedBy(host), host).toBeNull();
    }
  });

  it('does NOT claim to catch a lookalike domain', () => {
    /*
     * `facebook.com.evil.example` is a DIFFERENT registrable domain that merely
     * contains the string. This function deliberately does not match it, and
     * the test records that as intended rather than as an oversight: catching
     * it belongs to the SSRF guard and the robots check. A list that quietly
     * half-solved it would hide the gap.
     */
    expect(termsRefusedBy('facebook.com.evil.example')).toBeNull();
    expect(termsRefusedBy('notinstagram.com')).toBeNull();
  });

  it('says nothing about an empty host', () => {
    expect(termsRefusedBy('')).toBeNull();
    expect(termsRefusedBy(null)).toBeNull();
    expect(termsRefusedBy(undefined)).toBeNull();
  });
});

describe('the refusal an operator sees', () => {
  it('names the platform and the reason', () => {
    const msg = termsRefusalMessage('instagram.com');
    expect(msg).toContain('instagram.com');
    expect(msg).toMatch(/prohibits automated access/i);
  });

  it('offers the path that does have permission', () => {
    // A refusal with no alternative just reads as a broken feature.
    expect(TERMS_REFUSAL_GUIDANCE).toMatch(/claim their profile|by hand/i);
  });
});

describe('the list itself', () => {
  it('carries no protocol, path or www prefix', () => {
    for (const d of TERMS_REFUSED_HOSTS) {
      expect(d, d).not.toMatch(/^https?:|\/|^www\./);
      expect(d).toBe(d.toLowerCase());
    }
  });

  it('has no duplicates', () => {
    expect(new Set(TERMS_REFUSED_HOSTS).size).toBe(TERMS_REFUSED_HOSTS.length);
  });

  it('covers every major platform a business might be listed on', () => {
    for (const d of ['instagram.com', 'facebook.com', 'tiktok.com', 'linkedin.com', 'x.com']) {
      expect(TERMS_REFUSED_HOSTS).toContain(d);
    }
  });
});
