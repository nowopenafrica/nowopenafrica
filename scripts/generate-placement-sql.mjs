// Generates scripts/sql/update_placement_pricing.sql from AD_PLACEMENTS in
// src/data/populateData.ts (single source of truth, same arrangement as
// scripts/generate-media-sql.mjs).
//
// Usage:  node scripts/generate-placement-sql.mjs
//
// WHAT IT EMITS
//
//   1. UPDATEs for the 58 placements that were seeded before the rewrite,
//      matched by their ORIGINAL title, setting the new title, rate,
//      description and photograph.
//   2. INSERTs guarded by NOT EXISTS for everything added since.
//
// Non-destructive throughout, unlike seed_african_ad_placements.sql which
// deletes every row first and would take an owner-submitted placement with it.
//
// TWO PARSING TRAPS, BOTH OF WHICH HAVE ALREADY BITTEN:
//
//   * A row's location may be double-quoted, because "Cote d'Ivoire" contains
//     an apostrophe. A single-quote-only pattern drops those two rows silently.
//   * A row may carry a 7th field — the operator's own photograph of that
//     board. A six-field pattern drops all sixteen of those, silently.
//
// Both are silent because a regex that matches fewer rows still produces valid
// SQL. Hence the row-count assertion below rather than trusting the match.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SOURCE = join('src', 'data', 'populateData.ts');

// The live table still holds the ORIGINAL titles — nobody has run this SQL yet
// — so the UPDATEs must key on those, not on whatever HEAD now says. Reading
// HEAD would match no rows: a silent no-op rather than a visible failure.
const BASELINE = '8744713^';

