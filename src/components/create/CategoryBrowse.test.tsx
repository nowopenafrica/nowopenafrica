import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { DESIGN_TEMPLATES, type DesignTemplate } from '../../lib/designTemplates';
import { DIRECTIONS } from '../../lib/design/directions';
import { NEEDS, isListed, listedIn, shownNeeds } from '../../lib/create/needs';
import {
  CATEGORIES, needToSubcategories, shownSubcategories, subcategoryFor,
} from '../../lib/create/catalogueTaxonomy';

/* The real renderer is heavy; these tests are about which cards appear. */
vi.mock('../studio/TemplateSurface', () => ({ default: () => <div data-testid="surface" /> }));

/* The catalogue the page reads; a test swaps in synthetic directed templates. */
const catalogue = vi.hoisted(() => ({ list: null as null | unknown[], ready: true, incomplete: null as string | null }));
vi.mock('../../hooks/useDesignCatalogue', async () => {
  const mod = await import('../../lib/designTemplates');
  return {
    useDesignCatalogue: () => ({
      templates: catalogue.list ?? mod.DESIGN_TEMPLATES, ready: catalogue.ready, incomplete: catalogue.incomplete,
    }),
  };
});
vi.mock('../../lib/telemetry', () => ({ track: () => {} }));
/* Nothing on /media reads Supabase on mount except the catalogue hook (mocked above). */
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import CategoryBrowse from './CategoryBrowse';
import CreateMarketplace from './CreateMarketplace';

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); catalogue.list = null; catalogue.ready = true; catalogue.incomplete = null; });

const LISTED = DESIGN_TEMPLATES.filter(isListed);
const inSub = (key: string) => LISTED.filter((t) => subcategoryFor(t)?.key === key);

/**
 * Synthetic directed templates, through the real `shownSubcategories` rule:
 * business cards and sale posts each span four directions; everything else
 * keeps no direction and so stays unshown. Task 18's pilot adds the real ones.
 */
const directed = (tpls: DesignTemplate[], n = 4): DesignTemplate[] =>
  tpls.map((t, i) => ({ ...t, direction: DIRECTIONS[i % n].key }));
const DIRECTED: DesignTemplate[] = LISTED.map((t) => t);
for (const sub of ['business-card', 'sale-post']) {
  const d = directed(inSub(sub));
  for (const t of d) DIRECTED[DIRECTED.findIndex((x) => x.key === t.key)] = t;
}

const browse = (listed: DesignTemplate[], props: { loading?: boolean; error?: string | null } = {}) => render(
  <MemoryRouter><CategoryBrowse listed={listed} onEdit={() => {}} {...props} /></MemoryRouter>,
);
const cardKeys = () => screen.queryAllByTestId('template-card').map((c) => c.getAttribute('data-key'));

