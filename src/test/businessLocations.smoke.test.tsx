import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let rows: Record<string, unknown>[] = [];
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows }),
      }),
    }),
  },
}));

import BusinessLocations from '../components/BusinessLocations';
import type { Business } from '../types';

const business = {
  id: 'b1', name: 'MeatClub Nigeria', description: '', category: 'Meat & Poultry Shop',
  location: 'Yaba, Lagos', phone: '08031234567',
  opening_hours: 'Mon-Sat: 8AM-8PM', timezone: 'Africa/Lagos', open_status: null,
} as unknown as Business;

// Wednesday 10:00 in Lagos — inside the parent's hours.
const NOW = new Date('2026-08-26T09:00:00Z');

beforeEach(() => { rows = []; });

describe('BusinessLocations', () => {
  it('renders nothing at all for a single-site business', async () => {
    // The overwhelming majority. An empty "Locations" heading asks a question
    // the business has no answer to.
    const { container } = render(<BusinessLocations business={business} now={NOW} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });

  it('lists the branches with their own open state', async () => {
    rows = [
      { id: 'l1', name: 'Yaba', address: '14 Herbert Macaulay Way', is_primary: true },
      { id: 'l2', name: 'Ikeja', address: '2 Allen Avenue', open_status: 'closed' },
    ];
    render(<BusinessLocations business={business} now={NOW} />);
    expect(await screen.findByText('Yaba')).toBeInTheDocument();
    expect(screen.getByText('Ikeja')).toBeInTheDocument();
    expect(screen.getByText('14 Herbert Macaulay Way')).toBeInTheDocument();
    // One follows the parent's hours and is open; the other is overridden shut.
    expect(screen.getByText('Open now')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('summarises how many can be reached right now', async () => {
    rows = [
      { id: 'l1', name: 'Yaba' },
      { id: 'l2', name: 'Ikeja', open_status: 'closed' },
    ];
    render(<BusinessLocations business={business} now={NOW} />);
    expect(await screen.findByText('1 of 2 open now')).toBeInTheDocument();
  });

  it('falls back to the parent address for a branch that set none', async () => {
    rows = [{ id: 'l1', name: 'Main' }];
    render(<BusinessLocations business={business} now={NOW} />);
    expect(await screen.findByText('Yaba, Lagos')).toBeInTheDocument();
  });

  it('offers a way to act on each branch', async () => {
    rows = [{ id: 'l1', name: 'Yaba', address: '14 Herbert Macaulay Way', phone: '08099887766' }];
    render(<BusinessLocations business={business} now={NOW} />);
    expect(await screen.findByText('Call')).toBeInTheDocument();
    expect(screen.getByText('Directions')).toBeInTheDocument();
  });

  it('survives the table not existing yet', async () => {
    // Until the migration is applied, the query returns nothing — which must
    // look like "no branches", not like a broken profile.
    rows = [];
    const { container } = render(<BusinessLocations business={business} now={NOW} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe('');
  });
});
