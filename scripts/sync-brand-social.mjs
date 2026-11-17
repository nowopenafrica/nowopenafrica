#!/usr/bin/env node
// Generate the edge-runtime copy of the brand social rules.
//
// WHY A GENERATOR AND NOT A SECOND FILE
//
// The admin screen runs the checks so the founder sees problems while writing;
// brand-social-dispatch runs them again on the server, because a browser's
// verdict is not something to trust before posting as the brand. If the two
// copies disagreed, a post the screen called clean could be refused, or worse,
// a post the server should refuse could go out. Same pattern as sync-wa-link.
//
// Usage:  node scripts/sync-brand-social.mjs [--check]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Both files are import-free, so a verbatim copy runs unchanged under Deno.
// brandAutopilot.ts is the AI-drafting rules shared with brand-social-generate.
const FILES = ['brandSocial.ts', 'brandAutopilot.ts', 'brandPublish.ts'];

const banner = (name) => `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Derived from src/lib/${name} by scripts/sync-brand-social.mjs.
 * Edit the source and run \`npm run sync:brand-social\`; \`npm run verify\`
 * fails if this file and its source have drifted.
 *
 * The admin screen and the dispatcher must agree on what may be posted as the
 * brand. Two hand-maintained copies would eventually disagree.
 */

`;

export function generate(source, name = 'brandSocial.ts') {
  return `${banner(name)}${source.trimEnd()}\n`;
}

const check = process.argv.includes('--check');
let drifted = false;

for (const name of FILES) {
  const target = join(ROOT, 'supabase', 'functions', '_shared', name);
  const expected = generate(readFileSync(join(ROOT, 'src', 'lib', name), 'utf8'), name);
  if (!check) {
    writeFileSync(target, expected);
    console.log(`Wrote supabase/functions/_shared/${name}`);
    continue;
  }
  let actual = '';
  try {
    actual = readFileSync(target, 'utf8');
  } catch {
    console.error(`supabase/functions/_shared/${name} is missing. Run: npm run sync:brand-social`);
    drifted = true;
    continue;
  }
  if (actual !== expected) {
    console.error(
      `The edge copy of ${name} has drifted from src/lib/${name}.\n`
      + 'The screen and the edge functions would disagree about what may be posted.\n'
      + 'Run: npm run sync:brand-social',
    );
    drifted = true;
  }
}

if (check) {
  if (drifted) process.exit(1);
  console.log('✓ the edge brand social rules match their source.');
}
