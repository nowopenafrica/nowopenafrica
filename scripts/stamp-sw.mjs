#!/usr/bin/env node
/*
 * Stamp the build id into the service worker.
 *
 * ── WHY THIS SCRIPT EXISTS ───────────────────────────────────────────────
 *
 * `public/sw.js` is copied into `dist/` verbatim by Vite, so a version
 * constant written in that file is the same constant forever. The worker's
 * own comment claimed the build bumped it; nothing did, and `activate`
 * deletes only caches whose name does NOT start with the current VERSION —
 * which, with a fixed VERSION, is none of them.
 *
 * MEASURED on production 2026-10-27: 508 asset entries from every build
 * since the worker shipped. Returning visitors ran old chunks whose sibling
 * imports had been fingerprinted away, the SPA rewrite answered those with
 * index.html, and the page went blank. Each deploy made it likelier.
 *
 * ── THE ID ───────────────────────────────────────────────────────────────
 *
 * The hash of the built entry bundle's filename, which Vite fingerprints
 * from content. Same code in, same id out — so an unchanged rebuild does not
 * needlessly evict caches, and a changed build always does.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const DIST = 'dist';
const SW = join(DIST, 'sw.js');
const PLACEHOLDER = '__BUILD_ID__';

const fail = (why) => {
  console.error(`\n✗ stamp-sw: ${why}\n`);
  process.exit(1);
};

if (!existsSync(SW)) fail(`${SW} does not exist. Run this after \`vite build\`.`);

const source = readFileSync(SW, 'utf8');
if (!source.includes(PLACEHOLDER)) {
  fail(
    `${SW} has no ${PLACEHOLDER}. Something replaced the placeholder with a `
    + 'fixed version, which is how the cache came to outlive 508 builds.',
  );
}

/*
 * Every built asset name, hashed. The names already carry Vite's content
 * fingerprints, so hashing the list is a cheap stand-in for hashing the
 * build — and it changes exactly when the output does.
 */
const assetsDir = join(DIST, 'assets');
if (!existsSync(assetsDir)) fail(`${assetsDir} does not exist, so there is no build to stamp.`);

const id = createHash('sha256')
  .update(readdirSync(assetsDir).sort().join('\n'))
  .digest('hex')
  .slice(0, 12);

writeFileSync(SW, source.replaceAll(PLACEHOLDER, id), 'utf8');
console.log(`✓ service worker stamped nowopen-${id} (caches from other builds will be deleted on activate).`);
