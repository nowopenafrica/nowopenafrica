import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { DESIGN_TEMPLATES } from '../../lib/designTemplates';
import { isListed } from '../../lib/create/needs';
import { COLLECTIONS } from '../../lib/create/collections';

vi.mock('../studio/TemplateSurface', () => ({ default: () => <div data-testid="surface" /> }));

import CollectionStrip from './CollectionStrip';

const LISTED = DESIGN_TEMPLATES.filter(isListed);

afterEach(() => cleanup());

const mount = (listed = LISTED, loading = false) => render(
  <MemoryRouter><CollectionStrip listed={listed} loading={loading} onEdit={() => {}} /></MemoryRouter>,
);

describe('CollectionStrip', () => {
  it('shows each committed collection with its title, blurb and listed designs', () => {
    mount();
    const groups = screen.getAllByTestId('collection');
    expect(groups.map((g) => g.getAttribute('data-collection'))).toEqual(COLLECTIONS.map((c) => c.key));
    COLLECTIONS.forEach((c, i) => {
      const g = within(groups[i]);
      expect(g.getByRole('heading', { name: c.title })).toBeInTheDocument();
      expect(groups[i]).toHaveTextContent(c.blurb);
      expect(g.getAllByTestId('template-card').map((x) => x.getAttribute('data-key'))).toEqual(c.templateKeys);
    });
  });

  it('drops a design that is no longer listed, and renders nothing when none is left', () => {
    const held = COLLECTIONS[0].templateKeys[0];
    mount(LISTED.filter((t) => t.key !== held));
    expect(screen.getAllByTestId('template-card').map((x) => x.getAttribute('data-key'))).not.toContain(held);
    cleanup();
    const { container } = mount([]);
    expect(container.innerHTML).toBe('');
  });

  it('shows a skeleton while the catalogue is still loading and nothing has resolved', () => {
    mount([], true);
    expect(screen.getAllByTestId('card-skeleton').length).toBeGreaterThan(0);
    expect(screen.getByTestId('collections')).toHaveAttribute('aria-busy', 'true');
  });

  it('claims no popularity', () => {
    const { container } = mount();
    expect(container.textContent).not.toMatch(/best.?sell|trending|popular/i);
  });
});
