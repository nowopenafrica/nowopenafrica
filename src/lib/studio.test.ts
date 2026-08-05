import { describe, it, expect, vi } from 'vitest';
import { profileUrl, slugForFile, shareLinks, BRAND_ORIGIN, dataUrlToBlob, downloadUrl } from './studio';

describe('studio helpers', () => {
  it('profileUrl points at the brand domain + username', () => {
    expect(profileUrl({ id: '1', username: 'meatclub' })).toBe(`${BRAND_ORIGIN}/meatclub`);
  });

  it('profileUrl falls back to /businesses/:id without a username', () => {
    expect(profileUrl({ id: 'abc', username: undefined })).toBe(`${BRAND_ORIGIN}/businesses/abc`);
  });

  it('slugForFile makes a filesystem-safe slug', () => {
    expect(slugForFile('Meat Club Nigeria!')).toBe('meat-club-nigeria');
    expect(slugForFile('')).toBe('nowopen');
  });

  it('shareLinks returns encoded targets for every channel', () => {
    const links = shareLinks('https://nowopenafrica.com/a', 'Hello There');
    expect(links.map((l) => l.key)).toEqual(['whatsapp', 'facebook', 'x', 'linkedin', 'telegram', 'email']);
    const wa = links.find((l) => l.key === 'whatsapp')!;
    expect(wa.href).toContain(encodeURIComponent('https://nowopenafrica.com/a'));
  });

  it('dataUrlToBlob decodes a base64 PNG data URL', () => {
    const blob = dataUrlToBlob(`data:image/png;base64,${btoa('fake-png-bytes')}`);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe('fake-png-bytes'.length);
  });

  it('dataUrlToBlob decodes a percent-encoded data URL', () => {
    const blob = dataUrlToBlob(`data:text/plain;charset=utf-8,${encodeURIComponent('hello world')}`);
    expect(blob.type).toBe('text/plain');
    expect(blob.size).toBe('hello world'.length);
  });

  it('downloadUrl converts data URLs to a blob and clicks a download link', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revoke = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    Object.assign(URL, { createObjectURL, revokeObjectURL: revoke });
    try {
      downloadUrl(`data:image/png;base64,${btoa('bytes')}`, 'card.png');
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(document.querySelector('a[download="card.png"]')).toBeNull();
      vi.advanceTimersByTime(11_000);
      expect(revoke).toHaveBeenCalledWith('blob:mock');
    } finally {
      click.mockRestore();
      vi.useRealTimers();
    }
  });
});
