import { describe, it, expect } from 'vitest';

import {
  CAMPAIGN_PATH, SOURCES, STEPS, answerError, isComplete, readSource,
  shareText, shortReferrer, whatsappShareUrl,
} from './acquisition';

const SITE = 'https://nowopenafrica.com';

describe('where a request came from', () => {
  it('takes the source we printed on the flyer', () => {
    expect(readSource('?src=qr')).toBe('qr');
    expect(readSource('?src=WhatsApp')).toBe('whatsapp');
    expect(readSource('?ref=x&src=tiktok&y=1')).toBe('tiktok');
  });

  it('refuses anything not on the list', () => {
    // The one question this link exists to answer is which surface works. Left
    // open, one campaign becomes "whatsapp", "WhatsApp" and "whatsap" in the
    // same report and the question stops having an answer.
    expect(readSource('?src=whatsap')).toBe('direct');
    expect(readSource('?src=<script>')).toBe('direct');
    expect(readSource(`?src=${'x'.repeat(500)}`)).toBe('direct');
  });

  it('falls back to the referrer, and to direct when there is none', () => {
    expect(readSource('', 'https://www.instagram.com/p/abc')).toBe('instagram');
    expect(readSource('', 'https://l.facebook.com/')).toBe('facebook');
    expect(readSource('', 'https://api.whatsapp.com/send')).toBe('whatsapp');
    expect(readSource('', 'https://example.com/blog')).toBe('direct');
    expect(readSource('', 'not a url')).toBe('direct');
    expect(readSource('', '')).toBe('direct');
  });

  it('lets the declared source beat the referrer', () => {
    // A creator posting our link from Instagram may still be the reason it
    // worked. What we printed wins over where the click came from.
    expect(readSource('?src=creator', 'https://www.instagram.com/')).toBe('creator');
  });

  it('always returns something storable', () => {
    for (const s of [readSource(''), readSource('?src=founder'), readSource('?src=junk')]) {
      expect(SOURCES).toContain(s);
      expect(s.length).toBeLessThanOrEqual(40);
    }
  });
});

describe('the referrer we keep', () => {
  it('keeps the host and path, and drops the query', () => {
    // A full referrer is a tracking payload. The host is the useful part.
    expect(shortReferrer('https://www.instagram.com/p/abc?igsh=SECRET')).toBe('www.instagram.com/p/abc');
  });

  it('is null when there is nothing, and never unbounded', () => {
    expect(shortReferrer('')).toBeNull();
    expect(shortReferrer('   ')).toBeNull();
    expect((shortReferrer(`https://x.com/${'a'.repeat(500)}`) ?? '').length).toBeLessThanOrEqual(200);
  });
});

describe('the conversation', () => {
  it('asks three questions and no more', () => {
    // Every extra question is something we could find or ask later, and each
    // one costs more submissions than it is worth.
    expect(STEPS).toHaveLength(3);
    expect(STEPS.map((s) => s.key)).toEqual(['name', 'location', 'contact']);
  });

  it('asks the easy thing first and the costly thing last', () => {
    expect(STEPS[0].key).toBe('name');
    expect(STEPS[STEPS.length - 1].key).toBe('contact');
  });

  it('gives every question a real question and a label', () => {
    for (const s of STEPS) {
      expect(s.asks, s.key).toMatch(/\?$/);
      expect(s.label, s.key).toBeTruthy();
      expect(s.placeholder, s.key).toBeTruthy();
    }
  });
});

describe('what counts as an answer', () => {
  it('refuses only what would produce a row nobody can act on', () => {
    expect(answerError('name', '')).toBeTruthy();
    expect(answerError('location', '   ')).toBeTruthy();
    expect(answerError('contact', '')).toBeTruthy();
  });

  it('accepts every real way somebody gives a contact', () => {
    for (const contact of ['08031234567', '+234 803 123 4567', 'me@shop.ng', '@meatclubng']) {
      expect(answerError('contact', contact), contact).toBeNull();
    }
  });

  it('refuses a contact nobody could reach', () => {
    expect(answerError('contact', 'call me')).toBeTruthy();
  });

  it('does not police a business name or a place', () => {
    // This is reached from a WhatsApp status. Every rejection is somebody
    // deciding not to bother.
    expect(answerError('name', "Bella's Laundry & Dry-Cleaning (Yaba)")).toBeNull();
    expect(answerError('location', 'behind the market, Yaba')).toBeNull();
  });

  it('caps the length', () => {
    expect(answerError('name', 'x'.repeat(161))).toBeTruthy();
  });

  it('knows when the conversation is finished', () => {
    expect(isComplete({})).toBe(false);
    expect(isComplete({ name: 'MeatClub Nigeria', location: 'Lekki, Lagos' })).toBe(false);
    expect(isComplete({ name: 'MeatClub Nigeria', location: 'Lekki, Lagos', contact: '08031234567' })).toBe(true);
  });
});

describe('the message that gets forwarded', () => {
  it('carries the campaign link, attributed', () => {
    const text = shareText(SITE);
    expect(text).toContain(`${SITE}${CAMPAIGN_PATH}`);
    expect(text).toContain('src=whatsapp');
  });

  it('says what happens rather than what NowOpen is', () => {
    expect(shareText(SITE)).toMatch(/business name/i);
  });

  it('stays short enough to be forwarded', () => {
    expect(shareText(SITE).length).toBeLessThan(300);
  });

  it('encodes the whole message into the WhatsApp link', () => {
    const url = whatsappShareUrl(SITE);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe(shareText(SITE));
  });

  it('promises nothing about how fast', () => {
    // We have not committed to a turnaround, so the campaign must not imply one.
    expect(shareText(SITE)).not.toMatch(/today|24 hours|instantly|minutes|same day/i);
  });
});
