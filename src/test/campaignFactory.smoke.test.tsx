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
  const campaigns = [
    { id: 'cp-1', org_id: orgId, slug: 'africa-is-nowopen', name: 'Africa is NowOpen', focus: 'Open every African business on the map', audience: 'Business owners across Africa', channels: ['Social', 'Email', 'SMS', 'Press'], status: 'live', starts_at: '2026-01-15T09:00:00Z', ends_at: null },
    { id: 'cp-2', org_id: orgId, slug: 'restaurant-week-2026', name: 'Restaurant Week 2026', focus: 'The biggest restaurant run of the year', audience: 'Restaurants in Nigeria', channels: ['Social', 'WhatsApp', 'Email'], status: 'in_build', starts_at: '2026-09-14T09:00:00Z', ends_at: '2026-09-20T09:00:00Z' },
    { id: 'cp-3', org_id: orgId, slug: 'tailor-week-2026', name: 'Tailor Week', focus: 'Fashion and tailoring, platform-wide', audience: 'Fashion businesses', channels: ['Social', 'Email'], status: 'planning', starts_at: '2026-11-02T09:00:00Z', ends_at: null },
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
      from: vi.fn((table: string) => q(table === 'os_campaigns' ? campaigns : [])),
    },
  };
});

import { supabase } from '../lib/supabase';
import PlatformCampaigns from '../components/admin/PlatformCampaigns';

describe('PlatformCampaigns smoke', () => {
  it('renders the platform ledger from os_campaigns', async () => {
    render(<PlatformCampaigns />);
    expect(await screen.findByText('Africa is NowOpen')).toBeInTheDocument();
    expect(screen.getByText('Restaurant Week 2026')).toBeInTheDocument();
    expect(screen.getByText('Tailor Week')).toBeInTheDocument();
    expect(screen.getAllByText('Live').length).toBe(1);
    expect(screen.getAllByText('In build').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.queryByText(/Demo platform ledger/)).not.toBeInTheDocument();
  });

  it('shows the derived campaign KPIs', async () => {
    render(<PlatformCampaigns />);
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('Campaigns on the ledger')).toBeInTheDocument();
    expect(screen.getByText('Live now')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });

  it('opens a campaign on os_campaigns', async () => {
    render(<><Toaster /><PlatformCampaigns /></>);
    fireEvent.change(await screen.findByPlaceholderText('Campaign name…'), { target: { value: 'Christmas Gift Week' } });
    fireEvent.change(screen.getByPlaceholderText('Focus (e.g. Open every business on the map)…'), { target: { value: 'Festive gifting, platform-wide' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(await screen.findByText(/opened on the platform ledger/)).toBeInTheDocument();
    expect(supabase.from).toHaveBeenCalledWith('os_campaigns');
  });

  it('advances a campaign status', async () => {
    render(<><Toaster /><PlatformCampaigns /></>);
    fireEvent.click(await screen.findByRole('button', { name: /Advance Tailor Week/ }));
    expect(supabase.from).toHaveBeenCalledWith('os_campaigns');
  });

  it('removes a campaign', async () => {
    render(<PlatformCampaigns />);
    fireEvent.click(await screen.findByRole('button', { name: /Remove Restaurant Week 2026/ }));
    expect(supabase.from).toHaveBeenCalledWith('os_campaigns');
  });
});

describe('PlatformCampaigns fallback', () => {
  it('labels the demo ledger and shows the seed when os_campaigns is unavailable', async () => {
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
    render(<PlatformCampaigns />);
    expect(await screen.findByText(/Demo platform ledger/)).toBeInTheDocument();
    expect(screen.getByText('Africa is NowOpen')).toBeInTheDocument();
    expect(screen.getByText('Restaurant Week 2026')).toBeInTheDocument();
    expect(screen.getByText('Tailor Week')).toBeInTheDocument();
  });
});
