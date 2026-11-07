#!/usr/bin/env node
/**
 * Measure the template library instead of having an opinion about it.
 *
 * The creative brief asks whether a category offers "genuinely different
 * creative directions — not twenty copies of the same layout with a different
 * stock photograph or background colour". That is a measurable question, and
 * the answer should come from the data rather than from looking at a few
 * cards and generalising.
 *
 * WHAT IT MEASURES, AND WHY EACH ONE
 *
 *   composition signature  Where the headline sits, where the eyebrow sits,
 *                          whether there is an image, how many slots, which
 *                          roles. Two templates sharing a signature are the
 *                          same layout wearing different words, whatever
 *                          their names say.
 *
 *   headline anchor        Brief: "the same centred headline on every design"
 *                          is named as a thing to avoid. So count them.
 *
 *   demonstration copy     A card reading "Your headline here" shows a
 *                          shopper nothing about what the layout is FOR.
 *
 *   category depth         A deliverable with one or two directions cannot
 *                          offer a choice.
 *
 * It asserts nothing about beauty. Visual judgement is not automatable and
 * the brief says so; this is the half that is.
 *
 * Usage: node scripts/audit-templates.mjs [--json] [--check]
 *
 * --check fails the build on the one finding that can be stated objectively:
 * a layout with no demonstration copy and a layout in no deliverable
 * category. Both mean a template nobody can find or evaluate. The rest is
 * reported, not enforced, because "is this well art-directed" is not a thing
 * a script gets to decide.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── pull the data out without a bundler ──────────────────────────────────
 *
 * designTemplates.ts is TypeScript with imports, so it cannot simply be
 * required. The shapes needed here are regular enough to read directly, and
 * the alternative — standing up a transpiler for an audit script — is more
 * machinery than the answer is worth.
 */

/*
 * Both files that hold layouts. catalogueTemplates.ts is spread into
 * DESIGN_TEMPLATES; reading only designTemplates.ts would let 38 layouts
 * past the gate unaudited while the report still said "OK".
 */
const source = read('src/lib/designTemplates.ts') + '\n' + read('src/lib/design/catalogueTemplates.ts');

/** Every `{ key: '...', label: '...', ... }` template object, crudely. */
function templates() {
  const out = [];
  /*
   * A template object opens `{` on its own line; a look's pattern is written
   * inline as `{ key: 'grain', ... }`. Without the newline every pattern
   * counted as a slotless template.
   */
  const re = /\{[ \t]*\r?\n\s*key:\s*'([a-z0-9-]+)'/g;
  let m;
  while ((m = re.exec(source))) {
    const start = m.index;
    /* Find the matching close brace by counting depth from the opening one. */
    let depth = 0;
    let end = start;
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    out.push({ key: m[1], body: source.slice(start, end) });
  }
  return out;
}

const slotRe = /\{\s*role:\s*'([a-z]+)'[^}]*?\}/g;

function slotsOf(body) {
  const slots = [];
  let m;
  slotRe.lastIndex = 0;
  while ((m = slotRe.exec(body))) {
    const text = m[0];
    const num = (name) => {
      const hit = new RegExp(`${name}:\\s*(-?[0-9.]+)`).exec(text);
      return hit ? Number(hit[1]) : null;
    };
    const str = (name) => {
      const hit = new RegExp(`${name}:\\s*'([^']*)'`).exec(text);
      return hit ? hit[1] : null;
    };
    slots.push({
      role: m[1],
      x: num('x'), y: num('y'), w: num('w'),
      align: str('align') ?? 'left',
      fromBottom: /fromBottom:\s*true/.test(text),
      /*
        Type scale, weight, case and treatment.

        The first signature used only position, count and roles, and reported
        card-luxe-dark, card-type-led and card-colour-block as one layout.
        Reading their slots says otherwise: a 0.088 headline at weight 400, a
        0.13 UPPERCASE headline at weight 800 with -0.045 tracking, and a 0.09
        headline set inside a colour panel. Those are three different
        directions by any designer's reading, and a measurement that calls
        them identical overstates the problem it exists to find.
      */
      size: num('size'),
      weight: num('weight'),
      upper: /upper:\s*true/.test(text),
      treatment: str('treatment'),
    });
  }
  return slots;
}

