// Backfill: a web-size copy for every library photograph that has none.
//
// Usage: node scripts/assets/web-copies.mjs [--dry-run]
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
// (never on the command line, never in a file).
//
// For each row without a thumb_path: the original is read from the private
// intake bucket, the copy is made (webcopy.py) and uploaded there; an approved
// row's copy also goes to the public bucket, as approval would have done.
// thumb_path is written last, so a row only ever points at a file that exists.
// Run `npm run assets:manifest` afterwards so the galleries use the copies.

import { makeWebCopy, needsWebCopy, webCopyPath, WEB_COPY_KINDS } from './webcopy.mjs';

const INTAKE = 'design-assets-intake';
const PUBLIC = 'design-assets';
const dry = process.argv.includes('--dry-run');
const url = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url || !key) {
  console.error('web-copies: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.');
  process.exit(2);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function upload(bucket, path, body) {
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body,
  });
  if (!res.ok) throw new Error(`upload to ${bucket}/${path} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

const kinds = WEB_COPY_KINDS.join(',');
const list = await fetch(
  `${url}/rest/v1/design_assets?thumb_path=is.null&kind=in.(${kinds})&status=neq.retired&select=id,title,kind,mime,status,sha256,storage_path&order=id`,
  { headers },
);
if (!list.ok) { console.error(`web-copies: could not list assets (${list.status})`); process.exit(1); }
const rows = (await list.json()).filter((r) => needsWebCopy(r.kind, r.mime));
console.log(`web-copies: ${rows.length} asset(s) without a web copy${dry ? ' (dry run)' : ''}`);

let made = 0; let before = 0; let after = 0; const failed = [];
for (const r of rows) {
  try {
    const orig = await fetch(`${url}/storage/v1/object/${INTAKE}/${r.storage_path}`, { headers });
    if (!orig.ok) throw new Error(`could not read the original (${orig.status})`);
    const bytes = Buffer.from(await orig.arrayBuffer());
    const copy = makeWebCopy(bytes);
    before += bytes.length; after += copy.body.length;
    const path = webCopyPath(r.sha256);
    if (!dry) {
      await upload(INTAKE, path, copy.body);
      if (r.status === 'approved') await upload(PUBLIC, path, copy.body);
      const up = await fetch(`${url}/rest/v1/design_assets?id=eq.${r.id}`, {
        method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ thumb_path: path }),
      });
      if (!up.ok) throw new Error(`could not record thumb_path (${up.status}): ${(await up.text()).slice(0, 200)}`);
    }
    made++;
  } catch (e) {
    failed.push(`${r.title}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
const mb = (n) => (n / 1048576).toFixed(1);
console.log(`web-copies: ${made} made, ${mb(before)} MB of originals -> ${mb(after)} MB of web copies`);
if (failed.length) { console.error(`web-copies: ${failed.length} failed\n${failed.join('\n')}`); process.exit(1); }
