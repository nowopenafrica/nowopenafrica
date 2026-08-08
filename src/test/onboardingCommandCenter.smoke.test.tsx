import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../lib/supabase', () => {
  const tableData: Record<string, unknown[]> = {
    os_onboarding: [
      {
        id: 'r1', org_id: '00000000-0000-4000-8000-00000000a001',
        full_name: 'Ada Obi', email: 'ada@nowopen.africa', relationship: 'employee',
        department: 'Creative & Brand', role: 'Motion Designer', country: 'Nigeria',
        steps_completed: ['personal-information', 'nda'],
        signed_agreements: ['NDA'], access_grants: [],
        created_at: new Date().toISOString(),
      },
      {
        id: 'r2', org_id: '00000000-0000-4000-8000-00000000a001',
        full_name: 'Meatclub Nigeria', email: 'ops@meatclub.ng', relationship: 'partner',
        steps_completed: [
          'company-information', 'representative', 'partnership-type',
          'business-verification', 'partnership-proposal', 'nda',
          'partnership-agreement', 'signature', 'partner-portal',
        ],
        signed_agreements: ['NDA', 'Partnership agreement'], access_grants: ['Partner portal'],
        created_at: new Date().toISOString(),
      },
    ],
  };
  const result = { data: tableData.os_onboarding, error: null };
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
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

import OnboardingCommandCenter from '../components/admin/OnboardingCommandCenter';

describe('OnboardingCommandCenter smoke', () => {
  it('rolls up the relationships and derives status from the journeys', async () => {
    render(<OnboardingCommandCenter />);
    expect(await screen.findByText(/2 relationships/)).toBeInTheDocument();
    // Ada is 2 steps into the 13-step employee journey with unsigned signature
    // steps — that is "awaiting signature", never guessed. Meatclub finished
    // every partner step, so it reads "completed".
    expect(screen.getByText(/1 onboarded \(50%\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 awaiting signature/)).toBeInTheDocument();
    expect(screen.getByText(/0 blocked/)).toBeInTheDocument();
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.getByText('Meatclub Nigeria')).toBeInTheDocument();
  });

  it('expands a profile into its journey, signature need and document packet', async () => {
    render(<OnboardingCommandCenter />);
    fireEvent.click(await screen.findByText('Ada Obi'));
    expect(screen.getByText('Onboarding journey')).toBeInTheDocument();
    expect(screen.getByText('NDA', { selector: 'li *' })).toBeInTheDocument();
    expect(screen.getByText('Digital signature')).toBeInTheDocument();
    expect(screen.getByText(/Document packet \(14 documents\)/)).toBeInTheDocument();
    expect(screen.getByText('First 30 days plan')).toBeInTheDocument();
    // Awaiting a signature is surfaced honestly on the journey.
    expect(screen.getAllByText('signature').length).toBeGreaterThan(0);
  });

  it('filters the roster by status', async () => {
    render(<OnboardingCommandCenter />);
    await screen.findByText('Ada Obi');
    fireEvent.click(screen.getByRole('button', { name: /Completed · 1/ }));
    expect(screen.queryByText('Ada Obi')).not.toBeInTheDocument();
    expect(screen.getByText('Meatclub Nigeria')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Awaiting signature · 1/ }));
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.queryByText('Meatclub Nigeria')).not.toBeInTheDocument();
  });
});
