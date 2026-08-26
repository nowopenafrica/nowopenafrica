// Pulls the placement operator's photographs into our own storage and rewrites
// OPERATOR_IMAGES in src/data/populateData.ts to point at the copies.
//
// WHY YOU WOULD RUN THIS
//
// Those photographs currently load from the operator's WordPress uploads. That
// works, and it costs nothing, but it makes our listings depend on someone
// else's server: if a file is renamed or the site reorganises, the card loses
// its picture and nothing here will tell you. It also puts alternativeadverts.com
// on our img-src allowlist, which is a host we do not control.
//
// Re-hosting removes both. The CSP entry can come out afterwards.
//
// It fetches the FULL-SIZE original, not the 300x300 thumbnail the pages link
// to — same photograph, ~8x the detail, which matters on a placement detail
// page rather than a card.
//
// Usage:  node scripts/rehost-partner-images.mjs
// Needs:  SUPABASE_SERVICE_ROLE_KEY in .env (storage writes are not anon-key
//         work, and this is a one-off admin task rather than app code).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SOURCE = join(root, 'src', 'data', 'populateData.ts');
const BUCKET = 'placement-photos';

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_BASE = env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE) throw new Error('Missing VITE_SUPABASE_URL in .env');
if (!SERVICE_KEY) {
  throw new Error(
    'Missing SUPABASE_SERVICE_ROLE_KEY in .env — storage uploads need it. ' +
    'This is a one-off admin task; do not add the key to any VITE_ variable.',
  );
}

const src = readFileSync(SOURCE, 'utf8');

// Pull every OPERATOR('…') path out of the constant block.
const block = src.slice(src.indexOf('const OPERATOR_IMAGES'));
const entries = [...block.slice(0, block.indexOf('};')).matchAll(/(\w+):\s*OPERATOR\('([^']+)'\)/g)]
  .map(([, key, path]) => ({ key, path }));

if (entries.length === 0) throw new Error('No OPERATOR(...) entries found — has the constant been rewritten already?');

console.log(`Re-hosting ${entries.length} photographs into ${BUCKET}…\n`);

let rewritten = src;
let moved = 0;

for (const { key, path } of entries) {
  // Drop WordPress's size suffix to get the original upload.
  const fullPath = path.replace(/-\d+x\d+(?=\.\w+$)/, '');
  const from = `https://alternativeadverts.com/wp-content/uploads/${fullPath}`;
  const name = fullPath.split('/').pop();

  try {
    const res = await fetch(from);
    if (!res.ok) {
      console.log(`  ✗ ${key}: ${res.status} — left pointing at the operator`);
      continue;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    const up = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (!up.ok) {
      console.log(`  ✗ ${key}: upload ${up.status} ${(await up.text()).slice(0, 80)}`);
      continue;
    }

    const hosted = `${URL_BASE}/storage/v1/object/public/${BUCKET}/${name}`;
    rewritten = rewritten.replace(`OPERATOR('${path}')`, `'${hosted}'`);
    moved++;
    console.log(`  ✓ ${key} (${Math.round(bytes.length / 1024)}kb)`);
  } catch (e) {
    console.log(`  ✗ ${key}: ${String(e).slice(0, 90)}`);
  }
}

if (moved === entries.length) {
  // Only drop the helper once nothing needs it, so a partial run stays valid.
  rewritten = rewritten.replace(
    /const OPERATOR = \(path: string\) =>[^\n]*\n/,
    '',
  );
}

writeFileSync(SOURCE, rewritten, 'utf8');
console.log(`\nMoved ${moved}/${entries.length}. ${SOURCE} rewritten.`);
if (moved === entries.length) {
  console.log('All photographs are now ours — remove https://alternativeadverts.com from img-src in vercel.json.');
} else {
  console.log('Some are still linked to the operator, so leave the img-src entry in place.');
}
