import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, it, expect } from 'vitest';

import {
  MAX_ENTRY_BYTES, asText, entryBytes, readDirectory, readZip, unsafeName, type ZipEntry,
} from './zip';

/* ── a ZIP built by hand, so the reader is tested against the format ────────
 *
 * Not against a fixture file somebody once generated: when a test fails, the
 * bytes that produced it are right here and can be changed one field at a
 * time.
 */

interface Part { name: string; data: Uint8Array; method?: number; declaredSize?: number }

function zipOf(parts: Part[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const part of parts) {
    const name = enc.encode(part.name);
    const method = part.method ?? 0;
    const size = part.declaredSize ?? part.data.byteLength;

    const local = new Uint8Array(30 + name.length + part.data.byteLength);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, part.data.byteLength, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(part.data, 30 + name.length);
    locals.push(local);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(10, method, true);
    dv.setUint32(20, part.data.byteLength, true);
    dv.setUint32(24, size, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);

    offset += local.byteLength;
  }

  const cdSize = central.reduce((n, b) => n + b.byteLength, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, parts.length, true);
  ev.setUint16(10, parts.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...locals, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, b) => n + b.byteLength, 0));
  let at = 0;
  for (const b of all) { out.set(b, at); at += b.byteLength; }
  return out;
}

const bytes = (s: string) => new TextEncoder().encode(s);
const inflate = async (d: Uint8Array) => d; /* identity: the format, not the codec */

describe('reading the directory', () => {
  it('finds every entry with its name and size', () => {
    const dir = readDirectory(zipOf([
      { name: 'a.xml', data: bytes('<a/>') },
      { name: 'ppt/media/image1.png', data: bytes('png') },
    ])) as ZipEntry[];
    expect(dir.map((e) => e.name)).toEqual(['a.xml', 'ppt/media/image1.png']);
    expect(dir[0].size).toBe(4);
  });

  it('refuses anything that is not a zip', () => {
    expect(readDirectory(bytes('not a zip at all, not even close'))).toHaveProperty('error');
  });

  it('refuses a file too small to hold a directory', () => {
    expect(readDirectory(bytes('PK'))).toHaveProperty('error');
  });

  it('refuses zip64 rather than reading its sentinel offsets as real ones', () => {
    const zip = zipOf([{ name: 'a.xml', data: bytes('<a/>') }]);
    /* The directory offset is the last field but one of the end record. */
    new DataView(zip.buffer).setUint32(zip.byteLength - 6, 0xffffffff, true);
    expect(readDirectory(zip)).toHaveProperty('error');
  });
});

describe('finding an entry\'s bytes', () => {
  /*
   * Through the LOCAL header, whose name and extra lengths are allowed to
   * differ from the directory's. Reading the directory's is a known way to
   * land a few bytes into the wrong place.
   */
  it('reads the data the local header points at', () => {
    const zip = zipOf([{ name: 'one.xml', data: bytes('first') }, { name: 'two.xml', data: bytes('second') }]);
    const dir = readDirectory(zip) as ZipEntry[];
    expect(asText(entryBytes(zip, dir[1]) as Uint8Array)).toBe('second');
  });

  it('refuses an offset that points outside the file', () => {
    const zip = zipOf([{ name: 'one.xml', data: bytes('first') }]);
    const dir = readDirectory(zip) as ZipEntry[];
    expect(entryBytes(zip, { ...dir[0], offset: 999999 })).toHaveProperty('error');
  });
});

describe('what is extracted', () => {
  it('only inflates what was asked for', async () => {
    const zip = zipOf([
      { name: 'ppt/presentation.xml', data: bytes('<p/>') },
      { name: 'docProps/thumbnail.jpeg', data: bytes('jpeg bytes') },
    ]);
    const out = await readZip(zip, (n) => n.startsWith('ppt/'), inflate) as Map<string, Uint8Array>;
    expect([...out.keys()]).toEqual(['ppt/presentation.xml']);
  });

  it('round-trips real deflate', async () => {
    const xml = '<presentation>'.padEnd(500, 'x') + '</presentation>';
    const zip = zipOf([{
      name: 'ppt/presentation.xml',
      data: new Uint8Array(deflateRawSync(Buffer.from(xml))),
      method: 8,
      declaredSize: xml.length,
    }]);
    const out = await readZip(
      zip,
      () => true,
      async (d) => new Uint8Array(inflateRawSync(Buffer.from(d))),
    ) as Map<string, Uint8Array>;
    expect(asText(out.get('ppt/presentation.xml')!)).toBe(xml);
  });

  it('skips an encoding it cannot read instead of failing the whole file', async () => {
    const zip = zipOf([
      { name: 'ppt/old.xml', data: bytes('compressed somehow'), method: 12 },
      { name: 'ppt/presentation.xml', data: bytes('<p/>') },
    ]);
    const out = await readZip(zip, () => true, inflate) as Map<string, Uint8Array>;
    expect([...out.keys()]).toEqual(['ppt/presentation.xml']);
  });
});

describe('an uploaded archive is untrusted', () => {
  it('knows a traversing name when it sees one', () => {
    expect(unsafeName('../../etc/passwd')).toBe(true);
    expect(unsafeName('ppt\\..\\..\\x')).toBe(true);
    expect(unsafeName('/etc/passwd')).toBe(true);
    expect(unsafeName('C:/windows/x')).toBe(true);
    expect(unsafeName('ppt/slides/slide1.xml')).toBe(false);
  });

  it('leaves a traversing entry out rather than matching it to a part', async () => {
    const zip = zipOf([
      { name: '../ppt/presentation.xml', data: bytes('<evil/>') },
      { name: 'ppt/presentation.xml', data: bytes('<real/>') },
    ]);
    const out = await readZip(zip, () => true, inflate) as Map<string, Uint8Array>;
    expect([...out.keys()]).toEqual(['ppt/presentation.xml']);
  });

  /*
   * ── THE ZIP BOMB ─────────────────────────────────────────────────────
   *
   * A declared size is a number the attacker chose. It is checked, and then
   * the bytes that actually come out are checked AGAIN, because a header
   * that lies about being small is the entire trick.
   */
  it('refuses an entry that declares more than the ceiling', async () => {
    const zip = zipOf([{ name: 'ppt/x.xml', data: bytes('tiny'), declaredSize: MAX_ENTRY_BYTES + 1 }]);
    expect(await readZip(zip, () => true, inflate)).toHaveProperty('error');
  });

  it('refuses an entry that lied and expanded past the ceiling anyway', async () => {
    const zip = zipOf([{ name: 'ppt/x.xml', data: bytes('tiny'), method: 8, declaredSize: 10 }]);
    const lying = async () => new Uint8Array(MAX_ENTRY_BYTES + 1);
    expect(await readZip(zip, () => true, lying)).toHaveProperty('error');
  });

  it('reports damage rather than throwing when inflation fails', async () => {
    const zip = zipOf([{ name: 'ppt/x.xml', data: bytes('not deflate'), method: 8 }]);
    const failing = async () => { throw new Error('bad data'); };
    expect(await readZip(zip, () => true, failing)).toHaveProperty('error');
  });
});
