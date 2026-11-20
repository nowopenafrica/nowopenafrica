import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));

import { kindForPath, planLink, playerCommand, playerPageHost, PLAYER_PAGE_HOSTS, studioEmbedSrc } from './videoSources';
import { embedPlacementsAt, drawVideoFrame } from './videoCompositor';
import { blankVideoDocument, readVideoDocument, type VideoDocument } from './videoDocument';
import { MAX_BYTES, VIDEO_UPLOAD_TYPES } from './videoAssets';
import {
  IMPORT_MAX_BYTES, IMPORT_TYPES, PLAYER_PAGE_MESSAGE, playerPageHost as serverPlayerHost,
} from '../../../supabase/functions/_shared/videoImport';

const BASE = 'https://abc.supabase.co/storage/v1/object/public/';
const ME = '11111111-2222-3333-4444-555555555555';

describe('planLink', () => {
  it('uses a NowOpen file in my own folder where it is', () => {
    expect(planLink(`${BASE}business-images/${ME}/reel-1763600000000.mp4`, BASE, ME))
      .toEqual({ type: 'storage', path: `${ME}/reel-1763600000000.mp4`, kind: 'video' });
    expect(planLink(`${BASE}business-images/${ME}/studio/video-1-abc.jpg?t=1`, BASE, ME))
      .toEqual({ type: 'storage', path: `${ME}/studio/video-1-abc.jpg`, kind: 'image' });
  });

  it('copies somebody else’s NowOpen file rather than pointing at it', () => {
    const p = planLink(`${BASE}business-images/someone-else/reel-1.mp4`, BASE, ME);
    expect(p.type).toBe('import');
  });

  it('plays any other direct link from the link, adding https when missing', () => {
    expect(planLink('cdn.example.com/clip.mp4', BASE, ME)).toEqual({ type: 'import', url: 'https://cdn.example.com/clip.mp4', kind: 'video' });
    expect(planLink('https://x.org/watch?id=3', BASE, ME)).toEqual({ type: 'import', url: 'https://x.org/watch?id=3', kind: null });
  });

  it('shows YouTube, Vimeo, Instagram and TikTok videos through their own players', () => {
    expect(planLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', BASE, ME))
      .toMatchObject({ type: 'embed', platform: 'youtube', embedId: 'dQw4w9WgXcQ', label: 'YouTube' });
    expect(planLink('youtu.be/dQw4w9WgXcQ', BASE, ME)).toMatchObject({ type: 'embed', embedId: 'dQw4w9WgXcQ' });
    expect(planLink('https://youtube.com/shorts/abcDEF12345', BASE, ME)).toMatchObject({ type: 'embed', embedId: 'abcDEF12345' });
    expect(planLink('https://vimeo.com/76979871', BASE, ME)).toMatchObject({ type: 'embed', platform: 'vimeo', embedId: '76979871' });
    expect(planLink('https://www.instagram.com/reel/C1abcD2/', BASE, ME)).toMatchObject({ type: 'embed', platform: 'instagram', embedId: 'C1abcD2' });
    expect(planLink('https://www.tiktok.com/@shop/video/7212345678901234567', BASE, ME)).toMatchObject({ type: 'embed', platform: 'tiktok' });
  });

  it('refuses a platform link with no video in it, saying where to get one', () => {
    const p = planLink('https://www.youtube.com/@somechannel', BASE, ME);
    expect(p.type).toBe('refuse');
    expect(p.type === 'refuse' && p.reason).toMatch(/Share → Copy link/);
  });

  it('refuses empty, non-web and broken input', () => {
    expect(planLink('  ', BASE, ME).type).toBe('refuse');
    expect(planLink('javascript:alert(1)', BASE, ME).type).toBe('refuse');
    expect(planLink('data:video/mp4;base64,AAAA', BASE, ME).type).toBe('refuse');
    expect(planLink('https://', BASE, ME).type).toBe('refuse');
  });

  it('refuses a path-climbing own-folder link', () => {
    expect(planLink(`${BASE}business-images/${ME}/../other/x.mp4`, BASE, ME).type).not.toBe('storage');
  });
});

describe('platform players', () => {
  it('turn off controls, related videos and annotations, and keep the JS API on', () => {
    const src = studioEmbedSrc('youtube', 'dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.nowopenafrica.com');
    expect(src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    for (const p of ['enablejsapi=1', 'controls=0', 'rel=0', 'iv_load_policy=3', 'disablekb=1', 'fs=0']) expect(src).toContain(p);
    expect(studioEmbedSrc('vimeo', '1', 'https://vimeo.com/1', 'x')).toContain('controls=0');
  });

  it('speak each player’s command language', () => {
    expect(JSON.parse(playerCommand('youtube', 'seek', 12.5) as string)).toEqual({ event: 'command', func: 'seekTo', args: [12.5, true] });
    expect(playerCommand('vimeo', 'play')).toEqual({ method: 'play' });
    expect(playerCommand('tiktok', 'play')).toBeNull();
  });
});

describe('linked assets in the document', () => {
  const withEmbed = (): VideoDocument => {
    const d = blankVideoDocument(1080, 1920);
    d.assets.a1 = { kind: 'video', link: { url: 'https://youtu.be/dQw4w9WgXcQ', platform: 'youtube', embedId: 'dQw4w9WgXcQ' } };
    d.assets.a2 = { kind: 'video', link: { url: 'https://cdn.example.com/clip.mp4' }, durationMs: 8000 };
    d.tracks[0].clips = [{ id: 'c1', type: 'media', assetId: 'a1', startMs: 0, durationMs: 4000, inMs: 2000, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 } }];
    return d;
  };

  it('are read back; URLs in path and non-https links are still refused', () => {
    expect(readVideoDocument(withEmbed()).ok).toBe(true);
    const bad = withEmbed();
    bad.assets.a2 = { kind: 'video', link: { url: 'http://cdn.example.com/clip.mp4' } };
    expect(readVideoDocument(bad)).toMatchObject({ ok: false });
    const noId = withEmbed();
    noId.assets.a1 = { kind: 'video', link: { url: 'https://youtu.be/x', platform: 'youtube', embedId: '<script>' } };
    expect(readVideoDocument(noId)).toMatchObject({ ok: false });
    const none = withEmbed();
    none.assets.a2 = { kind: 'video' };
    expect(readVideoDocument(none)).toMatchObject({ ok: false, reason: expect.stringMatching(/no file and no link/) });
  });

  it('places the platform player where the clip is, at the right source time', () => {
    const p = embedPlacementsAt(withEmbed(), 1500);
    expect(p).toEqual([{ clipId: 'c1', assetId: 'a1', box: { x: 0, y: 0, w: 1, h: 1 }, opacity: 1, sourceSeconds: 3.5 }]);
    expect(embedPlacementsAt(withEmbed(), 5000)).toEqual([]);
  });

  it('the painter leaves a transparent hole for it in the editor', () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && ['clearRect', 'fillRect', 'drawImage'].includes(k) ? () => calls.push(k) : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
    drawVideoFrame(ctx, withEmbed(), 1000, { media: () => null, hole: (id) => id === 'a1' });
    expect(calls).toEqual(['fillRect', 'clearRect']);
  });
});

describe('kindForPath', () => {
  it('reads the kind from the extension', () => {
    expect(kindForPath('a/reel-1.webm')).toBe('video');
    expect(kindForPath('a/reel-1.jpeg')).toBe('image');
    expect(kindForPath('a/x.mp3')).toBe('audio');
    expect(kindForPath('a/x.pdf')).toBeNull();
  });
});

describe('browser and server agree', () => {
  it('a link may bring in exactly what an upload may', () => {
    expect(IMPORT_TYPES).toEqual(VIDEO_UPLOAD_TYPES);
    expect(IMPORT_MAX_BYTES).toEqual(MAX_BYTES);
  });

  it('refuse the same player pages', () => {
    for (const host of PLAYER_PAGE_HOSTS) expect(serverPlayerHost(host)).toBe(host);
    expect(serverPlayerHost('m.youtube.com')).toBe(playerPageHost('m.youtube.com'));
    expect(PLAYER_PAGE_MESSAGE('youtube.com')).toMatch(/not a file/);
  });
});
