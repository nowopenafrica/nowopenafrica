import { describe, it, expect } from 'vitest';

import {
  claimMessage, claimReference, extractReference, referenceMatches, waChatLink, waDigits,
} from './waLink';

const ID = '7b73a46e-ad47-484d-8a99-60f438a81a09'; // the real NowOpen Africa listing

describe('click-to-chat links', () => {
  it('builds a wa.me link with the message pre-typed', () => {
    const url = waChatLink({ phone: '+234 704 676 4907', text: 'Hi there' });
    expect(url).toBe('https://wa.me/2347046764907?text=Hi%20there');
  });

  /*
   * Same fail-closed rule as the edge sender. A Kenyan 0709... turned into
   * +234709... would open a chat with a stranger.
   */
  it('refuses a local number rather than guessing a country', () => {
    expect(waDigits('07081547726')).toBeNull();
    expect(waChatLink({ phone: '0708 154 7726', text: 'hi' })).toBeNull();
  });

  it('returns null rather than a half-built URL', () => {
    expect(waChatLink({ phone: null })).toBeNull();
    expect(waChatLink({ phone: '123' })).toBeNull();
  });

  it('drops the query when there is nothing to pre-type', () => {
    expect(waChatLink({ phone: '2347046764907' })).toBe('https://wa.me/2347046764907');
  });
});

describe('the reference that travels in the message', () => {
  it('is stable and derived from the listing id', () => {
    expect(claimReference(ID)).toBe('NOA-7B73A46E');
    expect(claimReference(ID)).toBe(claimReference(ID));
  });

  it('is empty rather than wrong when the id is unusable', () => {
    expect(claimReference('')).toBe('');
    expect(claimReference('xyz')).toBe('');
  });

  it('survives whatever the sender types around it', () => {
    expect(extractReference('hello (NOA-7B73A46E) please')).toBe('NOA-7B73A46E');
    expect(extractReference('lowercase noa-7b73a46e')).toBe('NOA-7B73A46E');
    expect(extractReference('no reference here')).toBeNull();
    expect(extractReference(null)).toBeNull();
  });

  it('matches an inbound message back to its listing', () => {
    expect(referenceMatches(claimMessage({ businessName: 'NowOpen Africa', businessId: ID }), ID)).toBe(true);
    expect(referenceMatches('NOA-00000000', ID)).toBe(false);
  });

  it('writes the message as the owner, not as the platform', () => {
    const msg = claimMessage({ businessName: 'Ada\'s Kitchen', businessId: ID });
    expect(msg).toContain("Ada's Kitchen");
    expect(msg).toMatch(/^Hi NowOpen Africa — I want to claim/);
  });

  it('still produces a usable sentence without a reference', () => {
    expect(claimMessage({ businessName: 'Ada', businessId: '' })).not.toContain('()');
  });
});
