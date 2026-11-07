/**
 * Which characters a font file can actually draw.
 *
 * NODE ONLY. This reads font files from disk in tests and audits (it uses
 * node:zlib), and must never be imported by anything the browser bundles.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The Studio faces used to ship as Google's `latin` subset: about 220 glyphs,
 * with no ₦, no ₵, no Yoruba dot-below letters, no Hausa hooked letters and no
 * Akan/Ewe ɛ ɔ. The demo copy set ₦ in 33 places, so every one of those prices
 * was drawn in a fallback face while the design claimed to be Outfit or
 * Playfair. A missing glyph does not error: the browser quietly borrows one
 * from the next font in the stack, and the export looks almost right.
 *
 * So coverage is read from the file itself, from its `cmap` table, rather than
 * from a family's marketing page or a subset's name.
 *
 * Reads WOFF2 (brotli), WOFF 1.0 (zlib), and bare OpenType/TrueType.
 */
import { brotliDecompressSync, inflateSync } from 'node:zlib';

/** WOFF2's known-table index (spec §5.1). A tag byte of 63 means "spelled out". */
const WOFF2_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
  'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

function woff2Cmap(buf: Buffer): Buffer {
  const numTables = buf.readUInt16BE(12);
  const compressedLength = buf.readUInt32BE(20);
  let o = 48;
  const base128 = (): number => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const c = buf[o++];
      v = v * 128 + (c & 0x7f);
      if (!(c & 0x80)) return v;
    }
    throw new Error('woff2: bad UIntBase128');
  };

  const dir: { tag: string; len: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[o++];
    const tag = (flags & 63) === 63 ? buf.toString('latin1', o, (o += 4)) : WOFF2_TAGS[flags & 63];
    const version = flags >> 6;
    let len = base128();
    // glyf and loca are transformed at version 0; every other table at non-zero.
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    if (transformed) len = base128();
    dir.push({ tag, len });
  }

  // Tables sit back to back in one brotli stream, in directory order.
  const data = brotliDecompressSync(buf.subarray(o, o + compressedLength));
  let off = 0;
  for (const d of dir) {
    if (d.tag === 'cmap') return data.subarray(off, off + d.len);
    off += d.len;
  }
  throw new Error('woff2: no cmap table');
}

function woffCmap(buf: Buffer): Buffer {
  const numTables = buf.readUInt16BE(12);
  for (let i = 0; i < numTables; i++) {
    const r = 44 + 20 * i;
    if (buf.toString('latin1', r, r + 4) !== 'cmap') continue;
    const offset = buf.readUInt32BE(r + 4);
    const compLength = buf.readUInt32BE(r + 8);
    const origLength = buf.readUInt32BE(r + 12);
    const raw = buf.subarray(offset, offset + compLength);
    // A table is stored uncompressed when zlib would not have made it smaller.
    return compLength < origLength ? inflateSync(raw) : raw;
  }
  throw new Error('woff: no cmap table');
}

function sfntCmap(buf: Buffer): Buffer {
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const r = 12 + 16 * i;
    if (buf.toString('latin1', r, r + 4) !== 'cmap') continue;
    const offset = buf.readUInt32BE(r + 8);
    return buf.subarray(offset, offset + buf.readUInt32BE(r + 12));
  }
  throw new Error('sfnt: no cmap table');
}

/** Only Unicode subtables: a Mac Roman or Symbol table would map the wrong code points. */
const isUnicode = (platform: number, encoding: number): boolean =>
  platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));

