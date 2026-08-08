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

import SigningVault from '../components/admin/SigningVault';

const provRow = (name: string) => {
  const nameEl = screen.getByText(name);
  return within(nameEl.closest('div')!.parentElement!);
};

describe('SigningVault smoke', () => {
  it('rolls up awaiting, captured and provisioned from the ledgers', async () => {
    render(<SigningVault />);
    expect(await screen.findByText(/2 awaiting signature/)).toBeInTheDocument();
    expect(screen.getByText(/3 captured/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 8 profiles provisioned/)).toBeInTheDocument();
    // Kofi's volunteer agreement is signed — his access is provisioned.
    expect(provRow('Kofi Mensah').getByText('Access granted')).toBeInTheDocument();
    expect(provRow('Kofi Mensah').getByText('Community portal')).toBeInTheDocument();
    expect(provRow('Chukwu Emeka').getByText('Awaiting documents')).toBeInTheDocument();
  });

  it('rejects a signer whose email does not match the counterparty', async () => {
    render(<SigningVault />);
    await screen.findByText('Creative Collaboration Agreement — Lagos Tech Studio');
    const row = screen.getByText('Creative Collaboration Agreement — Lagos Tech Studio').closest('div')!.parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: /Capture signature/ }));
    const dialog = screen.getByRole('dialog', { name: 'Capture signature' });
    fireEvent.change(within(dialog).getByLabelText('Signer email'), { target: { value: 'intruder@x.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Capture signature/ }));
    expect(await within(dialog).findByText(/must match the counterparty/)).toBeInTheDocument();
  });

  it('captures a signature, moves the document to signed and provisions the profile', async () => {
    render(<SigningVault />);
    await screen.findByText('Employment Agreement — Chukwu Emeka');
    const row = screen.getByText('Employment Agreement — Chukwu Emeka').closest('div')!.parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: /Capture signature/ }));
    const dialog = screen.getByRole('dialog', { name: 'Capture signature' });
    // The signer is prefilled from the document counterparty.
    expect(within(dialog).getByLabelText('Signer email')).toHaveValue('chukwu@nowopen.africa');
    fireEvent.click(within(dialog).getByRole('button', { name: /Capture signature/ }));
    // The document leaves the awaiting queue and lands in captured.
    expect(await screen.findByText('Awaiting signature · 1')).toBeInTheDocument();
    expect(screen.getByText('Recently captured · 4')).toBeInTheDocument();
    // Chukwu's NDA and employment agreement are now both signed → provisioned.
    expect(await provRow('Chukwu Emeka').findByText('Access granted')).toBeInTheDocument();
    expect(provRow('Chukwu Emeka').getByText('Creative Studio')).toBeInTheDocument();
  });
});
