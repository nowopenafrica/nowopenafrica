import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TemplateSurface, { type TemplateContent } from './TemplateSurface';
import { templateByKey, fontStack, type DesignTemplate } from '../../lib/designTemplates';
import { resolveLook, type Look } from '../../lib/design/look';
import { paletteOf } from '../../lib/design/palettes';
import { patternZoneBox } from '../../lib/design/patterns';
import { pairingOf } from '../../lib/design/typefaces';

const CONTENT: TemplateContent = {
  brand: 'Mama Put Kitchen',
  eyebrow: 'This weekend',
  headline: 'Two plates for the price of one',
  subline: 'Friday to Sunday, dine in only',
  meta: 'nowopenafrica.com/mama-put',
  cta: 'Book now',
  services: ['Jollof rice', 'Suya platter', 'Small chops'],
  stats: [{ value: '12k', label: 'Plates served' }, { value: '4.9', label: 'Rating' }],
  contact: ['0803 000 0000', 'hello@mamaput.ng', 'mamaput.ng'],
  price: [{ label: 'Jollof', price: '₦3,500', was: '₦4,000' }, { label: 'Suya', price: '₦2,000' }],
  logoUrl: null,
  qrUrl: null,
};

describe('TemplateSurface — looks', () => {
  /*
   * Recorded from the component BEFORE the look engine touched it. A template
   * without a `look` must keep producing exactly this markup: the 175 existing
   * templates are only redesigned on purpose, never as a side effect.
   */
  it('renders a template without a look exactly as before', () => {
    const cases: { key: string; extra?: Record<string, unknown> }[] = [
      { key: 'ticket' },
      { key: 'statement', extra: { mediaUrl: 'https://example.com/a.jpg', mediaOpacity: 80, surfaceOpacity: 0.6 } },
      { key: 'promo-burst', extra: { base: '#1e293b' } },
      { key: 'price-block' },
      { key: 'web-hero' },
    ];
    for (const c of cases) {
      const { container, unmount } = render(
        <TemplateSurface
          template={templateByKey(c.key)}
          content={CONTENT}
          width={1080}
          height={1080}
          accent="#9a3412"
          {...c.extra}
        />,
      );
      expect(container.innerHTML).toMatchSnapshot(c.key);
      unmount();
    }
  });

  // ---- with a look ---------------------------------------------------------

  const LOOK: Look = { palette: 'ink-coral', type: 'editorial' };
  const X = paletteOf('ink-coral')!.colours;

  /** A template that carries a look. `statement` is photoLed, which the duotone case needs. */
  const withLook = (patch: Partial<DesignTemplate> = {}, look: Partial<Look> = {}): DesignTemplate => ({
    ...templateByKey('statement'),
    ...patch,
    look: { ...LOOK, ...look },
  });

  /** jsdom normalises colours; push the expectation through the same parser. */
  const css = (colour: string): string => {
    const probe = document.createElement('div');
    probe.style.color = colour;
    return probe.style.color;
  };

  const draw = (tpl: DesignTemplate, extra: Record<string, unknown> = {}) =>
    render(
      <TemplateSurface template={tpl} content={CONTENT} width={1080} height={1080} accent="#9a3412" {...extra} />,
    );

  it('paints shapes in their role colours', () => {
    const tpl = withLook({ shapes: [{ kind: 'rect', x: 0, y: 0.8, w: 1, h: 0.2, tone: 'secondary' }] });
    const { container } = draw(tpl);
    const fills = [...container.querySelectorAll('div')].map((d) => (d as HTMLElement).style.background);
    expect(fills).toContain(css(X.secondary));
  });

  it('paints a gradient-filled shape from the roles', () => {
    const tpl = withLook({
      shapes: [{ kind: 'circle', cx: 0.5, cy: 0.5, r: 0.2, tone: 'primary', fill: { kind: 'linear', stops: ['primary', 'highlight'], angle: 45 } }],
    });
    const { container } = draw(tpl);
    const circle = [...container.querySelectorAll('div')].find((d) => (d as HTMLElement).style.borderRadius === '50%') as HTMLElement;
    expect(circle.style.background).toContain('linear-gradient');
    expect(circle.style.background).toContain(css(X.highlight));
  });

  it('sets text on its declared ground', () => {
    const base = withLook();
    const tpl = withLook({
      slots: base.slots.map((s) => (s.role === 'headline' ? { ...s, on: 'secondary' as const } : s)),
    });
    const resolved = resolveLook(tpl, { accent: '#9a3412', width: 1080, height: 1080 });
    draw(tpl);
    const el = screen.getByText(CONTENT.headline!) as HTMLElement;
    expect(el.style.color).toBe(css(resolved.inkOn.secondary));
    // And a slot with no `on` reads on the ground.
    const sub = screen.getByText(CONTENT.subline!) as HTMLElement;
    expect(sub.style.color).not.toBe(css(resolved.inkOn.secondary));
  });

  it('draws the pattern layer below the type', () => {
    const tpl = withLook({}, { pattern: { key: 'dots', role: 'highlight', opacity: 0.1, scale: 0.06, zone: 'top' } });
    const { container } = draw(tpl);
    const root = container.firstElementChild as HTMLElement;
    const kids = [...root.children] as HTMLElement[];
    const patternAt = kids.findIndex((k) => k.dataset.lookPattern !== undefined);
    const firstSlotAt = kids.findIndex((k) => k.textContent?.includes(CONTENT.brand!));
    expect(patternAt).toBeGreaterThan(-1);
    expect(patternAt).toBeLessThan(firstSlotAt);
    const layer = kids[patternAt];
    expect(layer.style.opacity).toBe('0.1');
    expect(layer.style.backgroundImage).toContain('data:image/svg+xml');
    // Clipped to its zone: the top band, not the whole canvas.
    const zone = patternZoneBox('top', 1080, 1080);
    expect(layer.style.top).toBe('0px');
    expect(layer.style.height).toBe(`${zone.h}px`);
  });

  it('applies a duotone to the photo', () => {
    const tpl = withLook({}, { duotone: ['ground', 'primary'] });
    expect(tpl.photoLed).toBe(true);
    const { container } = draw(tpl, { mediaUrl: 'https://example.com/a.jpg' });
    const img = container.querySelector('img') as HTMLImageElement;
    const ref = /url\(["']?#([^"')]+)["']?\)/.exec(img.style.filter);
    expect(ref).not.toBeNull();
    const filter = container.querySelector(`filter[id="${ref![1]}"]`);
    expect(filter).not.toBeNull();
    const values = filter!.querySelector('feColorMatrix')!.getAttribute('values')!.trim().split(/\s+/).map(Number);
    // Luma 0 maps to the first colour, luma 1 to the second: each row's offset is
    // the dark channel and its coefficients sum to (light - dark).
    const ch = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [d, l] = [ch(X.ground), ch(X.primary)];
    for (let row = 0; row < 3; row++) {
      const r = values.slice(row * 5, row * 5 + 5);
      expect(r[4]).toBeCloseTo(d[row], 3);
      expect(r[0] + r[1] + r[2]).toBeCloseTo(l[row] - d[row], 3);
    }
  });

  /** Pin what the browser claims about background-clip:text for one test. */
  const stubClip = (supported: boolean) => {
    const real = globalThis.CSS;
    vi.stubGlobal('CSS', { ...(real ?? {}), supports: () => supported });
    return () => vi.unstubAllGlobals();
  };

  it('fills the headline with a gradient when asked', () => {
    const restore = stubClip(true);
    try {
      const tpl = withLook({}, { headlineGradient: true });
      draw(tpl);
      const el = screen.getByText(CONTENT.headline!) as HTMLElement;
      const style = el.getAttribute('style') ?? '';
      expect(style).toMatch(/background-clip:\s*text/);
      expect(el.style.backgroundImage).toContain('linear-gradient');
      expect(el.style.backgroundImage).toContain(css(X.primary));
      expect(el.style.backgroundImage).toContain(css(X.secondary));
    } finally { restore(); }
  });

  it('keeps the headline in flat ink where text clipping is unsupported', () => {
    const restore = stubClip(false);
    try {
      const tpl = withLook({}, { headlineGradient: true });
      draw(tpl);
      const el = screen.getByText(CONTENT.headline!) as HTMLElement;
      const style = el.getAttribute('style') ?? '';
      expect(style).not.toMatch(/text-fill-color/);
      expect(style).not.toMatch(/background-clip/);
      expect(el.style.color).toBe(css(X.ink));
    } finally { restore(); }
  });

  it('colours list bullets and values by the slot role tone', () => {
    const tpl = withLook({
      slots: [
        ...withLook().slots,
        { role: 'services', x: 0.1, y: 0.7, w: 0.8, size: 0.03, bullet: 'dot', tone: 'highlight' },
      ],
    });
    const { container } = draw(tpl);
    const dots = [...container.querySelectorAll('span')]
      .filter((s) => (s as HTMLElement).style.borderRadius === '50%') as HTMLElement[];
    expect(dots.length).toBe(3);
    for (const d of dots) expect(d.style.background).toBe(css(X.highlight));
  });

  it('takes its type from the look pairing', () => {
    draw(withLook());
    const pairing = pairingOf('editorial');
    const el = screen.getByText(CONTENT.headline!) as HTMLElement;
    expect(el.style.fontFamily).toBe(probeFont(fontStack(pairing.display)));
    const sub = screen.getByText(CONTENT.subline!) as HTMLElement;
    expect(sub.style.fontFamily).toBe(probeFont(fontStack(pairing.text)));
  });

  it('paints the ground in the palette', () => {
    const { container } = draw(withLook());
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.background).toBe(css(X.ground));
  });
});

function probeFont(stack: string): string {
  const probe = document.createElement('div');
  probe.style.fontFamily = stack;
  return probe.style.fontFamily;
}
