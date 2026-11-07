import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../hooks/useDesignCatalogue', async () => {
  const mod = await import('../lib/designTemplates');
  const keep = ['swiss-event-poster', 'tiered-sale'];
  return { useDesignCatalogue: () => ({ templates: mod.DESIGN_TEMPLATES.filter((t) => keep.includes(t.key)) }) };
});
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TemplateGallery from '../components/create/TemplateGallery';
import { sampleFor } from '../lib/create/sampleCopy';

import TemplateCustomiser from '../components/create/TemplateCustomiser';
import { DESIGN_TEMPLATES, type DesignTemplate } from '../lib/designTemplates';
import { PALETTES, paletteOf } from '../lib/design/palettes';
import { parseLookParam, sanitiseOverride, encodeLookParam, lookFromParam } from '../lib/design/lookParam';

const tpl = (key: string): DesignTemplate => {
  const t = DESIGN_TEMPLATES.find((x) => x.key === key);
  if (!t) throw new Error(`no template ${key}`);
  return t;
};

// jsdom lays nothing out, and the customiser draws nothing until it has a
// measured stage to fit the design into.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const open = (key: string, initialLook?: string | null) =>
  render(
    <MemoryRouter>
      <TemplateCustomiser
        template={tpl(key)}
        initialStyle="clean"
        initialBrand="#2563eb"
        initialLook={initialLook}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );

/** The design as drawn: everything inside the export frame. */
const surface = (container: HTMLElement) =>
  container.querySelector('[data-export-width]')?.innerHTML ?? '';

const paletteCaption = () => screen.getByText(/^Palette:/).textContent ?? '';
const KEY = 'swiss-event-poster';

