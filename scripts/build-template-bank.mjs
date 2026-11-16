#!/usr/bin/env node
// Builds the official Template Bank package from src/data/templateBank.
//
//   node scripts/build-template-bank.mjs            -> ZIP, catalogue PDF, QA report
//   node scripts/build-template-bank.mjs --sheets   -> also contact sheets, and every
//                                                      template in every style
//
// Previews are painted by the app's own canvas renderer in a real browser, so a
// preview cannot differ from what the product exports. That needs Playwright,
// which is a build-time tool here and deliberately not a project dependency.

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { zipSync, strToU8 } from 'fflate';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'template-bank', 'dist');
const CACHE = join(ROOT, 'node_modules', '.cache', 'template-bank');
const SHEETS = process.argv.includes('--sheets');
const AUDIT_ONLY = process.argv.includes('--audit');

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is needed to render previews. Install it (npm i -g playwright) and re-run.');
  process.exit(1);
}

mkdirSync(CACHE, { recursive: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: [join(ROOT, 'scripts', 'template-bank', 'entry.ts')],
  outfile: join(CACHE, 'bank.mjs'),
  bundle: true, format: 'esm', platform: 'node', logLevel: 'warning',
});
const bank = await import(`${pathToFileURL(join(CACHE, 'bank.mjs')).href}?t=${Date.now()}`);
const { BANK_V1, BANK_V1_NAME, BANK_V1_VERSION, DIVISIONS, DESIGN_STYLES, PACKAGE_FORMAT, PACKAGE_FORMAT_VERSION } = bank;

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${origin}/robots.txt`);
await page.evaluate(async () => {
  const [draw, styles, faces, fit] = await Promise.all([
    import('/src/lib/drawTemplate.ts'),
    import('/src/lib/design/styles.ts'),
    import('/src/lib/design/typefaces.ts'),
    import('/src/lib/templateBank/fit.ts'),
  ]);
  const probe = document.createElement('canvas').getContext('2d');
  const measure = (text, font, spacing) => {
    probe.font = font;
    probe.letterSpacing = `${spacing}px`;
    return probe.measureText(text).width;
  };
  window.auditTemplate = ({ definition, sample, style, w, h }) =>
    fit.auditFit(styles.applyStyle(definition, styles.styleOf(style)), sample, w, h, measure);
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/src/index.css';
  document.head.appendChild(css);
  await import('/src/index.css');
  await faces.ensureTypefacesReady();
  window.renderTemplate = ({ definition, sample, style, accent, w, h }) => {
    const st = styles.styleOf(style);
    const styled = styles.applyStyle(definition, st);
    const tone = styles.styleColours(st, accent, styled.scheme);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw.drawTemplateFrame(canvas.getContext('2d'), styled, sample, w, h, { accent: tone.accent, base: tone.base });
    return canvas.toDataURL('image/png');
  };
});

const render = async (t, style, w, h) => {
  const url = await page.evaluate((a) => window.renderTemplate(a), {
    definition: t.definition, sample: t.sample, style, accent: t.previewAccent, w, h,
  });
  return Buffer.from(url.split(',')[1], 'base64');
};

const files = {};
const manifest = {
  format: PACKAGE_FORMAT, formatVersion: PACKAGE_FORMAT_VERSION,
  name: BANK_V1_NAME, version: BANK_V1_VERSION, createdAt: new Date().toISOString(),
  templates: [],
};
const previews = new Map();

for (const t of BANK_V1) {
  const dir = `${t.division}/${t.key}`;
  // Previews are capped at 1600px on the long edge. A billboard master is
  // 4500px wide; shipping that as a PNG per template would be most of the ZIP.
  const k = Math.min(1, 1600 / Math.max(t.dimensions.width, t.dimensions.height));
  const png = AUDIT_ONLY ? Buffer.alloc(0) : await render(t, t.recommendedStyle, Math.round(t.dimensions.width * k), Math.round(t.dimensions.height * k));
  previews.set(t.key, png);
  files[`${dir}/template.json`] = strToU8(`${JSON.stringify(t, null, 2)}\n`);
  files[`${dir}/preview.png`] = new Uint8Array(png);
  manifest.templates.push({
    id: t.id, key: t.key, version: t.version, division: t.division,
    source: `${dir}/template.json`, preview: `${dir}/preview.png`,
  });
}

// Fit audit: does the sample copy fit, in the recommended style, at every
// format the template claims, and in the square the gallery shows it at?
const fitReport = [];
let otherStyleIssues = 0;
for (const t of BANK_V1) {
  const sizes = new Map([['gallery square', [1080, 1080]]]);
  for (const key of t.formats) {
    const f = bank.DESIGN_FORMATS.find((x) => x.key === key);
    sizes.set(key, [f.w, f.h]);
  }
  for (const [name, [w, h]] of sizes) {
    const issues = await page.evaluate((a) => window.auditTemplate(a), { definition: t.definition, sample: t.sample, style: t.recommendedStyle, w, h });
    for (const issue of issues) fitReport.push({ key: t.key, format: name, ...issue });
  }
  for (const st of DESIGN_STYLES) {
    if (st.key === t.recommendedStyle) continue;
    const issues = await page.evaluate((a) => window.auditTemplate(a), { definition: t.definition, sample: t.sample, style: st.key, w: 1080, h: 1080 });
    otherStyleIssues += issues.length;
    for (const issue of issues) fitReport.push({ key: t.key, format: `gallery square, ${st.key} style`, otherStyle: true, ...issue });
  }
}
writeFileSync(join(OUT, 'fit-audit.json'), `${JSON.stringify(fitReport, null, 2)}\n`);
const fitFailures = fitReport.filter((r) => !r.otherStyle);
if (AUDIT_ONLY) {
  for (const r of fitReport) console.log(`${r.otherStyle ? 'other' : 'FIT  '} ${r.key} @ ${r.format}: ${r.detail}`);
  console.log(`${fitFailures.length} in the recommended style, ${otherStyleIssues} in other styles`);
  await browser.close();
  await server.close();
  process.exit(fitReport.length ? 1 : 0);
}

const docs = bank.packageDocs(BANK_V1, manifest);
for (const [name, text] of Object.entries(docs)) files[name] = strToU8(text);
files['manifest.json'] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);

const zip = zipSync(files, { level: 6 });
const zipName = `NOWOPEN-CREATIVE-TEMPLATE-BANK-V${BANK_V1_VERSION.split('.')[0]}.zip`;
writeFileSync(join(OUT, zipName), zip);

// Round trip: read the ZIP back exactly as the admin importer will.
const report = bank.validatePackage(bank.readPackageZip(new Uint8Array(zip)));
const rejected = report.templates.filter((t) => t.verdict === 'rejected');
writeFileSync(join(OUT, 'import-test.json'), `${JSON.stringify({
  package: zipName, sha256: createHash('sha256').update(zip).digest('hex'), bytes: zip.length,
  ok: report.ok, errors: report.errors, warnings: report.warnings, counts: report.counts,
  rejected: rejected.map((t) => ({ key: t.key, errors: t.errors })),
}, null, 2)}\n`);

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function sheet(name, cells, columns, cell = 360) {
  const html = `<html><body style="margin:0;background:#1b1b1f;font:12px system-ui;color:#ddd">
    <div style="display:grid;grid-template-columns:repeat(${columns},${cell}px);gap:14px;padding:14px">
    ${cells.map((c) => `<div><img src="${dataUrl(c.png)}" style="width:${cell}px;height:${cell}px;object-fit:contain;background:#000;display:block"><div style="padding:4px 0">${esc(c.label)}</div></div>`).join('')}
    </div></body></html>`;
  const p = await browser.newPage({ viewport: { width: columns * (cell + 14) + 14, height: 800 } });
  await p.setContent(html);
  await p.screenshot({ path: join(OUT, 'sheets', `${name}.png`), fullPage: true });
  await p.close();
}

if (SHEETS) {
  mkdirSync(join(OUT, 'sheets'), { recursive: true });
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const list = only ? BANK_V1.filter((t) => only.includes(t.key)) : BANK_V1;
  for (let i = 0; i < list.length; i += 12) {
    await sheet(`recommended-${String(i / 12 + 1).padStart(2, '0')}`,
      list.slice(i, i + 12).map((t) => ({ png: previews.get(t.key), label: `${t.id} ${t.name} · ${t.recommendedStyle}` })), 4);
  }
  if (process.argv.includes('--styles')) {
    for (let i = 0; i < list.length; i += 4) {
      const cells = [];
      for (const t of list.slice(i, i + 4)) {
        for (const st of DESIGN_STYLES) cells.push({ png: await render(t, st.key, 720, 720), label: `${t.key} · ${st.key}` });
      }
      await sheet(`styles-${String(i / 4 + 1).padStart(2, '0')}`, cells, 8, 230);
    }
  }
  if (process.argv.includes('--formats')) {
    for (let i = 0; i < list.length; i += 6) {
      const cells = [];
      for (const t of list.slice(i, i + 6)) {
        for (const [w, h] of [[1080, 1920], [1920, 1080], [1800, 600], [1080, 1080]]) {
          cells.push({ png: await render(t, t.recommendedStyle, w, h), label: `${t.key} · ${w}x${h}` });
        }
      }
      await sheet(`formats-${String(i / 6 + 1).padStart(2, '0')}`, cells, 4, 330);
    }
  }
}

// The visual catalogue: one section per division, names and previews.
const byDivision = DIVISIONS.map((d) => ({ ...d, items: BANK_V1.filter((t) => t.division === d.key) })).filter((d) => d.items.length);
const catalogue = `<html><head><style>
  @page { size: A4; margin: 14mm; }
  body { font: 10px/1.4 system-ui, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 30px; margin: 60mm 0 4mm; letter-spacing: -0.02em; }
  h2 { font-size: 17px; margin: 0 0 5mm; border-top: 2px solid #111; padding-top: 3mm; break-before: page; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm 5mm; }
  .card { break-inside: avoid; }
  .card .img { height: 62mm; background: #f1f1ee; display: flex; align-items: center; justify-content: center; }
  .card img { max-width: 100%; max-height: 100%; display: block; }
  .card b { display: block; margin-top: 2mm; font-size: 11px; }
  .muted { color: #666; }
</style></head><body>
  <h1>${esc(BANK_V1_NAME)}</h1>
  <p style="font-size:13px">Version ${esc(BANK_V1_VERSION)} · ${BANK_V1.length} templates · visual catalogue</p>
  <p class="muted" style="max-width:120mm">Every preview is rendered by the NowOpen Create canvas renderer from the template's own definition, in its recommended style and a sample brand colour. Copy is placeholder. No template here has been scored or passed design review.</p>
  ${byDivision.map((d) => `<h2>${esc(d.key.slice(0, 2))} · ${esc(d.label)} <span class="muted">(${d.items.length})</span></h2><div class="grid">
    ${d.items.map((t) => `<div class="card"><div class="img"><img src="${dataUrl(previews.get(t.key))}"></div><b>${esc(t.name)}</b><span class="muted">${esc(t.id)} · ${esc(t.category)} · ${esc(t.designStyle)}</span></div>`).join('')}
  </div>`).join('')}
</body></html>`;
const pdfPage = await browser.newPage();
await pdfPage.setContent(catalogue);
await pdfPage.pdf({ path: join(OUT, 'NOWOPEN-CREATIVE-TEMPLATE-BANK-CATALOGUE.pdf'), format: 'A4', printBackground: true });

await browser.close();
await server.close();

console.log(`${zipName}: ${BANK_V1.length} templates, ${(zip.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`import check: ok=${report.ok} new=${report.counts.new} rejected=${report.counts.rejected}`);
for (const t of rejected) console.log(`  REJECTED ${t.key}: ${t.errors.join('; ')}`);
for (const t of report.templates) for (const w of t.warnings) console.log(`  warn ${t.key}: ${w}`);
console.log(`fit audit: ${fitFailures.length} issue(s) in the recommended style; ${otherStyleIssues} in other styles (see fit-audit.json)`);
for (const r of fitFailures) console.log(`  FIT ${r.key} @ ${r.format}: ${r.detail}`);
if (!report.ok || rejected.length || fitFailures.length) process.exitCode = 1;
