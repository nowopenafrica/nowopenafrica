#!/usr/bin/env node
// Generate the edge-runtime copy of the click-to-chat link builder.
//
// WHY A GENERATOR AND NOT A SECOND FILE
//
// The browser needs it for the "Message us on WhatsApp" buttons; the edge
// functions need it for the onboarding email and for matching an inbound
// message back to a listing. Nothing in src/ imports from supabase/functions/
// or the reverse.
//
// The reference format is the part that must never drift: the browser writes
// NOA-XXXXXXXX into the owner's compose box and the webhook reads it back out.
// Two hand-maintained copies would eventually disagree, and the failure is
// silent — inbound messages simply stop matching any listing.
//
// Usage:  node scripts/sync-wa-link.mjs [--check]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, 'src', 'lib', 'waLink.ts');
const TARGET = join(ROOT, 'supabase', 'functions', '_shared', 'waLink.ts');

const BANNER = `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Derived from src/lib/waLink.ts by scripts/sync-wa-link.mjs.
 * Edit the source and run \`npm run sync:wa-link\`; \`npm run verify\` fails
 * if this file and its source have drifted.
 *
 * The reference written into the owner's compose box by the browser is read
 * back out by the inbound webhook. If these two copies disagree, inbound
 * messages stop matching any listing and nothing says why.
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
    console.error('supabase/functions/_shared/waLink.ts is missing. Run: npm run sync:wa-link');
    process.exit(1);
  }
  if (actual !== expected) {
    console.error(
      'The edge copy of the click-to-chat builder has drifted from src/lib/waLink.ts.\n'
      + 'Inbound messages would stop matching the references the browser writes.\n'
      + 'Run: npm run sync:wa-link',
    );
    process.exit(1);
  }
  console.log('✓ the edge click-to-chat builder matches its source.');
} else {
  writeFileSync(TARGET, expected);
  console.log('Wrote supabase/functions/_shared/waLink.ts');
}