/** Where a slot sits, in thirds. Fine enough to tell layouts apart. */
const band = (v) => (v === null ? '?' : v < 0.34 ? 'top' : v < 0.67 ? 'mid' : 'low');
const col = (v) => (v === null ? '?' : v < 0.34 ? 'L' : v < 0.67 ? 'C' : 'R');

/* Type scale as a designer would describe it, not as a float. */
const scale = (v) => (v === null ? '?' : v < 0.055 ? 'sm' : v < 0.09 ? 'md' : v < 0.13 ? 'lg' : 'xl');
const heft = (v) => (v === null || v < 500 ? 'light' : v < 700 ? 'medium' : 'heavy');

const label = (body) => (/label:\s*'([^']*)'/.exec(body) ?? [])[1] ?? '';

/*
  The deliverable category lives in design/deliverables.ts, NOT on the
  template.

  The first version of this script looked for a `category:` field on the
  template object, found none, and reported "1 categories — uncategorised",
  which would have been a confident false finding about the thing the audit
  exists to measure. deliverables.ts says in its own header why the mapping
  is explicit rather than inferred from tags.
*/
const deliverables = read('src/lib/design/deliverables.ts');
/*
  Quoted AND unquoted keys.

  A JavaScript object key only needs quotes when it is not a valid
  identifier, so `ticket:` and `'card-front':` sit side by side in these
  files. The first version of this regex required the quotes and therefore
  reported `statement`, `ticket`, `vacancy` and `certificate` as having no
  category and no demonstration copy. All four have both. Two confident false
  findings from one missing `?`.
*/
const KEY = String.raw`'?([a-z][a-z0-9-]*)'?`;
const CATEGORY = new Map(
  /* String.raw, because a plain template literal eats `\s` and `\{` before
     the RegExp ever sees them — which produced a pattern matching nothing
     and a report claiming every template was uncategorised. */
  [...deliverables.matchAll(new RegExp(String.raw`${KEY}:\s*\{\s*category:\s*'([a-z-]+)'`, 'g'))]
    .map((m) => [m[1], m[2]]),
);
const category = (key) => CATEGORY.get(key) ?? 'UNMAPPED';

const rows = templates().map(({ key, body }) => {
  const slots = slotsOf(body);
  const headline = slots.find((s) => s.role === 'headline');
  const roles = [...new Set(slots.map((s) => s.role))].sort();
  /* The biggest piece of type on the page — what the eye lands on first. */
  const lead = slots
    .filter((x) => x.size !== null)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0] ?? null;
  const treatments = [...new Set(slots.map((x) => x.treatment).filter(Boolean))].sort();
  return {
    key,
    label: label(body),
    category: category(key),
    slots: slots.length,
    roles,
    headline: headline
      ? { band: band(headline.y), col: col(headline.x), align: headline.align, w: headline.w }
      : null,
    /*
      The signature.

      Two templates sharing one are the same creative direction — a different
      palette does not make a different direction, but a different type scale,
      weight, case or treatment genuinely does. The first version used only
      position, count and roles and therefore reported three visibly different
      business cards as one layout; it was measuring less than a designer
      looks at.

      Also included: which role LEADS. A card whose largest element is the
      person's name and one whose largest element is the company mark are
      different cards however similar their slot lists.
    */
    signature: [
      headline ? `${band(headline.y)}/${col(headline.x)}/${headline.align}` : 'no-headline',
      headline ? `h:${scale(headline.size)}/${heft(headline.weight)}${headline.upper ? '/caps' : ''}` : '',
      lead ? `lead:${lead.role}` : '',
      treatments.length ? `fx:${treatments.join(',')}` : 'fx:none',
      `${slots.length}slots`,
      roles.join('+'),
    ].filter(Boolean).join(' | '),
  };
});

/* ── demonstration copy ──────────────────────────────────────────────── */

const copySource = read('src/lib/create/sampleCopy.ts');
const withOwnCopy = new Set(
  [...copySource.matchAll(new RegExp(String.raw`^\s{2}${KEY}:\s*\{`, 'gm'))].map((m) => m[1]),
);

