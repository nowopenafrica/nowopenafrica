#!/usr/bin/env node
// Parse every edge function entrypoint.
//
// WHY THIS EXISTS
//
// MEASURED 2026-10-10: an edit put a literal newline inside a double-quoted
// JS string in send-onboarding/index.ts — `].join("<newline>")` — which is a
// plain syntax error. `npm run verify` passed: 5,172 tests, 357 files, green.
//
// It passed because tsconfig.edge.json covers only _shared, and vitest never
// loads an entrypoint, so NOTHING in the gate reads those files. The deploy
// would have rejected it, which means the feedback arrives after a push to
// production rather than before one.
//
// Full typechecking of the entrypoints surfaces 69 pre-existing errors across
// 18 functions — worth doing, too large to attach to a bug fix. Parsing is the
// cheap half, and it catches the whole class of "this file is not valid".
//
// Usage:  node scripts/check-edge-syntax.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'supabase', 'functions');

if (!existsSync(DIR)) {
  console.log('No supabase/functions directory — nothing to parse.');
  process.exit(0);
}

const files = [];
for (const entry of readdirSync(DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  // _shared is already typechecked by tsconfig.edge.json.
  if (entry.name === '_shared') continue;
  const file = join(DIR, entry.name, 'index.ts');
  if (existsSync(file)) files.push([entry.name, file]);
}

let failures = 0;
for (const [name, file] of files) {
  try {
    // Parse only. Types are not checked here, deliberately.
    transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'esm' });
  } catch (err) {
    failures += 1;
    console.error(`\n${name}/index.ts`);
    for (const e of err.errors ?? [{ text: err.message }]) {
      const where = e.location ? ` (line ${e.location.line})` : '';
      console.error(`  ✗ ${e.text}${where}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} edge function(s) will not parse. The deploy would reject them.\n`);
  process.exit(1);
}
console.log(`✓ all ${files.length} edge function entrypoint(s) parse.`);
