import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { DESIGN_TEMPLATES, type DesignTemplate } from '../lib/designTemplates';
import { isListed } from '../lib/create/needs';
import { subcategoryFor } from '../lib/create/catalogueTaxonomy';
import {
  EXPORT_FORMATS, isPreviewOnly, relatedTemplates, templateDetailFacts,
} from '../lib/create/templateDetail';
import TemplateFacts from '../components/create/TemplateFacts';

/*
 * The catalogue is the code templates (plus fixtures below), with no network:
 * the hook is replaced so a test never waits on, or writes to, Supabase.
 */
const catalogue = vi.hoisted(() => ({ templates: [] as DesignTemplate[], ready: true }));
vi.mock('../hooks/useDesignCatalogue', () => ({
  useDesignCatalogue: () => ({ entries: [], templates: catalogue.templates, ready: catalogue.ready, incomplete: null }),
}));
/* The real customiser has its own tests; here only WHICH design it opens matters. */
vi.mock('../components/create/TemplateCustomiser', () => ({
  default: ({ template }: { template: DesignTemplate }) => (
    <div data-testid="customiser" data-key={template.key} />
  ),
}));

import TemplateDetail from './TemplateDetail';

afterEach(() => cleanup());

const LISTED = DESIGN_TEMPLATES.filter(isListed);
const allRoles = (t: DesignTemplate) =>
  [...new Set([t.slots, ...(t.extraPages ?? []).map((p) => p.slots)].flat().map((s) => s.role))];

/** A listed business card with a back. */
const CARD = LISTED.find((t) => subcategoryFor(t)?.key === 'business-card' && (t.extraPages?.length ?? 0) > 0)!;

/** The same card with only the roles the customiser edits, so C7 passes. */
const EDITABLE_CARD: DesignTemplate = (() => {
  const keep = (s: DesignTemplate['slots']) => s.filter((x) => x.role !== 'meta');
  return { ...CARD, slots: keep(CARD.slots), extraPages: CARD.extraPages?.map((p) => ({ ...p, slots: keep(p.slots) })) };
})();

