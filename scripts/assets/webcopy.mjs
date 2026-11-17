// Web-size copies of library photographs (see webcopy.py for what one is).
//
// The copy lives at web/<sha256 of the ORIGINAL>.jpg and is recorded in the
// row's thumb_path, which approval already copies to the public bucket with
// the original. So a new copy needs no schema change, and a retired asset
// loses both files.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Resolved when used, so importing this module (a test) never needs a file: URL. */
const helper = () => fileURLToPath(new URL('./webcopy.py', import.meta.url));

/** Raster kinds drawn as pictures on a page. An SVG scales itself and needs none. */
export const WEB_COPY_KINDS = ['photo', 'illustration', 'mockup_scene', 'texture'];

export const needsWebCopy = (kind, mime) => WEB_COPY_KINDS.includes(kind) && mime !== 'image/svg+xml';

export const webCopyPath = (originalSha256) => `web/${originalSha256}.jpg`;

/** The web copy's bytes and size. Throws when Python or Pillow cannot make one. */
export function makeWebCopy(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'webcopy-'));
  try {
    const src = join(dir, 'in');
    const dst = join(dir, 'out.jpg');
    writeFileSync(src, bytes);
    const py = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
    const r = spawnSync(py, ['-E', '-P', helper(), src, dst], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`web copy failed: ${(r.stderr || r.error?.message || '').trim().slice(0, 300)}`);
    const size = JSON.parse(r.stdout.trim());
    return { body: readFileSync(dst), width: size.width, height: size.height };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
