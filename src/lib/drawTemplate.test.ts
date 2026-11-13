import { describe, it, expect, vi } from 'vitest';
import { drawTemplateFrame, wrapLines, gradientLine, coverRect, applyDuotone, preloadTemplatePatterns } from './drawTemplate';
import { DESIGN_TEMPLATES, templateByKey, pageTemplate, settleTime, fontStack, hexAlpha, type DesignTemplate } from './designTemplates';
import { resolveLook, type Look } from './design/look';
import { paletteOf } from './design/palettes';
import { patternZoneBox } from './design/patterns';
import { pairingOf } from './design/typefaces';
import { glyphOf } from './design/icons';
import { platformMark } from './design/platformMarks';

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

// ---- the look engine ---------------------------------------------------------

/**
 * A richer recorder for the look cases and the look-less baseline: it also
 * logs every style assignment, and stamps each paint call with the fill in
 * force, because "which colour did this rectangle get" is the whole question.
 */
function recCtx(charWidth = 10) {
  const calls: { op: string; args: unknown[]; fill?: unknown }[] = [];
  const state: Record<string, unknown> = {
    filter: 'none', letterSpacing: '0px', font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter',
  };
  const ser = (v: unknown): unknown =>
    typeof v === 'object' && v !== null ? ((v as { __grad?: string }).__grad ?? '[object]') : v;
  let gid = 0;
  const ctx: Record<string, unknown> = { canvas: { width: 1080, height: 1080 } };
  for (const k of Object.keys(state)) {
    Object.defineProperty(ctx, k, {
      get: () => state[k],
      set: (v) => { state[k] = v; calls.push({ op: `set:${k}`, args: [ser(v)] }); },
    });
  }
  const paint = new Set(['fillRect', 'fill', 'fillText', 'drawImage']);
  for (const op of ['save', 'restore', 'clearRect', 'fillRect', 'strokeRect', 'fillText', 'translate', 'scale',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'rect', 'clip', 'fill', 'stroke', 'arc', 'drawImage']) {
    ctx[op] = (...args: unknown[]) => {
      calls.push({ op, args: args.map(ser), ...(paint.has(op) ? { fill: ser(state.fillStyle) } : {}) });
    };
  }
  ctx.measureText = (s: string) => ({ width: s.length * charWidth });
  const gradient = (kind: string) => (...args: unknown[]) => {
    const id = `[${kind}#${gid++}]`;
    calls.push({ op: `create${kind}`, args: [id, ...args] });
    return { __grad: id, addColorStop: (at: number, c: string) => calls.push({ op: 'stop', args: [id, at, c] }) };
  };
  ctx.createLinearGradient = gradient('Linear');
  ctx.createRadialGradient = gradient('Radial');
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const FULL = {
  ...CONTENT,
  services: ['Jollof rice', 'Suya platter', 'Small chops'],
  stats: [{ value: '12k', label: 'Plates served' }, { value: '4.9', label: 'Rating' }],
  contact: ['0803 000 0000', 'hello@mamaput.ng', 'mamaput.ng'],
  price: [{ label: 'Jollof', price: '₦3,500', was: '₦4,000' }, { label: 'Suya', price: '₦2,000' }],
};

describe('drawTemplateFrame — looks', () => {
  /*
   * Recorded from the painter BEFORE the look engine touched it: the snapshot
   * file was written by running this test against the pre-task drawTemplate.ts.
   * A template without a `look` must keep producing exactly this call log.
   */
  it('still paints a look-less template exactly as before', () => {
    const media = { width: 800, height: 600 } as unknown as CanvasImageSource;
    const cases: { key: string; opts?: Record<string, unknown>; content?: Record<string, unknown> }[] = [
      { key: 'statement' },
      { key: 'statement', opts: { t: 0.4, sceneSeconds: 4, surfaceOpacity: 0.6, mediaOpacity: 0.8 }, content: { media } },
      { key: 'ticket' },
      { key: 'promo-burst', opts: { base: '#1e293b' } },
      { key: 'price-block' },
      { key: 'web-hero' },
    ];
    for (const c of cases) {
      const { ctx, calls } = recCtx();
      drawTemplateFrame(ctx, templateByKey(c.key), { ...FULL, ...c.content }, 1080, 1080, { accent: '#9a3412', ...c.opts });
      expect(calls).toMatchSnapshot(`${c.key}${c.opts ? ' +opts' : ''}`);
    }
  });

  const X = paletteOf('ink-coral')!.colours;
  const LOOK: Look = { palette: 'ink-coral', type: 'editorial' };
  const withLook = (patch: Partial<DesignTemplate> = {}, look: Partial<Look> = {}): DesignTemplate => ({
    ...templateByKey('statement'),
    ...patch,
    look: { ...LOOK, ...look },
  });
  const paintOf = (tpl: DesignTemplate, opts: Record<string, unknown> = {}, content: Record<string, unknown> = {}) => {
    const r = recCtx();
    drawTemplateFrame(r.ctx, tpl, { ...FULL, ...content }, 1080, 1080, { accent: '#9a3412', ...opts });
    return r.calls;
  };

  it('fills role-toned shapes with role colours', () => {
    const calls = paintOf(withLook({
      shapes: [
        { kind: 'rect', x: 0, y: 0.8, w: 1, h: 0.2, tone: 'secondary' },
        { kind: 'circle', cx: 0.5, cy: 0.5, r: 0.1, tone: 'highlight' },
      ],
    }));
    const fills = calls.filter((c) => c.op === 'fillRect' || c.op === 'fill').map((c) => c.fill);
    expect(fills).toContain(X.secondary);
    expect(fills).toContain(X.highlight);
  });

  it('fills a gradient shape from the roles', () => {
    const calls = paintOf(withLook({
      shapes: [{ kind: 'rect', x: 0, y: 0, w: 0.5, h: 0.5, tone: 'primary', fill: { kind: 'linear', stops: ['primary', 'highlight'], angle: 90 } }],
    }));
    const stops = calls.filter((c) => c.op === 'stop').map((c) => c.args[2]);
    expect(stops).toContain(X.highlight);
    // Linear at 90deg across the shape's own box: x from 0 to 540, flat y.
    const lin = calls.find((c) => c.op === 'createLinear' && c.args[1] === 0 && c.args[3] === 540);
    expect(lin).toBeTruthy();
  });

  it('paints the ground gradient from the look', () => {
    const calls = paintOf(withLook({}, { gradient: { kind: 'linear', stops: ['ground', 'primary'], angle: 160 } }));
    expect(calls.some((c) => c.op === 'createLinear')).toBe(true);
    const stops = calls.filter((c) => c.op === 'stop').map((c) => c.args[2]);
    expect(stops).toContain(X.ground);
    expect(stops).toContain(X.primary);
    // The look's ground replaces the template's spotlight surface entirely.
    expect(calls.some((c) => c.op === 'createRadial')).toBe(false);
  });

  it('paints the pattern before any text, once its bitmap has decoded', async () => {
    const loads: string[] = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      __grad = '[pattern]';
      set src(v: string) { loads.push(v); queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', FakeImage);
    try {
      const tpl = withLook({}, { pattern: { key: 'dots', role: 'highlight', opacity: 0.1, scale: 0.05, zone: 'bottom' } });
      // First frame: the load starts and the frame paints without the pattern.
      const first = paintOf(tpl);
      expect(first.some((c) => c.op === 'drawImage')).toBe(false);
      expect(loads.length).toBe(1);
      expect(loads[0]).toMatch(/^data:image\/svg\+xml/);

      await preloadTemplatePatterns(tpl, 1080, 1080, { accent: '#9a3412' });
      const calls = paintOf(tpl);
      const img = calls.findIndex((c) => c.op === 'drawImage' && c.args[0] === '[pattern]');
      const text = calls.findIndex((c) => c.op === 'fillText');
      expect(img).toBeGreaterThan(-1);
      expect(img).toBeLessThan(text);
      // Clipped to its zone through the source rectangle.
      const z = patternZoneBox('bottom', 1080, 1080);
      expect(calls[img].args.slice(1)).toEqual([z.x, z.y, z.w, z.h, z.x, z.y, z.w, z.h]);
      // Opacity applied by the painter.
      const alpha = calls.slice(0, img).filter((c) => c.op === 'set:globalAlpha').pop();
      expect(alpha?.args[0]).toBe(0.1);
      // Cached: later frames do not load it again.
      expect(loads.length).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sets the headline in the look pairing, with a gradient where asked', () => {
    const calls = paintOf(withLook({}, { headlineGradient: true }));
    const pairing = pairingOf('editorial');
    const fonts = calls.filter((c) => c.op === 'set:font').map((c) => String(c.args[0]));
    expect(fonts.some((f) => f.includes(fontStack(pairing.display)))).toBe(true);

    const head = calls.find((c) => c.op === 'fillText' && String(c.args[0]).toLowerCase().includes('two plates'));
    expect(String(head?.fill)).toMatch(/^\[Linear#/);
    const stops = calls.filter((c) => c.op === 'stop' && c.args[0] === head!.fill).map((c) => c.args[2]);
    expect(stops).toEqual([X.primary, X.secondary]);
  });

  it('reads slot ink from the ground it declares', () => {
    const base = withLook();
    const tpl = withLook({ slots: base.slots.map((s) => (s.role === 'headline' ? { ...s, on: 'secondary' as const } : s)) });
    const resolved = resolveLook(tpl, { accent: '#9a3412', width: 1080, height: 1080 });
    const calls = paintOf(tpl);
    const head = calls.find((c) => c.op === 'fillText' && String(c.args[0]).toLowerCase().includes('two plates'));
    expect(head?.fill).toBe(resolved.inkOn.secondary);
    const sub = calls.find((c) => c.op === 'fillText' && String(c.args[0]).includes('Friday'));
    // statement's subline is muted: the palette ink, thinned.
    expect(sub?.fill).toBe(hexAlpha(X.ink, 0.72));
  });
});

describe('applyDuotone', () => {
  it('maps black to the first role and white to the second', () => {
    const px = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 128]);
    applyDuotone(px, '#102030', '#f0e0d0');
    expect([...px]).toEqual([0x10, 0x20, 0x30, 255, 0xf0, 0xe0, 0xd0, 128]);
  });

  it('uses Rec. 709 luma, so pure green lands far nearer the light end than pure blue', () => {
    const g = new Uint8ClampedArray([0, 255, 0, 255]);
    const b = new Uint8ClampedArray([0, 0, 255, 255]);
    applyDuotone(g, '#000000', '#ffffff');
    applyDuotone(b, '#000000', '#ffffff');
    expect(g[0]).toBe(Math.round(0.7152 * 255));
    expect(b[0]).toBe(Math.round(0.0722 * 255));
  });
});

describe('row icons (Task 18b)', () => {
  // The back of the bold card: its contact row leads a phone and a handle (the front keeps one row, Ruling AO).
  const tpl = pageTemplate(templateByKey('pilot-card-bold'), 1);
  const content = { ...CONTENT, contact: ['Your phone', '@yourhandle'] };

  it('indents an icon row the same whether or not the context can draw paths', () => {
    const g = globalThis as { Path2D?: unknown };
    const had = g.Path2D;
    const at = (withPath: boolean) => {
      g.Path2D = withPath ? class { d: string; constructor(d: string) { this.d = d; } } : undefined;
      const { ctx, calls } = stubCtx();
      drawTemplateFrame(ctx, tpl, content, 1011, 638, { accent: '#9a3412' });
      return {
        handle: calls.find((c) => c.op === 'fillText' && c.args[0] === '@yourhandle'),
        paths: calls.filter((c) => (c.op === 'fill' || c.op === 'stroke') && c.args.length === 1).length,
      };
    };
    try {
      const drawn = at(true);
      const bare = at(false);
      expect(drawn.paths).toBe(2);
      expect(bare.paths).toBe(0);
      expect(drawn.handle?.args[1]).toBe(bare.handle?.args[1]);
    } finally {
      g.Path2D = had;
    }
  });

  it('drops the mark, and keeps the words, when a handle row is rewritten as something else', () => {
    const g = globalThis as { Path2D?: unknown };
    const had = g.Path2D;
    g.Path2D = class { d: string; constructor(d: string) { this.d = d; } };
    try {
      const { ctx, calls } = stubCtx();
      drawTemplateFrame(ctx, tpl, { ...content, contact: ['Your phone', 'Your website'] }, 1011, 638, { accent: '#9a3412' });
      const drawn = calls.filter((c) => (c.op === 'fill' || c.op === 'stroke') && c.args.length === 1)
        .map((c) => (c.args[0] as { d: string }).d);
      // The website row reads as a website (Ruling AL): a globe, never the Instagram mark.
      expect(drawn).not.toContain(platformMark('instagram')!.path);
      expect(drawn).toEqual([...glyphOf({ set: 'lucide', name: 'phone' })!.paths, ...glyphOf({ set: 'lucide', name: 'globe' })!.paths]);
      expect(calls.some((c) => c.op === 'fillText' && c.args[0] === 'Your website')).toBe(true);
    } finally {
      g.Path2D = had;
    }
  });
});
