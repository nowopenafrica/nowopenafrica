/**
 * Reading a ZIP archive, because a PowerPoint file is one.
 *
 * ── WHY THIS EXISTS INSTEAD OF A LIBRARY ─────────────────────────────────
 *
 * A .pptx is a ZIP of XML. Pulling in a zip library to open one would add a
 * dependency to the editor bundle. The browser already ships the hard part:
 * `DecompressionStream('deflate-raw')` is the exact algorithm ZIP uses for
 * method 8. What is left is the container format — a few offsets — which is
 * what this file is.
 *
 * ── WHY IT REFUSES THINGS ────────────────────────────────────────────────
 *
 * An uploaded archive is untrusted input, and two of its numbers are
 * attacker-controlled:
 *
 *   - the uncompressed size, which is how a 50 kB file becomes 4 GB of heap
 *     (a zip bomb), so there is a ceiling per entry and a ceiling on the
 *     total — and the ceiling is checked again against the bytes actually
 *     produced, because the declared size is the attacker's number;
 *   - the entry name, which may contain `../`. Nothing here writes to disk,
 *     but names are used to look up parts, so a traversing name is refused
 *     rather than normalised into something that matches the wrong part.
 *
 * Only entries a caller asks for are inflated. Opening a deck should not cost
 * the memory of every picture in it.
 */

/** Signatures, little-endian. */
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const ZIP64_LOCATOR = 0x07064b50;

/** A single entry's directory record — enough to find and size its bytes. */
export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflate. Anything else this cannot read. */
  method: number;
  /** Offset of the LOCAL header, which is where the data lives. */
  offset: number;
  compressedSize: number;
  size: number;
}

/** A single entry may not expand beyond this. */
export const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
/** Nor may everything taken together. */
export const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

const u16 = (v: DataView, at: number) => v.getUint16(at, true);
const u32 = (v: DataView, at: number) => v.getUint32(at, true);

/** `..`, a drive letter or a leading slash — a name pointing outside. */
export function unsafeName(name: string): boolean {
  const n = name.replace(/\\/g, '/');
  return n.startsWith('/') || n.split('/').includes('..') || /^[a-zA-Z]:/.test(n);
}

/**
 * Read the central directory.
 *
 * Returns an error rather than throwing: "that file is not a PowerPoint" is
 * something the user needs told, not a stack trace.
 */
export function readDirectory(bytes: Uint8Array): ZipEntry[] | { error: string } {
  if (bytes.byteLength < 22) return { error: 'That file is too small to be a PowerPoint file.' };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  /* The end record sits at the end, after a comment of unknown length. */
  let eocd = -1;
  const floor = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let i = bytes.byteLength - 22; i >= floor; i -= 1) {
    if (u32(view, i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) return { error: 'That file is not a readable PowerPoint file.' };

  const count = u16(view, eocd + 10);
  const start = u32(view, eocd + 16);

  /*
   * Zip64 keeps the real offsets elsewhere and fills these with sentinels.
   * Refusing is honest; guessing reads from the wrong place and produces
   * nonsense that looks like a damaged file.
   */
  if (start === 0xffffffff || count === 0xffff
      || (eocd >= 20 && u32(view, eocd - 20) === ZIP64_LOCATOR)) {
    return { error: 'That PowerPoint file uses the ZIP64 format, which cannot be read here.' };
  }
  if (start >= bytes.byteLength) return { error: 'That PowerPoint file is damaged.' };

  const entries: ZipEntry[] = [];
  let at = start;
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.byteLength || u32(view, at) !== CENTRAL) {
      return { error: 'That PowerPoint file is damaged.' };
    }
    const nameLen = u16(view, at + 28);
    const extraLen = u16(view, at + 30);
    const commentLen = u16(view, at + 32);
    entries.push({
      name: new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen)),
      method: u16(view, at + 10),
      compressedSize: u32(view, at + 20),
      size: u32(view, at + 24),
      offset: u32(view, at + 42),
    });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** The compressed bytes of one entry, found through its local header. */
export function entryBytes(bytes: Uint8Array, entry: ZipEntry): Uint8Array | { error: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.offset;
  if (at + 30 > bytes.byteLength || u32(view, at) !== LOCAL) {
    return { error: 'That PowerPoint file is damaged.' };
  }
  /*
   * The LOCAL header's name and extra lengths, not the directory's. They are
   * allowed to differ, and using the directory's is a known way to end up
   * reading a few bytes into the wrong place.
   */
  const dataAt = at + 30 + u16(view, at + 26) + u16(view, at + 28);
  const end = dataAt + entry.compressedSize;
  if (end > bytes.byteLength) return { error: 'That PowerPoint file is damaged.' };
  return bytes.subarray(dataAt, end);
}

/** Inflate raw DEFLATE with what the browser already has. */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

/**
 * Extract the entries a caller wants, and only those.
 *
 * `wanted` decides what is paid for: a deck's XML is small, its pictures are
 * not, and nothing should be inflated on the chance it might be needed.
 */
export async function readZip(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
  inflate: Inflate = inflateRaw,
): Promise<Map<string, Uint8Array> | { error: string }> {
  const dir = readDirectory(bytes);
  if ('error' in dir) return dir;

  const out = new Map<string, Uint8Array>();
  let total = 0;

  for (const entry of dir) {
    if (entry.name.endsWith('/')) continue;
    if (unsafeName(entry.name)) continue;
    if (!wanted(entry.name)) continue;
    if (entry.size > MAX_ENTRY_BYTES) {
      return { error: 'Something inside that file is too large to open safely.' };
    }
    total += entry.size;
    if (total > MAX_TOTAL_BYTES) {
      return { error: 'That PowerPoint file is too large to open safely.' };
    }

    const raw = entryBytes(bytes, entry);
    if ('error' in raw) return raw;

    if (entry.method === 0) { out.set(entry.name, raw); continue; }
    /* An encoding this cannot read is skipped, not fatal — the rest still opens. */
    if (entry.method !== 8) continue;

    let data: Uint8Array;
    try {
      data = await inflate(raw);
    } catch {
      return { error: 'That PowerPoint file is damaged and could not be opened.' };
    }
    /* Measured, not declared. A lying header must not get past the ceiling. */
    if (data.byteLength > MAX_ENTRY_BYTES) {
      return { error: 'Something inside that file is too large to open safely.' };
    }
    out.set(entry.name, data);
  }
  return out;
}

export const asText = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
