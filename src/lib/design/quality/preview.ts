/**
 * C6, broken preview: the card render throws, or shows a missing image.
 *
 * Separate from automatedCriticals so that stays pure and fast: this one needs
 * a DOM (jsdom in tests). It renders TemplateSurface for every page the way
 * the gallery card does (the default style, the demo copy, the page at its
 * card size) and reports a throw, an <img> with no source, or a local image
 * path that is not in public/.
 *
 * Photographs the gallery adds to photoLed cards (previewMedia.ts) are passed
 * at render time and are not part of the template, so they are not rendered
 * here: they are the gallery's, and Task 17 replaces them.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import TemplateSurface from '../../../components/studio/TemplateSurface';
import type { DesignTemplate } from '../../designTemplates';
import { sampleFor } from '../../create/sampleCopy';
import { DESIGN_STYLES, applyStyle, styleColours } from '../styles';
import { pagesOf } from './checks/copy';
import { canvasFor } from './checks/geometry';
import { GALLERY_ACCENT } from './checks/styled';
import type { CriticalFailure } from './critical';

/** The gallery lays every card out inside this square. */
const CARD = 1080;

const missingLocal = (src: string): boolean =>
  src.startsWith('/') && !src.startsWith('//') && !existsSync(join(process.cwd(), 'public', src.split(/[?#]/)[0]));

export function previewCriticals(tpl: DesignTemplate): CriticalFailure[] {
  const out: CriticalFailure[] = [];
  const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const wasAct = g.IS_REACT_ACT_ENVIRONMENT;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const quiet = console.error;
  try {
    const style = DESIGN_STYLES[0];
    const styled = applyStyle(tpl, style);
    const tone = styleColours(style, GALLERY_ACCENT, styled.scheme);
    const c = canvasFor(tpl);
    const k = CARD / Math.max(c.w, c.h);
    const w = Math.round(c.w * k);
    const h = Math.round(c.h * k);
    for (const page of pagesOf(styled)) {
      // React logs an uncaught render error before rethrowing it; the throw is what is reported.
      console.error = () => {};
      act(() => {
        root.render(createElement(TemplateSurface, {
          template: { ...styled, slots: page.slots },
          content: sampleFor(tpl), width: w, height: h, accent: tone.accent, base: tone.base,
        }));
      });
      console.error = quiet;
      for (const img of Array.from(host.querySelectorAll('img'))) {
        const src = img.getAttribute('src') ?? '';
        if (!src) out.push({ code: 'C6', detail: `${page.name}: an image has no source` });
        else if (missingLocal(src)) out.push({ code: 'C6', detail: `${page.name}: image ${src} is not in public/` });
      }
    }
  } catch (e) {
    out.push({ code: 'C6', detail: `render threw: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    console.error = quiet;
    try { act(() => root.unmount()); } catch { /* already torn down by the error */ }
    host.remove();
    g.IS_REACT_ACT_ENVIRONMENT = wasAct;
  }
  return out;
}