function parseCmap(t: Buffer): Set<number> {
  const set = new Set<number>();
  const numSubtables = t.readUInt16BE(2);
  for (let i = 0; i < numSubtables; i++) {
    const rec = 4 + 8 * i;
    if (!isUnicode(t.readUInt16BE(rec), t.readUInt16BE(rec + 2))) continue;
    const off = t.readUInt32BE(rec + 4);
    const format = t.readUInt16BE(off);

    if (format === 4) {
      const segX2 = t.readUInt16BE(off + 6);
      const ends = off + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const end = t.readUInt16BE(ends + s);
        const start = t.readUInt16BE(starts + s);
        const delta = t.readUInt16BE(deltas + s);
        const rangeOffset = t.readUInt16BE(ranges + s);
        for (let c = start; c <= end && c < 0xffff; c++) {
          // A code point inside a segment can still map to .notdef (glyph 0).
          let glyph: number;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            glyph = t.readUInt16BE(ranges + s + rangeOffset + 2 * (c - start));
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) set.add(c);
        }
      }
    } else if (format === 12) {
      const groups = t.readUInt32BE(off + 12);
      for (let g = 0; g < groups; g++) {
        const b = off + 16 + 12 * g;
        const start = t.readUInt32BE(b);
        const end = t.readUInt32BE(b + 4);
        const startGlyph = t.readUInt32BE(b + 8);
        for (let c = start; c <= end; c++) if (startGlyph + (c - start) !== 0) set.add(c);
      }
    }
  }
  return set;
}

/** Every Unicode code point the font maps to a real glyph. */
export function codepointsOf(file: Buffer): Set<number> {
  const sig = file.toString('latin1', 0, 4);
  if (sig === 'wOF2') return parseCmap(woff2Cmap(file));
  if (sig === 'wOFF') return parseCmap(woffCmap(file));
  if (sig === 'OTTO' || sig === 'true' || file.readUInt32BE(0) === 0x00010000) return parseCmap(sfntCmap(file));
  throw new Error(`not a font file (signature ${JSON.stringify(sig)})`);
}

/**
 * The characters each supported language and currency needs (spec §12).
 *
 * Precomposed letters where Unicode has them, plus the two combining tone marks
 * (U+0300 grave, U+0301 acute) that Yoruba and Igbo stack on dot-below vowels,
 * which have no precomposed form (ẹ̀, ọ́).
 */
const BASIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TONES = 'ÀÁÈÉÌÍÒÓÙÚàáèéìíòóùú̀́';

export const SUPPORTED_CHARS: Record<string, string> = {
  english: `${BASIC}.,;:!?'"()&@#%/-–—‘’“”…`,
  french: 'ÀÂÆÇÉÈÊËÎÏÔŒÙÛÜŸàâæçéèêëîïôœùûüÿ«»',
  portuguese: 'ÁÀÂÃÇÉÊÍÓÔÕÚáàâãçéêíóôõúªº',
  swahili: BASIC,
  yoruba: `ẸẹỌọṢṣŃńǸǹḾḿ${TONES}`,
  igbo: `ỊịỌọỤụṄṅŃń${TONES}`,
  hausa: 'ƁɓƊɗƘƙƳƴ',
  twi_akan: `ƐɛƆɔ${TONES}`,
  ewe: `ƐɛƆɔƉɖŊŋƲʋƑƒƔɣ${TONES}`,
  zulu: BASIC,
  kinyarwanda: BASIC,
  // ₦ U+20A6 naira, ₵ U+20B5 cedi; the rest are written in letters.
  currency: '₦₵ KSh R RWF USh TSh',
};

/**
 * Supported characters that NO family we are approved to ship can draw.
 *
 * Read from the upstream files at google/fonts 86aced9 (2026-11-07): Hausa
 * Ƙ ƙ Ƴ ƴ and the Ewe capitals Ɖ Ʋ Ƒ are absent from all ten, including
 * Source Sans 3, the widest. Listed rather than hidden: fontCoverage.test.ts
 * checks that each one really is missing everywhere, so the day a face that
 * has them is added, this list has to shrink. Closing it needs one more OFL
 * family with full African Latin, which is a founder decision.
 */
export const UPSTREAM_GAPS = 'ƘƙƳƴƉƲƑ';

/** Characters that never need a glyph: line breaks and tabs. */
const IGNORED = new Set([0x09, 0x0a, 0x0d]);

/**
 * The characters in `chars` this font cannot draw, each once, in first-seen
 * order. An empty string means it covers them all.
 */
export function missingChars(file: Buffer, chars: string): string {
  const have = codepointsOf(file);
  const missing = new Set<string>();
  for (const ch of chars) {
    const cp = ch.codePointAt(0) as number;
    if (!IGNORED.has(cp) && !have.has(cp)) missing.add(ch);
  }
  return [...missing].join('');
}
