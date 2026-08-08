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
  const press = [
    { id: 'pr-1', org_id: orgId, headline: 'NowOpen Africa launches the AI Video Studio', outlet: 'NowOpen Africa', kind: 'release', status: 'published', published_at: '2026-08-01T09:00:00Z', url: 'u', summary: 'Businesses turn one idea into a video campaign.' },
    { id: 'pr-2', org_id: orgId, headline: 'Restaurant Week returns for its biggest run', outlet: 'Restaurant Week', kind: 'coverage', status: 'published', published_at: '2026-06-15T09:00:00Z', url: 'u', summary: 'Record footfall through the launch-week playbook.' },
    { id: 'pr-3', org_id: orgId, headline: 'Verified badge rolls out nationwide', outlet: 'NowOpen Africa', kind: 'release', status: 'published', published_at: '2026-03-10T09:00:00Z', url: 'u', summary: 'Document-based verification everywhere.' },
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
      from: vi.fn((table: string) => q(table === 'os_press' ? press : [])),
    },
  };
});

import { supabase } from '../lib/supabase';
import PressRoom from '../components/admin/PressRoom';

describe('PressRoom smoke', () => {
  it('renders the news timeline from os_press with the press kit hero', async () => {
    render(<PressRoom />);
    expect(await screen.findByText('Press kit')).toBeInTheDocument();
    expect(screen.getByText('News')).toBeInTheDocument();
    expect(screen.getByText('NowOpen Africa launches the AI Video Studio')).toBeInTheDocument();
    expect(screen.getByText('Restaurant Week returns for its biggest run')).toBeInTheDocument();
    expect(screen.getAllByText('Published').length).toBe(3);
    expect(screen.getByText('Press items')).toBeInTheDocument();
    expect(screen.queryByText(/Demo news timeline/)).not.toBeInTheDocument();
  });

  it('adds a story to os_press', async () => {
    render(<><Toaster /><PressRoom /></>);
    fireEvent.change(await screen.findByPlaceholderText('Headline…'), { target: { value: 'NowOpen hits 10,000 verified businesses' } });
    fireEvent.change(screen.getByPlaceholderText('Outlet…'), { target: { value: 'TechCabal' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));
    expect(await screen.findByText(/Story added to the news timeline/)).toBeInTheDocument();
    expect(supabase.from).toHaveBeenCalledWith('os_press');
  });

  it('toggles a story status and saves it', async () => {
    render(<><Toaster /><PressRoom /></>);
    fireEvent.click(await screen.findByRole('button', { name: /Mark NowOpen Africa launches the AI Video Studio draft/ }));
    expect(supabase.from).toHaveBeenCalledWith('os_press');
  });

  it('removes a story', async () => {
    render(<PressRoom />);
    fireEvent.click(await screen.findByRole('button', { name: /Remove Restaurant Week returns for its biggest run/ }));
    expect(supabase.from).toHaveBeenCalledWith('os_press');
  });

  it('shows the derived press KPIs', async () => {
    render(<PressRoom />);
    expect((await screen.findAllByText('3')).length).toBe(2);
    expect(screen.getByText('Published stories')).toBeInTheDocument();
    expect(screen.getByText('Coverage pieces')).toBeInTheDocument();
  });
});

describe('PressRoom fallback', () => {
  it('labels the demo timeline when os_press is unavailable', async () => {
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
    render(<PressRoom />);
    expect(await screen.findByText(/Demo news timeline/)).toBeInTheDocument();
    expect(screen.getByText('NowOpen Africa launches the AI Video Studio')).toBeInTheDocument();
  });
});
