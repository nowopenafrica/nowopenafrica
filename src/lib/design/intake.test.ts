import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { INDUSTRY_GROUPS } from './taxonomy';
import {
  ALLOWED_INDUSTRIES, KINDS, dominantColours, imageInfo, parseRow, sanitiseSvg, seededLicenceKeys,
  sha256, svgInfo, toInsertRow,
} from '../../../scripts/assets/intake-lib.mjs';

const MIGRATION = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20261114010000_design_asset_library.sql'), 'utf8',
);
const LICENCES = seededLicenceKeys(MIGRATION);

const pexels = {
  file: 'cafe.png', kind: 'photo', title: 'Cafe interior', description: 'A warm cafe',
  tags: 'cafe;coffee', subjects: 'interior', industries: 'Food & Hospitality', regions: 'NG;GH',
  source_name: 'Pexels', source_url: 'https://www.pexels.com/photo/123/', source_asset_id: '123',
  creator_name: 'A Photographer', creator_url: 'https://www.pexels.com/@a', licence_key: 'pexels',
  evidence_file: 'cafe-licence.png', attribution_text: 'Photo by A Photographer on Pexels',
  restrictions: '', contains_people: 'false', contains_brands: 'false', release_on_file: 'false',
};

describe('the seeded licence keys', () => {
  it('reads all 12 from the migration, and no Canva, Freepik or unknown key', () => {
    expect(LICENCES).toHaveLength(12);
    expect(LICENCES).toContain('pexels');
    expect(LICENCES.some((k: string) => /canva|freepik|unknown/.test(k))).toBe(false);
  });
});

describe('parseRow', () => {
  const ok = (over: Record<string, string> = {}) => parseRow({ ...pexels, ...over }, LICENCES);

  it('accepts a full Pexels row', () => {
    const r = ok();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.tags).toEqual(['cafe', 'coffee']);
      expect(r.value.regions).toEqual(['NG', 'GH']);
      expect(r.value.industries).toEqual(['Food & Hospitality']);
      expect(r.value.contains_people).toBe(false);
      expect(r.value.licence_key).toBe('pexels');
    }
  });

  it('rejects an unknown licence', () => {
    const r = ok({ licence_key: 'canva-pro' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/licence/i);
  });

  it('rejects a missing evidence file', () => {
    expect(ok({ evidence_file: '' }).ok).toBe(false);
    expect(ok({ evidence_file: '   ' }).ok).toBe(false);
  });

  it('rejects canva.com and freepik.com sources, subdomains included', () => {
    for (const url of ['https://www.canva.com/photos/x', 'https://canva.com/x', 'https://img.freepik.com/a', 'https://freepik.com/a']) {
      const r = ok({ source_url: url });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/canva|freepik/i);
    }
    expect(ok({ source_url: 'https://notcanva.com/x' }).ok).toBe(true);
  });

  it('rejects the Unsplash API but not a manual Unsplash download', () => {
    const api = ok({ source_name: 'Unsplash API', source_url: 'https://unsplash.com/photos/abc', licence_key: 'unsplash' });
    expect(api.ok).toBe(false);
    if (!api.ok) expect(api.reason).toMatch(/manual/i);
    expect(ok({ source_name: 'Unsplash', source_url: 'https://unsplash.com/photos/abc', licence_key: 'unsplash' }).ok).toBe(true);
  });

  it('rejects a kind outside the schema', () => {
    expect(ok({ kind: 'font' }).ok).toBe(false);
    expect(KINDS).toContain('mockup_scene');
  });

  it('rejects a file that is not PNG, JPEG, WebP or SVG', () => {
    for (const f of ['x.gif', 'x.ttf', 'x.woff2', 'x.pdf', 'x']) expect(ok({ file: f }).ok).toBe(false);
    for (const f of ['x.PNG', 'x.jpg', 'x.jpeg', 'x.webp', 'x.svg']) expect(ok({ file: f }).ok).toBe(true);
  });

  it('refuses contains_brands, which can never be approved', () => {
    const r = ok({ contains_brands: 'true' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/brand/i);
  });

  it('rejects an industry that is not a category group', () => {
    expect(ok({ industries: 'Food & Hospitality;Spaceships' }).ok).toBe(false);
  });

  it('rejects a malformed region and an unreadable boolean', () => {
    expect(ok({ regions: 'Nigeria' }).ok).toBe(false);
    expect(ok({ contains_people: 'maybe' }).ok).toBe(false);
  });

  it('requires a title and a source name', () => {
    expect(ok({ title: '' }).ok).toBe(false);
    expect(ok({ source_name: '' }).ok).toBe(false);
  });
});

