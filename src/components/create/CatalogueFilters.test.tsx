import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DESIGN_TEMPLATES } from '../../lib/designTemplates';
import { isListed } from '../../lib/create/needs';
import { filterOptions, type FilterSelection } from '../../lib/create/catalogueFilters';
import CatalogueFilters from './CatalogueFilters';

const LISTED = DESIGN_TEMPLATES.filter(isListed);

afterEach(() => cleanup());

const mount = (selection: FilterSelection = {}, onChange = vi.fn(), onClear = vi.fn()) => render(
  <CatalogueFilters options={filterOptions(LISTED, selection)} selection={selection} onChange={onChange} onClear={onClear} />,
);

/** min-h-[Npx] in explicit px — rem undersizes on this app's root font. */
const minHeightPx = (el: HTMLElement) => Number(el.className.match(/min-h-\[(\d+)px\]/)?.[1] ?? 0);

describe('CatalogueFilters', () => {
  it('renders one labelled control per group that has values, and no other', () => {
    mount();
    const groups = filterOptions(LISTED, {});
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(groups.length);
    for (const g of groups) expect(screen.getByLabelText(g.label)).toBeInTheDocument();
    // Nothing is directed today, so no Direction filter.
    expect(screen.queryByLabelText('Direction')).toBeNull();
  });

  it('offers only values that match something, with their counts', () => {
    mount();
    const colour = screen.getByLabelText('Colour');
    const group = filterOptions(LISTED, {}).find((g) => g.key === 'colour')!;
    const options = within(colour).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('value'))).toEqual(['', ...group.values.map((v) => v.value)]);
    for (const v of group.values) expect(within(colour).getByRole('option', { name: `${v.label} (${v.count})` })).toBeInTheDocument();
  });

  it('has no "free or paid", "trending" or "popularity" filter', () => {
    const { container } = mount();
    expect(container.textContent).not.toMatch(/free|paid|trending|popular/i);
  });

  it('is operable from the keyboard alone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mount({}, onChange);
    await user.tab();
    const first = screen.getAllByRole('combobox')[0];
    expect(first).toHaveFocus();
    await user.selectOptions(first, within(first).getAllByRole('option')[1]);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ category: expect.any(String) }));
    for (const s of screen.getAllByRole('combobox')) {
      expect(s.tagName).toBe('SELECT');
      expect(s).not.toHaveAttribute('tabindex', '-1');
      expect(minHeightPx(s)).toBeGreaterThanOrEqual(44);
    }
  });

  it('offers "Clear filters" only once something is chosen, as a 44px button', async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    cleanup();
    const onClear = vi.fn();
    mount({ category: 'brand' }, vi.fn(), onClear);
    const clear = screen.getByRole('button', { name: 'Clear filters' });
    expect(minHeightPx(clear)).toBeGreaterThanOrEqual(44);
    clear.focus();
    await user.keyboard('{Enter}');
    expect(onClear).toHaveBeenCalled();
  });

  it('choosing "Any" removes that group from the selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mount({ category: 'brand', colour: 'cool' }, onChange);
    await user.selectOptions(screen.getByLabelText('Category'), '');
    expect(onChange).toHaveBeenCalledWith({ colour: 'cool' });
  });
});
