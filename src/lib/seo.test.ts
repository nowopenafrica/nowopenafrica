import { describe, it, expect, beforeEach } from 'vitest';
import { applySeo, SITE_URL } from './seo';

const DEFAULT_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

function headMeta(selector: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(selector)?.getAttribute('content') ?? null;
}

function headLink(rel: string): string | null {
  return document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)?.href ?? null;
}

function jsonLdBlocks(): object[] {
  return Array.from(
    document.head.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')
  ).map((s) => JSON.parse(s.text ?? '{}'));
}

describe('applySeo', () => {
  beforeEach(() => {
    // Reset the managed head surface between tests. index.html isn't loaded in
    // jsdom, so the robots meta only exists once applySeo has written it.
    document.title = 'original title';
    for (const el of document.head.querySelectorAll('meta[name="robots"], meta[property^="og:"], meta[name="description"], meta[name^="twitter:"]')) {
      el.remove();
    }
  });

  it('sets title, description, canonical, robots default and OG tags', () => {
    const cleanup = applySeo({
      title: 'Test Business — NowOpen Africa',
      description: 'A test description.',
      path: '/test-business',
      image: '/og-image.png',
    });

    expect(document.title).toBe('Test Business — NowOpen Africa');
    expect(headMeta('meta[name="description"]')).toBe('A test description.');
    expect(headLink('canonical')).toBe(`${SITE_URL}/test-business`);
    expect(headMeta('meta[name="robots"]')).toBe(DEFAULT_ROBOTS);
    expect(headMeta('meta[property="og:title"]')).toBe('Test Business — NowOpen Africa');
    expect(headMeta('meta[property="og:url"]')).toBe(`${SITE_URL}/test-business`);
    expect(headMeta('meta[property="og:image"]')).toBe(`${SITE_URL}/og-image.png`);
    expect(headMeta('meta[name="twitter:card"]')).toBe('summary_large_image');

    cleanup();
  });

  it('respects a noindex robots override', () => {
    const cleanup = applySeo({
      title: 'Login — NowOpen Africa',
      description: 'Sign in.',
      path: '/login',
      robots: 'noindex, nofollow',
    });

    expect(headMeta('meta[name="robots"]')).toBe('noindex, nofollow');
    cleanup();
  });

  it('does not leak noindex onto the next route in a single-page session', () => {
    const first = applySeo({ title: 'Private', description: 'd', path: '/login', robots: 'noindex, nofollow' });
    first();

    // A public route that does NOT pass robots must reset the directive to the
    // index.html default rather than inheriting the previous page's noindex.
    const second = applySeo({ title: 'Public', description: 'd', path: '/businesses' });
    expect(headMeta('meta[name="robots"]')).toBe(DEFAULT_ROBOTS);
    second();
  });

  it('injects JSON-LD and removes it on cleanup', () => {
    const cleanup = applySeo({
      title: 'T',
      description: 'd',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: 'Test Co',
      },
    });

    const blocks = jsonLdBlocks();
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as any)['@type']).toBe('LocalBusiness');

    cleanup();
    expect(jsonLdBlocks()).toHaveLength(0);
  });

  it('restores the previous document title on cleanup', () => {
    const cleanup = applySeo({ title: 'New Title', description: 'd' });
    cleanup();
    expect(document.title).toBe('original title');
  });
});