describe('industry list', () => {
  it('matches INDUSTRY_GROUPS in the app', () => {
    expect([...ALLOWED_INDUSTRIES]).toEqual(INDUSTRY_GROUPS);
  });
});

describe('sha256', () => {
  it('hashes a buffer (known vector)', () => {
    expect(sha256(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('dominantColours', () => {
  it('returns the two colours of a two-colour buffer, most common first', () => {
    const px = (r: number, g: number, b: number, n: number) => Array(n).fill([r, g, b, 255]).flat();
    const rgba = new Uint8Array([...px(255, 0, 0, 30), ...px(0, 0, 255, 10)]);
    expect(dominantColours(rgba)).toEqual(['#ff0000', '#0000ff']);
  });

  it('merges near colours into one bucket, ignores transparent pixels, and honours n', () => {
    const rgba = new Uint8Array([
      250, 3, 3, 255, 255, 0, 0, 255, 0, 0, 0, 0, // two near-reds and a transparent pixel
      0, 255, 0, 255, 0, 0, 255, 255,
    ]);
    const out = dominantColours(rgba, 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^#[0-9a-f]{6}$/);
    expect(out[0].startsWith('#f')).toBe(true);
  });
});

/** A minimal valid PNG of solid colour, built by hand. */
function makePng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(w).fill(rgb).flat())]);
  const raw = Buffer.concat(Array(h).fill(row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('imageInfo (header readers)', () => {
  it('reads PNG size and decodes its colours', () => {
    const info = imageInfo(makePng(8, 4, [255, 0, 0]), 'image/png');
    expect(info).toMatchObject({ width: 8, height: 4, colours: ['#ff0000'] });
  });

  it('reads JPEG size from the SOF marker', () => {
    const jpg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // SOI, APP0 (len 4)
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x01, 0x01, 0x11, 0x00, // SOF0: h=300 w=600
    ]);
    expect(imageInfo(jpg, 'image/jpeg')).toMatchObject({ width: 600, height: 300, colours: [] });
  });

  it('reads WebP size (lossy, lossless and extended)', () => {
    const head = (fourcc: string, payload: Buffer) => Buffer.concat([
      Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from(fourcc), Buffer.alloc(4), payload,
    ]);
    const vp8 = Buffer.alloc(10); vp8.set([0x9d, 0x01, 0x2a], 3); vp8.writeUInt16LE(640, 6); vp8.writeUInt16LE(480, 8);
    expect(imageInfo(head('VP8 ', vp8), 'image/webp')).toMatchObject({ width: 640, height: 480 });

    const vp8l = Buffer.alloc(5); vp8l[0] = 0x2f;
    vp8l.writeUInt32LE(((100 - 1) | ((50 - 1) << 14)) >>> 0, 1);
    expect(imageInfo(head('VP8L', vp8l), 'image/webp')).toMatchObject({ width: 100, height: 50 });

    const vp8x = Buffer.alloc(10); vp8x.writeUIntLE(1000 - 1, 4, 3); vp8x.writeUIntLE(250 - 1, 7, 3);
    expect(imageInfo(head('VP8X', vp8x), 'image/webp')).toMatchObject({ width: 1000, height: 250 });
  });

  it('returns null for a buffer that is not the claimed format', () => {
    expect(imageInfo(Buffer.from('not an image'), 'image/png')).toBeNull();
    expect(imageInfo(Buffer.from('not an image'), 'image/jpeg')).toBeNull();
    expect(imageInfo(Buffer.from('not an image'), 'image/webp')).toBeNull();
  });
});

describe('sanitiseSvg (text)', () => {
  const svg = (inner: string, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" ${attrs}>${inner}</svg>`;

  it('strips a <script> element and says so', () => {
    const r = sanitiseSvg(svg('<script>alert(1)</script><rect width="10" height="10"/>'));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.svg).not.toMatch(/script/i); expect(r.svg).toContain('<rect'); expect(r.removed).toContain('script'); }
  });

  it('strips on* handlers, in either quote style', () => {
    const r = sanitiseSvg(svg(`<rect onclick="x()" onload='y()' width="10"/>`, 'onload="z()"'));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.svg).not.toMatch(/\son[a-z]+\s*=/i); expect(r.svg).toContain('width="10"'); }
  });

  it('strips foreignObject whatever its capitalisation, and external hrefs', () => {
    const r = sanitiseSvg(svg('<ForeignObject><div/></ForeignObject><use href="https://evil.example/a.svg#x"/><use href="#ok"/>'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.svg).not.toMatch(/foreignobject/i);
      expect(r.svg).not.toContain('evil.example');
      expect(r.svg).toContain('href="#ok"');
    }
  });

  it('strips a javascript: href, and a script hidden by nesting', () => {
    const a = sanitiseSvg(svg('<a href="javascript:alert(1)"><rect/></a>'));
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.svg).not.toMatch(/javascript:/i);
    const b = sanitiseSvg(svg('<scr<script>ipt>alert(1)</scr</script>ipt>'));
    if (b.ok) expect(b.svg).not.toMatch(/<script/i);
  });

  it('rejects what it cannot make safe', () => {
    const r = sanitiseSvg(svg('<style>.a{background:url(javascript:alert(1))}</style>'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/javascript:/);
  });

  it('rejects text that is not an SVG', () => {
    expect(sanitiseSvg('<html></html>').ok).toBe(false);
  });

  it('leaves a clean SVG untouched', () => {
    const clean = svg('<g id="a"><path d="M0 0L10 10"/></g>');
    expect(sanitiseSvg(clean)).toEqual({ ok: true, svg: clean, removed: [] });
  });
});

describe('svgInfo', () => {
  it('reads size from viewBox, then width/height', () => {
    expect(svgInfo('<svg viewBox="0 0 120 60"></svg>')).toMatchObject({ width: 120, height: 60 });
    expect(svgInfo('<svg width="30px" height="20"></svg>')).toMatchObject({ width: 30, height: 20 });
    expect(svgInfo('<svg></svg>')).toMatchObject({ width: null, height: null });
  });
});

describe('toInsertRow', () => {
  it('builds a draft row that sets sanitised_at for an SVG and nothing it should not', () => {
    const parsed = parseRow({ ...pexels, file: 'a.svg' }, LICENCES);
    if (!parsed.ok) throw new Error(parsed.reason);
    const row = toInsertRow(parsed.value, {
      sha256: 'a'.repeat(64), ext: 'svg', mime: 'image/svg+xml', bytes: 10, width: 100, height: 50,
      colours: [], storagePath: `${'a'.repeat(64)}.svg`, evidencePath: `evidence/${'b'.repeat(64)}.png`,
      sanitisedAt: '2026-11-08T00:00:00.000Z', now: '2026-11-08T00:00:00.000Z',
    });
    expect(row).toMatchObject({
      status: 'draft', mime: 'image/svg+xml', orientation: 'landscape', sanitised_at: '2026-11-08T00:00:00.000Z',
      storage_path: `${'a'.repeat(64)}.svg`, licence_evidence_path: `evidence/${'b'.repeat(64)}.png`,
    });
    expect(row).not.toHaveProperty('reviewed_by');
    expect(row).not.toHaveProperty('file');
    expect(row).not.toHaveProperty('evidence_file');
  });
});
