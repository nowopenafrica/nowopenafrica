import { describe, it, expect } from 'vitest';
import {
  isVideoUrl, mediaKindOf, videoThumbnailSrc, orientationOf,
  matchesGalleryFilter, galleryFilterCounts, GALLERY_FILTERS,
  type FilterableMedia,
} from './galleryMedia';

describe('isVideoUrl', () => {
  it('recognises the containers OpenReel records and owners upload', () => {
    for (const ext of ['mp4', 'm4v', 'webm', 'ogv', 'mov']) {
      expect(isVideoUrl(`https://x.test/a/reel-1.${ext}`), ext).toBe(true);
    }
  });

  it('treats images as photos, including the seeded Pexels URLs', () => {
    expect(isVideoUrl('https://images.pexels.com/photos/1/p.jpeg?auto=compress&cs=tinysrgb&w=640')).toBe(false);
    expect(isVideoUrl('https://x.test/a.webp')).toBe(false);
    expect(isVideoUrl('https://x.test/a.jpg')).toBe(false);
  });

  it('ignores a query string — a video URL with one is still a video', () => {
    // The bug this guards: `/\.mp4$/` fails on a signed or cache-busted URL,
    // so the item would render inside an <img> and show as broken.
    expect(isVideoUrl('https://x.test/reel.mp4?token=abc&download=1')).toBe(true);
    expect(isVideoUrl('https://x.test/reel.mp4#t=0.1')).toBe(true);
  });

  it('is false for empty and missing values', () => {
    expect(isVideoUrl('')).toBe(false);
    expect(isVideoUrl(null)).toBe(false);
    expect(isVideoUrl(undefined)).toBe(false);
  });

  it('does not match an extension appearing mid-path', () => {
    expect(isVideoUrl('https://x.test/mp4/cover.jpg')).toBe(false);
  });

  it('mediaKindOf agrees with it', () => {
    expect(mediaKindOf('https://x.test/a.mp4')).toBe('video');
    expect(mediaKindOf('https://x.test/a.jpg')).toBe('photo');
  });
});

describe('videoThumbnailSrc', () => {
  it('appends a media fragment so a still frame is painted', () => {
    expect(videoThumbnailSrc('https://x.test/reel.mp4')).toBe('https://x.test/reel.mp4#t=0.1');
  });

  it('keeps the query string intact', () => {
    expect(videoThumbnailSrc('https://x.test/reel.mp4?token=abc'))
      .toBe('https://x.test/reel.mp4?token=abc#t=0.1');
  });

  it('does not stack a second fragment on a URL that already seeks', () => {
    const once = videoThumbnailSrc('https://x.test/reel.mp4');
    expect(videoThumbnailSrc(once)).toBe(once);
  });

  it('accepts a custom offset', () => {
    expect(videoThumbnailSrc('https://x.test/reel.mp4', 1)).toBe('https://x.test/reel.mp4#t=1');
  });

  it('passes an empty value through rather than producing a bare fragment', () => {
    expect(videoThumbnailSrc('')).toBe('');
  });
});

describe('orientationOf', () => {
  it('classifies the shapes a phone produces', () => {
    expect(orientationOf(1080, 1920)).toBe('portrait');
    expect(orientationOf(1920, 1080)).toBe('landscape');
    expect(orientationOf(1000, 1000)).toBe('square');
  });

  it('keeps near-square media out of portrait and landscape', () => {
    expect(orientationOf(1000, 1020)).toBe('square');
    expect(orientationOf(1020, 1000)).toBe('square');
  });

  it('returns null when the size is not known yet', () => {
    expect(orientationOf(0, 0)).toBeNull();
    expect(orientationOf(null, null)).toBeNull();
    expect(orientationOf(undefined, undefined)).toBeNull();
    expect(orientationOf(1080, 0)).toBeNull();
  });
});

describe('matchesGalleryFilter', () => {
  const reel: FilterableMedia = { kind: 'video', orientation: 'portrait' };
  const photo: FilterableMedia = { kind: 'photo', orientation: 'landscape' };
  const unmeasured: FilterableMedia = { kind: 'video', orientation: null };

  it('shows everything under All, including unmeasured items', () => {
    for (const item of [reel, photo, unmeasured]) {
      expect(matchesGalleryFilter(item, 'all')).toBe(true);
    }
  });

  it('separates videos from photos', () => {
    expect(matchesGalleryFilter(reel, 'video')).toBe(true);
    expect(matchesGalleryFilter(reel, 'photo')).toBe(false);
    expect(matchesGalleryFilter(photo, 'photo')).toBe(true);
    expect(matchesGalleryFilter(photo, 'video')).toBe(false);
  });

  it('filters by orientation across both kinds', () => {
    expect(matchesGalleryFilter(reel, 'portrait')).toBe(true);
    expect(matchesGalleryFilter(reel, 'landscape')).toBe(false);
    expect(matchesGalleryFilter(photo, 'landscape')).toBe(true);
  });

  it('never claims an unmeasured item has an orientation', () => {
    expect(matchesGalleryFilter(unmeasured, 'portrait')).toBe(false);
    expect(matchesGalleryFilter(unmeasured, 'landscape')).toBe(false);
    expect(matchesGalleryFilter(unmeasured, 'square')).toBe(false);
  });
});

describe('galleryFilterCounts', () => {
  it('counts what each filter would show', () => {
    const items: FilterableMedia[] = [
      { kind: 'video', orientation: 'portrait' },
      { kind: 'video', orientation: 'portrait' },
      { kind: 'photo', orientation: 'landscape' },
      { kind: 'photo', orientation: null },
    ];
    const counts = galleryFilterCounts(items);
    expect(counts.all).toBe(4);
    expect(counts.video).toBe(2);
    expect(counts.photo).toBe(2);
    expect(counts.portrait).toBe(2);
    expect(counts.landscape).toBe(1);
    expect(counts.square).toBe(0);
  });

  it('reports every filter key, so a chip row can hide the empty ones', () => {
    const counts = galleryFilterCounts([]);
    for (const f of GALLERY_FILTERS) expect(counts[f.key]).toBe(0);
  });
});
