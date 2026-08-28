import { describe, it, expect } from 'vitest';

import { shouldRenderProfile, isCrawler, firstSegment } from '../../middleware';

const GOOGLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const WHATSAPP = 'WhatsApp/2.23.20.0 A';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('isCrawler', () => {
  it('recognises the search engines', () => {
    expect(isCrawler(GOOGLE)).toBe(true);
    expect(isCrawler('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe(true);
  });

  it('recognises the preview crawlers behind a shared link', () => {
    // These are the ones that decide whether a pasted link unfurls at all.
    for (const ua of [WHATSAPP, 'facebookexternalhit/1.1', 'Twitterbot/1.0', 'LinkedInBot/1.0', 'TelegramBot (like TwitterBot)', 'Slackbot-LinkExpanding 1.0']) {
      expect(isCrawler(ua), ua).toBe(true);
    }
  });

  it('does not mistake a person for a crawler', () => {
    // A false positive here serves a real customer the plain page instead of
    // the app, which is much worse than a false negative.
    expect(isCrawler(CHROME)).toBe(false);
    expect(isCrawler(IPHONE)).toBe(false);
    expect(isCrawler('Mozilla/5.0 (Linux; Android 13; Infinix X6819) Chrome/120.0 Mobile Safari/537.36')).toBe(false);
  });

  it('treats a missing user agent as a person', () => {
    expect(isCrawler(null)).toBe(false);
    expect(isCrawler('')).toBe(false);
  });
});

describe('shouldRenderProfile', () => {
  it('routes a crawler asking for a username to that profile', () => {
    expect(shouldRenderProfile('/mama-put', GOOGLE)).toBe('mama-put');
    expect(shouldRenderProfile('/mama-put/', WHATSAPP)).toBe('mama-put');
  });

  it('routes the id form too', () => {
    expect(shouldRenderProfile('/businesses/11111111-2222-3333-4444-555555555555', GOOGLE))
      .toBe('11111111-2222-3333-4444-555555555555');
  });

  it('leaves people alone entirely', () => {
    expect(shouldRenderProfile('/mama-put', CHROME)).toBeNull();
    expect(shouldRenderProfile('/businesses/abc', IPHONE)).toBeNull();
  });

  it('never swallows an app route that is not a username', () => {
    // Without this, a crawler asking for /businesses would be sent to look up a
    // business named "businesses", 404, and the directory's own index page
    // would drop out of the search results.
    for (const path of ['/businesses', '/discover', '/platform', '/studio', '/login', '/pricing', '/terms', '/privacy', '/live', '/r']) {
      expect(shouldRenderProfile(path, GOOGLE), path).toBeNull();
    }
  });

  it('is not case-sensitive about reserved routes', () => {
    expect(shouldRenderProfile('/Businesses', GOOGLE)).toBeNull();
    expect(shouldRenderProfile('/STUDIO', GOOGLE)).toBeNull();
  });

  it('ignores the root', () => {
    expect(shouldRenderProfile('/', GOOGLE)).toBeNull();
    expect(shouldRenderProfile('', GOOGLE)).toBeNull();
  });

  it('ignores deeper paths that cannot be a profile', () => {
    expect(shouldRenderProfile('/mama-put/menu', GOOGLE)).toBeNull();
    expect(shouldRenderProfile('/a/b/c', GOOGLE)).toBeNull();
  });

  it('refuses a slug that could not be a username', () => {
    expect(shouldRenderProfile('/../etc/passwd', GOOGLE)).toBeNull();
    expect(shouldRenderProfile(`/${'x'.repeat(80)}`, GOOGLE)).toBeNull();
    expect(shouldRenderProfile('/has space', GOOGLE)).toBeNull();
  });
});

describe('firstSegment', () => {
  it('reads the leading path segment', () => {
    expect(firstSegment('/mama-put')).toBe('mama-put');
    expect(firstSegment('/businesses/abc')).toBe('businesses');
    expect(firstSegment('/')).toBe('');
  });
});
