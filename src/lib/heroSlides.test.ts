import { describe, it, expect } from 'vitest';

import {
  parseSlideUrl, youTubeId, vimeoId, youTubeEmbedUrl, makeSlide,
  parseHeroSlides, heroPlaylist, EMBED_SLIDE_SECONDS,
} from './heroSlides';

describe('youTubeId', () => {
  it('reads the id from every shape of YouTube link people paste', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?list=PL123&v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
    ]) {
      expect(youTubeId(url), url).toBe('dQw4w9WgXcQ');
    }
  });

  it('is not fooled by a link that merely mentions youtube', () => {
    expect(youTubeId('https://example.com/about-youtube')).toBeNull();
  });
});

describe('vimeoId', () => {
  it('reads a Vimeo id', () => {
    expect(vimeoId('https://vimeo.com/123456789')).toBe('123456789');
    expect(vimeoId('https://vimeo.com/video/123456789')).toBe('123456789');
  });
});

describe('youTubeEmbedUrl', () => {
  const url = youTubeEmbedUrl('dQw4w9WgXcQ');

  it('uses the no-cookie host, so a visitor is not tracked for scrolling past', () => {
    expect(url.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe(true);
  });

  it('is muted, because autoplay is refused otherwise and noise loses people', () => {
    expect(url).toContain('mute=1');
    expect(url).toContain('autoplay=1');
  });

  it('loops the single video, which needs playlist set to its own id', () => {
    expect(url).toContain('loop=1');
    expect(url).toContain('playlist=dQw4w9WgXcQ');
  });

  it('hides the chrome — this is a background, not a player', () => {
    expect(url).toContain('controls=0');
    expect(url).toContain('rel=0');
  });
});

describe('parseSlideUrl', () => {
  it('accepts YouTube and Vimeo as embeds', () => {
    const yt = parseSlideUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(yt.ok && yt.kind).toBe('embed');
    expect(yt.ok && yt.poster).toContain('i.ytimg.com');
    expect(parseSlideUrl('https://vimeo.com/123456789').ok).toBe(true);
  });

  it('accepts a direct file from a host the page may actually load', () => {
    const ok = parseSlideUrl('https://abc.supabase.co/storage/v1/object/public/hero-videos/clip.mp4');
    expect(ok.ok && ok.kind).toBe('video');
    expect(parseSlideUrl('https://videos.pexels.com/video-files/123/clip.mp4').ok).toBe(true);
  });

  it('REFUSES a file from a host media-src blocks, with a reason', () => {
    // The whole point of this check: it would preview fine on the dev server,
    // which sends no CSP, and be a black rectangle on the live site.
    const res = parseSlideUrl('https://example.com/clip.mp4');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toContain('example.com');
      expect(res.reason).toMatch(/YouTube|Upload/);
    }
  });

  it('refuses a link that is not video at all', () => {
    const res = parseSlideUrl('https://example.com/page.html');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/Not a video/);
  });

  it('refuses http, which the page will not load', () => {
    const res = parseSlideUrl('http://videos.pexels.com/clip.mp4');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/https/);
  });

  it('asks for a full link rather than calling it invalid', () => {
    const res = parseSlideUrl('youtube dot com slash something');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/full link|https/i);
  });

  it('says something useful for an empty box', () => {
    expect(parseSlideUrl('').ok).toBe(false);
  });

  it('ignores a query string when testing the extension', () => {
    expect(parseSlideUrl('https://videos.pexels.com/a/clip.mp4?download=1').ok).toBe(true);
  });
});

describe('makeSlide', () => {
  it('builds a slide, keeping what was typed so it can be edited back', () => {
    const res = makeSlide('  https://youtu.be/dQw4w9WgXcQ  ', ' Launch film ');
    expect('slide' in res).toBe(true);
    if ('slide' in res) {
      expect(res.slide.url).toBe('https://youtu.be/dQw4w9WgXcQ');
      expect(res.slide.title).toBe('Launch film');
      expect(res.slide.kind).toBe('embed');
      expect(res.slide.id).toBeTruthy();
    }
  });

  it('hands back the reason rather than a broken slide', () => {
    expect('error' in makeSlide('https://example.com/clip.mp4')).toBe(true);
  });

  it('leaves the title off when none was given', () => {
    const res = makeSlide('https://youtu.be/dQw4w9WgXcQ', '   ');
    if ('slide' in res) expect(res.slide.title).toBeUndefined();
  });
});

describe('parseHeroSlides', () => {
  it('reads back what was saved', () => {
    const out = parseHeroSlides([{ id: 'a', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Film' }]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('embed');
    expect(out[0].playbackUrl).toContain('youtube-nocookie.com');
  });

  it('re-derives the playback url instead of trusting the stored one', () => {
    // A stored src is what goes into an iframe, and the embed parameters can
    // change between releases.
    const out = parseHeroSlides([
      { id: 'a', url: 'https://youtu.be/dQw4w9WgXcQ', playbackUrl: 'https://evil.example/x' },
    ]);
    expect(out[0].playbackUrl).not.toContain('evil');
  });

  it('drops anything it cannot play rather than rendering a broken slide', () => {
    const out = parseHeroSlides([
      { id: 'a', url: 'https://example.com/clip.mp4' },
      { id: 'b', url: 'https://youtu.be/dQw4w9WgXcQ' },
      'not an object',
      null,
      {},
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('b');
  });

  it('copes with a settings row that holds nothing sensible', () => {
    expect(parseHeroSlides(undefined)).toEqual([]);
    expect(parseHeroSlides('x')).toEqual([]);
  });
});

describe('heroPlaylist', () => {
  it('plays uploads first, then the URL slides', () => {
    const slides = parseHeroSlides([{ id: 's1', url: 'https://youtu.be/dQw4w9WgXcQ' }]);
    const list = heroPlaylist(['https://abc.supabase.co/a.mp4'], slides);
    expect(list.map((s) => s.kind)).toEqual(['video', 'embed']);
  });

  it('works with either side empty', () => {
    expect(heroPlaylist([], [])).toEqual([]);
    expect(heroPlaylist(['/hero-background.mp4'], [])).toHaveLength(1);
  });

  it('gives an embed slide a finite time on screen', () => {
    // It cannot report its own end, so something has to move it along.
    expect(EMBED_SLIDE_SECONDS).toBeGreaterThan(0);
    expect(EMBED_SLIDE_SECONDS).toBeLessThan(60);
  });
});
