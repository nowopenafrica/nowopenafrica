// Do the Wikidata ids in PLACE_QIDS / COUNTRY_QIDS name the places we think?
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// MEASURED 2026-09-24: 26 of the 83 ids were wrong, including 23 of the 33
// cities. They had never been looked up. A selection:
//
//   Abuja         Q1700    ->  Münsterland (a region of Germany)
//   Kano          Q182842  ->  Cameron Meyer (an Australian cyclist)
//   Ibadan        Q142435  ->  1691 Oort (an asteroid)
//   Port Harcourt Q15624   ->  Molins de Rei (a town in Catalonia)
//   Kaduna        Q2778    ->  August 11 (a date)
//   Rwanda        Q1039    ->  São Tomé and Príncipe
//
// A discovery campaign scoped to "Nigeria / Port Harcourt" therefore asked
// Wikidata for businesses in MOLINS DE REI, and fifteen Catalan buildings —
// including blocks of flats — were auto-published into an African business
// directory before anybody noticed. Nothing errored. The campaign reported
// success, because it had done exactly what it was told.
//
// An id is not checkable by reading it. Q182842 looks as much like Kano as
// Q182984 does, which is the real one. So it gets a script.
//
// ── HOW IT CHECKS ────────────────────────────────────────────────────────
//
// Label AND type, never one alone:
//
//   · a place must be labelled exactly as we name it, and carry P17 (country)
//   · a country must be labelled as we name it, and be P31 a country (Q6256)
//
// The second half matters. While fixing this, an earlier resolver decided
// Rwanda was Q50665459 — "Rwanda", a painting by George Gittoes — because its
// only test was "has no country property", which a painting also passes. A
// weak check is how the original ids got in.
//
// Usage: node scripts/check-place-qids.mjs      (exits 1 on any mismatch)

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'NowOpenDiscovery/1.0 (https://www.nowopenafrica.com)';

const src = readFileSync(
  join(root, 'supabase', 'functions', '_shared', 'discovery', 'plan.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

/** Pull one `Record<string, string>` map of name -> Qid out of the source. */
function parseMap(name) {
  const start = src.indexOf(`export const ${name}: Record<string, string> = {`);
  if (start === -1) throw new Error(`${name} not found — has it moved?`);
  const body = src.slice(start, src.indexOf('};', start));
  return [...body.matchAll(/^\s*'?([^':\n]+?)'?:\s*'(Q\d+)'/gm)]
    .map((m) => ({ name: m[1].trim(), qid: m[2] }));
}

const places = parseMap('PLACE_QIDS');
const countries = parseMap('COUNTRY_QIDS');
const all = [...places.map((p) => ({ ...p, kind: 'place' })),
             ...countries.map((c) => ({ ...c, kind: 'country' }))];

/*
 * Names Wikidata labels differently from us, verified by hand. Each is the
 * SAME entity under another name, not a different place — listed so a real
 * mismatch cannot hide behind a blanket tolerance.
 */
const KNOWN_ALIASES = {
  'DR Congo': 'Democratic Republic of the Congo',
  Gambia: 'The Gambia',
  // Q971 is Congo-Brazzaville, which Wikidata labels by its formal name.
  // Checked against P31 (country) and its capital before being listed here.
  'Congo (Brazzaville)': 'Republic of the Congo',
};

async function fetchJson(url, tries = 4) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
    if (res.ok) return res.json();
    // Wikimedia rate-limits bursts; backing off is politer than failing.
    if (attempt < tries - 1) await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    else throw new Error(`Wikidata answered ${res.status}`);
  }
  return null;
}

const entities = {};
for (let i = 0; i < all.length; i += 45) {
  const ids = all.slice(i, i + 45).map((x) => x.qid).join('|');
  const body = await fetchJson(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}`
    + '&props=labels|claims&languages=en&format=json',
  );
  Object.assign(entities, body?.entities ?? {});
  if (i + 45 < all.length) await new Promise((r) => setTimeout(r, 1200));
}

const problems = [];
for (const { kind, name, qid } of all) {
  const e = entities[qid];
  if (!e) { problems.push(`${kind} ${name} (${qid}) — no such entity`); continue; }

  const label = e.labels?.en?.value ?? '(no english label)';
  const expected = KNOWN_ALIASES[name] ?? name;
  if (label.trim().toLowerCase() !== expected.trim().toLowerCase()) {
    problems.push(`${kind} ${name} (${qid}) is actually "${label}"`);
    continue;
  }

  const claims = e.claims ?? {};
  if (kind === 'place') {
    // A settlement has a country. An asteroid and a cyclist do not.
    if (!claims.P17) problems.push(`place ${name} (${qid}) "${label}" has no country — not a place`);
  } else {
    const instanceOf = (claims.P31 ?? [])
      .map((c) => c.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);
    // Q6256 country, Q3624078 sovereign state.
    if (!instanceOf.includes('Q6256') && !instanceOf.includes('Q3624078')) {
      problems.push(`country ${name} (${qid}) "${label}" is not a country (P31=${instanceOf.slice(0, 3)})`);
    }
  }
}

console.log(`Checked ${all.length} Wikidata ids (${places.length} places, ${countries.length} countries).`);
if (problems.length) {
  console.error(`\n✗ ${problems.length} wrong:`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nA campaign scoped to one of these harvests somewhere else entirely.');
  process.exit(1);
}
console.log('✓ Every id names the place it claims to.');
