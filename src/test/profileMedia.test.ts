import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { embedThumbnailUrl, parseVideoEmbed } from '../lib/videoEmbeds';
import { posterUrlForVideo } from '../lib/reelShare';
import { mediaKindOf, videoThumbnailSrc } from '../lib/galleryMedia';

/**
 * Two media failures, both measured on production 2026-09-08.
 *
 * 1. EVERY BUSINESS LOGO WAS BLOCKED.
 *
 *    341 Content-Security-Policy violations on one profile page load. All 51
 *    businesses with a `logo_url` host it on their own CDN —
 *    images.squarespace-cdn.com, cafe.hardrock.com, app.terrakulture.com,
 *    zapphaireevents.com — and `img-src` allowed only Pexels, Picsum,
 *    Supabase, Paystack and i.ytimg.com. Every imported logo rendered broken.
 *
 *    A directory cannot enumerate its members' CDNs: each business has a
 *    different one and the list grows with every import.
 *
 * 2. YOUTUBE REELS SHOWED A GREY RECTANGLE.
 *
 *    The gallery holds 11 items: 6 uploaded videos, 4 YouTube links, 1
 *    Instagram reel. The uploaded ones already worked — verified that
 *    `reel-1787848887098-poster.jpg` returns 200 with 44KB of image/jpeg.
 *
 *    The YouTube links had no thumbnail because an embed has no `-poster.jpg`
 *    (there is no file to put one beside) and is not a video URL, so both of
 *    GalleryThumb's strategies miss it. They were the only reels anyone had
 *    captioned.
 */

describe('the CSP lets a business show its own logo', () => {
  const csp = (() => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
    const header = config.headers
      ?.flatMap((h: { headers?: { key: string; value: string }[] }) => h.headers ?? [])
      .find((h: { key: string }) => h.key === 'Content-Security-Policy');
    return String(header?.value ?? '');
  })();

  const directive = (name: string) =>
    (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) ?? '')
      .slice(name.length + 1)
      .split(/\s+/)
      .filter(Boolean);

  it('accepts an image from any https host', () => {
    // The only way a directory can display logos it does not host.
    expect(directive('img-src')).toContain('https:');
  });

  it('keeps the specific hosts listed, as a record of intent', () => {
    /*
     * `https:` subsumes them, so they are redundant to the browser and useful
     * to a reader: they say which hosts the platform deliberately depends on,
     * which is what makes a later narrowing possible.
     */
    for (const host of ['https://i.ytimg.com', 'https://*.supabase.co']) {
      expect(directive('img-src')).toContain(host);
    }
  });

  it('does NOT loosen anything that can execute', () => {
    /*
     * The whole justification for broadening img-src is that an image cannot
     * run code. That argument only holds while the executable directives stay
     * narrow, so this asserts they did.
     */
    const script = directive('script-src');
    expect(script).toContain("'self'");
    expect(script).not.toContain('https:');
    expect(script).not.toContain("'unsafe-eval'");
    expect(script.join(' ')).not.toMatch(/\*/);

    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
    expect(directive('base-uri')).toEqual(["'self'"]);
    expect(directive('form-action')).toEqual(["'self'"]);
  });

  it('does not widen connect-src, which is where data leaves', () => {
    // An image request cannot read a response. A fetch can.
    expect(directive('connect-src')).not.toContain('https:');
  });
});

describe('a third-party image is not handed the visitor’s page URL', () => {
  const src = readFileSync('src/pages/BusinessDetail.tsx', 'utf8');

  it('sets no-referrer on the logo', () => {
    /*
     * Hotlinking means the business's host sees each viewer's IP — that is
     * unavoidable. It does not have to also learn which profile they were
     * looking at. A published enrichment logo is hotlinked the same way.
     */
    const logoBlock = src.slice(src.indexOf('src={business.logo_url || publishedLogo}'), src.indexOf('src={business.logo_url || publishedLogo}') + 500);
    expect(logoBlock).toMatch(/referrerPolicy="no-referrer"/);
  });

  it('hides a logo that fails rather than leaving a broken image', () => {
    /*
     * SmartImg owns failure now: it swaps to the cover once, then renders a
     * styled placeholder in the same box — never the browser's broken-image
     * glyph across a hotlinked third-party host. There is no onError here
     * because there is nothing the page could do that the component doesn't.
     */
    const logoStart = src.indexOf('src={business.logo_url || publishedLogo}');
    const logoBlock = src.slice(logoStart - 60, logoStart + 500);
    expect(logoBlock).toMatch(/<SmartImg/);
    expect(logoBlock).toMatch(/fallback=\{business\.image_url \|\| null\}/);
    expect(logoBlock).not.toMatch(/onError/);
  });
});