describe('CategoryBrowse', () => {
  it('renders nothing for today\'s library: no subcategory spans four directions', () => {
    expect(shownSubcategories(LISTED)).toEqual([]);
    const { container } = browse(LISTED);
    expect(container.innerHTML).toBe('');
  });

  it('offers only the shown subcategories, under their categories', () => {
    browse(DIRECTED);
    const shown = shownSubcategories(DIRECTED).map((s) => s.key);
    expect(shown.sort()).toEqual(['business-card', 'sale-post']);
    const subs = screen.getAllByTestId('browse-subcategory').map((b) => b.getAttribute('data-subcategory'));
    expect(subs.sort()).toEqual(shown);
    const cats = screen.getAllByTestId('browse-category').map((b) => b.getAttribute('data-category'));
    expect(cats).toEqual(CATEGORIES.filter((c) => ['brand', 'social'].includes(c.key)).map((c) => c.key));
  });

  it('lists the designs of the shown subcategories only, twelve at a time', () => {
    browse(DIRECTED);
    const expected = [...inSub('business-card'), ...inSub('sale-post')].map((t) => t.key).sort();
    expect(expected.length).toBeGreaterThan(12);
    expect(cardKeys()).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: /Show \d+ more/ }));
    expect(cardKeys().sort()).toEqual(expected);
    expect(screen.queryByRole('button', { name: /Show \d+ more/ })).toBeNull();
  });

  it('narrows to a category, then to one subcategory', () => {
    browse(DIRECTED);
    const social = screen.getAllByTestId('browse-category').find((b) => b.getAttribute('data-category') === 'social')!;
    fireEvent.click(social);
    expect(social).toHaveAttribute('aria-pressed', 'true');
    expect(cardKeys().sort()).toEqual(inSub('sale-post').map((t) => t.key).sort());
    expect(screen.getAllByTestId('browse-subcategory').map((b) => b.getAttribute('data-subcategory'))).toEqual(['sale-post']);

    fireEvent.click(screen.getByRole('button', { name: /All categories/ }));
    const cards = screen.getAllByTestId('browse-subcategory').find((b) => b.getAttribute('data-subcategory') === 'business-card')!;
    fireEvent.click(cards);
    expect(cards).toHaveAttribute('aria-pressed', 'true');
    expect(cardKeys().sort()).toEqual(inSub('business-card').map((t) => t.key).sort());
  });

  it('filters with labelled controls, showing the direction filter once directions exist', () => {
    browse(DIRECTED);
    const dir = screen.getByLabelText('Direction');
    fireEvent.change(dir, { target: { value: 'luxury' } });
    const keys = cardKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(DIRECTED.find((t) => t.key === k)?.direction).toBe('luxury');
  });

  it('says plainly when a combination matches nothing, and clears it', () => {
    browse(DIRECTED);
    const social = screen.getAllByTestId('browse-category').find((b) => b.getAttribute('data-category') === 'social')!;
    fireEvent.click(social);
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'warm' } });
    expect(cardKeys().length).toBeGreaterThan(0);
    // Business cards hold no warm palette.
    fireEvent.click(screen.getAllByTestId('browse-category').find((b) => b.getAttribute('data-category') === 'brand')!);
    expect(cardKeys()).toEqual([]);
    expect(screen.getByTestId('browse-empty')).toHaveTextContent('No designs match these filters.');
    fireEvent.click(within(screen.getByTestId('browse-empty')).getByRole('button', { name: 'Clear filters' }));
    expect(cardKeys().length).toBeGreaterThan(0);
  });

  it('shows a skeleton, not "no designs", while the catalogue is still loading', () => {
    browse(DIRECTED, { loading: true });
    fireEvent.click(screen.getAllByTestId('browse-category').find((b) => b.getAttribute('data-category') === 'social')!);
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'warm' } });
    fireEvent.click(screen.getAllByTestId('browse-category').find((b) => b.getAttribute('data-category') === 'brand')!);
    expect(screen.queryByTestId('browse-empty')).toBeNull();
    expect(screen.getAllByTestId('card-skeleton').length).toBeGreaterThan(0);
    expect(screen.getByTestId('browse-results')).toHaveAttribute('aria-busy', 'true');
  });

  it('says so when uploaded designs could not be read', () => {
    browse(DIRECTED, { error: 'We could not load uploaded templates just now.' });
    expect(screen.getByTestId('browse-error')).toHaveTextContent('We could not load uploaded templates just now.');
    expect(cardKeys().length).toBeGreaterThan(0);
  });

  it('shows no Clear for a category alone; with a filter too, Clear drops the filter and keeps the category', () => {
    browse(DIRECTED);
    const social = () => screen.getAllByTestId('browse-category').find((b) => b.getAttribute('data-category') === 'social')!;
    fireEvent.click(social());
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'warm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(social()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Colour')).toHaveValue('');
    expect(cardKeys().sort()).toEqual(inSub('sale-post').map((t) => t.key).sort());
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('lets a product chip go once it is no longer shown, so the grid is never stuck empty', () => {
    const { rerender } = browse(DIRECTED);
    fireEvent.click(screen.getAllByTestId('browse-subcategory').find((b) => b.getAttribute('data-subcategory') === 'sale-post')!);
    expect(cardKeys().sort()).toEqual(inSub('sale-post').map((t) => t.key).sort());
    /* Sale posts lose their directions: only business cards stay shown. */
    const onlyCards = DIRECTED.map((t) => (subcategoryFor(t)?.key === 'sale-post' ? { ...t, direction: undefined } : t));
    rerender(<MemoryRouter><CategoryBrowse listed={onlyCards} onEdit={() => {}} /></MemoryRouter>);
    expect(screen.getAllByTestId('browse-subcategory').map((b) => b.getAttribute('data-subcategory'))).toEqual(['business-card']);
    expect(cardKeys().sort()).toEqual(inSub('business-card').map((t) => t.key).sort());
  });

  it('the empty state\'s Clear also releases the chosen product', () => {
    browse(DIRECTED);
    fireEvent.click(screen.getAllByTestId('browse-subcategory').find((b) => b.getAttribute('data-subcategory') === 'sale-post')!);
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'warm' } });
    fireEvent.click(screen.getAllByTestId('browse-subcategory').find((b) => b.getAttribute('data-subcategory') === 'business-card')!);
    expect(screen.getByTestId('browse-empty')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('browse-empty')).getByRole('button', { name: 'Clear filters' }));
    for (const b of screen.getAllByTestId('browse-subcategory')) expect(b).toHaveAttribute('aria-pressed', 'false');
    expect(cardKeys()).toHaveLength(12);
  });

  it('announces the result count, politely, after a change and not on arrival', () => {
    browse(DIRECTED);
    const live = screen.getByTestId('browse-count');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('');
    fireEvent.click(screen.getAllByTestId('browse-category').find((b) => b.getAttribute('data-category') === 'social')!);
    expect(live).toHaveTextContent(`${inSub('sale-post').length} designs`);
    fireEvent.change(screen.getByLabelText('Direction'), { target: { value: 'luxury' } });
    const n = DIRECTED.filter((t) => subcategoryFor(t)?.key === 'sale-post' && t.direction === 'luxury').length;
    expect(live).toHaveTextContent(`${n} ${n === 1 ? 'design' : 'designs'}`);
  });

  it('keeps the category buttons keyboard reachable at 44px', () => {
    browse(DIRECTED);
    for (const b of [...screen.getAllByTestId('browse-category'), ...screen.getAllByTestId('browse-subcategory')]) {
      expect(b.tagName).toBe('BUTTON');
      expect(b.className).toMatch(/min-h-\[44px\]/);
    }
  });
});

