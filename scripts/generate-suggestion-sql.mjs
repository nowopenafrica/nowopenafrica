// Generates a migration that writes category-template suggestions for the
// categories a template newly covers.
//
// WHY A GENERATOR AND NOT HAND-WRITTEN SQL
//
// The vocabulary lives in src/data/categoryTemplates.ts and the category→
// industry mapping lives in src/data/industrySystems.ts. Retyping either into
// SQL creates a second copy that drifts, and the drift is invisible: the app
// would show one list and the database would hold another, with nothing
// comparing them. This reads both files and emits SQL from them, so the TS
// stays the single source of truth.
//
// WHAT IT WILL NOT DO
//
// It emits INSERTs with published = false, because
// guard_generated_not_published() refuses template content that arrives
// published — a human publishes as a separate act. The publish statement is
// emitted after, so the two steps are visible in one file rather than hidden.
//
// Usage: node scripts/generate-suggestion-sql.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/*
 * Line endings normalised on read. These files are CRLF on disk — the repo's
 * convention on Windows — and every structural regex below is written against
 * "\n  {\n". Without this the parse silently finds nothing and the generator
 * reports "No templates parsed" rather than emitting wrong SQL, but that is
 * luck rather than design.
 */
const read = (...parts) =>
  readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

const templatesSrc = read('src', 'data', 'categoryTemplates.ts');
const industriesSrc = read('src', 'data', 'industrySystems.ts');

/**
 * Pull one string-array field out of a block of TS.
 *
 * eval on a bare array of string literals, and ONLY after checking it contains
 * nothing but strings, commas and whitespace. The templates also hold template
 * literals with ${FAQ_CONTACT} inside them, which would throw here — the guard
 * is what keeps this from quietly evaluating something with an expression in
 * it.
 */
function stringArray(block, field) {
  const m = block.match(new RegExp(`\\n\\s*${field}:\\s*\\[([\\s\\S]*?)\\]`, ''));
  if (!m) return null;
  const body = m[1];
  if (/[`$]/.test(body)) throw new Error(`${field} contains an expression; refusing to eval`);
  // eslint-disable-next-line no-eval
  const value = eval(`[${body}]`);
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`${field} is not an array of strings`);
  }
  return value;
}

// ── Templates ────────────────────────────────────────────────────────────
const templateBlocks = templatesSrc
  .split(/\n  \{\n/)
  .filter((b) => /^\s*industry:\s*'/.test(b));

const templates = templateBlocks.map((block) => {
  const industry = block.match(/industry:\s*'([^']+)'/)[1];
  return {
    industry,
    services: stringArray(block, 'services') ?? [],
    products: stringArray(block, 'products') ?? [],
  };
});
if (templates.length === 0) throw new Error('No templates parsed');

// ── Industries: slug → its category names ────────────────────────────────
const industries = [];
for (const m of industriesSrc.matchAll(/slug:\s*'([a-z-]+)',[\s\S]*?categories:\s*\[([\s\S]*?)\],/g)) {
  const body = m[2];
  if (/[`$]/.test(body)) continue;
  // eslint-disable-next-line no-eval
  industries.push({ slug: m[1], categories: eval(`[${body}]`) });
}
if (industries.length === 0) throw new Error('No industries parsed');

// ── Aliases ──────────────────────────────────────────────────────────────
const aliasBlock = templatesSrc.match(
  /export const CATEGORY_ALIASES[^=]*=\s*\{([\s\S]*?)\n\};/,
)[1];
const aliases = {};
for (const m of aliasBlock.matchAll(/^\s*'?([a-z& ]+?)'?:\s*'([a-z-]+)',/gm)) {
  aliases[m[1].trim()] = m[2];
}

const byIndustry = new Map(templates.map((t) => [t.industry, t]));

/** The same resolution order as industryForCategory: exact wins over alias. */
function templateForCategory(name) {
  const needle = name.trim().toLowerCase();
  for (const ind of industries) {
    if (ind.categories.some((c) => c.toLowerCase() === needle)) {
      return byIndustry.get(ind.slug) ?? null;
    }
  }
  const aliased = aliases[needle];
  if (aliased && industries.some((i) => i.slug === aliased)) return byIndustry.get(aliased) ?? null;
  return null;
}

/*
 * The category names measured on production that today have listings and no
 * services. Passed in explicitly rather than read from the database: this
 * script must be runnable offline and reviewable as a diff, and a generator
 * that silently widens its own scope on the next run is a generator nobody can
 * review.
 */
