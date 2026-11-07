/**
 * The robots.txt subset the official-website adapter honours.
 */

import { describe, expect, it } from 'vitest';
import { robotsAllowUrl } from './robots.ts';

const UA = 'NowOpenDiscovery/1.0';

describe('robotsAllowUrl', () => {
  it('permits everything when there is no robots file', () => {
    const v = robotsAllowUrl(null, 'https://biz.ng/contact', UA);
    expect(v.allow).toBe(true);
    expect(v.group).toBe('none');
  });

  it('honours a blanket disallow', () => {
    const txt = 'User-agent: *\nDisallow: /';
    expect(robotsAllowUrl(txt, 'https://biz.ng/', UA).allow).toBe(false);
    expect(robotsAllowUrl(txt, 'https://biz.ng/contact', UA).allow).toBe(false);
  });

  it('an empty Disallow removes the restriction', () => {
    const txt = 'User-agent: *\nDisallow: ';
    expect(robotsAllowUrl(txt, 'https://biz.ng/contact', UA).allow).toBe(true);
  });

  it('prefers the specific user-agent group over the star group', () => {
    const txt = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: NowOpenDiscovery/1.0',
      'Disallow: /admin',
    ].join('\n');
    expect(robotsAllowUrl(txt, 'https://biz.ng/', UA).allow).toBe(true);
    expect(robotsAllowUrl(txt, 'https://biz.ng/admin', UA).allow).toBe(false);
  });

  it('matching the agent token is case-insensitive', () => {
    const txt = 'User-Agent: NOWOPENDISCOVERY/1.0\nDisallow: /offers';
    expect(robotsAllowUrl(txt, 'https://biz.ng/offers', UA).allow).toBe(false);
    expect(robotsAllowUrl(txt, 'https://biz.ng/home', UA).allow).toBe(true);
  });

  it('longest matching rule wins (RFC 9309 precedence)', () => {
    const txt = 'User-agent: *\nDisallow: /admin\nAllow: /admin/pricing';
    expect(robotsAllowUrl(txt, 'https://biz.ng/admin/pricing', UA).allow).toBe(true);
    expect(robotsAllowUrl(txt, 'https://biz.ng/admin/users', UA).allow).toBe(false);
  });

  it('an equal-length tie resolves to allow', () => {
    const txt = 'User-agent: *\nDisallow: /a\nAllow: /a';
    expect(robotsAllowUrl(txt, 'https://biz.ng/a', UA).allow).toBe(true);
  });

  it('matches wildcard patterns', () => {
    const txt = 'User-agent: *\nDisallow: /contact-*';
    expect(robotsAllowUrl(txt, 'https://biz.ng/contact-us', UA).allow).toBe(false);
    expect(robotsAllowUrl(txt, 'https://biz.ng/about', UA).allow).toBe(true);
  });

  it('a trailing $ anchors the end of path', () => {
    const txt = 'User-agent: *\nDisallow: /forum/$';
    expect(robotsAllowUrl(txt, 'https://biz.ng/forum', UA).allow).toBe(false);
    expect(robotsAllowUrl(txt, 'https://biz.ng/forum/new', UA).allow).toBe(true);
  });

  it('ignores comments and the fields the adapter does not use', () => {
    const txt = '# nobody crawls\nUser-agent: *\nDisallow: /wp-admin\nCrawl-delay: 10\nSitemap: https://biz.ng/sitemap.xml';
    expect(robotsAllowUrl(txt, 'https://biz.ng/', UA).allow).toBe(true);
    expect(robotsAllowUrl(txt, 'https://biz.ng/wp-admin', UA).allow).toBe(false);
  });
});
describe('consecutive user-agent lines form one group (RFC 9309 §2.2.1)', () => {
  /**
   * MEASURED AGAINST google.com/robots.txt, 2026-09-15. Its opening lines:
   *
   *     User-agent: *
   *     User-agent: Yandex
   *     Disallow: /search
   *     Allow: /search/about
   *
   * The parser used to open a second group on the Yandex line and attach every
   * rule to it, leaving `*` with an empty rule list — so robotsAllowUrl found a
   * star group, found no rules, and returned allow:true for /search, a path
   * Google explicitly disallows.
   *
   * Grouping agents like this is normal on large sites, so the effect was to
   * disable robots.txt on precisely the sites most likely to have thought about
   * their rules.
   */
  const GOOGLE_SHAPED = [
    'User-agent: *',
    'User-agent: Yandex',
    'Disallow: /search',
    'Allow: /search/about',
    'Disallow: /groups',
  ].join('\n');

  it('applies the rules to the FIRST agent, not only the last', () => {
    expect(robotsAllowUrl(GOOGLE_SHAPED, 'https://x.example/search?q=a', 'NowOpenBot').allow).toBe(false);
    expect(robotsAllowUrl(GOOGLE_SHAPED, 'https://x.example/groups', 'NowOpenBot').allow).toBe(false);
  });

  it('still honours the longer Allow inside a disallowed prefix', () => {
    expect(robotsAllowUrl(GOOGLE_SHAPED, 'https://x.example/search/about', 'NowOpenBot').allow).toBe(true);
  });

  it('names the rule that decided it, so a refusal can be explained', () => {
    const v = robotsAllowUrl(GOOGLE_SHAPED, 'https://x.example/search', 'NowOpenBot');
    expect(v.allow).toBe(false);
    expect(v.matchedRule).toBe('disallow:/search');
    expect(v.group).toBe('star');
  });

  it('applies them to the named agent too', () => {
    expect(robotsAllowUrl(GOOGLE_SHAPED, 'https://x.example/search', 'Yandex').allow).toBe(false);
  });

  it('a rule line ends the run, so the next agent starts a fresh group', () => {
    const two = [
      'User-agent: *',
      'Disallow: /private',
      'User-agent: EvilBot',
      'Disallow: /',
    ].join('\n');
    // `*` keeps only its own rule and must NOT inherit EvilBot's blanket ban.
    expect(robotsAllowUrl(two, 'https://x.example/private', 'NowOpenBot').allow).toBe(false);
    expect(robotsAllowUrl(two, 'https://x.example/shop', 'NowOpenBot').allow).toBe(true);
    expect(robotsAllowUrl(two, 'https://x.example/shop', 'EvilBot').allow).toBe(false);
  });

  it('a non-rule field between agents also ends the run', () => {
    // Sitemap/Crawl-delay are not rules but they do break the group, per the RFC.
    const withSitemap = [
      'User-agent: *',
      'Sitemap: https://x.example/sitemap.xml',
      'User-agent: OtherBot',
      'Disallow: /',
    ].join('\n');
    expect(robotsAllowUrl(withSitemap, 'https://x.example/anything', 'NowOpenBot').allow).toBe(true);
  });
});

describe('the verdict is an object, and callers must read .allow', () => {
  it('is truthy even when it refuses', () => {
    /*
     * extract-page/index.ts wrote `if (!robotsAllowUrl(...))`. The return is an
     * object, so `!object` is always false and the refusal branch was
     * unreachable. This test states the shape so the mistake reads as a
     * mistake.
     */
    const v = robotsAllowUrl('User-agent: *\nDisallow: /', 'https://x.example/a', 'NowOpenBot');
    expect(v.allow).toBe(false);
    expect(!v).toBe(false);
    expect(typeof v).toBe('object');
  });
});
