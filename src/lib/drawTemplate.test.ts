import { describe, it, expect } from 'vitest';
import { drawTemplateFrame, wrapLines, gradientLine, coverRect } from './drawTemplate';
import { DESIGN_TEMPLATES, templateByKey, settleTime } from './designTemplates';

const CONTENT = {
  brand: 'Mama Put Kitchen',
  eyebrow: 'This weekend',
  headline: 'Two plates for the price of one',
  subline: 'Friday to Sunday, dine in only',
  meta: 'nowopenafrica.com/mama-put',
  cta: 'Book now',
};

/**
 * A recording stand-in for a 2D context. jsdom has no canvas, and what matters
 * is the sequence of drawing calls, not the pixels — that is what proves the
 * painter reached every slot with the right text.
 */
function stubCtx(charWidth = 10) {
  const calls: { op: string; args: unknown[] }[] = [];
  const rec = (op: string) => (...args: unknown[]) => { calls.push({ op, args }); };
  const ctx = {
    canvas: { width: 1080, height: 1080 },
    filter: 'none',
    letterSpacing: '0px',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    save: rec('save'),
    restore: rec('restore'),
    clearRect: rec('clearRect'),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    fillText: rec('fillText'),
    translate: rec('translate'),
    scale: rec('scale'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    quadraticCurveTo: rec('quadraticCurveTo'),
    rect: rec('rect'),
    clip: rec('clip'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    drawImage: rec('drawImage'),
    measureText: (s: string) => ({ width: s.length * charWidth }),
    createLinearGradient: () => ({ addColorStop: rec('stopL') }),
    createRadialGradient: () => ({ addColorStop: rec('stopR') }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, texts: () => calls.filter(c => c.op === 'fillText').map(c => String(c.args[0])) };
}

describe('drawTemplateFrame', () => {
  it('reports failure instead of throwing when there is no context', () => {
    expect(drawTemplateFrame(null, DESIGN_TEMPLATES[0], CONTENT, 1080, 1080, { accent: '#9a3412' })).toBe(false);
    expect(drawTemplateFrame({} as CanvasRenderingContext2D, DESIGN_TEMPLATES[0], CONTENT, 1080, 1080, { accent: '#9a3412' })).toBe(false);
  });

  it('paints a surface and the headline for every template', () => {
    for (const tpl of DESIGN_TEMPLATES) {
      const { ctx, calls, texts } = stubCtx();
      expect(drawTemplateFrame(ctx, tpl, CONTENT, 1080, 1080, { accent: '#9a3412' }), tpl.key).toBe(true);
      expect(calls.some(c => c.op === 'fillRect'), tpl.key).toBe(true);
      // The headline may wrap, and some templates set it in caps, so match a
      // fragment case-insensitively rather than the whole string.
      expect(texts().join(' ').toLowerCase(), tpl.key).toContain('two plates');
    }
  });

  it('draws nothing for a slot that has not arrived yet', () => {
    const tpl = templateByKey('editorial-split');
    const early = stubCtx();
    drawTemplateFrame(early.ctx, tpl, CONTENT, 1080, 1080, { accent: '#9a3412', t: 0 });
    expect(early.texts().join(' ')).not.toContain('Two plates');

    const late = stubCtx();
    drawTemplateFrame(late.ctx, tpl, CONTENT, 1080, 1080, { accent: '#9a3412', t: settleTime(tpl) });
    expect(late.texts().join(' ')).toContain('Two plates');
  });

  it('skips an empty slot rather than painting its chrome', () => {
    const { ctx, texts } = stubCtx();
    drawTemplateFrame(ctx, templateByKey('warm-offer'), { ...CONTENT, subline: '' }, 1080, 1080, { accent: '#9a3412' });
    expect(texts().join(' ')).not.toContain('Friday');
  });

  it('clips a wipe instead of fading it', () => {
    const { ctx, calls } = stubCtx();
    // street-poster's headline wipes in from 0.35s.
    drawTemplateFrame(ctx, templateByKey('street-poster'), CONTENT, 1080, 1080, { accent: '#9a3412', t: 0.5 });
    expect(calls.some(c => c.op === 'clip')).toBe(true);
  });

  it('uppercases where the template asks for caps', () => {
    const { ctx, texts } = stubCtx();
    drawTemplateFrame(ctx, templateByKey('street-poster'), CONTENT, 1080, 1080, { accent: '#9a3412' });
    expect(texts().some(t => t === t.toUpperCase() && /[A-Z]/.test(t))).toBe(true);
  });

  it('survives a media source that cannot be drawn', () => {
    // A cross-origin or not-yet-decoded frame throws from drawImage. Losing the
    // photo is acceptable; losing the whole frame is not.
    const { ctx } = stubCtx();
    (ctx as unknown as { drawImage: () => void }).drawImage = () => { throw new Error('tainted'); };
    const media = { width: 800, height: 600 } as unknown as CanvasImageSource;
    expect(drawTemplateFrame(ctx, DESIGN_TEMPLATES[0], { ...CONTENT, media }, 1080, 1080, { accent: '#9a3412' })).toBe(true);
  });

  it('tolerates a context without filter or letterSpacing support', () => {
    const { ctx } = stubCtx();
    Object.defineProperty(ctx, 'filter', { get: () => 'none', set: () => { throw new Error('unsupported'); } });
    expect(drawTemplateFrame(ctx, templateByKey('quiet-luxe'), CONTENT, 1080, 1080, { accent: '#9a3412', t: 0.7 })).toBe(true);
  });
});

describe('wrapLines', () => {
  const measure = (s: string) => s.length * 10;

  it('breaks on words to fit the width', () => {
    expect(wrapLines(measure, 'one two three four', 100)).toEqual(['one two', 'three four']);
  });

  it('returns nothing for empty input rather than a blank line', () => {
    expect(wrapLines(measure, '', 100)).toEqual([]);
    expect(wrapLines(measure, '   ', 100)).toEqual([]);
  });

  it('keeps an over-long word whole instead of hyphenating a business name', () => {
    const lines = wrapLines(measure, 'Abrakadabrakadabra', 50);
    expect(lines).toEqual(['Abrakadabrakadabra']);
  });

  it('truncates with an ellipsis at the line limit', () => {
    const lines = wrapLines(measure, 'a b c d e f g h i j k l m n o p', 30, 2);
    expect(lines.length).toBe(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('does not add an ellipsis when everything fits', () => {
    const lines = wrapLines(measure, 'short line', 200, 3);
    expect(lines.join('')).not.toContain('…');
  });
});

describe('gradientLine', () => {
  it('sends 0deg upward, matching CSS rather than canvas convention', () => {
    const l = gradientLine(0, 100, 100);
    expect(l.y0).toBeGreaterThan(l.y1);
    expect(Math.round(l.x0)).toBe(Math.round(l.x1));
  });

  it('sends 90deg rightward', () => {
    const l = gradientLine(90, 100, 100);
    expect(l.x1).toBeGreaterThan(l.x0);
    expect(Math.round(l.y0)).toBe(Math.round(l.y1));
  });

  it('spans the box for a diagonal', () => {
    const l = gradientLine(45, 200, 100);
    const len = Math.hypot(l.x1 - l.x0, l.y1 - l.y0);
    expect(len).toBeGreaterThan(100);
  });
});

describe('coverRect', () => {
  it('fills the frame and centres the overflow', () => {
    const r = coverRect(200, 100, 100, 100);
    expect(r.w).toBeGreaterThanOrEqual(100);
    expect(r.h).toBeGreaterThanOrEqual(100);
    expect(r.x).toBeLessThanOrEqual(0);
  });

  it('degrades to the frame for a source with no dimensions', () => {
    expect(coverRect(0, 0, 100, 50)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });
});