describe('customiser — Look panel', () => {
  it('shows the original look first and resets to it', () => {
    const { container } = open(KEY);
    const original = surface(container);
    expect(original).not.toBe('');
    expect(paletteCaption()).toContain(paletteOf(tpl(KEY).look!.palette)!.name);
    expect(paletteCaption()).toContain('the original');

    const other = PALETTES.find((p) => p.key !== tpl(KEY).look!.palette
      && screen.queryByRole('button', { name: `${p.name} palette` }));
    expect(other).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `${other!.name} palette` }));
    expect(surface(container)).not.toBe(original);
    expect(paletteCaption()).toContain(other!.name);

    fireEvent.click(screen.getByRole('button', { name: 'Reset to original' }));
    expect(surface(container)).toBe(original);
    expect(paletteCaption()).toContain('the original');
  });

  it('applies my brand colours', () => {
    const { container } = open(KEY);
    const original = surface(container);

    fireEvent.change(screen.getByLabelText('Brand colour'), { target: { value: '#0f766e' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply brand colours' }));
    expect(screen.queryByRole('alert')).toBeNull();
    const branded = surface(container);
    expect(branded).not.toBe(original);
    expect(paletteCaption()).toContain('Your brand');

    // A colour we cannot read is refused with the message, and nothing moves.
    fireEvent.change(screen.getByLabelText('Brand colour'), { target: { value: 'red' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply brand colours' }));
    expect(screen.getByRole('alert').textContent).toBe(
      'That isn’t a colour we can read — try a hex like #0f766e',
    );
    expect(surface(container)).toBe(branded);
  });

  it('refuses an unreadable second brand colour', () => {
    const { container } = open(KEY);
    const original = surface(container);
    fireEvent.change(screen.getByLabelText('Brand colour'), { target: { value: '#0f766e' } });
    fireEvent.change(screen.getByLabelText('Second brand colour (optional)'), { target: { value: 'teal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply brand colours' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(surface(container)).toBe(original);
  });

  it('remixes and respects locks', () => {
    // Two fixed seeds, so the assertion is about the code and not about luck.
    const draws = [0.31, 0.77];
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => draws[i++ % draws.length]);

    const { container } = open(KEY);
    const original = surface(container);
    const lock = screen.getByRole('button', { name: 'Lock palette' });
    expect(lock).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(lock);
    expect(lock).toHaveAttribute('aria-pressed', 'true');
    const caption = paletteCaption();

    fireEvent.click(screen.getByRole('button', { name: 'Remix' }));
    const first = surface(container);
    fireEvent.click(screen.getByRole('button', { name: 'Remix' }));
    const second = surface(container);

    expect(paletteCaption()).toBe(caption);
    expect(first).not.toBe(original);
    expect(second).not.toBe(first);
  });

  it('keeps a locked palette and pattern through a remix', () => {
    const { container } = open(KEY);
    fireEvent.click(screen.getByRole('button', { name: 'Lock pattern' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lock palette' }));
    const pattern = () => container.querySelector('[data-look-pattern]')?.getAttribute('style') ?? '';
    const before = pattern();
    for (let n = 0; n < 3; n += 1) fireEvent.click(screen.getByRole('button', { name: 'Remix' }));
    expect(pattern()).toBe(before);
  });

  it('carries the look into the editor link', () => {
    open(KEY);
    const link = screen.getByRole('link', { name: /Open in Studio/ });
    expect(link.getAttribute('href')).toContain('look=');

    fireEvent.click(screen.getByRole('button', { name: 'Remix' }));
    const href = screen.getByRole('link', { name: /Open in Studio/ }).getAttribute('href') ?? '';
    const raw = new URL(href, 'http://x').searchParams.get('look');
    const parsed = parseLookParam(raw);
    expect(parsed?.seed).not.toBeNull();
    expect(Object.keys(parsed?.override ?? {}).length).toBeGreaterThan(0);
  });

  it('opens remixed from a shared ?look=<seed> link, the same way every time', () => {
    const a = open(KEY, '123456');
    const first = surface(a.container);
    expect(first).not.toBe('');
    cleanup();
    const b = open(KEY, '123456');
    expect(surface(b.container)).toBe(first);
    cleanup();
    const plain = open(KEY);
    expect(surface(plain.container)).not.toBe(first);
  });

  it('only a template with a look gets the Look panel; the rest keep the one colour picker', () => {
    const without = DESIGN_TEMPLATES.find((t) => !t.look)!;
    open(without.key);
    expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
    expect(screen.getByLabelText('Pick any colour')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Studio/ }).getAttribute('href')).not.toContain('look=');
  });

  it('makes every control at least 44px tall or wide', () => {
    open(KEY);
    for (const name of ['Remix', 'Lock palette', 'Lock background', 'Lock pattern', 'Lock fonts', 'Apply brand colours']) {
      expect(screen.getByRole('button', { name }).className).toMatch(/min-h-\[44px\]/);
    }
    expect(screen.getAllByRole('button', { name: /palette$/ })[0].className).toMatch(/h-\[44px\]/);
  });
});

describe('lookParam — what a URL is allowed to say', () => {
  it('drops unknown palette, pattern and type keys', () => {
    expect(sanitiseOverride({ palette: 'nope', type: 'nope', pattern: { key: 'nope', role: 'ink', opacity: 0.1, scale: 0.1 } }))
      .toEqual({});
  });

  it('keeps known keys and caps pattern opacity at the 0.12 ceiling', () => {
    const out = sanitiseOverride({
      palette: 'ink-coral', type: 'editorial',
      pattern: { key: 'dots', role: 'primary', opacity: 0.9, scale: 0.1 },
    });
    expect(out.palette).toBe('ink-coral');
    expect(out.type).toBe('editorial');
    expect(out.pattern?.opacity).toBe(0.12);
  });

  it('refuses an override that carries a hex colour', () => {
    expect(sanitiseOverride({ palette: 'ink-coral', gradient: { kind: 'linear', stops: ['ground', '#ff0000'] } })).toEqual({});
    expect(sanitiseOverride({ palette: '#ff0000' })).toEqual({});
  });

  it('accepts only a finite integer as a seed', () => {
    expect(parseLookParam('42')?.seed).toBe(42);
    expect(parseLookParam('-7')?.seed).toBe(-7);
    expect(parseLookParam('4.5')).toBeNull();
    expect(parseLookParam('1e9')).toBeNull();
    expect(parseLookParam('NaN')).toBeNull();
    expect(parseLookParam('99999999999999999999')).toBeNull();
    expect(parseLookParam('{"s":1.5}')?.seed).toBeNull();
    expect(parseLookParam('{"s":"7"}')?.seed).toBeNull();
    expect(parseLookParam('{not json')).toBeNull();
    expect(parseLookParam(null)).toBeNull();
  });

  it('refuses a brand colour it cannot read', () => {
    expect(parseLookParam('{"o":{},"b":{"p":"red"}}')?.brand).toBeNull();
    expect(parseLookParam('{"o":{},"b":{"p":"#0f766e","h":"nope"}}')?.brand)
      .toEqual({ primary: '#0f766e', harmony: 'analogous' });
  });

  it('round-trips what the customiser writes', () => {
    const state = {
      override: { palette: 'ink-coral', type: 'luxury' },
      seed: 5,
      brand: { primary: '#0f766e', harmony: 'split' as const },
    };
    expect(parseLookParam(encodeLookParam(state))).toEqual(state);
  });

  it('gives the editor nothing for a template without a look', () => {
    const without = DESIGN_TEMPLATES.find((t) => !t.look)!;
    expect(lookFromParam(without, '42')).toEqual({});
  });

  it('gives the editor a brand palette and the seed for a looked template', () => {
    const out = lookFromParam(tpl(KEY), encodeLookParam({
      override: {}, seed: 9, brand: { primary: '#0f766e', harmony: 'analogous' },
    }));
    expect(out.brandPalette?.colours.primary).toBeTruthy();
    expect(out.seed).toBe(9);
  });
});

describe('customiser — content and link scoping', () => {
  it('shows the own sample lists of the template, not the generic ones', () => {
    const { container } = open('tiered-sale');
    const html = container.textContent ?? '';
    const want = sampleFor(tpl('tiered-sale')).stats!;
    expect(want[0].label).toBe('Selected lines');
    expect(html).toContain('Selected lines');
    expect(html).not.toContain('Bedrooms');
  });

  it('drops a ?look= palette that cannot carry the text of the template', () => {
    const t = tpl(KEY);
    const bad = PALETTES.find((p) => !needsMetFor(t, p.key));
    // The test is only worth having if such a palette exists.
    expect(bad).toBeTruthy();
    if (!bad) return;
    const out = lookFromParam(t, encodeLookParam({ override: { palette: bad.key }, seed: null, brand: null }));
    expect(out.look?.palette).toBeUndefined();
  });

  it('drops a ?look= gradient that would put the ink of the template on a colour it cannot be read on', () => {
    const t = tpl(KEY);
    const gradient = { kind: 'linear' as const, stops: ['ground' as const, 'primary' as const], angle: 180 };
    // Precondition: on the template's own palette, ink over its primary fails.
    expect(needsMet(paletteOf(t.look!.palette)!.colours, textNeeds(t), gradient.stops)).toBe(false);
    const out = lookFromParam(t, encodeLookParam({ override: { gradient }, seed: null, brand: null }));
    expect(out.look?.gradient).toBeUndefined();
    // A readable one is kept.
    const fine = lookFromParam(t, encodeLookParam({ override: { gradient: t.look!.gradient! }, seed: null, brand: null }));
    expect(fine.look?.gradient).toEqual(t.look!.gradient);
  });

  it('does not take a gradient headline from a link', () => {
    expect(sanitiseOverride({ headlineGradient: true })).toEqual({});
  });

  const galleryAt = (url: string) =>
    render(<MemoryRouter initialEntries={[url]}><TemplateGallery /></MemoryRouter>);
  const seedInLink = () => {
    const href = screen.getByRole('link', { name: /Open in Studio/ }).getAttribute('href') ?? '';
    return parseLookParam(new URL(href, 'http://x').searchParams.get('look'))?.seed ?? null;
  };

  it('applies the look of a link to the template it named, once', () => {
    galleryAt('/?template=swiss-event-poster&look=777');
    expect(screen.getByRole('dialog', { name: /Edit/ })).toBeInTheDocument();
    expect(seedInLink()).toBe(777);

    // Close, reopen the same card: its original look, not the link's.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit / })[0]);
    expect(seedInLink()).toBeNull();
  });

  it('does not leak the look onto another template', () => {
    galleryAt('/?template=swiss-event-poster&look=777');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const other = screen.getAllByRole('button', { name: /^Edit / }).find((b) => !/swiss/i.test(b.getAttribute('aria-label') ?? ''));
    expect(other).toBeTruthy();
    fireEvent.click(other!);
    expect(seedInLink()).toBeNull();
  });

  it('applies a bare ?look=<seed> to nothing', () => {
    galleryAt('/?look=777');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit / })[0]);
    expect(seedInLink()).toBeNull();
  });

  it('clears the typed brand colour when a palette chip drops the brand', () => {
    open(KEY);
    fireEvent.change(screen.getByLabelText('Brand colour'), { target: { value: '#0f766e' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply brand colours' }));
    fireEvent.click(screen.getAllByRole('button', { name: /palette$/ })[0]);
    expect((screen.getByLabelText('Brand colour') as HTMLInputElement).value).toBe('');
  });
});

import { needsMet } from '../lib/design/remix';
import { textNeeds } from '../lib/design/remix';
function needsMetFor(t: DesignTemplate, key: string): boolean {
  return needsMet(paletteOf(key)!.colours, textNeeds(t), t.look?.gradient?.stops ?? []);
}
