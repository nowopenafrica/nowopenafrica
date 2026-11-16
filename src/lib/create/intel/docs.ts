// Renders the generated half of docs/creative-intelligence/ from the registry.
//
// Pure functions, so `scripts/intel-docs.ts` can write the files and
// `intel.test.ts` can prove the files on disk still match the registry.
// The hand-written documents (README, fundamentals, print-production) are not
// generated and are not listed here.

import { TYPEFACES, typefaceOf } from '../../design/typefaces';
import { paletteOf } from '../../design/palettes';
import { ARCHETYPES, archetypeOf } from './archetypes';
import { ALL_PAIRINGS, FACE_GAPS } from './pairings';
import { MOVEMENTS, movementOf } from './movements';
import { INDUSTRIES } from './industries';
import { TRENDS } from './trends';
import { IMAGERY_RULES, PHOTOGRAPHY } from './photography';
import { REQUEST_FAMILIES } from './requests';

const HEAD = (title: string, source: string) =>
  `# ${title}\n\n> Generated from \`src/lib/create/intel/${source}\` by \`npm run intel:docs\`. Edit the registry, not this file; a test fails when they differ.\n`;

const list = (items: string[]) => items.map((i) => `- ${i}`).join('\n');
const mv = (key: string) => movementOf(key)?.name ?? key;

export function renderMovements(): string {
  const out: string[] = [HEAD('Design movements', 'movements.ts')];
  out.push(`${MOVEMENTS.length} movements. Each is a set of decisions that belong together. Choosing one means refusing the others for that piece. "Avoid when" matters as much as "Use when": most bad design is a good movement in the wrong place.\n`);
  out.push('These are public design history in our own words. Nothing here describes or copies a specific design.\n');
  out.push('| Movement | Group | Leads with | Use when (first reason) |\n|---|---|---|---|');
  for (const m of MOVEMENTS) out.push(`| [${m.name}](#${m.key}) | ${m.group} | ${archetypeOf(m.archetypes[0]).name} | ${m.useWhen[0]} |`);
  for (const m of MOVEMENTS) {
    const pal = paletteOf(m.samplePalette);
    out.push(`\n<a id="${m.key}"></a>\n## ${m.name}\n`);
    out.push(`${m.origin}\n`);
    out.push(`**Principles**\n${list(m.principles)}\n`);
    out.push(`- **Grid:** ${m.grid}\n- **Typography:** ${m.typography}\n- **Colour:** ${m.colour}\n- **Imagery:** ${m.imagery.join(', ')}\n- **Compositions:** ${m.archetypes.map((a) => archetypeOf(a).name).join('; ')}\n- **Pairings we ship:** ${m.pairings.join(', ')}\n- **Palette families:** ${m.paletteFamilies.join(', ')} (sample: ${pal?.name ?? m.samplePalette})\n`);
    out.push(`**Use when**\n${list(m.useWhen)}\n`);
    out.push(`**Avoid when**\n${list(m.avoidWhen)}\n`);
    out.push(`**Pitfalls**\n${list(m.pitfalls)}`);
  }
  out.push('\n## Composition archetypes\n');
  out.push('The generators are built in CI-3. Three concepts for one brief must use three different archetypes.\n');
  out.push('| Archetype | Idea | Leads with | Needs a picture |\n|---|---|---|---|');
  for (const a of ARCHETYPES) out.push(`| ${a.name} | ${a.idea} | ${a.hierarchy} | ${a.needsImage ? 'yes' : 'no'} |`);
  return out.join('\n') + '\n';
}

export function renderIndustries(): string {
  const out: string[] = [HEAD('Industry profiles', 'industries.ts')];
  out.push(`${INDUSTRIES.length} profiles. A profile gives the brief engine its defaults: who is looking, what the piece must achieve, what it cannot leave out, and which movements help or hurt.\n`);
  out.push('"Cautions" are prompts to check, not legal advice. Advertising rules differ by country.\n');
  for (const i of INDUSTRIES) {
    out.push(`\n<a id="${i.key}"></a>\n## ${i.name}\n`);
    out.push(`*${i.group}*\n`);
    out.push(`- **Audience:** ${i.audience}\n- **Tone:** ${i.tone}\n- **Movements that fit:** ${i.fits.map(mv).join(', ')}\n- **Usually wrong:** ${i.avoid.map(mv).join(', ')}\n- **Often needs:** ${i.deliverables.join(', ')}\n`);
    out.push(`**Goals**\n${list(i.goals)}\n`);
    out.push(`**Must carry**\n${list(i.mustCarry)}\n`);
    out.push(`**Imagery**\n${list(i.imagery)}\n`);
    out.push(`**Cautions**\n${list(i.cautions)}`);
  }
  return out.join('\n') + '\n';
}

