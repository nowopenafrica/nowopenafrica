import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_URL } from '../lib/seo';

/**
 * Every URL the site DECLARES about itself must name the host the server
 * actually serves.
 *
 * MEASURED on production 2026-09-14, before this was fixed:
 *
 *   http://nowopenafrica.com       308 -> https://nowopenafrica.com/
 *   https://nowopenafrica.com      308 -> https://www.nowopenafrica.com/
 *   https://www.nowopenafrica.com  200
 *
 * So `www` is canonical. Yet `SITE_URL` was the non-www host, which put a
 * redirecting URL into every <link rel="canonical">, every og:url, every
 * structured-data @id, all 1,131 sitemap <loc> entries and the robots.txt
 * Sitemap directive. Google treats rel=canonical as a signal and weighs it
 * against the site's other signals — and here those signals contradicted each
 * other, with the server overruling the tag on every single page.
 *
 * This is cheap to get wrong again: the bare host is the one a person types
 * from memory. So it is asserted rather than remembered.
 */

const ROOTS = ['src', 'api'];
const EXTRA = ['index.html', 'public/robots.txt', 'public/manifest.webmanifest', 'public/site.webmanifest'];
const SKIP = /node_modules|\.test\.|\.d\.ts$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|html|txt|json|webmanifest)$/.test(p)) out.push(p);
  }
  return out;
}

/** The bare origin, NOT matching one that already carries a www. prefix. */
const BARE = /https:\/\/nowopenafrica\.com(?!\w)/g;

describe('the canonical host', () => {
  it('is the host the server redirects to, not the one it redirects away from', () => {
    expect(SITE_URL).toBe('https://www.nowopenafrica.com');
  });

  it('has no trailing slash, so `${SITE_URL}/path` never doubles it', () => {
    expect(SITE_URL.endsWith('/')).toBe(false);
  });

  it('is not contradicted anywhere in the shipped code', () => {
    const offenders: string[] = [];

    const files = [
      ...ROOTS.flatMap((r) => (existsSync(r) ? walk(r) : [])),
      ...EXTRA.filter((f) => existsSync(f)),
    ];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        if (BARE.test(line)) offenders.push(`${file}:${i + 1}`);
        BARE.lastIndex = 0;   // the /g flag makes .test stateful
      });
    }

    expect(
      offenders,
      'These declare the non-www host, which 308-redirects. Use SITE_URL ' +
      '(or https://www.nowopenafrica.com) so the canonical tag, og:url, ' +
      'structured data and sitemap all agree with the server:\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('platform verification tags survive edits', () => {
  it('keeps the Facebook domain verification tag in the static HTML', () => {
    /*
     * Meta's crawler fetches the raw HTML and does not run JavaScript, so this
     * tag only counts if it is in index.html — injecting it from React would
     * leave it invisible and the domain claim would silently fail, taking App
     * Review with it.
     */
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/name="facebook-domain-verification"/);
    expect(html).toContain('n38qpyxjb6r0je8nq4hrd9tw630ype');
    /*
     * Exactly one. An earlier code was supplied and then superseded; leaving a
     * stale one alongside the live one is the kind of thing that survives for
     * years and makes a later reader unsure which claim is real.
     */
    expect(html.match(/facebook-domain-verification/g)?.length).toBe(1);
    expect(html).not.toContain('t942j9m3kp5hc8mooo867cujv1w7s4');
  });

  it('serves the Facebook verification FILE from the site root', () => {
    /*
     * Meta's second method: a file at /<code>.html containing the bare code.
     *
     * It must live in public/, which Vercel resolves from the filesystem
     * BEFORE applying rewrites — otherwise the SPA catch-all
     * ("/((?!api/).*)" -> /index.html) would answer with the app shell and
     * Meta would read the whole page instead of the code. middleware.ts also
     * excludes dotted paths, so nothing intercepts it.
     */
    const code = 'n38qpyxjb6r0je8nq4hrd9tw630ype';
    const file = readFileSync(`public/${code}.html`, 'utf8');
    // The bare code and nothing else — no markup, no wrapper.
    expect(file.trim()).toBe(code);
    expect(file).not.toMatch(/<html|<head|<body/i);
  });
});
