import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) },
}));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

import ListingExplorer from '../components/home/ListingExplorer';
import type { Business } from '../types';

/**
 * The homepage used to read open/closed from the stored `status` column. Every
 * business on live carries status='open' while only two have ever set opening
 * hours, so the busiest page on the site was calling thirty shops open on the
 * strength of a default value.
 */
const shop = (over: Record<string, unknown>) => ({
  id: String(over.id), name: 'Shop', category: 'Restaurant', status: 'open',
  description: 'd', location: 'Lagos', rating: 4, ...over,
} as unknown as Business);

const mount = (businesses: Business[]) => render(
  <MemoryRouter>
    <ListingExplorer businesses={businesses} adverts={[]} mediaServices={[]} />
  </MemoryRouter>,
);

describe('homepage business cards', () => {
  it('does not call a shop open just because the status column says so', async () => {
    mount([shop({ id: '1', name: 'No Hours Shop', opening_hours: null, hours: null })]);
    expect(await screen.findByText('No Hours Shop')).toBeInTheDocument();
    expect(screen.queryByText(/Open now/)).not.toBeInTheDocument();
    expect(screen.getByText(/not confirmed/i)).toBeInTheDocument();
  });

  it('says open when the opening hours actually say so', async () => {
    mount([shop({ id: '2', name: 'Always Open', opening_hours: 'Mon-Sun 00:00-23:59' })]);
    expect(await screen.findByText(/Open now/)).toBeInTheDocument();
  });

  it('offers Keep on the homepage, where the loop starts', async () => {
    mount([shop({ id: '3', name: 'Keepable' })]);
    expect(await screen.findByRole('button', { name: /Keep Keepable/ })).toBeInTheDocument();
  });

  it('carries the details people read to choose', async () => {
    mount([shop({ id: '4', name: 'Detailed', phone: '08012345678', description: 'Great jollof' })]);
    expect(await screen.findByText('Great jollof')).toBeInTheDocument();
    expect(screen.getByText('08012345678')).toBeInTheDocument();
    expect(screen.getByText('Lagos')).toBeInTheDocument();
  });
});
