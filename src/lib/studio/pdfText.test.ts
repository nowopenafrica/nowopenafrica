import { describe, expect, it } from 'vitest';

import type { Bitmap } from './reference';
import {
  groupTextLines, hasUsableText, inkColour, patchColour, type PdfTextPiece,
} from './pdfText';

const piece = (
  str: string, x: number, y: number, width: number, height = 20, extra: Partial<PdfTextPiece> = {},
): PdfTextPiece => ({ str, x, y, width, height, bold: false, italic: false, ...extra });

describe('runs are regrouped into lines a person would recognise', () => {
  /*
   * pdf.js splits on every change of font, kerning or colour, so one
   * headline arrives as several items. Importing those as separate text
   * objects is faithful and useless — nobody edits a headline in eight boxes.
   */
  it('joins runs that share a baseline', () => {
    const lines = groupTextLines([
      piece('Open ', 10, 100, 60),
      piece('late', 72, 100, 40),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('Open late');
  });

  it('keeps separate baselines apart, in reading order', () => {
    const lines = groupTextLines([
      piece('Second', 10, 140, 70),
      piece('First', 10, 100, 60),
    ]);
    expect(lines.map((l) => l.text)).toEqual(['First', 'Second']);
  });

  /*
   * A run break is not a space: pdf.js splits mid-word on a kerning pair, so
   * joining every run with " " puts spaces inside words.
   */
  it('does not insert a space where the runs are touching', () => {
    const lines = groupTextLines([
      piece('Wa', 10, 100, 30),
      piece('ter', 40, 100, 30),
    ]);
    expect(lines[0].text).toBe('Water');
  });

  it('does insert one where a reader would see a gap', () => {
    const lines = groupTextLines([
      piece('Name', 10, 100, 40),
      piece('₦500', 200, 100, 40),
    ]);
    expect(lines[0].text).toBe('Name ₦500');
  });

  /*
   * Compared on the centre, not the top: a superscript or a smaller currency
   * symbol on the same baseline has a different top and belongs to the line.
   */
  it('keeps a smaller run on the same line', () => {
    const lines = groupTextLines([
      piece('5,000', 40, 100, 60, 20),
      piece('₦', 10, 104, 14, 12),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('₦ 5,000');
  });

  it('reports the line box and the dominant size', () => {
    const [line] = groupTextLines([
      piece('Big', 10, 100, 80, 40),
      piece('small', 95, 112, 40, 16),
    ]);
    expect(line.x).toBe(10);
    expect(line.y).toBe(100);
    expect(line.width).toBe(125);
    expect(line.size).toBe(40);
  });

  it('calls a line bold when most of its width is bold', () => {
    expect(groupTextLines([
      piece('Heavy', 10, 100, 80, 20, { bold: true }),
      piece(' tail', 92, 100, 20),
    ])[0].bold).toBe(true);
    expect(groupTextLines([
      piece('Light', 10, 100, 80),
      piece(' bit', 92, 100, 20, 20, { bold: true }),
    ])[0].bold).toBe(false);
  });

  it('drops whitespace-only runs', () => {
    expect(groupTextLines([piece('   ', 10, 100, 10), piece('', 30, 100, 0)])).toEqual([]);
  });
});

describe('deciding whether a page is text or a picture', () => {
  const line = (text: string, width: number) => ({
    text, x: 0, y: 0, width, height: 20, size: 20, bold: false,
  });

  it('treats a real page of text as text', () => {
    expect(hasUsableText([
      line('Mama Chi Kitchen — open until 9pm', 400),
      line('Jollof, suya and fresh fish daily', 380),
    ], 1000)).toBe(true);
  });

  /*
   * A scan sometimes carries a stray OCR character or a stamped page number.
   * Rebuilding that as "the text of the page" is worse than admitting the
   * page is a picture.
   */
  it('treats a stray page number as a picture', () => {
    expect(hasUsableText([line('12', 20)], 1000)).toBe(false);
    expect(hasUsableText([line('a', 8), line('b', 8)], 1000)).toBe(false);
    expect(hasUsableText([], 1000)).toBe(false);
  });

  it('refuses text that spans almost nothing', () => {
    expect(hasUsableText([
      line('aaaaaaaaaaaaaa', 40), line('bbbbbbbbbbbbbb', 40),
    ], 1000)).toBe(false);
  });
});

describe('sampling the page so edited text does not ghost', () => {
  /** A bitmap with a solid background and a dark band where "text" sits. */
  function page(bg: [number, number, number], ink: [number, number, number]): Bitmap {
    const width = 40;
    const height = 40;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const inText = y >= 18 && y < 24 && x >= 10 && x < 30;
        const [r, g, b] = inText ? ink : bg;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    return { width, height, data };
  }

  const box = { x: 10, y: 18, width: 20, height: 6 };

  it('takes the patch from around the line, not from the ink', () => {
    const cream = page([250, 247, 240], [17, 24, 39]);
    expect(patchColour(cream, box)).toBe('#faf7f0');
  });

  it('reads the ink colour out of the line itself', () => {
    const red = page([255, 255, 255], [220, 38, 38]);
    expect(inkColour(red, box)).toBe('#dc2626');
  });

  it('falls back to paper when there is nothing around to sample', () => {
    const tiny: Bitmap = { width: 2, height: 1, data: new Uint8ClampedArray(8) };
    expect(patchColour(tiny, { x: 0, y: 0, width: 2, height: 1 })).toBe('#ffffff');
  });
});
