import { describe, it, expect } from 'vitest';
import {
  isVideoUrl, posterUrlForVideo, escapeHtml, renderSharePage, isEmbedUrl, embedPreviewImage,
} from './shareRender';
import { posterUrlForVideo as clientPosterUrl } from './reelShare';

const VIDEO = 'https://x.supabase.co/storage/v1/object/public/business-images/u1/reel-9.mp4';
const base = {
  title: 'Mama Put Kitchen — OpenReel video',
  description: 'Fresh jollof today',
  image: 'https://x.supabase.co/.../reel-9-poster.jpg',
  mediaUrl: VIDEO,
  isVideo: true,
  profileUrl: 'https://nowopenafrica.com/mama-put',
  shareUrl: 'https://nowopenafrica.com/r/abc',
  businessName: 'Mama Put Kitchen',
  siteUrl: 'https://nowopenafrica.com',
};

describe('poster derivation', () => {
  it('matches the client-side convention exactly', () => {
    // The camera writes the poster; this function reads it. If these two ever
    // disagree, every share card silently loses its image.
    for (const url of [
      VIDEO,
      'https://x.test/a/reel-1.webm',
      'https://x.test/a/reel-2.mov',
      `${VIDEO}?token=abc`,
    ]) {
      expect(posterUrlForVideo(url), url).toBe(clientPosterUrl(url));
    }
  });

  it('returns null for photos and empty values', () => {
    expect(posterUrlForVideo('https://x.test/a.jpg')).toBeNull();
    expect(posterUrlForVideo('')).toBeNull();
    expect(posterUrlForVideo(null)).toBeNull();
  });

  it('classifies videos ignoring query strings', () => {
    expect(isVideoUrl(VIDEO)).toBe(true);
    expect(isVideoUrl(`${VIDEO}?token=x`)).toBe(true);
    expect(isVideoUrl('https://x.test/a.jpeg?w=640')).toBe(false);
  });
});

describe('platform links in a share card', () => {
  it('recognises a pasted platform link, which is a page and not a file', () => {
    for (const url of [
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.tiktok.com/@x/video/7212345678901234567',
      'https://www.instagram.com/reel/Cabc/',
      'https://vimeo.com/123456789',
    ]) {
      expect(isEmbedUrl(url), url).toBe(true);
    }
    expect(isEmbedUrl(VIDEO)).toBe(false);
    expect(isEmbedUrl('https://x.test/a.jpg')).toBe(false);
  });

  it('resolves a real YouTube thumbnail instead of pointing og:image at a web page', () => {
    // The bug: WhatsApp was handed a watch-page URL as the image and showed
    // nothing at all.
    const expected = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?list=x&v=dQw4w9WgXcQ',
    ]) {
      expect(embedPreviewImage(url), url).toBe(expected);
    }
  });

  it('returns null where no stable public thumbnail exists, so a fallback is used', () => {
    expect(embedPreviewImage('https://www.tiktok.com/@x/video/7212345678901234567')).toBeNull();
    expect(embedPreviewImage('https://www.instagram.com/reel/Cabc/')).toBeNull();
    expect(embedPreviewImage('')).toBeNull();
  });

  it('sends the viewer to the platform rather than embedding a player it cannot own', () => {
    const html = renderSharePage({
      ...base,
      isVideo: false,
      isEmbed: true,
      mediaUrl: 'https://youtu.be/dQw4w9WgXcQ',
      image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });
    expect(html).toContain('Watch the full video');
    expect(html).toContain('href="https://youtu.be/dQw4w9WgXcQ"');
    // An image card, so the thumbnail is what the chat preview shows.
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).not.toContain('<video');
    // Never claim the page itself is a video file.
    expect(html).not.toContain('og:video');
  });
});

describe('escapeHtml', () => {
  it('neutralises markup so a caption cannot inject into the page', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(escapeHtml('a"b\'c&d')).toBe('a&quot;b&#39;c&amp;d');
  });

  it('handles empty input', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('renderSharePage', () => {
  it('emits the tags a crawler needs', () => {
    const html = renderSharePage(base);
    for (const tag of [
      '<meta property="og:title" content="Mama Put Kitchen — OpenReel video">',
      '<meta property="og:description" content="Fresh jollof today">',
      '<meta property="og:url" content="https://nowopenafrica.com/r/abc">',
      '<meta property="og:site_name" content="NowOpen Africa">',
    ]) {
      expect(html).toContain(tag);
    }
    expect(html).toContain(`<meta property="og:image" content="${base.image}">`);
  });

  it('declares a video card for a reel and points og:video at the file', () => {
    const html = renderSharePage(base);
    expect(html).toContain('<meta property="og:type" content="video.other">');
    expect(html).toContain(`<meta property="og:video" content="${VIDEO}">`);
    expect(html).toContain('<meta property="og:video:secure_url"');
  });

  it('declares an image card for a photo, with no video tags', () => {
    const html = renderSharePage({ ...base, isVideo: false, mediaUrl: 'https://x.test/a.jpg' });
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).not.toContain('og:video');
    expect(html).toContain('<img src="https://x.test/a.jpg"');
  });

  it('plays the reel on the page, so the link is worth opening from WhatsApp', () => {
    const html = renderSharePage(base);
    expect(html).toMatch(/<video[^>]+autoplay/);
    expect(html).toContain(`poster="${base.image}"`);
    expect(html).toMatch(/<video[^>]+playsinline/);
  });

  it('always links back to the business profile', () => {
    const html = renderSharePage(base);
    expect(html).toContain(`href="${base.profileUrl}"`);
    expect(html).toContain('See more from Mama Put Kitchen');
  });

  it('escapes a hostile caption rather than embedding it raw', () => {
    const html = renderSharePage({
      ...base,
      description: '"><script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('omits the caption block entirely when there is none', () => {
    const html = renderSharePage({ ...base, description: '' });
    expect(html).not.toContain('class="caption"');
  });

  it('is a complete document', () => {
    const html = renderSharePage(base);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });
});
