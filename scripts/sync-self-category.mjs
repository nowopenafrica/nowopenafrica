#!/usr/bin/env node
// Generate the edge-runtime copy of the self-description category reader.
//
// WHY A GENERATOR AND NOT A SECOND FILE
//
// The browser and the Deno edge runtime do not share imports here — nothing
// in src/ imports from supabase/functions/ or the reverse, deliberately. But
// both need the same classifier: the browser for the Instagram intake, the
// edge function for the scheduled re-categorisation sweep.
//
// Hand-copying 200 lines of trade vocabulary guarantees they drift, and a
// drifted copy is the worst kind of bug here: the sweep would file businesses
// under categories the rest of the platform no longer uses, silently.
//
// So one file is canonical (src/lib/instagramCategory.ts) and this derives the
// other. `npm run check:self-category` fails the build if the generated file
// on disk differs from what this would produce.
//
// Usage:  node scripts/sync-self-category.mjs [--check]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, 'src', 'lib', 'instagramCategory.ts');
const TARGET = join(ROOT, 'supabase', 'functions', '_shared', 'selfCategory.ts');

const BANNER = `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Derived from src/lib/instagramCategory.ts by scripts/sync-self-category.mjs.
 * Edit the source and run \`npm run sync:self-category\`; \`npm run verify\`
 * fails if this file and its source have drifted.
 *
 * The two runtimes do not share imports, and the scheduled re-categorisation
 * sweep must classify a business exactly as the Instagram intake does — a
 * business should not land in one category when a visitor submits it and
 * another when the sweep sees it.
 */

`;

/**
 * The edge copy, built from the canonical source.
 *
 * Two things are removed: the `BUSINESS_CATEGORIES` import (it reaches into
 * src/data, which the edge runtime cannot see) and the two helpers that exist
 * only to support the browser-side audit of that list. Nothing that decides a
 * category is touched.
 */
export function generate(source) {
  let out = source
    .replace(/^import \{ BUSINESS_CATEGORIES \}.*$/m, '')
    // Everything from the audit helpers to the end of the file.
    .replace(/\/\*\* Every category this module can emit[\s\S]*$/m, '')
    .trimEnd();

  return `${BANNER}${out}\n`;
}

const expected = generate(readFileSync(SOURCE, 'utf8'));

if (process.argv.includes('--check')) {
  let actual = '';
  try {
    actual = readFileSync(TARGET, 'utf8');
  } catch {
    console.error('supabase/functions/_shared/selfCategory.ts is missing. Run: npm run sync:self-category');
    process.exit(1);
  }
  if (actual !== expected) {
    console.error(
      'The edge copy of the category reader has drifted from src/lib/instagramCategory.ts.\n'
      + 'The scheduled sweep would classify businesses differently from the Instagram intake.\n'
      + 'Run: npm run sync:self-category',
    );
    process.exit(1);
  }
  console.log('✓ the edge category reader matches its source.');
} else {
  writeFileSync(TARGET, expected);
  console.log('Wrote supabase/functions/_shared/selfCategory.ts');
}