// The 7th field must NOT swallow the 8th. `([^\]]+?)` did: on a row carrying
// both an image and a card price it captured "OPERATOR_IMAGES.foo, 14" as one
// value, so every operator photograph silently vanished from the SQL while the
// row count still matched and the guard stayed quiet. Excluding commas from the
// image capture keeps the two apart.
const ROW = /\[\s*(['"])(.*?)\1,\s*(['"])(.*?)\3,\s*(['"])(.*?)\5,\s*(\d+),\s*(['"])(.*?)\8,\s*(['"])(.*?)\10\s*(?:,\s*([^,\]]+?))?\s*(?:,\s*(\d+))?\s*\]/g;

function parse(text) {
  const start = text.indexOf('const AD_PLACEMENTS');
  const block = text.slice(start, start + text.slice(start).indexOf('\n];'));
  const rows = [...block.matchAll(ROW)].map((m) => ({
    title: m[2], type: m[4], location: m[6],
    usd: Number(m[7]), dimensions: m[9], traffic: m[11],
    own: (m[12] || '').trim(),
    listPrice: m[13] ? Number(m[13]) : null,
  }));
  // Every line that looks like a tuple must have parsed.
  const literal = block.split('\n').filter((l) => /^\s*\[['"]/.test(l)).length;
  if (rows.length !== literal) {
    throw new Error(`Parsed ${rows.length} placements but the file has ${literal} — the pattern is dropping rows.`);
  }
  // Counting rows is not enough. A pattern can match every row and still read
  // the wrong FIELDS: when the image capture swallowed the card price beside
  // it, all sixteen operator photographs disappeared from the SQL while this
  // count stayed correct. Check the fields that go missing quietly.
  const withImage = (block.match(/OPERATOR_IMAGES\./g) || []).length;
  const parsedImages = rows.filter((r) => /^OPERATOR_IMAGES\.\w+$/.test(r.own)).length;
  if (withImage !== parsedImages) {
    throw new Error(`${withImage} placements carry an operator photograph but only ${parsedImages} parsed cleanly — the pattern is misreading fields.`);
  }
  return rows;
}

const current = readFileSync(join(root, SOURCE), 'utf8');
const baseline = execFileSync('git', ['show', `${BASELINE}:${SOURCE.replace(/\\/g, '/')}`], {
  cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 8,
});

const oldRows = parse(baseline);
const newRows = parse(current);
if (newRows.length < oldRows.length) throw new Error('Placements were removed — refusing to generate.');

// Resolve OPERATOR_IMAGES.foo to the URL it stands for.
const opBlock = current.slice(current.indexOf('const OPERATOR_IMAGES'));
const OPERATOR_URLS = Object.fromEntries(
  [...opBlock.slice(0, opBlock.indexOf('};')).matchAll(/(\w+):\s*OPERATOR\('([^']+)'\)/g)]
    .map(([, key, path]) => [key, `https://alternativeadverts.com/wp-content/uploads/${path}`]),
);
const ownUrl = (expr) => {
  const m = /^OPERATOR_IMAGES\.(\w+)$/.exec(expr || '');
  return m ? OPERATOR_URLS[m[1]] : null;
};

// The per-type stock pools, cycled exactly as generateAdverts does.
const poolBlock = current.slice(current.indexOf('const AD_TYPE_IMAGES'));
const POOLS = Object.fromEntries(
  [...poolBlock.slice(0, poolBlock.indexOf('\n};')).matchAll(/'([\w ]+)':\s*\[([^\]]*)\]\.map\(pexels\)/g)]
    .map(([, type, ids]) => [type, (ids.match(/\d+/g) || []).map(Number)]),
);
const pexels = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=640`;

const descBlock = current.slice(current.indexOf('const AD_TYPE_DESCRIPTIONS'));
const DESCRIPTIONS = Object.fromEntries(
  [...descBlock.slice(0, descBlock.indexOf('\n};')).matchAll(/'([\w &]+)':\s*'((?:[^'\\]|\\.)*)'/g)]
    .map(([, type, text]) => [type, text.replace(/\\'/g, "'")]),
);

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const counts = {};
const imageFor = (row) => {
  const own = ownUrl(row.own);
  if (own) return own;
  const pool = POOLS[row.type] || [];
  counts[row.type] = (counts[row.type] ?? -1) + 1;
  return pool.length ? pexels(pool[counts[row.type] % pool.length]) : null;
};
const describe = (row) =>
  `${DESCRIPTIONS[row.type] || 'Premium advertising placement'} — ${row.dimensions}, ${row.traffic} traffic. Located at ${row.location}.`;

const out = [
  '-- Repoints the advertisements table at realistic titles, rate-card pricing',
  '-- and, where the operator supplied one, a photograph of that exact board.',
  '--',
  '-- Generated by scripts/generate-placement-sql.mjs — do not edit by hand.',
  '--',
  '-- NON-DESTRUCTIVE, unlike seed_african_ad_placements.sql which deletes every',
  '-- row first. Only the seeded placements are touched, matched by their',
  '-- previous title, so an owner-submitted placement is left alone.',
  '--',
  '-- Safe to re-run: once the old titles are gone every UPDATE is a no-op and',
  '-- every INSERT is guarded by NOT EXISTS.',
  '',
];

oldRows.forEach((was, i) => {
  const now = newRows[i];
  const img = imageFor(now);
  out.push(
    `UPDATE advertisements SET title = ${q(now.title)}, price_per_day = ${now.usd}, ` +
    `pricing = ${now.usd}, description = ${q(describe(now))}, ` +
    // Written every time, NULL included: a placement that stops being
    // discounted has to LOSE its struck-through price, not keep a stale one
    // that now claims a discount nobody is offering.
    `list_price_per_day = ${now.listPrice ?? 'NULL'}` +
    (img ? `, image_url = ${q(img)}` : '') +
    ` WHERE title = ${q(was.title)};`,
  );
});

out.push('', '-- Inventory added after the original seed.', '');
newRows.slice(oldRows.length).forEach((row) => {
  const img = imageFor(row);
  out.push(
    'INSERT INTO advertisements (title, description, type, category, location, price_per_day, pricing, list_price_per_day, dimensions, image_url, status)',
    `SELECT ${q(row.title)}, ${q(describe(row))}, ${q(row.type)}, ${q(row.type)}, ${q(row.location)}, ` +
    `${row.usd}, ${row.usd}, ${row.listPrice ?? 'NULL'}, ${q(row.dimensions)}, ${img ? q(img) : 'NULL'}, 'active'`,
    `WHERE NOT EXISTS (SELECT 1 FROM advertisements WHERE title = ${q(row.title)});`,
    '',
  );
});

out.push(
  '-- Sanity check: nothing should sit outside the published market band.',
  'SELECT title, price_per_day, round(price_per_day * 30 * 1500 / 1000000.0, 2) AS naira_millions_per_month',
  'FROM advertisements ORDER BY price_per_day DESC LIMIT 5;',
  '',
);

const target = join(root, 'scripts', 'sql', 'update_placement_pricing.sql');
writeFileSync(target, out.join('\n'), 'utf8');
console.log(
  `Wrote ${target}\n  ${oldRows.length} updates, ${newRows.length - oldRows.length} inserts, ` +
  `${newRows.filter((r) => ownUrl(r.own)).length} operator photographs, ` +
  `${newRows.filter((r) => r.listPrice).length} discounted.`,
);
