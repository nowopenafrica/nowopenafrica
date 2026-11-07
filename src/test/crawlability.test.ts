import { describe, it, expect } from 'vitest';

import {
  isCrawler, isAiCrawler, isSearchCrawler,
  shouldRenderProfile, shouldRenderDiscovery, shouldRenderMarketing,
} from '../../middleware';

/**
 * Who can actually read NowOpen.
 *
 * The site is a client-rendered SPA, so anything that does not run JavaScript
 * sees one sentence — "NowOpen Africa needs JavaScript enabled to run" — unless
 * the middleware recognises it and rewrites the request to a renderer. That
 * makes this list the single point at which a whole class of reader is either
 * served the directory or served nothing at all.
 *
 * It failed silently for an entire class once already. Measured on production
 * on 2026-09-14, asking for /businesses/in/lagos:
 *
 *   Googlebot     → 38,715 bytes, <h1>Businesses in Lagos</h1>
 *   GPTBot        →  7,495 bytes, no <h1>, home page title
 *   OAI-SearchBot →  7,495 bytes, no <h1>, home page title
 *   ClaudeBot     →  7,495 bytes, no <h1>, home page title
 *   PerplexityBot →  7,495 bytes, no <h1>, home page title
 *
 * Nothing reported it. The pages rendered, the sitemap listed them, Search
 * Console was happy, and four of the crawlers that increasingly decide what a
 * person is told about a business were reading an empty shell.
 *
 * These tests are the alarm that was missing.
 */

/** Real user agent strings, as each crawler actually sends them. */
const AI_AGENTS: Record<string, string> = {
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
  'OAI-SearchBot': 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  'ChatGPT-User': 'Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)',
  ClaudeBot: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  PerplexityBot: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  'Perplexity-User': 'Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
  Amazonbot: 'Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)',
  Bytespider: 'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
  'meta-externalagent': 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  CCBot: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
  DuckAssistBot: 'Mozilla/5.0 (compatible; DuckAssistBot/1.0; +https://duckduckgo.com/duckassistbot.html)',
  'MistralAI-User': 'MistralAI-User/1.0',
  YouBot: 'Mozilla/5.0 (compatible; YouBot (+http://www.you.com))',
  'cohere-ai': 'cohere-ai/1.0',
};

const HUMAN =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

describe('AI crawlers can read the directory', () => {
  it.each(Object.entries(AI_AGENTS))('recognises %s', (_name, ua) => {
    expect(isAiCrawler(ua)).toBe(true);
    expect(isCrawler(ua)).toBe(true);
  });

  it('serves them a business profile, exactly as it serves Googlebot', () => {
    // The specific URL measured as broken above.
    for (const ua of Object.values(AI_AGENTS)) {
      expect(shouldRenderProfile('/yemzoarts', ua)).toBe('yemzoarts');
    }
  });

  it('serves them city and category pages', () => {
    for (const ua of Object.values(AI_AGENTS)) {
      expect(shouldRenderDiscovery('/businesses/in/lagos', ua)).toEqual({ place: 'lagos', category: '' });
      expect(shouldRenderDiscovery('/businesses/restaurant/in/lagos', ua))
        .toEqual({ place: 'lagos', category: 'restaurant' });
    }
  });

  it('serves them the marketing pages', () => {
    for (const ua of Object.values(AI_AGENTS)) {
      expect(shouldRenderMarketing('/about', ua)).toBe('/about');
    }
  });

  it('gives them byte-for-byte the same decision as a search engine', () => {
    /*
     * The anti-cloaking invariant, stated as a test rather than a comment.
     *
     * Every renderer decision must depend only on the PATH once a request is
     * known to be a crawler. If an AI crawler ever took a different branch from
     * Googlebot, the two would be served different content for the same URL —
     * which is cloaking, and would also be the fastest way to put a fact about
     * a real business into an assistant's answer that nobody can see or correct.
     */
    const google = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    const paths = [
      '/yemzoarts', '/businesses/some-uuid', '/business/mama-put',
      '/businesses/in/lagos', '/businesses/restaurant/in/lagos',
      '/about', '/discover', '/', '/businesses', '/admin', '/dashboard',
    ];
    for (const path of paths) {
      for (const ua of Object.values(AI_AGENTS)) {
        expect(shouldRenderProfile(path, ua), path).toEqual(shouldRenderProfile(path, google));
        expect(shouldRenderDiscovery(path, ua), path).toEqual(shouldRenderDiscovery(path, google));
        expect(shouldRenderMarketing(path, ua), path).toEqual(shouldRenderMarketing(path, google));
      }
    }
  });
});

describe('the three families stay distinct', () => {
  it('does not file an AI crawler as a search engine, or the reverse', () => {
    // They are governed differently: restricting AI training use later must be
    // one edit to one list, not a hunt through a sixty-term regex.
    expect(isSearchCrawler(AI_AGENTS.GPTBot)).toBe(false);
    expect(isAiCrawler('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(false);
  });

  it('still recognises search engines and link previews', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; YandexBot/3.0)',
      'Mozilla/5.0 (compatible; DuckDuckBot/1.1; +http://duckduckgo.com/duckduckbot.html)',
      'Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)',
      // WhatsApp is where a shared business link actually travels in this market.
      'WhatsApp/2.23.20.0 A',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Twitterbot/1.0',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0)',
      'TelegramBot (like TwitterBot)',
    ]) {
      expect(isCrawler(ua), ua).toBe(true);
    }
  });

  it('leaves a person alone', () => {
    expect(isCrawler(HUMAN)).toBe(false);
    expect(isAiCrawler(HUMAN)).toBe(false);
    expect(isSearchCrawler(HUMAN)).toBe(false);
    expect(shouldRenderProfile('/yemzoarts', HUMAN)).toBeNull();
    expect(shouldRenderDiscovery('/businesses/in/lagos', HUMAN)).toBeNull();
    expect(shouldRenderMarketing('/about', HUMAN)).toBeNull();
  });

  it('says nothing about a missing user agent', () => {
    expect(isCrawler(null)).toBe(false);
    expect(isAiCrawler(null)).toBe(false);
    expect(isSearchCrawler(null)).toBe(false);
  });

  it('matches case-insensitively, because the casing varies by crawler', () => {
    // Anthropic sends "ClaudeBot", OpenAI sends "GPTBot", and neither is stable
    // enough to depend on.
    expect(isAiCrawler('claudebot/1.0')).toBe(true);
    expect(isAiCrawler('GPTBOT/1.1')).toBe(true);
  });
});

describe('every submitted route renders for a crawler', () => {
  it('has a marketing page for /open-now', () => {
    /*
     * /open-now was listed in the sitemap and had no entry in the marketing
     * renderer, so it was the one submitted route still answering Googlebot
     * with the JavaScript shell — measured at 7,495 bytes with no <h1>.
     *
     * Submitting a URL and then serving it an empty page is the worst of both:
     * crawl budget spent, nothing gained, and a signal that the site does not
     * know what its own pages contain.
     */
    const google = 'Mozilla/5.0 (compatible; Googlebot/2.1)';
    expect(shouldRenderMarketing('/open-now', google)).toBe('/open-now');
  });
});
