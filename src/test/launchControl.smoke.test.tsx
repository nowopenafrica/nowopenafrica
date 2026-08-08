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
  const launches = [
    { id: 'la-1', org_id: orgId, name: 'AI Video Studio', area: 'Product · Media', target: 'Aug 2026', checklist_done: [true, true, true, true, true, true, true] },
    { id: 'la-2', org_id: orgId, name: 'Verified Badge', area: 'Trust & Safety', target: 'Mar 2026', checklist_done: [true, true, true, true, true, true, true] },
    { id: 'la-3', org_id: orgId, name: 'Restaurant Week 2026', area: 'Growth · Campaigns', target: 'Sep 2026', checklist_done: [true, false, false, false, false, false, false] },
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
      from: vi.fn((table: string) => q(table === 'os_launches' ? launches : [])),
    },
  };
});

import { supabase } from '../lib/supabase';
import LaunchControl from '../components/admin/LaunchControl';

describe('LaunchControl smoke', () => {
  it('renders the launch board from os_launches with derived statuses', async () => {
    render(<LaunchControl />);
    expect(await screen.findByText('Open a launch')).toBeInTheDocument();
    expect(screen.getByText('Open launches')).toBeInTheDocument();
    expect(screen.getByText('AI Video Studio')).toBeInTheDocument();
    expect(screen.getByText('Restaurant Week 2026')).toBeInTheDocument();
    expect(screen.getAllByText('Ready to ship').length).toBe(2);
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getAllByText('Design review passed').length).toBe(3);
    expect(screen.queryByText(/Demo launch board/)).not.toBeInTheDocument();
  });

  it('adds a launch to os_launches', async () => {
    render(<><Toaster /><LaunchControl /></>);
    fireEvent.change(await screen.findByPlaceholderText('Feature name…'), { target: { value: 'Marketplace v2' } });
    fireEvent.change(screen.getByPlaceholderText('Owner area…'), { target: { value: 'Product · Market' } });
    fireEvent.change(screen.getByPlaceholderText('Target (e.g. Oct 2026)…'), { target: { value: 'Oct 2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(await screen.findByText(/Launch "Marketplace v2" added to the board/)).toBeInTheDocument();
    expect(supabase.from).toHaveBeenCalledWith('os_launches');
  });

  it('ticks a checklist item and saves it', async () => {
    render(<><Toaster /><LaunchControl /></>);
    const item = (await screen.findAllByRole('button', { name: 'Marketing assets ready' }))[0];
    fireEvent.click(item);
    expect(supabase.from).toHaveBeenCalledWith('os_launches');
  });

  it('deletes a launch', async () => {
    render(<LaunchControl />);
    fireEvent.click(await screen.findByRole('button', { name: /Delete AI Video Studio/ }));
    expect(supabase.from).toHaveBeenCalledWith('os_launches');
  });

  it('shows the derived board KPIs', async () => {
    render(<LaunchControl />);
    expect(await screen.findByText('3')).toBeInTheDocument();
  });
});

describe('LaunchControl fallback', () => {
  it('labels the demo board when os_launches is unavailable', async () => {
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
    render(<LaunchControl />);
    expect(await screen.findByText(/Demo launch board/)).toBeInTheDocument();
    expect(screen.getByText('AI Video Studio')).toBeInTheDocument();
  });
});
