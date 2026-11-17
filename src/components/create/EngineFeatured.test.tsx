import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import EngineFeatured from './EngineFeatured';
import { FEATURED_ROWS, STRIP_ITEMS } from '../../lib/create/engineFeatured';

vi.mock('../../contexts/AuthContext', () => ({ useOptionalAuth: () => ({ user: null }) }));

const words = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

describe('EngineFeatured: the Create page default view, drawn by the engine', () => {
  it('fills the strip with one engine design per item, in different compositions', () => {
    render(<EngineFeatured part="strip" onPick={vi.fn()} />);
    const strip = screen.getByRole('region', { name: 'Creative products' });
    const real = within(within(strip).getByTestId('products-list')).getAllByTestId('engine-featured-card');
    expect(real).toHaveLength(STRIP_ITEMS.length);
    /* The loop's hidden copy is not reachable by keyboard. */
    for (const c of within(within(strip).getByTestId('products-clone')).getAllByTestId('engine-featured-card')) expect(c.tabIndex).toBe(-1);
    /* The caption's second line names the design's movement: the strip should not be one style twelve times. */
    const movements = real.map((c) => c.querySelectorAll(':scope > span')[1]?.textContent ?? '');
    expect(new Set(movements).size).toBeGreaterThanOrEqual(4);
  });

  it('opens the item’s gallery from a strip card', () => {
    const onPick = vi.fn();
    render(<EngineFeatured part="strip" onPick={onPick} />);
    fireEvent.click(within(screen.getByTestId('products-list')).getAllByTestId('engine-featured-card')[1]);
    expect(onPick).toHaveBeenCalledWith('stationery', 'business-card');
  });

  it('shows the featured rows (six designs, four for a landscape card), with no filler or invented figures', () => {
    render(<EngineFeatured part="rows" onPick={vi.fn()} />);
    const rows = screen.getAllByTestId('engine-featured-row');
    expect(rows.map((r) => r.dataset.item)).toEqual(FEATURED_ROWS.map((r) => r.item));
    for (const r of rows) {
      expect(within(r).getAllByTestId('engine-featured-card')).toHaveLength(r.dataset.item === 'business-card' ? 4 : 6);
      expect(words(r)).not.toMatch(/lorem|your headline here|00%/i);
    }
    expect(words(rows[1])).toMatch(/Your phone/);
    expect(words(rows[3])).toMatch(/Your date/);
  });

  it('opens a row’s gallery from See all or from a card', () => {
    const onPick = vi.fn();
    render(<EngineFeatured part="rows" onPick={onPick} />);
    const events = screen.getAllByTestId('engine-featured-row')[3];
    fireEvent.click(within(events).getByRole('button', { name: /See all/ }));
    fireEvent.click(within(events).getAllByTestId('engine-featured-card')[0]);
    expect(onPick.mock.calls).toEqual([['events', 'event-poster'], ['events', 'event-poster']]);
  });

  it('browses by category with engine galleries, never the old template cards', () => {
    render(<MemoryRouter><EngineFeatured part="browse" onPick={vi.fn()} /></MemoryRouter>);
    const browse = screen.getByTestId('engine-browse');
    /* It opens on a category the featured rows do not already show. */
    expect(within(browse).getByRole('button', { pressed: true }).textContent).toBe('Brand & packaging');
    /* A denser grid: six or seven a row on a wide screen, two rows of seven first. */
    expect(within(browse).getAllByTestId('engine-design')).toHaveLength(14);
    expect(within(browse).getByRole('list').className).toMatch(/lg:grid-cols-6 xl:grid-cols-7/);
    fireEvent.click(within(browse).getByRole('button', { name: 'Menus & price lists' }));
    expect(within(browse).getByRole('heading', { level: 3 }).textContent).toBe('Designed for menu');
    expect(within(browse).getAllByTestId('engine-design')).toHaveLength(14);
    fireEvent.click(within(browse).getByRole('button', { name: /^Show \d+ more$/ }));
    const all = within(browse).getAllByTestId('engine-design').length;
    expect(all).toBeGreaterThan(14);
    expect(all).toBeLessThanOrEqual(21);
  });
});
