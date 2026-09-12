import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'react-hot-toast';

// jsdom has no matchMedia — react-hot-toast's <Toaster /> needs it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock('../lib/supabase', () => {
  let prefsRow: Record<string, unknown> | null = {
    id: 'p1', business_id: 'b1', sync_enabled: true,
    auto_apply_hours: false, auto_apply_source_images: true, auto_apply_discovery_fields: false,
    notify_on_change: true, approval_threshold: 80, confirm_24_hours: false, hours_override_reason: null,
  };
  let readError: { message: string } | null = null;
  let updateArg: Record<string, unknown> | null = null;

  const rowChain = {
    select: vi.fn(() => rowChain),
    order: vi.fn(() => rowChain),
    limit: vi.fn(() => rowChain),
    eq: vi.fn(() => rowChain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: prefsRow, error: readError })),
    update: vi.fn((patch: Record<string, unknown>) => {
      updateArg = patch;
      return { eq: vi.fn(() => Promise.resolve({ data: null, error: null })) };
    }),
  };

  return {
    __setPrefs: (p: Record<string, unknown> | null) => { prefsRow = p; },
    __setReadError: (m: string | null) => { readError = m ? { message: m } : null; },
    __lastUpdate: () => updateArg,
    supabase: { from: vi.fn(() => rowChain) },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-owner', email: 'owner@nowopen.africa' },
    session: null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

import EnrichmentSyncPanel from '../components/studio/EnrichmentSyncPanel';
import type { Business } from '../types';
import * as supabaseModule from '../lib/supabase';

const sb = supabaseModule as unknown as {
  __setPrefs: (p: Record<string, unknown> | null) => void;
  __setReadError: (m: string | null) => void;
  __lastUpdate: () => Record<string, unknown> | null;
  supabase: { from: ReturnType<typeof vi.fn> };
};

const business = { id: 'b1', name: 'Test Co' } as unknown as Business;

const renderPanel = () => render(
  <>
    <EnrichmentSyncPanel business={business} />
    <Toaster />
  </>,
);

describe('EnrichmentSyncPanel smoke', () => {
  beforeEach(() => {
    sb.__setPrefs({
      id: 'p1', business_id: 'b1', sync_enabled: true,
      auto_apply_hours: false, auto_apply_source_images: true, auto_apply_discovery_fields: false,
      notify_on_change: true, approval_threshold: 80, confirm_24_hours: false, hours_override_reason: null,
    });
    sb.__setReadError(null);
  });

  it('shows the master switch, the three families and the posture summary', async () => {
    renderPanel();
    expect(await screen.findByText('Enrichment & Sync')).toBeInTheDocument();
    expect(screen.getByText('Master switch')).toBeInTheDocument();
    expect(screen.getByText('Opening hours')).toBeInTheDocument();
    expect(screen.getByText('Logo & cover images')).toBeInTheDocument();
    expect(screen.getByText('Discovery fields')).toBeInTheDocument();
    expect(screen.getByText(/Enrichment runs\. Auto-applied without asking: logo & cover images/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save preferences/ })).toBeDisabled();
  });

  it('shows the posture message over an off master switch', async () => {
    sb.__setPrefs({
      id: 'p1', business_id: 'b1', sync_enabled: false,
      auto_apply_hours: false, auto_apply_source_images: false, auto_apply_discovery_fields: false,
      notify_on_change: true, approval_threshold: 80, confirm_24_hours: false, hours_override_reason: null,
    });
    renderPanel();
    expect(await screen.findByText(/Enrichment is off for this business/)).toBeInTheDocument();
  });

  it('turns a family on and saves through an owner-scoped update', async () => {
    renderPanel();
    const hours = await screen.findByRole('button', { name: 'Opening hours: auto-apply off' });
    await userEvent.click(hours);
    expect(screen.getByRole('button', { name: 'Opening hours: auto-apply on' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save preferences/ })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /Save preferences/ }));
    await screen.findByText(/Saved — the enrichment engine will follow this from the next run/);
    expect(sb.__lastUpdate()).toMatchObject({ auto_apply_hours: true, approval_threshold: 80 });
  });

  it('shows an honest state when the preference row does not exist yet', async () => {
    sb.__setPrefs(null);
    renderPanel();
    expect(await screen.findByText(/Nothing on file for this business yet/)).toBeInTheDocument();
    expect(screen.queryByText('Master switch')).not.toBeInTheDocument();
  });

  it('shows a designed “not provisioned” state instead of the raw missing-table error', async () => {
    sb.__setReadError("PGRST204 Could not find the table 'public.business_sync_preferences' in the schema cache");
    renderPanel();
    expect(await screen.findByText(/not yet provisioned/)).toBeInTheDocument();
    expect(screen.queryByText(/PGRST204/)).not.toBeInTheDocument();
    expect(screen.queryByText('Master switch')).not.toBeInTheDocument();
  });
});