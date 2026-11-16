/**
 * Writes the generated half of docs/creative-intelligence/ from the registry.
 * Run: npm run intel:docs   (add `-- --check` to fail instead of writing)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATED_DOCS } from '../src/lib/create/intel/docs';

const DIR = 'docs/creative-intelligence';
const check = process.argv.includes('--check');
mkdirSync(DIR, { recursive: true });

let stale = 0;
for (const [name, render] of Object.entries(GENERATED_DOCS)) {
  const path = join(DIR, name);
  const next = render();
  const prev = existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : '';
  if (prev === next) continue;
  stale += 1;
  if (check) console.error(`stale: ${path}`);
  else { writeFileSync(path, next, 'utf8'); console.log(`wrote ${path}`); }
}
if (check && stale > 0) process.exit(1);
if (!stale) console.log('creative-intelligence docs are current');
