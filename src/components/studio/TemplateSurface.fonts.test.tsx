import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import TemplateSurface from './TemplateSurface';
import { templateByKey } from '../../lib/designTemplates';
import { sampleFor } from '../../lib/create/sampleCopy';
import { GLYPH_FALLBACK, glyphFallbackFaces, pairingOf, typefaceOf, TYPEFACES } from '../../lib/design/typefaces';
import { codepointsOf } from '../../lib/design/fontCoverage';

/**
 * A menu with naira prices, rendered the way the gallery renders it.
 *
 * jsdom does no font matching and draws no glyphs, so this proves which stack
 * the price is set in and which self-hosted file in that stack has the ₦. That
 * the browser then shapes it from that file is for a real browser to show.
 */
describe('a ₦ menu is set in its template face', () => {
  const tpl = templateByKey('drinks-menu');
  const content = sampleFor(tpl);

  /** The nearest ancestor that sets a font-family: the one the text inherits. */
  const familyOf = (el: HTMLElement | null): string => {
    for (let n = el; n; n = n.parentElement) if (n.style.fontFamily) return n.style.fontFamily;
    return '';
  };

  it('renders the prices in the look\'s text face, and its headline in the display face', () => {
    expect(tpl.look?.type).toBe('editorial');
    const pairing = pairingOf('editorial');
    render(<TemplateSurface template={tpl} content={content} width={1080} height={1527} accent="#9a3412" />);

    const price = screen.getByText('₦4,500');
    expect(familyOf(price)).toBe(typefaceOf(pairing.text).stack);
    expect(familyOf(price)).toMatch(/^Outfit, "NowOpen Glyph Fallback", Inter,/);

    expect(familyOf(screen.getByText('Drinks'))).toBe(typefaceOf(pairing.display).stack);
  });

  it('has a self-hosted file, second in that stack, that draws ₦', () => {
    const stack = typefaceOf(pairingOf('editorial').text).stack
      .split(',').map((s) => s.trim().replace(/"/g, ''));
    /** The files a family in the stack resolves to, as index.css declares them. */
    const filesOf = (family: string): string[] => {
      if (family === GLYPH_FALLBACK.family) return glyphFallbackFaces().map((f) => f.url);
      const face = TYPEFACES.find((f) => f.family === family);
      return face ? face.weights.map((w) => face.files[w]) : [];
    };
    const drawer = stack.find((family) => {
      const files = filesOf(family);
      return files.length > 0 && files.every((u) => codepointsOf(readFileSync(`public${u}`)).has(0x20a6));
    });
    // Outfit has no naira upstream; the glyph fallback, named second, does
    // (and U+20A6 is inside its unicode-range). Before this, the ₦ fell
    // through to Inter or whatever the device had.
    expect(drawer).toBe(GLYPH_FALLBACK.family);
    expect(stack.indexOf(drawer as string)).toBe(1);
    expect(GLYPH_FALLBACK.unicodeRange).toContain('U+20A0-20CF');
  });
});
