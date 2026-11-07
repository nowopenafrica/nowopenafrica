import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ingestFile, ingestFiles } from './ingestTemplates';
import { classifyArtboard, cleanLabel, formatFor } from './classifyArtboard';
import { DESIGN_TEMPLATES } from '../designTemplates';
import type { MeasuredRun } from './measureArtboard';

const read = (name: string) =>
  readFileSync(`src/test/fixtures/creative-system/${name}.dc.html`, 'utf8');

const file = (name: string, text: string, type = 'text/html') =>
  ({ name, type, text: async () => text });

/*
 * Laying an artboard out needs a browser, so the measurer is injected and
 * the tests hand in the geometry they want to reason about. Everything else
 * — what a file is, whether it may be published, what it is filed as — is a
 * decision, and decisions are tested without a browser.
 */
const measured: MeasuredRun[] = [
  { text: 'SERIES 01', x: 72, y: 80, w: 936, h: 30, fontSize: 24, fontWeight: 600, upper: true, tracking: 0.16, align: 'left', display: false, chip: false },
  { text: 'A big line', x: 72, y: 600, w: 936, h: 300, fontSize: 160, fontWeight: 700, upper: false, tracking: -0.05, align: 'left', display: true, chip: false },
  { text: 'Book now', x: 72, y: 1200, w: 300, h: 70, fontSize: 28, fontWeight: 600, upper: false, tracking: 0, align: 'left', display: false, chip: true },
];
const measure = async () => ({ runs: measured, shapes: [] });
const nothing = async () => ({ runs: [], shapes: [] });

const taken = new Set(DESIGN_TEMPLATES.map((t) => t.key));

describe('one door, two kinds of file', () => {
  it('takes a Claude Design artboard and measures it', async () => {
    const out = await ingestFile(file('T01-Bold-Type.dc.html', read('T01-Bold-Type')), taken, measure);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.sourceFormat).toBe('dc.html');
    expect(out.draft.template.slots.map((s) => s.role)).toContain('headline');
    /* Every slot is live type at a measured position, same as code. */
    expect(out.draft.editability).toBe('full');
  });

  it('recognises an artboard by its content, not only its extension', async () => {
    /* A file saved out of a canvas is often just "Main.html". */
    const out = await ingestFile(file('Main.html', read('T01-Bold-Type')), taken, measure);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.sourceFormat).toBe('dc.html');
  });

  it('takes native template JSON unchanged', async () => {
    const json = JSON.stringify({
      label: 'A layout', category: 'flyers',
      slots: [{ role: 'headline', x: 0.1, y: 0.4, w: 0.8 }],
    });
    const out = await ingestFile(file('x.json', json, 'application/json'), taken, nothing);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.sourceFormat).toBe('json');
    expect(out.draft.category).toBe('flyers');
  });

  it('refuses a picture, with somewhere else to put it', async () => {
    const out = await ingestFile({ name: 'art.png', type: 'image/png', text: async () => '' }, taken, nothing);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/Brand Asset Manager/);
  });

  it('refuses a format with no importer, by name', async () => {
    const out = await ingestFile({ name: 'art.psd', type: '', text: async () => '' }, taken, nothing);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/Photoshop/);
  });

  it('refuses an artboard nothing could be measured on', async () => {
    const out = await ingestFile(file('T01-Bold-Type.dc.html', read('T01-Bold-Type')), taken, nothing);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/Nothing could be measured/);
  });
});