export function renderTrends(): string {
  const out: string[] = [HEAD('Trends 2026', 'trends.ts')];
  out.push('A trend is a note about what is current, not a rule. It ages, so each entry has the date it was written and a review-by date. A test fails once a review-by date passes.\n');
  out.push('**These are editorial observations, not measured facts. None cites a statistic.** Every entry is `proposed` until the founder approves it. Proposed trends are ignored by the concept engine and never shown to customers.\n');
  out.push('| Trend | Status | Added | Review by | Shows up in |\n|---|---|---|---|---|');
  for (const t of TRENDS) out.push(`| ${t.name} | ${t.status} | ${t.added} | ${t.reviewBy} | ${t.movements.map(mv).join(', ')} |`);
  for (const t of TRENDS) out.push(`\n## ${t.name}\n\n${t.summary}\n\n- **Caution:** ${t.caution}\n- **Basis:** ${t.basis}`);
  return out.join('\n') + '\n';
}

export function renderTypography(): string {
  const out: string[] = [HEAD('Typography', 'pairings.ts')];
  out.push('Customer designs use only faces we self-host with a recorded licence. NowOpen Create\'s own interface uses Coolvetica; customer designs do not inherit it.\n');
  out.push('## Faces we ship\n');
  out.push('| Key | Face | Role | Weights | Licence |\n|---|---|---|---|---|');
  for (const f of TYPEFACES) out.push(`| ${f.key} | ${f.label} | ${f.role} | ${f.weights.join(', ')} | ${f.licence} |`);
  out.push('\n## Pairings\n');
  out.push('A pairing is the decision already made: which face carries the headline, which the reading, which the small labels.\n');
  out.push('| Pairing | Display | Text | Accent | Suits | Movements |\n|---|---|---|---|---|---|');
  for (const p of ALL_PAIRINGS) {
    const used = MOVEMENTS.filter((m) => m.pairings.includes(p.key)).map((m) => m.name);
    out.push(`| ${p.label} (\`${p.key}\`) | ${typefaceOf(p.display).label} | ${typefaceOf(p.text).label} | ${typefaceOf(p.accent).label} | ${p.suits} | ${used.join(', ') || 'none yet'} |`);
  }
  out.push('\n## Rules\n');
  out.push(list([
    'Two families per piece at most, in three weights at most. Contrast comes from size and weight.',
    'A steep scale: headline at least 3x body on posts and billboards; name at least 1.6x details on cards.',
    'Capitals for labels are tracked +4 to +12%. Large headlines are tracked slightly negative. Body stays at 0.',
    'Real typographic marks: curly quotes, en and em dashes where the language uses them, the naira sign from the face itself.',
    'No widows or orphans in headlines; balance the lines.',
    'Aligned (tabular) figures in prices, times and contact blocks.',
    'A monospace face is for small labels and codes, never a headline, and never on luxury, corporate or clinical work where it reads as software.',
    'Script is for one word, never a sentence, and never in capitals.',
  ]));
  out.push('\n## Voices we cannot produce yet\n');
  out.push('Four of the six gaps found in CI-1 were closed on 16 November 2026 (Jost, Bodoni Moda, Zilla Slab and Cormorant Garamond, one display weight each). Two remain. Neither is installed.\n');
  out.push('| Missing voice | Weakens | Candidate | Licence | What the check found |\n|---|---|---|---|---|');
  for (const g of FACE_GAPS) out.push(`| ${g.voice} | ${g.movements.map(mv).join(', ')} | ${g.candidate} | ${g.licence} | ${g.finding} |`);
  return out.join('\n') + '\n';
}

export function renderPhotography(): string {
  const out: string[] = [HEAD('Photography and imagery direction', 'photography.ts')];
  out.push('The CI-0 baseline found that 28 of 35 scored designs had no photograph, and 6 of the 7 that did showed the wrong subject. Relevance comes first: a picture of the wrong thing is worse than no picture.\n');
  out.push(`## Rules for every picture\n\n${list(IMAGERY_RULES)}\n`);
  for (const p of PHOTOGRAPHY) out.push(`\n## ${p.name}\n\n${p.brief}\n\n**Do**\n${list(p.rules)}\n\n**Never**\n${list(p.never)}`);
  return out.join('\n') + '\n';
}

export function renderRequests(): string {
  const out: string[] = [HEAD('Request taxonomy', 'requests.ts')];
  out.push('The seven kinds of thing people ask Create for. They sit above the catalogue categories and map onto them.\n');
  for (const r of REQUEST_FAMILIES) out.push(`\n## ${r.name}\n\n- **Catalogue categories:** ${r.categories.join(', ')}\n\n**Examples**\n${list(r.examples)}\n\n**The brief must settle**\n${list(r.briefMustSettle)}`);
  return out.join('\n') + '\n';
}

/** File name under docs/creative-intelligence/ → its generated content. */
export const GENERATED_DOCS: Record<string, () => string> = {
  'movements.md': renderMovements,
  'industries.md': renderIndustries,
  'trends-2026.md': renderTrends,
  'typography.md': renderTypography,
  'photography.md': renderPhotography,
  'request-taxonomy.md': renderRequests,
};
