import { describe, it, expect } from 'vitest';

import {
  ARTWORK_MAX_BYTES, ARTWORK_TYPES, artworkPath, checkArtwork, safeArtworkName,
} from './artwork';

const file = (name: string, size = 1024, type = 'application/pdf') => ({ name, size, type });

describe('what we will accept', () => {
  it('takes the four things print-ready artwork actually arrives as', () => {
    expect(checkArtwork(file('flyer.pdf', 1024, 'application/pdf')).ok).toBe(true);
    expect(checkArtwork(file('logo.png', 1024, 'image/png')).ok).toBe(true);
    expect(checkArtwork(file('shot.jpg', 1024, 'image/jpeg')).ok).toBe(true);
    expect(checkArtwork(file('art.webp', 1024, 'image/webp')).ok).toBe(true);
  });

  it('trusts the extension when the browser reports no type', () => {
    // Windows hands over an empty type for some PDFs. Refusing a valid file is
    // worse than letting the bucket refuse an invalid one a second later.
    expect(checkArtwork(file('flyer.pdf', 1024, '')).ok).toBe(true);
  });

  it('refuses SVG, whatever it claims to be', () => {
    // The bucket is private, but a signed URL renders in a staff browser and an
    // SVG is a script running on the storage origin.
    expect(ARTWORK_TYPES).not.toContain('image/svg+xml');
    expect(checkArtwork(file('logo.svg', 1024, 'image/svg+xml')).ok).toBe(false);
  });

  it('refuses anything executable', () => {
    for (const name of ['payload.exe', 'macro.docm', 'script.html', 'archive.zip']) {
      expect(checkArtwork(file(name, 1024, 'application/octet-stream')).ok, name).toBe(false);
    }
  });

  it('refuses an empty file and one over the limit, and says why', () => {
    expect(checkArtwork(file('flyer.pdf', 0)).ok).toBe(false);
    const big = checkArtwork(file('flyer.pdf', ARTWORK_MAX_BYTES + 1));
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.reason).toMatch(/25MB/);
  });
});

describe('the stored name', () => {
  it('keeps the stem, so whoever prints it knows what it is', () => {
    expect(safeArtworkName('Ankara Sale Flyer.PDF')).toBe('ankara-sale-flyer.pdf');
  });

  it('cannot escape its folder', () => {
    for (const evil of ['../../etc/passwd.png', 'a/b/c.png', '..\\win.png']) {
      const safe = safeArtworkName(evil);
      expect(safe).not.toContain('/');
      expect(safe).not.toContain('\\');
      expect(safe).not.toContain('..');
    }
  });

  it('never produces a nameless file', () => {
    expect(safeArtworkName('...')).toMatch(/^artwork\./);
    expect(safeArtworkName('')).toMatch(/^artwork\./);
  });

  it('does not carry an extension we did not accept', () => {
    expect(safeArtworkName('thing.exe')).toBe('thing.dat');
  });
});

describe('the path the order declares', () => {
  it('lives under the reference, which is what authorises the upload', () => {
    const path = artworkPath('NOC-8H3KM-2QW9T', 'My Flyer.pdf');
    expect(path).toBe('NOC-8H3KM-2QW9T/my-flyer.pdf');
  });

  it('stays inside the reference folder however the file was named', () => {
    const path = artworkPath('NOC-8H3KM-2QW9T', '../../NOC-OTHER/steal.pdf');
    expect(path.split('/')).toHaveLength(2);
    expect(path.startsWith('NOC-8H3KM-2QW9T/')).toBe(true);
  });
});
