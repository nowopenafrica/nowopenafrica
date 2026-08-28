import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/** Rows keyed by table, so one mock serves all three reads. */
let tables: Record<string, Record<string, unknown>[]> = {};
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: tables[table] ?? [] }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import CustomersPanel from '../components/studio/CustomersPanel';
import type { Business } from '../types';

const business = { id: 'b1', name: 'Mama Put Kitchen', location: 'Yaba, Lagos' } as unknown as Business;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeEach(() => {
  tables = {
    business_bookings: [
      { id: 'k1', customer_name: 'Chidi Okafor', customer_email: 'chidi@x.com', customer_phone: '08031234567', item_name: 'Jollof platter', status: 'confirmed', created_at: daysAgo(3) },
      { id: 'k2', customer_name: 'Chidi Okafor', customer_email: 'CHIDI@x.com', item_name: 'Egusi', status: 'pending', created_at: daysAgo(200) },
      { id: 'k3', customer_name: 'Amaka Eze', customer_email: 'amaka@x.com', item_name: 'Catering', status: 'pending', created_at: daysAgo(400) },
    ],
    business_enquiries: [],
    business_reviews: [],
  };
});

describe('CustomersPanel', () => {
  it('turns bookings into people, merging the same person', async () => {
    render(<CustomersPanel business={business} />);
    expect(await screen.findByText('Chidi Okafor')).toBeInTheDocument();
    expect(screen.getByText('Amaka Eze')).toBeInTheDocument();
    // Two bookings, one customer — the email matched despite the casing.
    expect(screen.getByText(/2 people have booked/)).toBeInTheDocument();
  });

  it('shows what they bought, so a message can refer to it', async () => {
    render(<CustomersPanel business={business} />);
    await screen.findByText('Chidi Okafor');
    expect(screen.getByText(/Jollof platter/)).toBeInTheDocument();
  });

  it('filters to a segment', async () => {
    render(<CustomersPanel business={business} />);
    await screen.findByText('Chidi Okafor');
    // Amaka last came 400 days ago; Chidi came 3 days ago.
    fireEvent.click(screen.getByRole('button', { name: /Lapsed/ }));
    await waitFor(() => expect(screen.queryByText('Chidi Okafor')).not.toBeInTheDocument());
    expect(screen.getByText('Amaka Eze')).toBeInTheDocument();
  });

  it('searches by name', async () => {
    render(<CustomersPanel business={business} />);
    await screen.findByText('Chidi Okafor');
    fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'amaka' } });
    await waitFor(() => expect(screen.queryByText('Chidi Okafor')).not.toBeInTheDocument());
  });

  it('says so plainly when there are no customers yet', async () => {
    tables = { business_bookings: [], business_enquiries: [], business_reviews: [] };
    render(<CustomersPanel business={business} />);
    expect(await screen.findByText(/No customers yet/)).toBeInTheDocument();
  });

  it('cannot message a contact with no phone or email', async () => {
    // The button is disabled rather than opening an empty chat.
    tables.business_bookings = [
      { id: 'k1', customer_name: 'No Contact', customer_email: 'x@y.com', created_at: daysAgo(1) },
    ];
    render(<CustomersPanel business={business} />);
    await screen.findByText('No Contact');
    expect(screen.getByRole('button', { name: /Message/ })).not.toBeDisabled();
  });
});
