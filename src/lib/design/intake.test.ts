import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { INDUSTRY_GROUPS } from './taxonomy';
import {
  ALLOWED_INDUSTRIES, KINDS, classifyUploadResponse, dominantColours, imageInfo, parseRow, seededLicenceKeys,
  sha256, svgInfo, toInsertRow, validateLibrarySvg,
} from '../../../scripts/assets/intake-lib.mjs';
import { needsWebCopy, webCopyPath } from '../../../scripts/assets/webcopy.mjs';

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

  it('tags people with no release as no-endorsement, the condition approval requires', () => {
    const r = ok({ contains_people: 'true', release_on_file: 'false' });
    expect(r.ok && r.value.tags).toEqual(['cafe', 'coffee', 'no-endorsement']);
    const released = ok({ contains_people: 'true', release_on_file: 'true' });
    expect(released.ok && released.value.tags).toEqual(['cafe', 'coffee']);
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
    expect(sha256(Buffer.from([0x61, 0x62, 0x63]))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
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

describe('validateLibrarySvg (allowlist, fails closed)', () => {
  // The security reviewer's probe: every vector must be REFUSED, not stripped.
  const w = (inner: string, attrs = '') =>
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10" ${attrs}>${inner}</svg>`;
  const attacks: Record<string, string> = {
    mixedCaseScript: w('<SCRIPT>alert(1)</SCRIPT>'),
    onloadSpace: w('', 'onload ="alert(1)"'),
    xlinkHrefJs: w('<a xlink:href="javascript:alert(1)"><rect/></a>'),
    xlinkHrefOnUse: w('<use xlink:href="javascript:alert(1)"/>'),
    hrefEntity: w('<use href=" jav&#x61;script:alert(1)"/>'),
    hrefDecimalEntity: w('<use href="jav&#97;script:alert(1)"/>'),
    hrefControlChars: w('<use href="java&#x09;script:alert(1)"/>'),
    foreignObject: w('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script><img src="x" onerror="alert(1)"/></div></foreignObject>'),
    useData: w('<use href="data:image/svg+xml;base64,AAAA#x"/>'),
    useExternal: w('<use href="https://evil.example/a.svg#x"/>'),
    imageHttp: w('<image href="http://evil/x.png"/>'),
    animate: w('<animate attributeName="href" to="javascript:alert(1)"/>'),
    cdata: w('<![CDATA[</text>]]><script>alert(1)</script>'),
    commentHidesNothing: w('<!-- <rect/> --><script>alert(1)</script>'),
    styleImport: w('<style>@import url(https://evil/x.css); a{fill:url(//evil/y)}</style>'),
    jsInPlainAttribute: w('<rect fill="javascript:alert(1)"/>'),
    jsInPlainAttributeEncoded: w('<text font-family="java&#x09;script:alert(1)">x</text>'),
    styleAttribute: w('<rect style="fill:red"/>'),
    classAttribute: w('<rect class="a"/>'),
    urlProtocolRelative: w('<rect fill="url(//evil/x)"/>'),
    urlEntityEncoded: w('<rect fill="u&#114;l(//evil/x)"/>'),
    urlHttp: w('<rect fill="url(https://evil/x)"/>'),
    prefixedScript: w('<x:script xmlns:x="http://www.w3.org/2000/svg">alert(document.domain)</x:script>'),
    prefixedHref: w('<use xmlns:l="http://www.w3.org/1999/xlink" l:href="jav&#x61;script:alert(document.domain)"/>'),
    xhtmlIframeSrcdoc: w('<h:iframe xmlns:h="http://www.w3.org/1999/xhtml" srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"/>'),
    xmlStylesheet: `<?xml-stylesheet type="text/xsl" href="https://evil/x.xsl"?>${w('<rect/>')}`,
    secondPi: w('<?php echo 1 ?>'),
    doctype: `<!DOCTYPE svg [<!ENTITY x "y">]>${w('<rect/>')}`,
    entityDecl: `<!ENTITY x "y">${w('<rect/>')}`,
    badXmlns: '<svg xmlns="http://www.w3.org/1999/xhtml"></svg>',
    stringTextInSvg: w('hello'),
    unquotedAttr: w('<rect width=10/>'),
    unbalanced: w('<g><rect/>'),
    unterminatedComment: w('<!-- never closed <script>'),
    notSvg: '<html><body></body></html>',
  };
  for (const [name, text] of Object.entries(attacks)) {
    it(`refuses ${name}`, () => {
      const r = validateLibrarySvg(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    });
  }

  it('passes a realistic clean icon (paths, a gradient, a same-document use)', () => {
    const icon = `<?xml version="1.0" encoding="UTF-8"?>
<!-- exported from a design tool -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="url(#g)" stroke-width="2">
  <title>Coffee</title>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a7d4b"/><stop offset="1" stop-color="#facc15" stop-opacity="0.9"/></linearGradient>
    <clipPath id="c"><rect width="24" height="24"/></clipPath>
    <path id="cup" d="M3 8h13v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/>
  </defs>
  <g clip-path="url(#c)">
    <use href="#cup"/>
    <use xlink:href="#cup" transform="translate(1 1)"/>
    <path d="M16 10h2a3 3 0 0 1 0 6h-2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="2" y="22" font-family="sans-serif" font-size="3">Hot &amp; fresh</text>
  </g>
</svg>`;
    const r = validateLibrarySvg(icon);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.svg).toContain('<?xml version');
      expect(r.svg).not.toContain('exported from');
      expect(r.svg).toContain('<linearGradient');
    }
  });

  it('is case-insensitive on element names after the allowlist, and never edits the artwork', () => {
    const clean = w('<G><Rect width="1" height="1"/></G>');
    expect(validateLibrarySvg(clean)).toEqual({ ok: true, svg: clean });
  });
});

describe('classifyUploadResponse', () => {
  it('treats 2xx as uploaded', () => {
    expect(classifyUploadResponse(200, '{"Key":"x"}')).toBe('uploaded');
  });
  it('accepts a Duplicate body (Supabase answers 400) or statusCode 409 as already existing', () => {
    expect(classifyUploadResponse(400, '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}')).toBe('exists');
    expect(classifyUploadResponse(400, '{"error":"Duplicate"}')).toBe('exists');
    expect(classifyUploadResponse(409, '{"statusCode":"409"}')).toBe('exists');
  });
  it('treats every other failure as failed, even a bare 409 or any other 400', () => {
    expect(classifyUploadResponse(400, '{"statusCode":"400","error":"Invalid","message":"bad mime"}')).toBe('failed');
    expect(classifyUploadResponse(400, 'not json')).toBe('failed');
    expect(classifyUploadResponse(409, '')).toBe('failed');
    expect(classifyUploadResponse(413, '{"error":"Payload too large"}')).toBe('failed');
    expect(classifyUploadResponse(500, '{"error":"Duplicate key in log"}')).toBe('failed');
  });
});

describe('retrieved_at', () => {
  it('is optional, validated, and used by toInsertRow when present', () => {
    expect(parseRow({ ...pexels }, LICENCES)).toMatchObject({ ok: true, value: { retrieved_at: null } });
    expect(parseRow({ ...pexels, retrieved_at: 'yesterday' }, LICENCES).ok).toBe(false);
    const r = parseRow({ ...pexels, retrieved_at: '2026-10-01' }, LICENCES);
    if (!r.ok) throw new Error(r.reason);
    expect(r.value.retrieved_at).toBe('2026-10-01T00:00:00.000Z');
    const m = {
      sha256: 'a'.repeat(64), ext: 'png', mime: 'image/png', bytes: 1, width: 1, height: 1, colours: [],
      storagePath: 'p.png', evidencePath: 'evidence/e.png', sanitisedAt: null, now: '2026-11-08T00:00:00.000Z',
    };
    expect(toInsertRow(r.value, m)).toMatchObject({ retrieved_at: '2026-10-01T00:00:00.000Z' });
    const d = parseRow({ ...pexels }, LICENCES);
    if (!d.ok) throw new Error(d.reason);
    expect(toInsertRow(d.value, m)).toMatchObject({ retrieved_at: m.now });
  });

  it('records the web-size copy in thumb_path, or none', () => {
    const d = parseRow({ ...pexels }, LICENCES);
    if (!d.ok) throw new Error(d.reason);
    const m = {
      sha256: 'a'.repeat(64), ext: 'jpeg', mime: 'image/jpeg', bytes: 1, width: 1, height: 1, colours: [],
      storagePath: 'p.jpg', evidencePath: 'evidence/e.png', sanitisedAt: null, now: '2026-11-08T00:00:00.000Z',
    };
    expect(toInsertRow(d.value, m)).toMatchObject({ thumb_path: null });
    expect(toInsertRow(d.value, { ...m, thumbPath: webCopyPath(m.sha256) })).toMatchObject({ thumb_path: `web/${'a'.repeat(64)}.jpg` });
    expect(needsWebCopy('photo', 'image/jpeg')).toBe(true);
    expect(needsWebCopy('vector', 'image/svg+xml')).toBe(false);
    expect(needsWebCopy('photo', 'image/svg+xml')).toBe(false);
  });
});

describe('PNG decoding limits', () => {
  it('does not decode an absurd width but still reports its size', () => {
    // A header claiming 40000 x 2 with a tiny IDAT: dimensions only, no colours, no crash.
    const png = makePng(8, 4, [1, 2, 3]);
    png.writeUInt32BE(40000, 16);
    expect(imageInfo(png, 'image/png')).toMatchObject({ width: 40000, height: 4, colours: [] });
  });
  it('refuses a stream that inflates past its declared size', () => {
    const png = makePng(8, 4, [1, 2, 3]);
    png.writeUInt32BE(1, 16); // claims 1 x 4: the real data is larger than that
    expect(imageInfo(png, 'image/png')).toMatchObject({ width: 1, height: 4, colours: [] });
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
