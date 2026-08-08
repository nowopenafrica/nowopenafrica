import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toaster } from 'react-hot-toast';

// jsdom has no matchMedia — react-hot-toast's <Toaster /> needs it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock('../lib/supabase', () => {
  const orgId = '00000000-0000-4000-8000-00000000a001';
  const partners = [
    { id: 'pa-1', org_id: orgId, name: 'Aurora Growth Fund', type: 'Investor', note: 'Funding conversations.', stage: 'Proposal' },
    { id: 'pa-2', org_id: orgId, name: 'TechCabal', type: 'Media', note: 'Launch co-announcement.', stage: 'Negotiation' },
    { id: 'pa-3', org_id: orgId, name: 'Lagos Business School', type: 'University', note: 'Case study.', stage: 'Active' },
    { id: 'pa-4', org_id: orgId, name: 'Magnet Agency', type: 'Agency', note: 'Past campaigns.', stage: 'Alumni' },
  ];
  const q = (data: unknown) => {
    const result = { data, error: null };
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      insert: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
      catch: (onR?: any) => Promise.resolve(result).catch(onR),
      finally: (onF?: any) => Promise.resolve(result).finally(onF),
    };
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => q(table === 'os_partners' ? partners : [])),
    },
  };
});

import { supabase } from '../lib/supabase';
import PartnershipCrm from '../components/admin/PartnershipCrm';

describe('PartnershipCrm smoke', () => {
  it('renders the pipeline from os_partners with stage counts', async () => {
    render(<PartnershipCrm />);
    expect(await screen.findByText('Add a partner')).toBeInTheDocument();
    expect(screen.getByText('Total partners')).toBeInTheDocument();
    expect(screen.getByText('Aurora Growth Fund')).toBeInTheDocument();
    expect(screen.getByText('TechCabal')).toBeInTheDocument();
    expect(screen.getByText('Lagos Business School')).toBeInTheDocument();
    expect(screen.queryByText(/Demo partner pipeline/)).not.toBeInTheDocument();
  });

  it('adds a partner to os_partners', async () => {
    render(<><Toaster /><PartnershipCrm /></>);
    fireEvent.change(await screen.findByPlaceholderText('Organisation name…'), { target: { value: 'BrandComms Lagos' } });
    fireEvent.change(screen.getByPlaceholderText('What are we working on…'), { target: { value: 'Creator network activation' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(await screen.findByText(/BrandComms Lagos added to the pipeline/)).toBeInTheDocument();
    expect(supabase.from).toHaveBeenCalledWith('os_partners');
  });

  it('moves a proposal partner forward and saves it', async () => {
    render(<PartnershipCrm />);
    fireEvent.click(await screen.findByRole('button', { name: 'Move Aurora Growth Fund forward' }));
    expect(supabase.from).toHaveBeenCalledWith('os_partners');
  });

  it('removes a partner', async () => {
    render(<PartnershipCrm />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Magnet Agency' }));
    expect(supabase.from).toHaveBeenCalledWith('os_partners');
  });

  it('shows the derived pipeline KPIs', async () => {
    render(<PartnershipCrm />);
    expect(await screen.findByText('4')).toBeInTheDocument();
  });
});

describe('PartnershipCrm fallback', () => {
  it('labels the demo pipeline when os_partners is unavailable', async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      insert: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn(() => chain),
      delete: vi.fn(() => chain),
      then: (onF?: any, onR?: any) => Promise.resolve({ data: [], error: null }).then(onF, onR),
      catch: (onR?: any) => Promise.resolve({ data: [], error: null }).catch(onR),
      finally: (onF?: any) => Promise.resolve({ data: [], error: null }).finally(onF),
    };
    vi.mocked(supabase.from).mockImplementation(() => chain as never);
    render(<PartnershipCrm />);
    expect(await screen.findByText(/Demo partner pipeline/)).toBeInTheDocument();
    expect(screen.getByText('Aurora Growth Fund')).toBeInTheDocument();
  });
});
