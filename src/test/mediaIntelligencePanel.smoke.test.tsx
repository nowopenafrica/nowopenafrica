import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'react-hot-toast';

// jsdom has no matchMedia — react-hot-toast's <Toaster /> needs it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock('../lib/supabase', () => {
  // Hoisted into the factory: top-level fixtures trip vitest's mock hoisting.
  const rows = [
    {
      id: 'a1', business_id: 'b1', asset_type: 'gallery', caption: 'Storefront photo',
      source_id: 'wikimedia', source_url: 'https://commons.example/photo', source_uri: 'https://cdn.example/a.jpg',
      match_confidence: 88, rights_decision: 'licensed', licence: 'CC BY 4.0', rights_owner: 'Photographer',
      criticality: 'non_critical', moderation_status: 'pending', moderation_reason: null, status: 'match_confirmed',
      takedown_requested_at: null, takedown_reason: null, created_at: '2026-09-11T00:00:00.000Z', reviewed_at: null,
      business: { name: 'Meat Club Lagos', username: 'meat-club' },
    },
    {
      id: 'a2', business_id: 'b2', asset_type: 'logo', caption: 'Restaurant logo',
      source_id: null, source_url: null, source_uri: 'https://cdn.example/logo.png',
      match_confidence: 90, rights_decision: 'licensed', licence: 'CC0', rights_owner: null,
      criticality: 'critical', moderation_status: 'approved', moderation_reason: null, status: 'published',
      takedown_requested_at: null, takedown_reason: null, created_at: '2026-09-10T00:00:00.000Z', reviewed_at: '2026-09-10T01:00:00.000Z',
      business: { name: 'Nkanchi Beauty', username: 'nkanchi' },
    },
  ];
  let currentError: { message: string } | null = null;
  const result = () => ({ data: rows, error: currentError });
  let updateSpy: ((patch: unknown) => void) | undefined;
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    update: (patch: unknown) => { updateSpy?.(patch); return chain; },
    then: (onF?: any, onR?: any) => Promise.resolve(result()).then(onF, onR),
    catch: (onR?: any) => Promise.resolve(result()).catch(onR),
    finally: (onF?: any) => Promise.resolve(result()).finally(onF),
  };
  return {
    __setReadError: (m: string | null) => { currentError = m ? { message: m } : null; },
    __setUpdateSpy: (spy: (patch: unknown) => void) => { updateSpy = spy; },
    supabase: {
      from: vi.fn(() => chain),
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-admin', email: 'admin@nowopen.africa' },
    session: null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

import MediaIntelligencePanel from '../components/admin/MediaIntelligencePanel';
import * as supabaseModule from '../lib/supabase';

const sb = supabaseModule as unknown as {
  supabase: { from: ReturnType<typeof vi.fn> };
  __setReadError: (m: string | null) => void;
  __setUpdateSpy: (spy: (patch: unknown) => void) => void;
};

describe('MediaIntelligencePanel smoke', () => {
  beforeEach(() => {
    sb.__setReadError(null);
    sb.__setUpdateSpy(() => undefined);
  });

  it('queues discoveries for a human and keeps published assets out of that queue', async () => {
    render(<MediaIntelligencePanel />);
    expect(await screen.findByText(/Meat Club Lagos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Needs review \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Published \(1\)/ })).toBeInTheDocument();
    expect(screen.queryByText(/Nkanchi Beauty/)).not.toBeInTheDocument();
  });

  it('publishes a reviewed asset from the queue and says so honestly', async () => {
    let patch: unknown = null;
    sb.__setUpdateSpy((p) => { patch = p; });
    render(
      <>
        <MediaIntelligencePanel />
        <Toaster />
      </>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(patch).not.toBeNull());
    expect(sb.supabase.from).toHaveBeenCalledWith('business_media_assets');
    expect(patch).toMatchObject({ status: 'published', moderation_status: 'approved', reviewed_by: 'u-admin' });
    expect(await screen.findByText(/Published — it now renders on the profile\./)).toBeInTheDocument();
  });

  it('honours a takedown on a published asset', async () => {
    let patch: unknown = null;
    sb.__setUpdateSpy((p) => { patch = p; });
    render(
      <>
        <MediaIntelligencePanel />
        <Toaster />
      </>,
    );
    await screen.findByText(/Meat Club Lagos/);
    await userEvent.click(screen.getByRole('button', { name: /All/ }));
    await userEvent.click(screen.getByRole('button', { name: /Takedown/ }));
    await waitFor(() => expect(patch).not.toBeNull());
    expect(patch).toMatchObject({ status: 'removed', takedown_requested_at: expect.any(String) });
    expect(await screen.findByText(/Takedown honoured/)).toBeInTheDocument();
  });

  it('shows a designed “not provisioned” state instead of the raw missing-table error', async () => {
    sb.__setReadError("PGRST204 Could not find the table 'public.business_media_assets' in the schema cache");
    render(<MediaIntelligencePanel />);
    expect(await screen.findByText(/not yet provisioned/)).toBeInTheDocument();
    expect(screen.queryByText(/PGRST204/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Meat Club Lagos/)).not.toBeInTheDocument();
  });
});