describe('a whole selection at once', () => {
  it('keeps keys unique across the run, so the second file is not lost', async () => {
    const source = read('T01-Bold-Type');
    const results = await ingestFiles(
      [file('Carousel.dc.html', source), file('Carousel.dc.html', source)],
      taken, measure,
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const keys = results.flatMap((r) => (r.ok ? [r.draft.template.key] : []));
    expect(new Set(keys).size).toBe(2);
  });

  it('never lets an import shadow a shipped layout', async () => {
    const victim = DESIGN_TEMPLATES[0].key;
    const source = read('T01-Bold-Type');
    const out = await ingestFile(file(`${victim}.dc.html`, source), taken, measure);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.draft.template.key).not.toBe(victim);
  });

  it('reports progress so a long import is not a frozen screen', async () => {
    const seen: number[] = [];
    const source = read('T01-Bold-Type');
    await ingestFiles(
      [file('a.dc.html', source), file('b.dc.html', source), file('c.dc.html', source)],
      taken, measure, (done) => seen.push(done),
    );
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('filing it where somebody will find it', () => {
  it('reads the name first, because shape alone is ambiguous', () => {
    /* A roll-up and a story are the same shape and are not the same thing. */
    expect(classifyArtboard('Roll-up banner', 425, 1000).category).toBe('flyers');
    expect(classifyArtboard('Launch story', 1080, 1920).category).toBe('social');
    expect(classifyArtboard('Menu A4', 794, 1123).category).toBe('menus');
    expect(classifyArtboard('Business card front', 344, 231).category).toBe('branding');
    expect(classifyArtboard('Invoice A4', 794, 1123).category).toBe('documents');
  });

  it('falls back to the shape, and says that is what happened', () => {
    const tall = classifyArtboard('Untitled', 1080, 1920);
    expect(tall.category).toBe('social');
    expect(tall.because).toMatch(/tall canvas/);
  });

  it('picks the canvas a design belongs on', () => {
    expect(formatFor(1080, 1920)).toBe('story');
    expect(formatFor(1080, 1080)).toBe('instagram-post');
    expect(formatFor(1200, 627)).toBe('linkedin-post');
    /* A 728×90 strip now has a canvas of its own; see the display units
       below. Before it did, nothing shipped was honestly "nearest". */
    expect(formatFor(728, 90)).toBe('display-leaderboard');
  });

  /*
   * Each of these was measured WRONG before the shape-decides rule, and each
   * wrong answer is the same bug the card sizes in studioPresets record: the
   * label changed and the canvas did not.
   */
  it('sends a 4:5 feed post to a 4:5 canvas, not to US Letter', () => {
    expect(formatFor(1080, 1350)).toBe('instagram-portrait');
  });

  it('tells A5 from A4, which share a proportion and nothing else', () => {
    expect(formatFor(559, 794)).toBe('a5');
    expect(formatFor(1240, 1754)).toBe('a4');
  });

  it('does not send a roll-up to a business card', () => {
    /* The artboard is drawn at 0.5 px per millimetre, so its area says
       nothing and only its proportion does. */
    expect(formatFor(425, 1000)).toBe('rollup');
  });

  /*
   * The name decides here and the shape cannot: 344×231 is 91×61mm
   * INCLUDING BLEED, which is proportionally nearer Half A4 than the
   * trimmed 85.6×54 card. Both measurements are right; they are measuring
   * different rectangles.
   */
  it('opens a business card on a business card, on the strength of its name', () => {
    expect(formatFor(344, 231, 'Business card front')).toBe('business-card');
    expect(formatFor(216, 342, 'Staff ID front')).toBe('business-card-portrait');
    /* Without the name, the shape is all there is and says Half A4. */
    expect(formatFor(344, 231)).toBe('half-a4');
  });

  it('refuses a named canvas that would change the shape', () => {
    /* A 48-sheet board is 2:1; the billboard canvas we ship is 3:1. Forcing
       the name would hand back a design of the wrong proportion. */
    expect(formatFor(1600, 800, '48-sheet billboard')).not.toBe('billboard');
  });

  it('serves the display units this platform sells', () => {
    expect(formatFor(300, 250)).toBe('display-mpu');
    expect(formatFor(728, 90)).toBe('display-leaderboard');
  });

  it('returns nothing rather than a wrong canvas', () => {
    /* A 640×1900 email is not a canvas Studio designs on, and the
       product's square default is a stated fallback, not a wrong answer. */
    expect(formatFor(640, 1900)).toBe('');
  });
});

describe('naming a template for the person choosing it', () => {
  it('drops the canvas filing', () => {
    expect(cleanLabel('T15 First 1,000 numeral', 'x')).toBe('First 1,000 numeral');
    expect(cleanLabel('C1 · Display 300×250', 'x')).toBe('Display');
    expect(cleanLabel('Business card front, actual size', 'x')).toBe('Business card front');
  });

  /*
   * Measured on the real set: "A3 campaign poster" and "A5 flyer" use the
   * paper size attributively, and stripping it left "campaign poster" —
   * losing the one thing a print buyer needs.
   */
  it('keeps a paper size that is part of the name', () => {
    expect(cleanLabel('A3 campaign poster', 'x')).toBe('A3 campaign poster');
    expect(cleanLabel('A5 flyer — list your business', 'x')).toBe('A5 flyer — list your business');
  });

  it('falls back rather than returning nothing', () => {
    expect(cleanLabel('T01', 'bold type')).toBe('bold type');
  });
});

describe('a filing code is not a paper size', () => {
  /*
   * MEASURED: `A3-ID-Front.dc.html` is a CR80 staff ID card, 216×342. Its
   * board code on the canvas is "A3", which reads exactly like the poster
   * size — and it was given an A3 canvas. The filename may say what a
   * design is for; only the artboard's own title may say how big it is.
   */
  it('keeps a filename out of the canvas decision', () => {
    const fromBoth = classifyArtboard('Staff ID front A3-ID-Front.dc.html', 216, 342);
    const titleOnly = classifyArtboard('Staff ID front A3-ID-Front.dc.html', 216, 342, 'Staff ID front');
    expect(fromBoth.format).toBe('a3');
    expect(titleOnly.format).toBe('business-card-portrait');
    /* The filename still helps decide what it is for. */
    expect(titleOnly.category).toBe('branding');
  });
});
