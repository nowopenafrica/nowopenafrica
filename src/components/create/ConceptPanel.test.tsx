import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ConceptPanel from './ConceptPanel';
import { readBrief } from '../../lib/create/brief';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  navigate: vi.fn(),
  insert: vi.fn(),
  result: { data: { id: 'proj-1' } as { id: string } | null, error: null as { message: string } | null },
  toastError: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => state.navigate }));
vi.mock('react-hot-toast', () => ({ default: { error: state.toastError } }));
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (row: unknown) => { state.insert(row); return { select: () => ({ single: async () => state.result }) }; },
    }),
  },
}));

/* A design wraps its lines, so its text carries line breaks: read it as a reader would. */
const words = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

const show = (request: string, businessName?: string) =>
  render(<MemoryRouter><ConceptPanel brief={readBrief(request)} businessName={businessName} /></MemoryRouter>);

beforeEach(() => {
  state.user = null;
  state.navigate.mockReset(); state.insert.mockReset(); state.toastError.mockReset();
  state.result = { data: { id: 'proj-1' }, error: null };
});

describe('ConceptPanel', () => {
  it('shows three directions that are different designs, each named', () => {
    show('Instagram post for a contemporary restaurant opening');
    const panel = screen.getByTestId('concept-panel');
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('Three directions for this brief');
    const names = [1, 2, 3].map((n) => within(screen.getByTestId(`concept-${n}`)).getByRole('heading', { level: 3 }).textContent);
    expect(new Set(names).size).toBe(3);
    /* Three headlines, not one headline three times. */
    for (const line of ['Pull up a chair.', 'The table is set.', 'Stay for another course.']) expect(words(panel)).toContain(line);
  });

  it('names the type of each concept, so the choice between them is an informed one', () => {
    show('Instagram post for a contemporary restaurant opening');
    const lines = [1, 2, 3].map((n) => screen.getByTestId(`concept-${n}-type`).textContent ?? '');
    for (const line of lines) expect(line).toMatch(/^(Headline in .+, text in .+|Type: .+ throughout)$/);
    /* Three concepts, three voices: no two name the same headline face. */
    const heads = lines.map((l) => l.replace(/^Headline in |^Type: /, '').replace(/, text in .*| throughout$/, ''));
    expect(new Set(heads).size).toBe(3);
  });

  it('says the words are placeholders, and uses the business name when it has one', () => {
    show('Flyer for my barber shop', 'Iron Chair');
    const panel = screen.getByTestId('concept-panel');
    expect(panel.textContent).toMatch(/placeholders to start from, not claims about your business/);
    for (const n of [1, 2, 3]) {
      expect(words(screen.getByTestId(`concept-${n}`))).toContain('Iron Chair');
      expect(words(screen.getByTestId(`concept-${n}`))).not.toContain('Your brand');
    }
  });

  it('keeps the customer’s own headline on all three', () => {
    show('Flyer for my barber shop "Fades from the heart"');
    expect(screen.getByTestId('concept-panel').textContent).toMatch(/Your headline is used as you wrote it/);
    for (const n of [1, 2, 3]) expect(words(screen.getByTestId(`concept-${n}`))).toContain('Fades from the heart');
  });

  it('shows nothing until the trade is known', () => {
    show('something nice please');
    expect(screen.queryByTestId('concept-panel')).toBeNull();
  });

  it('asks a signed-out visitor to sign in, and saves nothing', () => {
    show('Flyer for my barber shop');
    expect(screen.getAllByRole('link', { name: /Sign in to edit this/ })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Open in the editor/ })).toBeNull();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it('saves the chosen concept as the customer’s own project and opens it in the editor', async () => {
    state.user = { id: 'user-9' };
    show('Flyer for my barber shop');
    expect(state.insert).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByTestId('concept-2')).getByRole('button', { name: /Open in the editor/ }));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/media/studio/proj-1'));
    expect(state.insert).toHaveBeenCalledTimes(1);
    const row = state.insert.mock.calls[0][0] as { user_id: string; title: string; document: { pages: { objects: { type: string; text?: string }[] }[] } };
    expect(row.user_id).toBe('user-9');
    expect(row.document.pages[0].objects.some((o) => o.type === 'text' && o.text?.replace(/\n/g, ' ') === 'Your hair, handled.')).toBe(true);
  });

  it('says so when the save fails, and stays on the page', async () => {
    state.user = { id: 'user-9' };
    state.result = { data: null, error: { message: 'row violates policy' } };
    show('Flyer for my barber shop');
    fireEvent.click(within(screen.getByTestId('concept-1')).getByRole('button', { name: /Open in the editor/ }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith('Could not open that concept: row violates policy'));
    expect(state.navigate).not.toHaveBeenCalled();
    expect(within(screen.getByTestId('concept-1')).getByRole('button', { name: /Open in the editor/ })).toBeTruthy();
  });
});
