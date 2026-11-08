/**
 * Template quality report. Run: npm run audit:quality [-- --json]
 * Per category and subcategory: directions present, whether it is shown, and
 * each template's score, criticals and stale-review status; then the formats
 * due for re-verification. Needs vite-node (the scorer is Node-only).
 */
import { DESIGN_TEMPLATES } from '../src/lib/designTemplates';
import { localDateISO } from '../src/lib/dates';
import { CATEGORIES, MIN_DIRECTIONS } from '../src/lib/create/catalogueTaxonomy';
import { buildReport, formatsDue } from '../src/lib/design/quality/report';

const today = localDateISO();
const rows = buildReport(DESIGN_TEMPLATES, { assets: [] }, today);
const due = formatsDue(today);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ today, rows, formatsDue: due.map((f) => f.key) }, null, 2));
} else {
  console.log(`\nTEMPLATE QUALITY REPORT - ${today}`);
  console.log('Checks not run here: C8 not checked; C6 checked in tests.\n');
  for (const c of CATEGORIES) {
    const subs = rows.filter((r) => r.category === c.key);
    console.log(`${c.name}`);
    if (subs.length === 0) console.log('  (no subcategories yet)');
    for (const r of subs) {
      console.log(`  ${r.subcategoryName} [${r.subcategory}]  listed ${r.listedDirections}/${MIN_DIRECTIONS} directions (${r.directions} present in drafts)  ${r.shown ? 'SHOWN' : 'hidden'}  templates ${r.templates.length}`);
      for (const t of r.templates) {
        const flags = [
          t.listed ? 'listed' : 'unlisted',
          t.stale ? 'STALE REVIEW' : null,
          t.criticals.length ? `criticals ${t.criticals.join(',')}` : 'no criticals',
        ].filter(Boolean).join(', ');
        console.log(`      ${t.key.padEnd(26)} ${t.score.toFixed(1).padStart(5)}  ${flags}`);
      }
    }
    console.log('');
  }
  console.log(`Formats due for re-verification (${due.length}):`);
  for (const f of due) console.log(`  ${f.key}  ${f.verifiedAt ? `last verified ${f.verifiedAt}` : 'never verified'}`);
  console.log('');
}