function mount(key: string, templates: DesignTemplate[] = DESIGN_TEMPLATES, ready = true) {
  catalogue.templates = templates;
  catalogue.ready = ready;
  return render(
    <MemoryRouter initialEntries={[`/media/templates/${key}`]}>
      <Routes>
        <Route path="/media/templates/:key" element={<TemplateDetail />} />
        <Route path="/media" element={<p>media page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const withEditableCard = () => DESIGN_TEMPLATES.map((t) => (t.key === CARD.key ? EDITABLE_CARD : t));

describe('template detail page', () => {
  it('has a business card with a back to test against', () => {
    expect(CARD, 'a listed business card with extraPages').toBeDefined();
  });

  it('shows dimensions in px and mm', () => {
    mount(CARD.key);
    expect(screen.getByTestId('facts-px')).toHaveTextContent('1011 × 638 px');
    expect(screen.getByTestId('facts-mm')).toHaveTextContent('85.6 × 54 mm');
  });

  it('shows every page and side, with a front-back toggle', () => {
    mount(CARD.key);
    const names = ['Front', ...CARD.extraPages!.map((p) => p.name)];
    const strip = screen.getByRole('list', { name: 'Every page and side' });
    expect([...strip.querySelectorAll('[data-page]')].map((n) => n.getAttribute('data-page'))).toEqual(names);
    for (const li of strip.querySelectorAll('[data-page]')) expect(li.querySelector('[data-side]')).not.toBeNull();

    const sides = within(screen.getByRole('group', { name: 'Sides' }));
    expect(sides.getByRole('button', { name: 'Front' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('detail-preview')).toHaveAttribute('data-side', 'Front');
    fireEvent.click(sides.getByRole('button', { name: names[1] }));
    expect(sides.getByRole('button', { name: names[1] })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('detail-preview')).toHaveAttribute('data-side', names[1]);
  });

  it('lists only PNG and PDF as export formats', () => {
    mount(CARD.key);
    const block = screen.getByTestId('facts-exports');
    expect([...block.querySelectorAll('[data-export]')].map((n) => n.getAttribute('data-export'))).toEqual(['png', 'pdf']);
    expect(EXPORT_FORMATS.map((f) => f.label)).toEqual(['PNG', 'PDF']);
    expect(block.textContent).not.toMatch(/svg|jpe?g|print-ready/i);
  });

  it('lists the editable elements from the slot roles', () => {
    mount(CARD.key);
    const block = screen.getByTestId('facts-elements');
    const shown = [...block.querySelectorAll('[data-role]')].map((n) => n.getAttribute('data-role'));
    expect(shown).toEqual(allRoles(CARD));
    expect(block.querySelector('[data-role="headline"]')).toHaveAttribute('data-status', 'editable');
  });

  it('lists the fonts with their licences, and says when there are no library images', () => {
    mount(CARD.key);
    const fonts = screen.getByTestId('facts-fonts');
    const facts = templateDetailFacts(CARD);
    expect(facts.fonts.length).toBeGreaterThan(0);
    for (const f of facts.fonts) {
      const row = fonts.querySelector(`[data-font="${f.key}"]`);
      expect(row, f.key).toHaveTextContent(f.family);
      expect(row, f.key).toHaveTextContent(f.licence);
    }
    expect(screen.getByTestId('facts-assets')).toHaveTextContent('No library images');
  });

  it('shows a library asset with its licence and attribution, and never invents one', () => {
    const facts = {
      ...templateDetailFacts(CARD),
      assets: [
        { id: 'a1', asset: { id: 'a1', kind: 'photo', path: 'p', w: 10, h: 10, licence: 'CC BY 4.0', attribution: 'Ada Obi', tags: [], people: false, iconSet: null } },
        { id: 'a2', asset: null },
      ],
    };
    render(<TemplateFacts facts={facts} description="" />);
    expect(document.querySelector('[data-asset="a1"]')).toHaveTextContent('CC BY 4.0 · Ada Obi');
    expect(document.querySelector('[data-asset="a2"]')).toHaveTextContent('no licence on record');
  });

  it('opens the customiser on that key from "Use this template"', () => {
    mount(EDITABLE_CARD.key, withEditableCard());
    expect(screen.queryByTestId('customiser')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Use this template/ }));
    expect(screen.getByTestId('customiser')).toHaveAttribute('data-key', EDITABLE_CARD.key);
  });

  it('shows "Preview only" and no "Use this template" when C7 fails', () => {
    const tpl = DESIGN_TEMPLATES.find((t) => t.key === 'editorial-split')!;
    expect(isPreviewOnly(tpl)).toBe(true);
    mount(tpl.key);
    expect(screen.getByTestId('preview-only')).toHaveTextContent('Preview only');
    expect(screen.queryByRole('button', { name: /Use this template/ })).toBeNull();
  });

  it('shows related designs from the same subcategory, never this one', () => {
    mount(EDITABLE_CARD.key, withEditableCard());
    const related = screen.getByTestId('related');
    const keys = [...related.querySelectorAll('[data-template]')].map((n) => n.getAttribute('data-template'));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.length).toBeLessThanOrEqual(6);
    expect(keys).not.toContain(CARD.key);
    for (const k of keys) {
      const t = DESIGN_TEMPLATES.find((x) => x.key === k)!;
      expect(subcategoryFor(t)?.key, k!).toBe('business-card');
      expect(isListed(t), k!).toBe(true);
    }
  });

  it('shows a not-found state with a link back to /media, and noindex', () => {
    mount('no-such-design');
    const box = screen.getByTestId('template-not-found');
    expect(within(box).getByRole('link', { name: /all designs/i })).toHaveAttribute('href', '/media');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/);
  });

  it('waits for the uploaded half before calling a key unknown', () => {
    mount('no-such-design', DESIGN_TEMPLATES, false);
    expect(screen.queryByTestId('template-not-found')).toBeNull();
  });

  it('titles the page "<card title> | NowOpen Create"', () => {
    mount(CARD.key);
    expect(document.title).toMatch(/ \| NowOpen Create$/);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toContain('1011 × 638 px');
  });
});

describe('relatedTemplates', () => {
  const cards = LISTED.filter((t) => subcategoryFor(t)?.key === 'business-card');
  const dirs = ['minimal', 'luxury', 'bold', 'minimal', 'editorial', 'minimal', 'corporate', 'luxury'] as const;
  const directed = cards.map((t, i) => ({ ...t, direction: dirs[i % dirs.length] }));
  const self = directed.find((t) => t.direction === 'minimal')!;

  it('prefers other directions, keeps to the subcategory, caps at six and excludes itself', () => {
    const flyer = LISTED.find((t) => subcategoryFor(t)?.key === 'flyer');
    const out = relatedTemplates(self, [...directed, ...(flyer ? [flyer] : [])]);
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out.map((t) => t.key)).not.toContain(self.key);
    for (const t of out) expect(subcategoryFor(t)?.key).toBe('business-card');
    const firstSame = out.findIndex((t) => t.direction === self.direction);
    if (firstSame >= 0) {
      for (const t of out.slice(firstSame)) expect(t.direction).toBe(self.direction);
    }
    /* Each other direction is offered before any repeats. */
    const others = new Set(directed.filter((t) => t.key !== self.key && t.direction !== self.direction).map((t) => t.direction));
    const lead = out.slice(0, Math.min(others.size, 6)).map((t) => t.direction);
    expect(new Set(lead).size).toBe(lead.length);
  });
});

describe('a gallery card', () => {
  it('links to the detail page and keeps the quick Edit action', async () => {
    const { PreviewCard } = await import('../components/create/TemplateGallery');
    const onOpen = vi.fn();
    render(
      <MemoryRouter>
        <PreviewCard template={CARD} styleKey="signature" brand="#2563eb" onOpen={onOpen} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: new RegExp(`^View `) })).toHaveAttribute('href', `/media/templates/${CARD.key}`);
    fireEvent.click(screen.getByRole('button', { name: `Edit ${CARD.label}` }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('the route', () => {
  it('is declared before /media/:id so a key is not read as a service id', async () => {
    const { readFileSync } = await import('node:fs');
    const app = readFileSync('src/App.tsx', 'utf8');
    const detail = app.indexOf('path="/media/templates/:key"');
    expect(detail).toBeGreaterThan(-1);
    expect(detail).toBeLessThan(app.indexOf('path="/media/:id"'));
  });
});
