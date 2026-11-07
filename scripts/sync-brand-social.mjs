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
const SOURCE = join(ROOT, 'src', 'lib', 'brandSocial.ts');
const TARGET = join(ROOT, 'supabase', 'functions', '_shared', 'brandSocial.ts');

const BANNER = `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Derived from src/lib/brandSocial.ts by scripts/sync-brand-social.mjs.
 * Edit the source and run \`npm run sync:brand-social\`; \`npm run verify\`
 * fails if this file and its source have drifted.
 *
 * The admin screen and the dispatcher must agree on what may be posted as the
 * brand. Two hand-maintained copies would eventually disagree.
 */

`;

export function generate(source) {
  return `${BANNER}${source.trimEnd()}\n`;
}

const expected = generate(readFileSync(SOURCE, 'utf8'));

if (process.argv.includes('--check')) {
  let actual = '';
  try {
    actual = readFileSync(TARGET, 'utf8');
  } catch {
    console.error('supabase/functions/_shared/brandSocial.ts is missing. Run: npm run sync:brand-social');
    process.exit(1);
  }
  if (actual !== expected) {
    console.error(
      'The edge copy of the brand social rules has drifted from src/lib/brandSocial.ts.\n'
      + 'The screen and the dispatcher would disagree about what may be posted.\n'
      + 'Run: npm run sync:brand-social',
    );
    process.exit(1);
  }
  console.log('✓ the edge brand social rules match their source.');
} else {
  writeFileSync(TARGET, expected);
  console.log('Wrote supabase/functions/_shared/brandSocial.ts');
}