/* ── report ──────────────────────────────────────────────────────────── */

const byCategory = new Map();
for (const r of rows) {
  byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
}

const bySignature = new Map();
for (const r of rows) {
  bySignature.set(r.signature, [...(bySignature.get(r.signature) ?? []), r.key]);
}

const duplicates = [...bySignature.entries()].filter(([, keys]) => keys.length > 1);
const centred = rows.filter((r) => r.headline?.align === 'center');
const topLeft = rows.filter((r) => r.headline?.band === 'top' && r.headline?.col === 'L');
const generic = rows.filter((r) => !withOwnCopy.has(r.key));

const report = {
  templates: rows.length,
  categories: byCategory.size,
  categoryDepth: Object.fromEntries(
    [...byCategory.entries()].sort((a, b) => a[1].length - b[1].length).map(([c, list]) => [c, list.length]),
  ),
  sharedCompositions: duplicates
    .sort((a, b) => b[1].length - a[1].length)
    .map(([sig, keys]) => ({ signature: sig, count: keys.length, keys })),
  headlineAnchors: {
    centred: centred.length,
    topLeft: topLeft.length,
    other: rows.length - centred.length - topLeft.length,
  },
  demonstrationCopy: {
    withOwn: rows.length - generic.length,
    generic: generic.length,
    genericKeys: generic.map((r) => r.key),
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pct = (n) => `${Math.round((n / report.templates) * 100)}%`;
  console.log(`\nTEMPLATE LIBRARY AUDIT — ${report.templates} layouts in ${report.categories} categories\n`);

  console.log('Thinnest categories (a deliverable with one direction offers no choice):');
  for (const [c, n] of Object.entries(report.categoryDepth).slice(0, 8)) {
    console.log(`  ${String(n).padStart(3)}  ${c}`);
  }

  console.log(`\nHeadline anchor:`);
  console.log(`  centred   ${String(report.headlineAnchors.centred).padStart(3)}  ${pct(report.headlineAnchors.centred)}`);
  console.log(`  top-left  ${String(report.headlineAnchors.topLeft).padStart(3)}  ${pct(report.headlineAnchors.topLeft)}`);
  console.log(`  other     ${String(report.headlineAnchors.other).padStart(3)}  ${pct(report.headlineAnchors.other)}`);

  console.log(`\nShared compositions (same slot roles, count and headline anchor):`);
  if (report.sharedCompositions.length === 0) console.log('  none');
  for (const d of report.sharedCompositions.slice(0, 10)) {
    console.log(`  ${String(d.count).padStart(2)} x  ${d.signature}`);
    console.log(`        ${d.keys.join(', ')}`);
  }

  console.log(`\nDemonstration copy:`);
  console.log(`  own copy  ${String(report.demonstrationCopy.withOwn).padStart(3)}  ${pct(report.demonstrationCopy.withOwn)}`);
  console.log(`  generic   ${String(report.demonstrationCopy.generic).padStart(3)}  ${pct(report.demonstrationCopy.generic)}  (these render "Your headline here")`);
  console.log('');
}

/* -- the enforceable half --------------------------------------------- */

if (process.argv.includes('--check')) {
  const unmapped = rows.filter((r) => r.category === 'UNMAPPED');
  const failures = [];

  if (generic.length > 0) {
    failures.push(
      generic.length + ' layout(s) render the generic "Your headline here" and show a shopper'
      + ' nothing about what they are for: ' + generic.map((r) => r.key).join(', ')
      + '. Add an entry to src/lib/create/sampleCopy.ts - a LABEL for each slot, never an invented business.',
    );
  }
  if (unmapped.length > 0) {
    failures.push(
      unmapped.length + ' layout(s) belong to no deliverable category, so the deliverable-first'
      + ' browser cannot surface them: ' + unmapped.map((r) => r.key).join(', ')
      + '. Add them to src/lib/design/deliverables.ts.',
    );
  }

  if (failures.length > 0) {
    console.error('TEMPLATE AUDIT FAILED');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('OK: all ' + rows.length + ' layouts have demonstration copy and a deliverable category.');
}
