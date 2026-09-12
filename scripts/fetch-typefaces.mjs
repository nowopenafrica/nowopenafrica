#!/usr/bin/env node
/**
 * Download the Studio typefaces into public/fonts and self-host them.
 *
 * WHY SELF-HOST RATHER THAN LINK TO GOOGLE FONTS
 *
 * Three reasons, in order of how much they matter here:
 *
 * 1. The export has to be right. Studio renders the same template into the DOM,
 *    into an html2canvas PNG and into canvas video frames. A font that has not
 *    finished downloading silently substitutes in one of the three, and the
 *    customer gets a poster that does not match the preview. A self-hosted face
 *    is one same-origin request we can await before any export runs.
 *
 * 2. The CSP already allows it. `font-src 'self' data:` — no third-party font
 *    host is permitted, and widening the policy for a convenience is the wrong
 *    trade. The repo already self-hosts Coolvetica this way.
 *
 * 3. No visitor of ours is announced to a third party for the sake of a font.
 *
 * LICENCES. Every family below is SIL Open Font License 1.1, which permits
 * redistribution and hosting. The licence is recorded per family in
 * src/lib/design/typefaces.ts and shown in the picker, because a design tool
 * that cannot tell you what you are allowed to do with the output is not
 * finished. NOTHING IS ADDED HERE WITHOUT A LICENCE THAT PERMITS IT.
 *
 * Run:  node scripts/fetch-typefaces.mjs
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'public/fonts/studio';

/** family -> the weights we actually use. Kept small: these render large. */
const WANTED = [
  ['Playfair Display', [700, 900]],
  ['DM Serif Display', [400]],
  ['Fraunces', [600]],
  ['Bebas Neue', [400]],
  ['Archivo Black', [400]],
  ['Space Grotesk', [500, 700]],
  ['Outfit', [400, 600, 800]],
  ['Space Mono', [700]],
];

// Google serves woff2 only to a browser-shaped UA. Anything else gets ttf,
// which is roughly four times the size for the same glyphs.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** The subset that carries U+0000-00FF — ASCII plus the accented Latin that
 *  French-speaking African markets need. We deliberately skip latin-ext,
 *  Cyrillic and Vietnamese: they double the payload for glyphs no template
 *  here sets. */
const LATIN = 'U+0000-00FF';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

async function cssFor(family, weight) {
  const axis = family === 'Fraunces'
    ? `family=${encodeURIComponent(family)}:opsz,wght@9..144,${weight}`
    : `family=${encodeURIComponent(family)}:wght@${weight}`;
  const url = `https://fonts.googleapis.com/css2?${axis}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${family} ${weight}: css ${res.status}`);
  return res.text();
}

/** The @font-face block whose unicode-range is the latin subset. */
function latinUrl(css) {
  const blocks = css.split('@font-face').slice(1);
  const latin = blocks.find((b) => b.includes(LATIN)) ?? blocks[blocks.length - 1];
  const m = latin?.match(/src:\s*url\((https:[^)]+\.woff2)\)/);
  if (!m) throw new Error('no woff2 in the css');
  return m[1];
}

mkdirSync(OUT, { recursive: true });

let total = 0;
for (const [family, weights] of WANTED) {
  for (const weight of weights) {
    const file = join(OUT, `${slug(family)}-${weight}.woff2`);
    if (existsSync(file)) {
      total += statSync(file).size;
      console.log(`= ${file} (already here)`);
      continue;
    }
    const url = latinUrl(await cssFor(family, weight));
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${family} ${weight}: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, bytes);
    total += bytes.length;
    console.log(`+ ${file}  ${(bytes.length / 1024).toFixed(1)}KB`);
  }
}

console.log(`\n${(total / 1024).toFixed(0)}KB total.`);
// A budget, not a wish: these load inside Studio only, but a design tool that
// costs a megabyte before it draws anything is a design tool nobody opens twice.
if (total > 600 * 1024) {
  console.error('Over the 600KB budget. Drop a weight rather than raising it.');
  process.exit(1);
}
