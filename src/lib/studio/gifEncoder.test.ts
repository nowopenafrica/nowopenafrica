import { describe, expect, it } from 'vitest';

import { buildPalette, GifEncoder, indexPixels } from './gifEncoder';

/** A minimal GIF reader: enough to prove the file is well formed and the pixels come back. */
function decodeFirstFrame(bytes: Uint8Array): { width: number; height: number; frames: number; loops: boolean; pixels: number[] } {
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => { const v = bytes[p] | (bytes[p + 1] << 8); p += 2; return v; };
  const head = String.fromCharCode(...bytes.slice(0, 6));
  if (head !== 'GIF89a') throw new Error(`bad header ${head}`);
  p = 6;
  const width = u16(); const height = u16(); const flags = u8(); p += 2;
  if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
  let frames = 0; let loops = false; let first: number[] | null = null;
  for (;;) {
    const b = u8();
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8();
      if (label === 0xff) { const n = u8(); const app = String.fromCharCode(...bytes.slice(p, p + n)); p += n; if (app === 'NETSCAPE2.0') loops = true; }
      for (let n = u8(); n; n = u8()) p += n;
      continue;
    }
    if (b !== 0x2c) throw new Error(`unexpected block ${b}`);
    p += 8;
    const f = u8();
    const pal = bytes.slice(p, p + 3 * (1 << ((f & 7) + 1)));
    p += pal.length;
    const minCode = u8();
    const data: number[] = [];
    for (let n = u8(); n; n = u8()) { data.push(...bytes.slice(p, p + n)); p += n; }
    frames++;
    if (!first) {
      /* LZW decode */
      const clear = 1 << minCode; const eoi = clear + 1;
      let size = minCode + 1; let dict: number[][] = []; let prev: number[] | null = null;
      const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = []; size = minCode + 1; prev = null; };
      reset();
      const out: number[] = [];
      let bit = 0;
      const read = () => { let v = 0; for (let i = 0; i < size; i++) { v |= ((data[(bit >> 3)] >> (bit & 7)) & 1) << i; bit++; } return v; };
      while (bit + size <= data.length * 8) {
        const code = read();
        if (code === clear) { reset(); continue; }
        if (code === eoi) break;
        let entry: number[];
        if (code < dict.length && dict[code]) entry = dict[code];
        else if (prev) entry = [...prev, prev[0]];
        else throw new Error('bad code');
        out.push(...entry);
        if (prev) { dict.push([...prev, entry[0]]); if (dict.length === (1 << size) && size < 12) size++; }
        prev = entry;
      }
      first = out.map((i) => (pal[i * 3] << 16) | (pal[i * 3 + 1] << 8) | pal[i * 3 + 2]);
    }
  }
  return { width, height, frames, loops, pixels: first ?? [] };
}

describe('GifEncoder', () => {
  it('writes a looping GIF89a whose pixels decode back to the source colours', () => {
    const w = 8; const h = 4;
    const rgba = new Uint8Array(w * h * 4);
    const colours = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]];
    for (let i = 0; i < w * h; i++) { const c = colours[i % 4]; rgba.set([c[0], c[1], c[2], 255], i * 4); }
    const enc = new GifEncoder(w, h);
    enc.addFrame(rgba, 10);
    enc.addFrame(rgba, 10);
    const gif = decodeFirstFrame(enc.finish());
    expect(gif).toMatchObject({ width: 8, height: 4, frames: 2, loops: true });
    expect(gif.pixels.slice(0, 4)).toEqual([0xff0000, 0x00ff00, 0x0000ff, 0xffffff]);
    expect(gif.pixels).toHaveLength(w * h);
  });

  it('compresses a large frame with many colours (code size grows past 9 bits and resets)', () => {
    const w = 128; const h = 128;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, 255], i * 4);
    const enc = new GifEncoder(w, h);
    enc.addFrame(rgba, 5);
    const gif = decodeFirstFrame(enc.finish());
    expect(gif.pixels).toHaveLength(w * h);
    const pal = buildPalette(rgba);
    const idx = indexPixels(rgba, pal);
    const expected = Array.from(idx, (i) => (pal[i * 3] << 16) | (pal[i * 3 + 1] << 8) | pal[i * 3 + 2]);
    expect(gif.pixels).toEqual(expected);
  });
});
