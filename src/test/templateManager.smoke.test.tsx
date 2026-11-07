import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// jsdom has no matchMedia — react-hot-toast's <Toaster /> needs it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

/**
 * The read outcome under test is chosen per file by this flag.
 *
 * The thing worth guarding here is not that a list renders — it is that an
 * EMPTY library and an UNREADABLE one say different things. Eleven admin
 * panels in this product have already reported an empty table as a missing
 * migration; the mirror of that mistake invites somebody to upload a whole
 * library a second time because a failed read looked like zero.
 */
let mode: 'empty' | 'missing' = 'empty';

vi.mock('../lib/supabase', () => {
  const result = () => (mode === 'empty'
    ? { data: [], error: null }
    : { data: null, error: { code: '42P01', message: 'relation does not exist' } });
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    then: (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(onF, onR),
  });
  return {
    supabase: {
      from: vi.fn(() => chain),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-staff' } }, error: null })) },
    },
  };
});

import TemplateManager from '../components/admin/TemplateManager';
import { DESIGN_TEMPLATES } from '../lib/designTemplates';

describe('TemplateManager smoke', () => {
  it('tells an empty library from an unreadable one', async () => {
    mode = 'empty';
    render(<TemplateManager />);
    expect(await screen.findByText(/Nothing uploaded yet/)).toBeInTheDocument();
    /* The shipped layouts are not affected by an empty table, and it says so. */
    expect(screen.getAllByText(new RegExp(`${DESIGN_TEMPLATES.length} shipped layouts`)).length).toBeGreaterThan(0);

    mode = 'missing';
    render(<TemplateManager />);
    expect(await screen.findByText(/not applied to this database yet/)).toBeInTheDocument();
    expect(screen.getByText(/failed read, not an empty library/)).toBeInTheDocument();
  });

  it('says plainly what becomes an editable template and what cannot', async () => {
    mode = 'empty';
    render(<TemplateManager />);
    await screen.findAllByText(/Nothing uploaded yet/);
    /*
     * "It uploaded" and "it is editable" are different facts. A picture
     * stored here would be a catalogue entry nothing in the editor can
     * change, so the screen states the limit before anybody picks a file.
     */
    expect(screen.getAllByText(/become editable templates/).length).toBeGreaterThan(0);
    /* And the limit, in the same breath, before anybody picks a file. */
    expect(screen.getAllByText(/A picture cannot/).length).toBeGreaterThan(0);
  });

  it('offers a real starter file, because a blank JSON editor is not an instruction', async () => {
    mode = 'empty';
    render(<TemplateManager />);
    await screen.findAllByText(/Nothing uploaded yet/);
    expect(screen.getAllByRole('button', { name: /Starter file/ }).length).toBeGreaterThan(0);
  });
});
