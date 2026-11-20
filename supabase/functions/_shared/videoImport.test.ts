import { describe, expect, it } from 'vitest';

import { checkImportSize, checkImportType, importPath, playerPageHost, PLAYER_PAGE_HOSTS_FOR_TEST } from './videoImport';

describe('checkImportType', () => {
  it('accepts upload types, ignoring parameters and case', () => {
    expect(checkImportType('video/MP4; codecs="avc1"')).toEqual({ ok: true, kind: 'video', ext: 'mp4' });
    expect(checkImportType('image/jpeg')).toEqual({ ok: true, kind: 'image', ext: 'jpg' });
    expect(checkImportType('audio/mpeg')).toEqual({ ok: true, kind: 'audio', ext: 'mp3' });
  });

  it('explains a web page and refuses anything else', () => {
    const page = checkImportType('text/html; charset=utf-8');
    expect(page.ok === false && page.reason).toMatch(/web page, not a media file/);
    expect(checkImportType('application/pdf').ok).toBe(false);
    expect(checkImportType(null).ok).toBe(false);
    expect(checkImportType('image/svg+xml').ok).toBe(false);
  });
});

describe('checkImportSize', () => {
  it('caps by kind and refuses empty files', () => {
    expect(checkImportSize('video', 50 * 1024 * 1024)).toBeNull();
    expect(checkImportSize('video', 50 * 1024 * 1024 + 1)).toMatch(/limit is 50 MB/);
    expect(checkImportSize('image', 26 * 1024 * 1024)).toMatch(/limit is 25 MB/);
    expect(checkImportSize('audio', 0)).toMatch(/empty/);
  });
});

describe('importPath and player pages', () => {
  it('stores in the person’s own studio folder', () => {
    expect(importPath('u1', 'mp4', 1763600000000, 'a!b?c')).toBe('u1/studio/video-1763600000000-abc.mp4');
  });

  it('names player pages, including subdomains, and not look-alikes', () => {
    expect(playerPageHost('www.youtube.com')).toBe('youtube.com');
    expect(playerPageHost('vm.tiktok.com')).toBe('tiktok.com');
    expect(playerPageHost('notyoutube.com')).toBeNull();
    expect(PLAYER_PAGE_HOSTS_FOR_TEST.length).toBeGreaterThan(10);
  });
});
