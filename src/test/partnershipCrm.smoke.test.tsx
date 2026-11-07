import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toaster } from 'react-hot-toast';

// jsdom has no matchMedia — react-hot-toast's <Toaster /> needs it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

/*
 * ── THIS SUITE EXERCISES THE SEED, SO IT MUST ASK FOR THE SEED ───────────
 *
 * It used to mock `{ data: [], error: null }` — a table that read perfectly
 * and happened to be empty — and relied on the panel treating that as a
 * failure in order to render the bundled seed. That conflation was a real bug:
 * Launch Control told operators "the os_launches migration isn't applied in
 * this project yet" about a database that was fine (checked 2026-10-06: every
 * os_ table exists live with its policies), while showing invented rows whose
 * edits saved nowhere.
 *
 * Empty and unavailable are now different states. These tests are about the
 * seed, so they mock the state that legitimately produces it: an error.
 */
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
    /*
     * The first assertion about DATA has to be the awaited one.
     *
     * The line above waits for static chrome, which renders before the
     * mocked query resolves — so it can pass while the rows are still on
     * their way, and the synchronous `getByText` beneath it then misses
     * them. It held under a single-file run and failed under full-suite
     * load, twice, which is the signature of exactly that race.
     */
    expect(await screen.findByText('Aurora Growth Fund')).toBeInTheDocument();
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
      then: (onF?: any, onR?: any) => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).then(onF, onR),
      catch: (onR?: any) => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).catch(onR),
      finally: (onF?: any) => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).finally(onF),
    };
    vi.mocked(supabase.from).mockImplementation(() => chain as never);
    render(<PartnershipCrm />);
    expect(await screen.findByText(/Demo partner pipeline/)).toBeInTheDocument();
    expect(screen.getByText('Aurora Growth Fund')).toBeInTheDocument();
  });
});
