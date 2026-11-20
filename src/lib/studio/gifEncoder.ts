/**
 * A small animated-GIF encoder for Video Studio's GIF export.
 *
 * Each frame gets its own 256-colour palette by median cut over a 15-bit
 * colour histogram (good for gradients, unlike a fixed web palette), pixels
 * map to the nearest palette entry through a 32,768-entry lookup, and the
 * indices are LZW-compressed as GIF89a requires. Loops forever.
 *
 * Written here rather than added as a package: it is ~200 lines, has no
 * dependencies, and is tested against the format's own structure.
 */

export class ByteWriter {
  private buf = new Uint8Array(1 << 16);
  private len = 0;
  byte(b: number) { if (this.len >= this.buf.length) this.grow(1); this.buf[this.len++] = b & 0xff; }
  word(w: number) { this.byte(w); this.byte(w >> 8); }
  bytes(a: ArrayLike<number>) { this.grow(a.length); for (let i = 0; i < a.length; i++) this.buf[this.len++] = a[i]; }
  str(s: string) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
  private grow(n: number) {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  done(): Uint8Array { return this.buf.slice(0, this.len); }
}

type Box = { r0: number; r1: number; g0: number; g1: number; b0: number; b1: number; colors: number[] };

/** Median-cut palette of up to 256 colours from RGBA pixels. Returns [r,g,b,...] (length 768, padded). */
export function buildPalette(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const hist = new Uint32Array(32768);
  for (let i = 0; i < rgba.length; i += 4) hist[((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3)]++;
  const used: number[] = [];
  for (let c = 0; c < 32768; c++) if (hist[c]) used.push(c);
  const r = (c: number) => (c >> 10) & 31;
  const g = (c: number) => (c >> 5) & 31;
  const b = (c: number) => c & 31;
  const fit = (colors: number[]): Box => {
    const box: Box = { r0: 31, r1: 0, g0: 31, g1: 0, b0: 31, b1: 0, colors };
    for (const c of colors) {
      box.r0 = Math.min(box.r0, r(c)); box.r1 = Math.max(box.r1, r(c));
      box.g0 = Math.min(box.g0, g(c)); box.g1 = Math.max(box.g1, g(c));
      box.b0 = Math.min(box.b0, b(c)); box.b1 = Math.max(box.b1, b(c));
    }
    return box;
  };
  const boxes: Box[] = used.length ? [fit(used)] : [];
  while (boxes.length < 256) {
    /* Split the box with the most pixels along its widest side. */
    let bi = -1; let best = 0;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      if (bx.colors.length < 2) continue;
      const weight = bx.colors.reduce((n, c) => n + hist[c], 0) * Math.max(bx.r1 - bx.r0, bx.g1 - bx.g0, bx.b1 - bx.b0);
      if (weight > best) { best = weight; bi = i; }
    }
    if (bi < 0) break;
    const bx = boxes[bi];
    const dr = bx.r1 - bx.r0; const dg = bx.g1 - bx.g0; const db = bx.b1 - bx.b0;
    const key = dr >= dg && dr >= db ? r : dg >= db ? g : b;
    const sorted = bx.colors.slice().sort((x, y) => key(x) - key(y));
    const total = sorted.reduce((n, c) => n + hist[c], 0);
    let acc = 0; let cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) { acc += hist[sorted[i]]; if (acc >= total / 2) { cut = i + 1; break; } }
    boxes.splice(bi, 1, fit(sorted.slice(0, cut)), fit(sorted.slice(cut)));
  }
  const pal = new Uint8Array(768);
  boxes.forEach((bx, i) => {
    let n = 0; let sr = 0; let sg = 0; let sb = 0;
    for (const c of bx.colors) { const w = hist[c]; n += w; sr += r(c) * w; sg += g(c) * w; sb += b(c) * w; }
    const k = n || 1;
    pal[i * 3] = Math.round((sr / k) * 255 / 31);
    pal[i * 3 + 1] = Math.round((sg / k) * 255 / 31);
    pal[i * 3 + 2] = Math.round((sb / k) * 255 / 31);
  });
  return pal;
}

/** Palette index for every pixel, through a lookup keyed by the 15-bit colour. */
export function indexPixels(rgba: Uint8ClampedArray | Uint8Array, pal: Uint8Array): Uint8Array {
  const lookup = new Int16Array(32768).fill(-1);
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    const key = ((rgba[i] >> 3) << 10) | ((rgba[i + 1] >> 3) << 5) | (rgba[i + 2] >> 3);
    let idx = lookup[key];
    if (idx < 0) {
      let best = 0; let bestD = Infinity;
      for (let j = 0; j < 256; j++) {
        const dr = pal[j * 3] - rgba[i]; const dg = pal[j * 3 + 1] - rgba[i + 1]; const db = pal[j * 3 + 2] - rgba[i + 2];
        const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (d < bestD) { bestD = d; best = j; if (d === 0) break; }
      }
      idx = best;
      lookup[key] = idx;
    }
    out[p] = idx;
  }
  return out;
}

/** GIF LZW, 8-bit minimum code size, emitted as data sub-blocks. */
export function lzw(indices: Uint8Array, w: ByteWriter): void {
  const minCode = 8;
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let codeSize = minCode + 1;
  let next = eoi + 1;
  let dict = new Map<number, number>();
  const block: number[] = [];
  let cur = 0; let bits = 0;
  const emit = (code: number) => {
    cur |= code << bits; bits += codeSize;
    while (bits >= 8) { block.push(cur & 0xff); cur >>>= 8; bits -= 8; if (block.length === 255) { w.byte(255); w.bytes(block); block.length = 0; } }
  };
  w.byte(minCode);
  emit(clear);
  let prefix = indices.length ? indices[0] : 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      dict = new Map();
      codeSize = minCode + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  if (indices.length) emit(prefix);
  emit(eoi);
  if (bits > 0) { block.push(cur & 0xff); if (block.length === 255) { w.byte(255); w.bytes(block); block.length = 0; } }
  if (block.length) { w.byte(block.length); w.bytes(block); }
  w.byte(0);
}

export class GifEncoder {
  private w = new ByteWriter();
  constructor(private width: number, private height: number) {
    const w = this.w;
    w.str('GIF89a');
    w.word(width); w.word(height);
    w.byte(0x00); /* no global colour table */
    w.byte(0); w.byte(0);
    /* NETSCAPE2.0: loop forever */
    w.byte(0x21); w.byte(0xff); w.byte(11); w.str('NETSCAPE2.0'); w.byte(3); w.byte(1); w.word(0); w.byte(0);
  }

  /** Add one RGBA frame shown for `delayCs` hundredths of a second. */
  addFrame(rgba: Uint8ClampedArray | Uint8Array, delayCs: number): void {
    const w = this.w;
    const pal = buildPalette(rgba);
    const idx = indexPixels(rgba, pal);
    w.byte(0x21); w.byte(0xf9); w.byte(4); w.byte(0x04); w.word(Math.max(2, Math.round(delayCs))); w.byte(0); w.byte(0);
    w.byte(0x2c); w.word(0); w.word(0); w.word(this.width); w.word(this.height);
    w.byte(0x87); /* local colour table, 256 entries */
    w.bytes(pal);
    lzw(idx, w);
  }

  finish(): Uint8Array {
    this.w.byte(0x3b);
    return this.w.done();
  }
}
