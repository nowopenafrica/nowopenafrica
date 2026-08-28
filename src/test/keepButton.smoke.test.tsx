import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/** The one row this user has for this business, or null. */
let existing: { topics: string[] } | null = null;
const upserts: Record<string, unknown>[] = [];
const deletes: number[] = [];

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: existing }) }),
          order: async () => ({ data: [] }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => { upserts.push(row); return { error: null }; },
      delete: () => ({ eq: () => ({ eq: async () => { deletes.push(1); return { error: null }; } }) }),
    }),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

let currentUser: { id: string } | null = { id: 'u1' };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: currentUser }),
}));

import KeepButton from '../components/KeepButton';
import { DEFAULT_TOPICS } from '../lib/keeps';

const mount = () => render(
  <MemoryRouter><KeepButton businessId="b1" businessName="Mama Put Kitchen" /></MemoryRouter>,
);

beforeEach(() => {
  existing = null;
  upserts.length = 0;
  deletes.length = 0;
  currentUser = { id: 'u1' };
  localStorage.clear();
});

describe('KeepButton', () => {
  it('offers Keep to someone who is not keeping yet', async () => {
    mount();
    expect(await screen.findByRole('button', { name: /Keep Mama Put Kitchen/ })).toBeInTheDocument();
  });

  it('keeps, and opts into the sensible topics rather than everything', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Keep Mama Put Kitchen/ }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0].topics).toEqual(DEFAULT_TOPICS);
    // Opening updates would be fourteen notifications a week for a daily trader.
    expect(upserts[0].topics).not.toContain('openings');
  });

  it('shows the consent panel straight after keeping, not buried in settings', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Keep Mama Put Kitchen/ }));
    expect(await screen.findByText(/What would you like to hear about/)).toBeInTheDocument();
  });

  it('reads back an existing keep and its topics', async () => {
    existing = { topics: ['promotions'] };
    mount();
    expect(await screen.findByRole('button', { name: /Keeping Mama Put Kitchen/ })).toBeInTheDocument();
  });

  it('saves a topic change', async () => {
    existing = { topics: ['promotions'] };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Keeping Mama Put Kitchen/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Events/ }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0].topics).toContain('events');
  });

  it('lets someone keep a business and ask for nothing', async () => {
    // A real choice, and not the same as not keeping.
    existing = { topics: ['promotions'] };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Keeping Mama Put Kitchen/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Promotions and offers/ }));
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(upserts[0].topics).toEqual([]);
    expect(await screen.findByText(/will not message you/)).toBeInTheDocument();
  });

  it('can stop keeping', async () => {
    existing = { topics: ['promotions'] };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Keeping Mama Put Kitchen/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Stop keeping/ }));
    await waitFor(() => expect(deletes).toHaveLength(1));
  });

  it('asks a signed-out visitor to sign in rather than failing silently', async () => {
    currentUser = null;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Keep Mama Put Kitchen/ }));
    expect(await screen.findByText(/Sign in to Keep/)).toBeInTheDocument();
    expect(upserts).toHaveLength(0);
  });

  it('remembers the tap so nobody has to do it twice after signing in', async () => {
    // Someone who taps Keep, signs in, comes back and finds nothing happened
    // will not tap it again.
    currentUser = null;
    const { unmount } = mount();
    fireEvent.click(await screen.findByRole('button', { name: /Keep Mama Put Kitchen/ }));
    unmount();

    currentUser = { id: 'u1' };
    mount();
    await waitFor(() => expect(upserts).toHaveLength(1));
    expect(await screen.findByRole('button', { name: /Keeping Mama Put Kitchen/ })).toBeInTheDocument();
  });

  it('does not resume a keep for a different business', async () => {
    currentUser = null;
    const { unmount } = mount();
    fireEvent.click(await screen.findByRole('button', { name: /Keep Mama Put Kitchen/ }));
    unmount();

    currentUser = { id: 'u1' };
    render(<MemoryRouter><KeepButton businessId="OTHER" businessName="Someone Else" /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 60));
    expect(upserts).toHaveLength(0);
  });
});
