import { describe, it, expect } from 'vitest';
import {
  parseVideoEmbed, isEmbeddableVideoUrl, embedRejectionReason, EMBED_FRAME_HOSTS,
  backgroundSourceIssue,
} from './videoEmbeds';

describe('YouTube links', () => {
  it('reads the id from every shape a person might paste', () => {
    const shapes = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
    ];
    for (const url of shapes) {
      const e = parseVideoEmbed(url);
      expect(e?.platform, url).toBe('youtube');
      expect(e?.id, url).toBe('dQw4w9WgXcQ');
    }
  });

  it('embeds through the no-cookie host', () => {
    expect(parseVideoEmbed('https://youtu.be/abc123')?.embedUrl)
      .toBe('https://www.youtube-nocookie.com/embed/abc123');
  });

  it('copes with a missing scheme', () => {
    expect(parseVideoEmbed('youtu.be/abc123')?.id).toBe('abc123');
  });
});

describe('TikTok links', () => {
  it('reads the numeric id from a full video link', () => {
    const e = parseVideoEmbed('https://www.tiktok.com/@nowopen/video/7212345678901234567');
    expect(e?.platform).toBe('tiktok');
    expect(e?.id).toBe('7212345678901234567');
    expect(e?.embedUrl).toBe('https://www.tiktok.com/embed/v2/7212345678901234567');
  });

  it('explains that a short link cannot be embedded, rather than failing silently', () => {
    // vm.tiktok.com carries no id — it has to be resolved by following it,
    // which the browser cannot do cross-origin.
    const reason = embedRejectionReason('https://vm.tiktok.com/ZMabcdef/');
    expect(reason).toMatch(/Short links/i);
    expect(parseVideoEmbed('https://vm.tiktok.com/ZMabcdef/')).toBeNull();
  });
});

describe('Instagram links', () => {
  it('handles reels, posts and IGTV', () => {
    expect(parseVideoEmbed('https://www.instagram.com/reel/Cabc123/')?.id).toBe('Cabc123');
    expect(parseVideoEmbed('https://www.instagram.com/p/Cabc123/')?.id).toBe('Cabc123');
    expect(parseVideoEmbed('https://instagram.com/tv/Cabc123/')?.id).toBe('Cabc123');
  });

  it('embeds a post through the /p/ path and a reel through /reel/', () => {
    expect(parseVideoEmbed('https://www.instagram.com/p/Cabc123/')?.embedUrl)
      .toBe('https://www.instagram.com/p/Cabc123/embed');
    expect(parseVideoEmbed('https://www.instagram.com/reel/Cabc123/')?.embedUrl)
      .toBe('https://www.instagram.com/reel/Cabc123/embed');
  });
});

describe('Vimeo and Facebook links', () => {
  it('reads a Vimeo numeric id', () => {
    const e = parseVideoEmbed('https://vimeo.com/123456789');
    expect(e?.platform).toBe('vimeo');
    expect(e?.embedUrl).toBe('https://player.vimeo.com/video/123456789');
  });

  it('routes Facebook video through the plugin player', () => {
    const e = parseVideoEmbed('https://www.facebook.com/watch?v=987654321');
    expect(e?.platform).toBe('facebook');
    expect(e?.embedUrl).toContain('facebook.com/plugins/video.php');
    expect(e?.embedUrl).toContain(encodeURIComponent('v=987654321'));
  });
});

describe('non-embeddable input', () => {
  it('returns null for a direct file, which plays as plain video instead', () => {
    expect(parseVideoEmbed('https://x.test/a/clip.mp4')).toBeNull();
    // ...and is explicitly accepted by the validator.
    expect(embedRejectionReason('https://x.test/a/clip.mp4')).toBeNull();
    expect(embedRejectionReason('https://x.test/a/clip.mp4?token=1')).toBeNull();
  });

  it('rejects a random page with an actionable message', () => {
    const reason = embedRejectionReason('https://example.com/some/article');
    expect(reason).toMatch(/YouTube, TikTok, Instagram/);
  });

  it('rejects text that is not a link at all', () => {
    expect(embedRejectionReason('barber shop')).toMatch(/doesn't look like a link|full video address/);
    expect(parseVideoEmbed('')).toBeNull();
    expect(parseVideoEmbed('   ')).toBeNull();
  });

  it('isEmbeddableVideoUrl agrees with parseVideoEmbed', () => {
    expect(isEmbeddableVideoUrl('https://youtu.be/abc')).toBe(true);
    expect(isEmbeddableVideoUrl('https://x.test/a.mp4')).toBe(false);
  });
});

describe('backgroundSourceIssue', () => {
  it('refuses a platform embed, because a canvas cannot draw an iframe', () => {
    // Design/motion backgrounds are composited into the exported file. Allowing
    // a YouTube link would let someone design against a preview that exports
    // blank, which is worse than refusing it up front.
    const issue = backgroundSourceIssue('https://youtu.be/dQw4w9WgXcQ');
    expect(issue).toMatch(/YouTube/);
    expect(issue).toMatch(/Upload the file|record with OpenReel|direct/i);
  });

  it('names the platform it is refusing', () => {
    expect(backgroundSourceIssue('https://www.tiktok.com/@x/video/7212345678901234567')).toMatch(/TikTok/);
    expect(backgroundSourceIssue('https://www.instagram.com/reel/Cabc/')).toMatch(/Instagram/);
  });

  it('allows a direct file, which is what the renderer can actually draw', () => {
    expect(backgroundSourceIssue('https://x.supabase.co/storage/v1/object/public/b/clip.mp4')).toBeNull();
    expect(backgroundSourceIssue('https://x.test/cover.jpg')).toBeNull();
  });

  it('is silent for an empty value', () => {
    expect(backgroundSourceIssue('')).toBeNull();
    expect(backgroundSourceIssue('   ')).toBeNull();
  });
});

describe('CSP frame hosts', () => {
  it('lists an https origin for every platform that can be embedded', () => {
    const platforms = ['youtube', 'tiktok', 'instagram', 'vimeo', 'facebook'];
    for (const p of platforms) {
      const key = p === 'youtube' ? 'youtube' : p;
      expect(
        EMBED_FRAME_HOSTS.some((h) => h.includes(key)),
        `${p} has no frame host`,
      ).toBe(true);
    }
    for (const h of EMBED_FRAME_HOSTS) expect(h.startsWith('https://')).toBe(true);
  });
});
