#!/usr/bin/env node
/*
 * The service worker's cache name must be stamped, not written down.
 *
 * This guard exists because the thing it checks was asserted in a comment
 * and was not true. `public/sw.js` said "bumped on every deploy by the
 * build"; the constant was the literal `nowopen-v1`, and `activate` deletes
 * only caches that do NOT start with the current VERSION. So nothing was
 * ever deleted, 508 chunks accumulated on production, and returning
 * visitors got a blank page after a deploy.
 *
 * A comment cannot enforce this. A guard can.
 */

import { readFileSync, existsSync } from 'node:fs';

const SW = 'public/sw.js';
const PLACEHOLDER = '__BUILD_ID__';
const problems = [];

if (!existsSync(SW)) {
  problems.push(`${SW} is missing — without a service worker the app is not installable.`);
} else {
  const source = readFileSync(SW, 'utf8');

  const version = /const VERSION = '([^']*)'/.exec(source);
  if (!version) {
    problems.push(`${SW} has no VERSION constant, so cache naming cannot be checked.`);
  } else if (!version[1].includes(PLACEHOLDER)) {
    problems.push(
      `${SW} VERSION is "${version[1]}", a fixed string. It must carry ${PLACEHOLDER} so `
      + 'scripts/stamp-sw.mjs can replace it per build — otherwise old caches outlive every '
      + 'deploy and returning visitors run chunks whose imports no longer exist.',
    );
  }

  /*
   * The SPA rewrite answers a missing /assets/ file with index.html and a
   * 200. Caching that stores HTML under a name the browser will later demand
   * a module from, and the failure then survives the fixing deploy.
   */
  if (!/text\/html/.test(source)) {
    problems.push(
      `${SW} does not refuse to cache an HTML response. A missing asset returns index.html `
      + 'with status 200, and caching it poisons that URL.',
    );
  }
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (!/stamp-sw/.test(pkg.scripts?.build ?? '')) {
  problems.push('package.json "build" does not run scripts/stamp-sw.mjs, so the placeholder would ship unstamped.');
}

if (problems.length) {
  console.error('\n✗ service worker versioning:\n');
  for (const p of problems) console.error(`    ${p}`);
  console.error('');
  process.exit(1);
}

console.log('✓ service worker cache name is stamped per build, and HTML is never cached as an asset.');
