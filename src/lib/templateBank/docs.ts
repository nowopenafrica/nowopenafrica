import { DIVISIONS, MIN_QUALITY_SCORE, QUALITY_CRITERIA, type BankManifest, type BankTemplate } from './package';
import { TYPEFACES } from '../design/typefaces';

/**
 * The documents that travel inside a package, generated from its contents so
 * the README cannot describe a different package from the one it sits in.
 */
export function packageDocs(templates: BankTemplate[], manifest: BankManifest): Record<string, string> {
  const groups = DIVISIONS
    .map((d) => ({ ...d, items: templates.filter((t) => t.division === d.key) }))
    .filter((d) => d.items.length);
  const avg = templates.length
    ? (templates.reduce((sum, t) => sum + t.quality.total, 0) / templates.length).toFixed(1)
    : '0';
  const reviewers = [...new Set(templates.map((t) => t.quality.reviewer))];

  const readme = `# ${manifest.name}

Version ${manifest.version} · ${templates.length} templates · package format ${manifest.format} v${manifest.formatVersion}

## What this is

Editable layout templates for NowOpen Create. Each template folder holds:

- \`template.json\` — metadata plus \`definition\`, a native NowOpen \`DesignTemplate\`.
  The definition is the editable source: slots, shapes and surface as fractions of the
  canvas, so one template renders correctly at every NowOpen format.
- \`preview.png\` — rendered by the NowOpen canvas renderer in the recommended style.

Nothing in this package is a flattened design. Text, colour, typography, style and
format all stay editable after import.

## Importing

1. Open the admin dashboard and choose **Template Bank**.
2. Upload this ZIP. The package is validated in the browser before anything is written.
3. Review the report: missing files, duplicates, rejected templates and scores.
4. Import. All valid templates are written in one database transaction as *pending*.
5. Approve or reject each template, then publish the collection.

Only published templates appear on the public Create page and in Studio.

## Limits of this format

A template can hold text slots, list slots (services, stats, contact, prices), five
kinds of decorative shape and one background photograph or video. It cannot hold
multiple pages, separate image regions, dielines or custom vector artwork. Print
output is RGB with no bleed or crop marks.
`;

  const index = `# Template category index

${groups.map((d) => `## ${d.key.slice(0, 2)} · ${d.label} (${d.items.length})

| ID | Template | Category | Style | Formats | Score |
|---|---|---|---|---|---|
${d.items.map((t) => `| ${t.id} | ${t.name} | ${t.category} — ${t.subcategory} | ${t.designStyle} | ${t.formats.join(', ')} | ${t.quality.total} |`).join('\n')}
`).join('\n')}`;

  const criteria = Object.entries(QUALITY_CRITERIA).map(([k, max]) => `${k} ${max}`).join(', ');
  const qa = `# Quality assurance report

- Templates in this package: ${templates.length}
- Average score: ${avg} / 100 (minimum to enter the bank: ${MIN_QUALITY_SCORE})
- Scored by: ${reviewers.join('; ')}
- Rubric: ${criteria}

## What was checked by machine

Every template passed the structural gate at five formats (square, story, landscape,
A3 and a 240px thumbnail): a headline exists, no slot or list leaves the canvas, no
solid shape covers the headline, type never rounds to nothing, motion settles within
the limit, and the template carries enough tags to be found.

## What was checked by eye

Every template was rendered through the product's canvas renderer and inspected in
its recommended style, in all built-in styles, and at story, landscape and A4 sizes.

## What was not done

The scores are the author's own. They are not an independent design review, and the
"imagery" criterion is scored on how well the layout carries a photograph the
customer supplies, because the package ships no photography.

## Scores

| ID | Template | Total |
|---|---|---|
${templates.map((t) => `| ${t.id} | ${t.name} | ${t.quality.total} |`).join('\n')}
`;

  const licences = `# Licences and assets

## Templates

${[...new Set(templates.map((t) => t.licence))].map((l) => `- ${l}`).join('\n')}

## Typefaces

Not included in this package. NowOpen Create self-hosts them; templates refer to them by key.

| Family | Licence | Source |
|---|---|---|
${TYPEFACES.map((f) => `| ${f.family} | ${f.licence} | ${f.source} |`).join('\n')}

## Imagery

None. No photographs, illustrations, icons or third-party graphics are included.
Decorative geometry is drawn by the renderer from the template definition.
`;

  return {
    'README.md': readme,
    'TEMPLATE-INDEX.md': index,
    'QA-REPORT.md': qa,
    'LICENSES-AND-ASSETS.md': licences,
  };
}
