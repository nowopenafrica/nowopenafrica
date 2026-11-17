import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import EngineGallery from './EngineGallery';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  navigate: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({ useOptionalAuth: () => ({ user: state.user }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => state.navigate }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ insert: (row: unknown) => { state.insert(row); return { select: () => ({ single: async () => ({ data: { id: 'proj-7' }, error: null }) }) }; } }) },
}));

const show = (deliverables: string[]) => render(<MemoryRouter><EngineGallery deliverables={deliverables} /></MemoryRouter>);
const words = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => { state.user = null; state.navigate.mockReset(); state.insert.mockReset(); });

describe('EngineGallery', () => {
  it('shows eight designs for the first item it can make, each naming its type', () => {
    show(['letterhead', 'flyer', 'poster']);
    const g = screen.getByTestId('engine-gallery');
    expect(within(g).getByRole('heading', { level: 3 }).textContent).toBe('Designed for flyer');
    const cards = screen.getAllByTestId('engine-design');
    expect(cards).toHaveLength(8);
    for (const c of cards) expect(words(c)).toMatch(/Headline in .+, text in .+|Type: .+ throughout/);
    /* An item the engine cannot make (a letterhead) is not offered as a chip. */
    expect(within(g).queryByRole('button', { name: 'Letterhead' })).toBeNull();
    expect(within(g).getByRole('button', { name: 'Poster' })).toBeTruthy();
  });

  it('switches item, and shows more on request', () => {
    show(['flyer', 'poster']);
    fireEvent.click(screen.getByRole('button', { name: 'Poster' }));
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Designed for poster');
    fireEvent.click(screen.getByRole('button', { name: /Show \d+ more/ }));
    expect(screen.getAllByTestId('engine-design').length).toBeGreaterThan(8);
  });

  it('uses the chosen trade’s own words', () => {
    show(['flyer']);
    fireEvent.change(screen.getByTestId('engine-gallery-trade'), { target: { value: 'restaurant-dining' } });
    expect(words(screen.getByTestId('engine-gallery'))).toMatch(/Pull up a chair\.|The table is set\.|Stay for another course\./);
  });

  it('shows nothing for a need the engine cannot make', () => {
    show(['letterhead', 'invoice']);
    expect(screen.queryByTestId('engine-gallery')).toBeNull();
  });

  it('asks a signed-out visitor to sign in, and saves nothing', () => {
    show(['flyer']);
    expect(screen.getAllByRole('link', { name: /Sign in to edit/ })).toHaveLength(8);
    expect(state.insert).not.toHaveBeenCalled();
  });

  it('saves the chosen design as the customer’s own project and opens the editor', async () => {
    state.user = { id: 'user-3' };
    show(['business-card']);
    fireEvent.click(within(screen.getAllByTestId('engine-design')[2]).getByRole('button', { name: 'Edit' }));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/media/studio/proj-7'));
    const row = state.insert.mock.calls[0][0] as { user_id: string; document: { pages: { width: number; height: number }[] } };
    expect(row.user_id).toBe('user-3');
    expect(row.document.pages[0].width / row.document.pages[0].height).toBeCloseTo(1011 / 638, 2);
  });
});