describe('the Create page with and without directions', () => {
  const page = (url = '/media') => render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/media" element={<CreateMarketplace />} /></Routes>
    </MemoryRouter>,
  );
  const sections = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-create-section]')].map((el) => el.getAttribute('data-create-section'));

  it('today keeps the need tiles and has no browse section', () => {
    const { container } = page();
    expect(sections(container)).not.toContain('browse');
    expect(screen.getAllByTestId('need-tile').length).toBe(shownNeeds(LISTED).length);
    expect(container.textContent).not.toContain('Browse by category');
  });

  it('adds the browse section once a subcategory is shown, and keeps the tiles', () => {
    catalogue.list = DIRECTED;
    const { container } = page();
    expect(sections(container)).toContain('browse');
    expect(screen.getByRole('heading', { name: 'Browse by category' })).toBeInTheDocument();
    expect(screen.getAllByTestId('need-tile').length).toBeGreaterThan(0);
  });

  it('still lands an old ?category= link on its need', () => {
    const { container } = page('/media?category=menus');
    expect(container.querySelector('[data-create-section="need"]')).toHaveAttribute('data-need', 'menus');
  });

  it('every need still routes to its own subcategories', () => {
    for (const need of NEEDS) {
      const subs = new Set(needToSubcategories(need.slug));
      for (const t of listedIn(need.slug, LISTED)) {
        expect(subs.has(subcategoryFor(t)!.key), `${need.slug} -> ${t.key}`).toBe(true);
      }
    }
  });
});