describe('a YouTube reel gets its real thumbnail', () => {
  const YT = 'https://www.youtube.com/watch?v=fJaQiqnB9mA';

  it('is classified as an embed, not a video or a photo', () => {
    // Which is why GalleryThumb's two strategies both miss it.
    expect(mediaKindOf(YT)).toBe('embed');
    expect(posterUrlForVideo(YT)).toBeNull();
  });

  it('derives the still from the id our own parser extracted', () => {
    /*
     * No API key, no signature. Verified 200 image/jpeg on the real URL, and
     * i.ytimg.com was already in the img-src allowlist.
     */
    expect(embedThumbnailUrl(YT)).toBe('https://i.ytimg.com/vi/fJaQiqnB9mA/hqdefault.jpg');
  });

  it('uses hqdefault, which always exists', () => {
    // maxresdefault 404s for videos that were never uploaded at that size,
    // and a 404 here shows a broken tile.
    expect(embedThumbnailUrl(YT)).toContain('hqdefault');
    expect(embedThumbnailUrl(YT)).not.toContain('maxres');
  });

  it('handles the short form and an embed URL too', () => {
    for (const u of ['https://youtu.be/fJaQiqnB9mA', 'https://www.youtube.com/embed/fJaQiqnB9mA']) {
      expect(embedThumbnailUrl(u), u).toBe('https://i.ytimg.com/vi/fJaQiqnB9mA/hqdefault.jpg');
    }
  });

  it('escapes the id rather than trusting the parser blindly', () => {
    // Defence in depth: the id is ours, but it ends up in a URL.
    const src = readFileSync('src/lib/videoEmbeds.ts', 'utf8');
    expect(src).toMatch(/encodeURIComponent\(embed\.id\)/);
  });
});

describe('platforms without a derivable still keep the placeholder', () => {
  for (const [name, url] of [
    ['Instagram', 'https://www.instagram.com/reel/DbsxOzHN_Dd/'],
    ['TikTok', 'https://www.tiktok.com/@user/video/7300000000000000000'],
    ['Vimeo', 'https://vimeo.com/123456789'],
  ] as const) {
    it(`returns null for ${name}, rather than guessing a URL that 404s`, () => {
      /*
       * Each needs an oEmbed or Graph call. A labelled placeholder saying
       * "TikTok" is honest about not having the picture; a broken image reads
       * as NowOpen being broken.
       */
      expect(parseVideoEmbed(url), `${name} must still parse as an embed`).not.toBeNull();
      expect(embedThumbnailUrl(url)).toBeNull();
    });
  }

  it('returns null for something that is not an embed at all', () => {
    expect(embedThumbnailUrl('https://example.com/clip.mp4')).toBeNull();
    expect(embedThumbnailUrl('not a url')).toBeNull();
  });
});

describe('uploaded reels keep working — this must not regress', () => {
  const VIDEO = 'https://wvayqqfqqocwjripugnb.supabase.co/storage/v1/object/public/business-images/540dc1a9/reel-1787848887098.mp4';

  it('derives the poster beside the clip', () => {
    // Verified live: the real poster returns 200, 44KB, image/jpeg.
    expect(posterUrlForVideo(VIDEO)).toBe(VIDEO.replace('.mp4', '-poster.jpg'));
  });

  it('falls back to a seeked video frame when no poster exists', () => {
    /*
     * At exactly 0 some decoders stay on a blank frame — iOS in particular —
     * which is what the offset works around.
     */
    expect(videoThumbnailSrc(VIDEO)).toBe(`${VIDEO}#t=0.1`);
  });

  it('is classified as a video, so GalleryThumb handles it', () => {
    expect(mediaKindOf(VIDEO)).toBe('video');
  });
});
