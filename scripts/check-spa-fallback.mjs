#!/usr/bin/env node
/*
 * A missing asset must 404, not become the app shell.
 *
 * ── THE BUG THIS GUARDS ──────────────────────────────────────────────────
 *
 * The SPA rewrite caught everything but /api/, so a request for a chunk that
 * was not on the server returned **index.html, status 200**. The headers
 * block then stamped `/assets/(.*)` with
 * `public, max-age=31536000, immutable`.
 *
 * MEASURED on production 2026-10-27:
 *
 *     GET /assets/DoesNotExist-aaaaaaa.js
 *     → 200 OK · Content-Type: text/html · Cache-Control: immutable, 1 year
 *
 * So a visitor who asked for an asset at the wrong moment — mid-deploy, or
 * with an index that referenced a chunk a later build pruned — cached HTML
 * under a `.js` URL for a year. The browser refuses an HTML "module", the
 * page goes blank, and `immutable` means it never revalidates: the next
 * deploy cannot fix it, and neither can a reload.
 *
 * Excluding the static directories from the rewrite restores a real 404,
 * which nothing caches as a module and which recovers by itself.
 */

import { readFileSync } from 'node:fs';

const CONFIG = 'vercel.json';
const problems = [];

/** Directories whose contents are content-hashed and cached immutably. */
const IMMUTABLE_DIRS = ['assets', 'fonts'];

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));

/* The catch-all rewrite is the last one: everything not matched above it. */
const fallback = (config.rewrites ?? []).find((r) => r.destination === '/index.html');

if (!fallback) {
  problems.push(`${CONFIG} has no rewrite to /index.html, so deep links into the app would 404.`);
} else {
  for (const dir of IMMUTABLE_DIRS) {
    if (!fallback.source.includes(`${dir}/`)) {
      problems.push(
        `the SPA rewrite "${fallback.source}" does not exclude /${dir}/. A missing file there `
        + 'would return index.html with status 200, and the immutable header below pins that '
        + 'HTML under a script URL for a year.',
      );
    }
  }
}

/*
 * The exclusion only matters because of the header. If the immutable rule
 * ever goes away this guard is over-strict rather than wrong, so it says so
 * instead of silently passing.
 */
const immutable = (config.headers ?? []).filter((h) =>
  h.headers?.some((x) => /immutable/.test(String(x.value ?? ''))));
if (!immutable.length) {
  console.warn('  note: no immutable cache header found; the rewrite exclusion is now belt-and-braces.');
}

if (problems.length) {
  console.error('\n✗ SPA fallback:\n');
  for (const p of problems) console.error(`    ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ a missing file under ${IMMUTABLE_DIRS.map((d) => `/${d}/`).join(' or ')} 404s instead of becoming the app shell.`);
