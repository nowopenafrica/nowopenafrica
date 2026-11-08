/**
 * The pilot collection (Task 18): the twenty render, and clear the automated
 * half of the quality standard, at their own canvases.
 *
 * NODE + jsdom: the criticals read the shipped font files (critical.ts), and
 * the render needs a DOM. Nothing here lays text out; jsdom cannot. What a
 * page LOOKS like is the founder's review, on screenshots.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import TemplateSurface from '../../components/studio/TemplateSurface';
import { DESIGN_TEMPLATES } from '../designTemplates';
import { subcategoryFor } from '../create/catalogueTaxonomy';
import { sampleFor } from '../create/sampleCopy';
import { directionOverflow, distinctnessIssues } from './composition';
import { deliverableFor } from './deliverables';
import { previewPhotoFor } from './previewMedia';
import { PILOT_TEMPLATES } from './pilotTemplates';
import { automatedCriticals } from './quality/critical';
import { externalUrls } from './quality/checks/assets';
import { pagesOf } from './quality/checks/copy';
import { canvasFor } from './quality/checks/geometry';
import { previewCriticals } from './quality/preview';

const MANIFEST = { assets: [] };
const keys = PILOT_TEMPLATES.map((t) => t.key);
const inSub = (sub: string) => PILOT_TEMPLATES.filter((t) => subcategoryFor(t)?.key === sub);

/** Render every page of a template at its true canvas; report a throw or an image without a source. */
function renderProblems(key: string): string[] {
  const tpl = PILOT_TEMPLATES.find((t) => t.key === key)!;
  const { w, h } = canvasFor(tpl);
  const problems: string[] = [];
  const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const was = g.IS_REACT_ACT_ENVIRONMENT;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const quiet = console.error;
  try {
    for (const page of pagesOf(tpl)) {
      // With and without the gallery's preview photograph, as a photo-led card is shown both ways.
      for (const mediaUrl of tpl.photoLed ? [null, previewPhotoFor(tpl.key)] : [null]) {
        console.error = () => {};
        act(() => {
          root.render(createElement(TemplateSurface, {
            template: { ...tpl, slots: page.slots },
            content: sampleFor(tpl), width: w, height: h, accent: '#2563eb', mediaUrl,
          }));
        });
        console.error = quiet;
        const surface = host.firstElementChild as HTMLElement | null;
        if (!surface) problems.push(`${page.name}: rendered nothing`);
        else if (surface.style.width !== `${w}px` || surface.style.height !== `${h}px`) {
          problems.push(`${page.name}: drew ${surface.style.width} x ${surface.style.height}, not ${w} x ${h}`);
        }
        for (const img of Array.from(host.querySelectorAll('img'))) {
          if (!img.getAttribute('src')) problems.push(`${page.name}: an image has no source`);
        }
      }
    }
  } catch (e) {
    problems.push(`render threw: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    console.error = quiet;
    try { act(() => root.unmount()); } catch { /* torn down by the error */ }
    host.remove();
    g.IS_REACT_ACT_ENVIRONMENT = was;
  }
  return problems;
}

describe('the pilot collection', () => {
  it('is twenty designs: eight cards, six posts, six 48-sheets, all in the library', () => {
    expect(PILOT_TEMPLATES).toHaveLength(20);
    expect(inSub('business-card')).toHaveLength(8);
    expect(inSub('instagram-post')).toHaveLength(6);
    expect(inSub('billboard-48-sheet')).toHaveLength(6);
    for (const key of keys) expect(DESIGN_TEMPLATES.some((t) => t.key === key), key).toBe(true);
  });

  it('opens each on its product canvas', () => {
    const want: Record<string, string> = {
      'business-card': 'business-card', 'instagram-post': 'instagram-portrait', 'billboard-48-sheet': 'board-48-sheet',
    };
    for (const t of PILOT_TEMPLATES) expect(deliverableFor(t)?.format, t.key).toBe(want[subcategoryFor(t)!.key]);
  });

  it('uses each direction at most once in a product, and every direction on the cards', () => {
    for (const sub of ['business-card', 'instagram-post', 'billboard-48-sheet']) {
      const dirs = inSub(sub).map((t) => t.direction);
      expect(new Set(dirs).size, sub).toBe(dirs.length);
    }
    expect(new Set(inSub('business-card').map((t) => t.direction)).size).toBe(8);
  });

  it('keeps every pair in a product at distance 3 or more, with no direction overflowing', () => {
    expect(distinctnessIssues(PILOT_TEMPLATES)).toEqual([]);
    expect(directionOverflow(PILOT_TEMPLATES)).toEqual([]);
    // And against the whole library, where the undirected designs are not compared.
    expect(distinctnessIssues(DESIGN_TEMPLATES)).toEqual([]);
    expect(directionOverflow(DESIGN_TEMPLATES)).toEqual([]);
  });

  it('never repeats a palette across the twenty', () => {
    const palettes = PILOT_TEMPLATES.map((t) => t.look?.palette);
    expect(palettes.every(Boolean)).toBe(true);
    expect(new Set(palettes).size).toBe(palettes.length);
  });

  it('gives every card a back, and the industry designs a real trade', () => {
    for (const t of inSub('business-card')) expect(t.extraPages?.length, t.key).toBe(1);
    for (const t of PILOT_TEMPLATES.filter((x) => x.direction === 'industry')) {
      expect(t.industries?.length, t.key).toBe(1);
    }
  });

  it('carries no image of its own and no icon set', () => {
    for (const t of PILOT_TEMPLATES) {
      expect(externalUrls(t), t.key).toEqual([]);
      expect(t.iconSet, t.key).toBeUndefined();
    }
  });

  it('has no automated critical failure', () => {
    const failures = PILOT_TEMPLATES.flatMap((t) =>
      automatedCriticals(t, DESIGN_TEMPLATES, MANIFEST).map((c) => `${t.key}: ${c.code} ${c.detail}`));
    expect(failures).toEqual([]);
  });

  it('renders every page as the gallery card does (C6)', () => {
    const failures = PILOT_TEMPLATES.flatMap((t) => previewCriticals(t).map((c) => `${t.key}: ${c.code} ${c.detail}`));
    expect(failures).toEqual([]);
  });

  it.each(keys)('renders %s at its true canvas, every page, without throwing', (key) => {
    expect(renderProblems(key)).toEqual([]);
  });
});
