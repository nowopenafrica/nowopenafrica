import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../lib/supabase', () => {
  const tableData: Record<string, unknown[]> = {};
  const result = { data: tableData.os_documents ?? [], error: null };
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    update: vi.fn(() => chain),
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

import DocumentCenter from '../components/admin/DocumentCenter';

describe('DocumentCenter smoke', () => {
  it('renders the ledger and the agreement library', async () => {
    render(<DocumentCenter />);
    expect(await screen.findByText(/7 documents/)).toBeInTheDocument();
    expect(screen.getByText(/Mutual Non-Disclosure Agreement — Atlas Capital/)).toBeInTheDocument();
    expect(screen.getByText(/Agreement library · 12 templates/)).toBeInTheDocument();
    expect(screen.getByText('Employment Agreement')).toBeInTheDocument();
  });

  it('expands a document into its clauses and rendered text', async () => {
    render(<DocumentCenter />);
    fireEvent.click(await screen.findByText(/Volunteer Agreement — Kofi Mensah/));
    expect(screen.getByText('Safeguarding and conduct')).toBeInTheDocument();
    expect(screen.getByText(/SIGNED by Kofi Mensah/)).toBeInTheDocument();
    expect(screen.getByText(/governed by the laws of the Federal Republic of Nigeria/)).toBeInTheDocument();
  });

  it('drafts a new document from the library form', async () => {
    render(<DocumentCenter />);
    fireEvent.click(await screen.findByRole('button', { name: /New document/ }));
    fireEvent.change(screen.getByLabelText('Counterparty name'), { target: { value: 'Lagos Restaurant Group' } });
    fireEvent.change(screen.getByLabelText('Counterparty email'), { target: { value: 'hello@lagos.restaurant' } });
    fireEvent.click(screen.getByRole('button', { name: /Generate draft/ }));
    const title = await screen.findByText(/Mutual Non-Disclosure Agreement — Lagos Restaurant Group/);
    expect(within(title.closest('button')!).getByText('Draft')).toBeInTheDocument();
  });

  it('moves a draft to sent and a sent document to signed, never backwards', async () => {
    render(<DocumentCenter />);
    await screen.findByText(/Mutual Non-Disclosure Agreement — Atlas Capital/);
    // Atlas Capital's NDA is a draft — expand it, send it, then sign it.
    fireEvent.click(screen.getByText(/Mutual Non-Disclosure Agreement — Atlas Capital/));
    const header = screen.getByText(/Mutual Non-Disclosure Agreement — Atlas Capital/).closest('button')!;
    fireEvent.click(await within(header).findByText('Send'));
    const sentHeader = screen.getByText(/Mutual Non-Disclosure Agreement — Atlas Capital/).closest('button')!;
    expect(within(sentHeader).getByText('Sent for signature')).toBeInTheDocument();
    fireEvent.click(await within(sentHeader).findByText('Mark signed'));
    const signedHeader = screen.getByText(/Mutual Non-Disclosure Agreement — Atlas Capital/).closest('button')!;
    expect(within(signedHeader).getByText('Signed')).toBeInTheDocument();
    expect(within(signedHeader).queryByText('Decline')).not.toBeInTheDocument();
  });
});
