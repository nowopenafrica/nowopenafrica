import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
window.scrollTo = () => {};

vi.mock('../lib/supabase', () => {
  const result = { data: [], error: null };
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
    catch: (onR?: any) => Promise.resolve(result).catch(onR),
    finally: (onF?: any) => Promise.resolve(result).finally(onF),
  };
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn(() => chain),
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'admin@nowopen.africa' },
    session: null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

import ApplicationsReview from '../components/admin/ApplicationsReview';

const renderReview = () => render(<ApplicationsReview />);

describe('Applications Review smoke', () => {
  it('renders the ledger summary and the seeded applications', async () => {
    renderReview();

    expect(await screen.findByText(/Applications Review/)).toBeInTheDocument();
    expect(await screen.findByText(/5 applications/)).toBeInTheDocument();
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.getByText('Chukwu Emeka')).toBeInTheDocument();
    expect(screen.getByText('Nairobi Media House')).toBeInTheDocument();
    expect(screen.getByText(/NOW-INT-2026-4QX7A9/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Intern/ })).toBeInTheDocument();
  });

  it('filters the queue by relationship', async () => {
    renderReview();
    await screen.findByText(/5 applications/);

    fireEvent.click(screen.getByRole('button', { name: /Intern/ }));
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.queryByText('Chukwu Emeka')).not.toBeInTheDocument();
    expect(screen.queryByText('Nairobi Media House')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /All · 5/ }));
    expect(screen.getByText('Chukwu Emeka')).toBeInTheDocument();
  });

  it('advances an intern application one honest step along its pipeline', async () => {
    renderReview();
    await screen.findByText(/5 applications/);

    const adaRow = screen.getByText('Ada Obi').closest('.rounded-xl') as HTMLElement;
    expect(within(adaRow).getByText('New')).toBeInTheDocument();

    fireEvent.click(within(adaRow).getByRole('button', { name: /Advance to Screening/ }));

    expect(await within(adaRow).findByText('Screening')).toBeInTheDocument();
    expect(within(adaRow).queryByRole('button', { name: /Advance to Screening/ })).not.toBeInTheDocument();
    expect(within(adaRow).getByRole('button', { name: /Advance to Under review/ })).toBeInTheDocument();
  });

  it('rejects with an honest note, then reopens back to new', async () => {
    renderReview();
    await screen.findByText(/5 applications/);

    const nairobiRow = screen.getByText('Nairobi Media House').closest('.rounded-xl') as HTMLElement;
    fireEvent.click(within(nairobiRow).getByRole('button', { name: /Reject/ }));

    expect(screen.getByRole('dialog', { name: 'Reject application' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Rejection note'), { target: { value: 'Budget not approved this quarter' } });
    fireEvent.click(screen.getByRole('button', { name: /Reject application/ }));

    expect(await within(nairobiRow).findByText('Rejected')).toBeInTheDocument();
    expect(within(nairobiRow).getByText(/Budget not approved this quarter/)).toBeInTheDocument();
    expect(within(nairobiRow).getByRole('button', { name: /Reopen/ })).toBeInTheDocument();

    fireEvent.click(within(nairobiRow).getByRole('button', { name: /Reopen/ }));

    expect(await within(nairobiRow).findByText('New')).toBeInTheDocument();
    expect(within(nairobiRow).queryByText('Rejected')).not.toBeInTheDocument();
    expect(within(nairobiRow).getByRole('button', { name: /Advance to Screening/ })).toBeInTheDocument();
  });

  it('expands a submission to read its answers', async () => {
    renderReview();
    await screen.findByText(/5 applications/);

    fireEvent.click(screen.getByLabelText('Ada Obi application details'));
    expect(screen.getByText('University of Lagos')).toBeInTheDocument();
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getAllByText('Reference')).toBeDefined();
  });
});
