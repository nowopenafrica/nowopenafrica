// Every relative import reachable from api/ must carry a .js extension.
//
// The api/ files run as Node ESM serverless functions on Vercel. Node's ESM
// resolver does not guess extensions, so `from './openingHours'` throws
// ERR_MODULE_NOT_FOUND at import time and Vercel reports the whole request as
// FUNCTION_INVOCATION_FAILED — a 500, with nothing in the response to say why.
//
// This is invisible in development: Vite resolves extensionless imports happily,
// tsc is satisfied, and the browser build works. It only appears in production,
// and only on the crawler path, which is the one nobody clicks. One such import
// took the server-rendered business pages down and every crawler hitting a
// profile received a 500 rather than the page.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

const seen = new Set();
const bad = [];
const queue = [];

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) queue.push(p);
  }
};
walk('api');

while (queue.length) {
  const path = queue.pop();
  if (seen.has(path) || !existsSync(path)) continue;
  seen.add(path);
  const src = readFileSync(path, 'utf8');
  for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
    const spec = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    if (!spec.endsWith('.js')) bad.push({ path, line, spec });
    const target = normalize(join(dirname(path), spec.replace(/\.js$/, '.ts')));
    if (existsSync(target)) queue.push(target);
  }
}

if (bad.length) {
  console.error(`\n✗ ${bad.length} relative import(s) reachable from api/ have no .js extension.`);
  console.error('  These resolve in dev and throw at runtime on Vercel:\n');
  for (const b of bad) console.error(`    ${b.path}:${b.line}  from '${b.spec}'  →  '${b.spec}.js'`);
  console.error('');
  process.exit(1);
}
console.log(`✓ all relative imports reachable from api/ carry .js (${seen.size} files checked).`);