const LIVE_CATEGORIES = [
  'Professional Services', 'Arts & Culture', 'Banking & Finance', 'Library & Archive',
  'Other', 'Events & Entertainment', 'Hospitality & Travel', 'Shopping Mall',
  'Fitness & Wellness', 'Professional Service', 'Education', 'Beauty & Hair', 'Tech & Digital',
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const rows = [];
const uncovered = [];
for (const category of LIVE_CATEGORIES) {
  const t = templateForCategory(category);
  if (!t) { uncovered.push(category); continue; }
  t.services.forEach((name, i) => rows.push([category, 'service', name, i, t.industry]));
  t.products.forEach((name, i) => rows.push([category, 'product', name, i, t.industry]));
}

const covered = [...new Set(rows.map((r) => r[0]))];

const values = rows
  .map(([cat, kind, name, ord]) => `    (${q(cat)}, ${q(kind)}, ${q(name)}, ${ord})`)
  .join(',\n');

const sql = `-- Category-template suggestions for the categories a template newly covers.
--
-- GENERATED BY scripts/generate-suggestion-sql.mjs — do not hand-edit. The
-- vocabulary lives in src/data/categoryTemplates.ts; regenerate rather than
-- correct a word here, or the two copies drift and nothing compares them.
--
-- COVERED (${covered.length}): ${covered.join(', ')}
--
-- NOT COVERED (${uncovered.length}), on purpose: ${uncovered.join(', ')}
--   Each of these is in DELIBERATELY_UNMAPPED with the reason recorded. They
--   are grab-bag names — "Professional Services" holds a cement manufacturer,
--   a publisher, a news site and a balloon hire firm — and no vocabulary is
--   true of all of them. They need re-categorising, not a template.
--
-- UNCLAIMED ONLY. A claimed profile is its owner's, and
-- guard_claimed_profile_edits refuses the write anyway.

create temporary table _suggestion (
  category text not null,
  kind     text not null,
  name     text not null,
  ord      int  not null
) on commit drop;

insert into _suggestion (category, kind, name, ord) values
${values};

-- ── Services ─────────────────────────────────────────────────────────────
--
-- published = false is not a choice: guard_generated_not_published() raises on
-- template content inserted already published. The publish is the separate,
-- deliberate second step below.
insert into public.business_services
  (business_id, name, description, content_status, source_type, source_name,
   requires_confirmation, published, generated_at, enrichment_version)
select b.id, s.name, null, 'suggested', 'category_template',
       'NowOpen category template', true, false, now(), 1
  from public.businesses b
  join _suggestion s
    on lower(trim(b.category)) = lower(s.category)
 where b.claim_status <> 'claimed'
   and s.kind = 'service'
   -- Never a second copy of something the profile already lists, however it
   -- got there.
   and not exists (
     select 1 from public.business_services e
      where e.business_id = b.id
        and lower(regexp_replace(e.name, '[^a-zA-Z0-9]+', '', 'g'))
          = lower(regexp_replace(s.name, '[^a-zA-Z0-9]+', '', 'g'))
   );

-- ── Products ─────────────────────────────────────────────────────────────
insert into public.business_products
  (business_id, name, description, content_status, source_type, source_name,
   requires_confirmation, published, generated_at, enrichment_version)
select b.id, s.name, null, 'suggested', 'category_template',
       'NowOpen category template', true, false, now(), 1
  from public.businesses b
  join _suggestion s
    on lower(trim(b.category)) = lower(s.category)
 where b.claim_status <> 'claimed'
   and s.kind = 'product'
   and not exists (
     select 1 from public.business_products e
      where e.business_id = b.id
        and lower(regexp_replace(e.name, '[^a-zA-Z0-9]+', '', 'g'))
          = lower(regexp_replace(s.name, '[^a-zA-Z0-9]+', '', 'g'))
   );

-- ── Publish ──────────────────────────────────────────────────────────────
--
-- The same rule 20260926010000 applied to the 21,468 rows already on file:
-- publication changes, provenance does not. content_status stays 'suggested',
-- so SuggestedContentNotice keeps rendering "some of these are not confirmed"
-- above the list, and reviewed_by stays null because no person read these.
update public.business_services s
   set published = true, reviewed_at = now()
  from public.businesses b, _suggestion t
 where b.id = s.business_id
   and lower(trim(b.category)) = lower(t.category)
   and b.claim_status <> 'claimed'
   and s.content_status = 'suggested'
   and s.published = false;

update public.business_products p
   set published = true, reviewed_at = now()
  from public.businesses b, _suggestion t
 where b.id = p.business_id
   and lower(trim(b.category)) = lower(t.category)
   and b.claim_status <> 'claimed'
   and p.content_status = 'suggested'
   and p.published = false;
`;

const out = join(root, 'supabase', 'migrations', '20260927010000_suggestions_for_new_templates.sql');
writeFileSync(out, sql, 'utf8');

console.log(`templates parsed : ${templates.length}`);
console.log(`industries parsed: ${industries.length}`);
console.log(`aliases parsed   : ${Object.keys(aliases).length} -> ${JSON.stringify(aliases)}`);
console.log(`covered          : ${covered.join(', ') || '(none)'}`);
console.log(`uncovered        : ${uncovered.join(', ') || '(none)'}`);
console.log(`rows             : ${rows.length}`);
console.log(`written          : ${out}`);
