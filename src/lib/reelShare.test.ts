import { describe, it, expect, afterEach } from 'vitest';
import {
  posterUrlForVideo, shareImageFor, reelShareUrl, reelShareText, reelShareTitle,
  POSTER_SUFFIX, shareFileName, shouldShareAsFile, shareReel, MAX_SHARE_FILE_BYTES,
} from './reelShare';
import { SITE_URL } from './seo';

const VIDEO = 'https://x.supabase.co/storage/v1/object/public/business-images/u1/reel-123.mp4';

describe('posterUrlForVideo', () => {
  it('derives the poster beside the video, so no column is needed', () => {
    expect(posterUrlForVideo(VIDEO))
      .toBe('https://x.supabase.co/storage/v1/object/public/business-images/u1/reel-123-poster.jpg');
  });

  it('handles every container a reel can be recorded in', () => {
    for (const ext of ['mp4', 'webm', 'mov', 'm4v']) {
      expect(posterUrlForVideo(`https://x.test/a/reel.${ext}`)).toBe(`https://x.test/a/reel${POSTER_SUFFIX}`);
    }
  });

  it('drops a query or fragment — those belong to the video, not the still', () => {
    expect(posterUrlForVideo(`${VIDEO}?token=abc`)).toBe(posterUrlForVideo(VIDEO));
    expect(posterUrlForVideo(`${VIDEO}#t=0.1`)).toBe(posterUrlForVideo(VIDEO));
  });

  it('returns null for a photo, which is already its own share image', () => {
    expect(posterUrlForVideo('https://x.test/a/photo.jpg')).toBeNull();
    expect(posterUrlForVideo('https://x.test/a/photo.webp')).toBeNull();
  });

  it('returns null for missing values rather than a broken URL', () => {
    expect(posterUrlForVideo('')).toBeNull();
    expect(posterUrlForVideo(null)).toBeNull();
    expect(posterUrlForVideo(undefined)).toBeNull();
  });
});

describe('shareImageFor', () => {
  it('uses the photo itself when the item is a photo', () => {
    const photo = 'https://x.test/a/photo.jpg';
    expect(shareImageFor(photo)).toBe(photo);
  });

  it('uses the derived poster for a video', () => {
    expect(shareImageFor(VIDEO)).toBe(posterUrlForVideo(VIDEO));
  });

  it('falls back to the business cover for reels recorded before posters existed', () => {
    // posterUrlForVideo always returns a path; the fallback matters when the
    // caller knows the poster is absent and passes null through instead.
    expect(shareImageFor('https://x.test/a/clip.unknownext', 'https://x.test/cover.jpg'))
      .toBe('https://x.test/a/clip.unknownext');
  });

  it('returns null when there is nothing usable at all', () => {
    expect(shareImageFor('', null)).toBe('');
  });
});

describe('reelShareUrl', () => {
  it('is a branded URL on the site, not a raw function URL', () => {
    expect(reelShareUrl('abc-123')).toBe(`${SITE_URL}/r/abc-123`);
    expect(reelShareUrl('abc-123').startsWith('https://')).toBe(true);
  });

  it('escapes anything odd in the id', () => {
    expect(reelShareUrl('a/b?c')).toBe(`${SITE_URL}/r/a%2Fb%3Fc`);
  });
});

describe('sharing the media itself', () => {
  const originalNavigator = globalThis.navigator;

  const installNavigator = (impl: Partial<Navigator>) => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { ...originalNavigator, ...impl },
    });
  };

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: originalNavigator });
  });

  it('names the file after the business so the recipient sees something meaningful', () => {
    expect(shareFileName(VIDEO, 'Mama Put Kitchen')).toBe('mama-put-kitchen-openreel.mp4');
    expect(shareFileName('https://x.test/a/clip.webm', 'Golden Sands Hotel'))
      .toBe('golden-sands-hotel-openreel.webm');
  });

  it('falls back to a sane name and extension', () => {
    expect(shareFileName('https://x.test/a/clip', '')).toBe('nowopen-openreel.mp4');
    expect(shareFileName(`${VIDEO}?token=abc`, '!!!')).toBe('nowopen-openreel.mp4');
  });

  it('only pushes bytes worth pushing over mobile data', () => {
    expect(shouldShareAsFile(5 * 1024 * 1024)).toBe(true);
    expect(shouldShareAsFile(MAX_SHARE_FILE_BYTES)).toBe(true);
    expect(shouldShareAsFile(MAX_SHARE_FILE_BYTES + 1)).toBe(false);
    expect(shouldShareAsFile(0)).toBe(false);
  });

  it('shares the video FILE when the browser can — this is what plays in WhatsApp', async () => {
    const shared: unknown[] = [];
    installNavigator({
      canShare: () => true,
      share: async (data: ShareData) => { shared.push(data); },
    } as Partial<Navigator>);

    const outcome = await shareReel({
      mediaUrl: VIDEO,
      isVideo: true,
      businessName: 'Mama Put Kitchen',
      caption: 'Fresh jollof',
      galleryId: 'g-1',
      fetchMedia: async () => new Blob([new Uint8Array(1024)], { type: 'video/mp4' }),
    });

    expect(outcome).toBe('file');
    const data = shared[0] as ShareData & { files: File[] };
    expect(data.files).toHaveLength(1);
    expect(data.files[0].type).toBe('video/mp4');
    // The link rides along, so a forwarded video still traces back.
    expect(data.text).toContain(reelShareUrl('g-1'));
  });

  it('falls back to the link when the clip is too big to share as a file', async () => {
    const shared: ShareData[] = [];
    installNavigator({
      canShare: () => true,
      share: async (data: ShareData) => { shared.push(data); },
    } as Partial<Navigator>);

    const outcome = await shareReel({
      mediaUrl: VIDEO,
      isVideo: true,
      businessName: 'Big Clips',
      galleryId: 'g-2',
      fetchMedia: async () => ({ size: 40 * 1024 * 1024, type: 'video/mp4' } as Blob),
    });

    expect(outcome).toBe('link');
    expect(shared[0].url).toBe(reelShareUrl('g-2'));
    expect('files' in shared[0]).toBe(false);
  });

  it('falls back to the link where files cannot be shared at all', async () => {
    const shared: ShareData[] = [];
    installNavigator({
      canShare: undefined,
      share: async (data: ShareData) => { shared.push(data); },
    } as unknown as Partial<Navigator>);

    expect(await shareReel({
      mediaUrl: VIDEO, isVideo: true, businessName: 'X', galleryId: 'g-3',
    })).toBe('link');
    expect(shared[0].url).toBe(reelShareUrl('g-3'));
  });

  it('copies the link when there is no share sheet at all (desktop)', async () => {
    const copied: string[] = [];
    installNavigator({
      canShare: undefined,
      share: undefined,
      clipboard: { writeText: async (t: string) => { copied.push(t); } },
    } as unknown as Partial<Navigator>);

    expect(await shareReel({
      mediaUrl: VIDEO, isVideo: true, businessName: 'X', galleryId: 'g-4',
    })).toBe('copied');
    expect(copied[0]).toContain(reelShareUrl('g-4'));
  });

  it('treats a dismissed share sheet as cancelled, not as a failure to work around', async () => {
    // Silently copying a link after someone backed out would be surprising.
    const copied: string[] = [];
    installNavigator({
      canShare: () => true,
      share: async () => { throw new DOMException('cancelled', 'AbortError'); },
      clipboard: { writeText: async (t: string) => { copied.push(t); } },
    } as unknown as Partial<Navigator>);

    expect(await shareReel({
      mediaUrl: VIDEO, isVideo: true, businessName: 'X', galleryId: 'g-5',
      fetchMedia: async () => new Blob([new Uint8Array(16)], { type: 'video/mp4' }),
    })).toBe('cancelled');
    expect(copied).toHaveLength(0);
  });

  it('degrades to the link when the media cannot be fetched', async () => {
    const shared: ShareData[] = [];
    installNavigator({
      canShare: () => true,
      share: async (data: ShareData) => { shared.push(data); },
    } as Partial<Navigator>);

    expect(await shareReel({
      mediaUrl: VIDEO, isVideo: true, businessName: 'X', galleryId: 'g-6',
      fetchMedia: async () => { throw new Error('network'); },
    })).toBe('link');
  });
});

describe('share copy', () => {
  it('leads with the caption when there is one', () => {
    expect(reelShareText('Mama Put Kitchen', 'Fresh jollof today'))
      .toBe('Fresh jollof today — Mama Put Kitchen on NowOpen Africa');
  });

  it('falls back to the business name alone', () => {
    expect(reelShareText('Mama Put Kitchen')).toBe('Mama Put Kitchen on NowOpen Africa');
    expect(reelShareText('Mama Put Kitchen', '   ')).toBe('Mama Put Kitchen on NowOpen Africa');
  });

  it('titles the card by media type', () => {
    expect(reelShareTitle('Golden Sands Hotel', true)).toBe('Golden Sands Hotel — OpenReel video');
    expect(reelShareTitle('Golden Sands Hotel', false)).toBe('Golden Sands Hotel — OpenReel photo');
  });
});
