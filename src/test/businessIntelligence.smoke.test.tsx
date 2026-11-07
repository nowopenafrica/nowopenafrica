import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

vi.mock('../lib/supabase', () => {
  // Hoisted into the factory: top-level fixtures trip vitest's mock hoisting.
  const campaignId = 'camp-1';
  const fixtures: Record<string, unknown[]> = {
    radar_candidates: [
      {
        id: 'c1', source_key: 'wikidata', campaign_id: campaignId, name: 'Bello Tailors',
        category: 'Tailors', city: 'Lagos', confidence: 92, status: 'pending',
        decision_reason: null, duplicate_of: null, published_business_id: null,
        source_url: 'https://www.wikidata.org/wiki/Q1', created_at: '2026-09-14T08:00:00.000Z',
      },
      {
        id: 'c2', source_key: 'wikidata', campaign_id: null, name: 'Alpha Mechanics',
        category: 'Mechanics', city: 'Abuja', confidence: 40, status: 'held',
        decision_reason: 'Low confidence.', duplicate_of: null, published_business_id: null,
        source_url: null, created_at: '2026-09-13T08:00:00.000Z',
      },
      {
        id: 'c3', source_key: 'wikidata', campaign_id: null, name: 'Field Copy',
        category: 'Retail & Shopping', city: 'Kano', confidence: 90, status: 'merged',
        decision_reason: 'Duplicate.', duplicate_of: 'b-999', published_business_id: 'b-999',
        source_url: null, created_at: '2026-09-12T08:00:00.000Z',
      },
      {
        id: 'c4', source_key: 'openstreetmap', campaign_id: campaignId, name: 'Bello Tailors Ltd',
        category: 'Tailors', city: 'Lagos', confidence: 78, status: 'review',
        decision_reason: null, duplicate_of: null, published_business_id: null,
        source_url: 'https://www.openstreetmap.org/way/123', created_at: '2026-09-14T07:30:00.000Z',
      },
    ],
    radar_candidate_evidence: [
      {
        id: 1, candidate_id: 'c1', evidence_field: 'phone', field_value: '+2348000000001',
        source_key: 'openstreetmap', method: 'structured_data', source_url: 'https://www.openstreetmap.org/way/123',
        confidence: 92, owner_confirmed: false, can_auto_update: true, collected_at: '2026-09-14T08:00:00.000Z',
      },
      {
        id: 2, candidate_id: 'c1', evidence_field: 'website', field_value: 'https://bello-tailors.example',
        source_key: 'wikidata', method: 'api', source_url: 'https://www.wikidata.org/wiki/Q1',
        confidence: 88, owner_confirmed: true, can_auto_update: false, collected_at: '2026-09-14T08:00:00.000Z',
      },
    ],
    radar_sources: [
      {
        key: 'wikidata', name: 'Wikidata', kind: 'authorized_api', active: true,
        automated_access: 'permitted', bulk_extraction: 'permitted', competing_dataset: 'permitted',
        redistribution: 'permitted', licence: 'CC0 1.0', authorised_by: 'NowOpen Africa',
        authorised_at: '2026-09-08T00:00:00.000Z', notes: null, last_run_at: '2026-09-14T06:00:00.000Z', records_seen: 120,
        health_status: 'healthy', last_successful_sync: '2026-09-14T06:00:00.000Z', last_error: null,
      },
      {
        key: 'businesslist_ng', name: 'BusinessList', kind: 'licensed_directory', active: false,
        automated_access: 'prohibited', bulk_extraction: 'prohibited', competing_dataset: 'prohibited',
        redistribution: 'prohibited', licence: null, authorised_by: null, authorised_at: null, notes: null,
        last_run_at: null, records_seen: 0, health_status: 'disabled', last_successful_sync: null, last_error: null,
      },
    ],
    businesses: [
      { id: 'b1', claim_status: 'unclaimed', verification_status: 'unverified' },
      { id: 'b2', claim_status: 'claimed', verification_status: 'verified' },
      { id: 'b3', claim_status: 'claim_pending', verification_status: 'unverified' },
    ],
    business_discovery_campaigns: [
      {
        id: campaignId, name: 'Lagos Fashion — September 2026', status: 'active',
        countries: ['Nigeria'], regions: [], cities: ['Lagos'], neighborhoods: [],
        categories: ['Fashion & Apparel'], services: [], products: [], source_keys: ['wikidata'],
        review_threshold: 50, auto_publish_threshold: 90, outreach_enabled: false, outreach_channel: null,
        records_discovered: 12, records_published: 3, claims_linked: 1, created_at: '2026-09-10T00:00:00.000Z',
      },
    ],
    business_discovery_runs: [
      { id: 'r1', campaign_id: campaignId, status: 'succeeded', records_discovered: 12, records_published: 3, error: null, started_at: '2026-09-10T00:00:00.000Z', finished_at: '2026-09-10T00:00:00.000Z', created_at: '2026-09-10T00:00:01.000Z' },
    ],
    feature_flags: [
      { key: 'business_discovery_engine', enabled: true, label: 'Discovery engine', description: 'Master switch.' },
      { key: 'claim_outreach', enabled: false, label: 'Claim outreach', description: 'Owner invitations.' },
    ],
    radar_config: [{ id: 1, autonomy_mode: 'manual', auto_publish_threshold: 90, review_threshold: 50 }],
    claimreach_suppressions: [
      { id: 's1', contact: '+2348012345678', channel: 'whatsapp', reason: 'opted_out', expires_at: null, created_at: '2026-09-10T00:00:00.000Z' },
    ],
  };

  const statsFixture = {
    pending: 1, review: 2, held: 1, published: 6, merged: 1, rejected: 2,
    today: 3, sources_active: 1, sources_blocked: 1, mode: 'manual',
  };

  const tableErrors: Record<string, { message: string } | null> = {};
  const rpcErrors: Record<string, string> = {};
  let insertSpy: ((row: unknown) => void) | undefined;
  let updateSpy: ((patch: unknown) => void) | undefined;
  let rpcSpy: ((fn: string, params: unknown) => void) | undefined;

  const resultFor = (table: string) => {
    const err = tableErrors[table] ?? null;
    return { data: err ? null : fixtures[table], error: err };
  };
  const makeChain = (table: string) => {
    const res = resultFor(table);
    const c = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      // The queue pages with .range() and breaks created_at ties on id, so the
      // fake client has to speak both or the list renders empty.
      range: vi.fn(() => c),
      in: vi.fn(() => c),
      update: (patch: unknown) => { updateSpy?.(patch); return c; },
      insert: (row: unknown) => { insertSpy?.(row); return c; },
      then: (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(res).then(onF, onR),
      catch: (onR?: (e: unknown) => unknown) => Promise.resolve(res).catch(onR),
      finally: (onF?: () => unknown) => Promise.resolve(res).finally(onF),
    };
    return c;
  };

  return {
    __setError: (table: string, message: string | null) => { tableErrors[table] = message ? { message } : null; },
    __setRpcError: (fn: string, message: string | null) => { if (message) { rpcErrors[fn] = message; } else { delete rpcErrors[fn]; } },
    __setInsertSpy: (spy: (row: unknown) => void) => { insertSpy = spy; },
    __setUpdateSpy: (spy: (patch: unknown) => void) => { updateSpy = spy; },
    __setRpcSpy: (spy: (fn: string, params: unknown) => void) => { rpcSpy = spy; },
    __campaignId: campaignId,
    supabase: {
      from: vi.fn((table: string) => makeChain(table)),
      rpc: vi.fn(async (fn: string, params?: unknown) => {
        rpcSpy?.(fn, params);
        if (rpcErrors[fn]) return { data: null, error: { message: rpcErrors[fn] } };
        if (fn === 'radar_stats') return { data: statsFixture, error: null };
        return { data: true, error: null };
      }),
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

import BusinessIntelligencePanel from '../components/admin/BusinessIntelligencePanel';
import * as supabaseModule from '../lib/supabase';

const sb = supabaseModule as unknown as {
  supabase: { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn> };
  __setError: (table: string, message: string | null) => void;
  __setRpcError: (fn: string, message: string | null) => void;
  __setInsertSpy: (spy: (row: unknown) => void) => void;
  __setUpdateSpy: (spy: (patch: unknown) => void) => void;
  __setRpcSpy: (spy: (fn: string, params: unknown) => void) => void;
  __campaignId: string;
};

const renderPanel = () =>
  render(
    <MemoryRouter initialEntries={['/admin/business-intelligence?tab=overview']}>
      <BusinessIntelligencePanel />
      <Toaster />
    </MemoryRouter>,
  );

const go = async (tab: string) => {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(tab, 'i') }));
};

describe('BusinessIntelligencePanel smoke', () => {
  beforeEach(() => {
    sb.__setError('radar_candidates', null);
    sb.__setRpcError('radar_stats', null);
    sb.__setInsertSpy(() => undefined);
    sb.__setUpdateSpy(() => undefined);
    sb.__setRpcSpy(() => undefined);
    sb.supabase.from.mockClear();
    sb.supabase.rpc.mockClear();
  });

  it('overview reads real counts from the tables it already has', async () => {
    renderPanel();
    expect(await screen.findByText('In discovery')).toBeInTheDocument();
    expect(screen.getByText('Published profiles')).toBeInTheDocument();
    expect(await screen.findByText('Bello Tailors')).toBeInTheDocument();
    expect(sb.supabase.from).toHaveBeenCalledWith('businesses');
    expect(sb.supabase.rpc).toHaveBeenCalledWith('radar_stats');
  });

  it('creates a campaign with a valid target plan and saves it as a draft', async () => {
    let inserted: unknown = null;
    sb.__setInsertSpy((row) => { inserted = row; });
    renderPanel();
    await go('Campaigns');
    expect((await screen.findAllByText('Lagos Fashion — September 2026')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'New campaign' }));
    await userEvent.type(screen.getByPlaceholderText(/e.g. Lagos Fashion/), 'Accra Beauty Drive');
    await userEvent.click(await screen.findByRole('button', { name: 'Nigeria' }));
    await userEvent.click(screen.getByRole('button', { name: 'Fashion & Apparel' }));
    await userEvent.click(screen.getByRole('button', { name: 'wikidata' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(inserted).not.toBeNull());
    expect(inserted).toMatchObject({
      name: 'Accra Beauty Drive',
      countries: ['Nigeria'],
      categories: ['Fashion & Apparel'],
      source_keys: ['wikidata'],
      outreach_enabled: false,
      review_threshold: 50,
      auto_publish_threshold: 90,
    });
    expect(await screen.findByText(/Campaign saved as draft/)).toBeInTheDocument();
  });

  it('sources tab reports the rights gate per source', async () => {
    renderPanel();
    await go('Sources');
    expect(await screen.findByText('Wikidata')).toBeInTheDocument();
    expect(await screen.findByText('BusinessList')).toBeInTheDocument();
    expect(sb.supabase.from).toHaveBeenCalledWith('radar_sources');
    expect(screen.getByRole('button', { name: 'Switch on' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch off' })).toBeInTheDocument();
  });

  it('sources tab summaries network health and recent runs', async () => {
    renderPanel();
    await go('Sources');
    expect(await screen.findByText(/Network health/)).toBeInTheDocument();
    expect(screen.getByText('1 healthy')).toBeInTheDocument();
    expect(screen.getByText('1 disabled')).toBeInTheDocument();
    expect(await screen.findByText(/Recent runs/)).toBeInTheDocument();
    expect(screen.getByText('succeeded')).toBeInTheDocument();
    expect(await screen.findByText(/Lagos Fashion — September 2026/)).toBeInTheDocument();
    expect(sb.supabase.from).toHaveBeenCalledWith('business_discovery_runs');
  });

  it('review publishes a queue candidate through radar_publish_candidate', async () => {
    let rpcCall: unknown = null;
    sb.__setRpcSpy((fn, params) => { rpcCall = { fn, params }; });
    renderPanel();
    await go('Review');
    const publish = await screen.findAllByRole('button', { name: 'Publish' });
    expect(publish.length).toBeGreaterThan(0);
    await userEvent.click(publish[0]);
    await waitFor(() => expect(rpcCall).not.toBeNull());
    expect(rpcCall).toEqual({ fn: 'radar_publish_candidate', params: { p_candidate: 'c1' } });
    expect(await screen.findByText(/Published Bello Tailors/)).toBeInTheDocument();
  });

  it('review shows per-field provenance from radar_candidate_evidence', async () => {
    renderPanel();
    await go('Review');
    const toggle = await screen.findByRole('button', { name: /Provenance · 2/ });
    await userEvent.click(toggle);
    expect(await screen.findByText('structured_data')).toBeInTheDocument();
    expect(screen.getByText('+2348000000001')).toBeInTheDocument();
    expect(screen.getByText('phone')).toBeInTheDocument();
    expect(screen.getByText('owner confirmed')).toBeInTheDocument();
    expect(sb.supabase.from).toHaveBeenCalledWith('radar_candidate_evidence');
  });

  it('review flags a queue candidate as a duplicate of another candidate and rejects it', async () => {
    let patch: unknown = null;
    sb.__setUpdateSpy((p) => { patch = p; });
    renderPanel();
    await go('Review');
    const card = screen.getByText('Bello Tailors Ltd').closest('section');
    expect(card).not.toBeNull();
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: /Check duplicates/ }));
    expect(await within(card as HTMLElement).findByText(/Business name matches/)).toBeInTheDocument();
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Reject as duplicate' }));
    await waitFor(() => expect(patch).not.toBeNull());
    expect(patch).toMatchObject({ status: 'rejected' });
    expect(String((patch as Record<string, unknown>).decision_reason)).toMatch(/Duplicate of candidate "Bello Tailors"/);
    expect(sb.supabase.from).toHaveBeenCalledWith('businesses');
  });

  it('compliance shows engine switches and the suppression list, masked', async () => {
    let rpcCall: unknown = null;
    sb.__setRpcSpy((fn, params) => { rpcCall = { fn, params }; });
    renderPanel();
    await go('Compliance');
    expect(await screen.findByText(/Discovery engine/)).toBeInTheDocument();
    expect(screen.queryByText('+2348012345678')).not.toBeInTheDocument();
    expect(screen.getByText(/Queue thresholds/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle Discovery engine' }));
    await waitFor(() => expect(rpcCall).not.toBeNull());
    expect(rpcCall).toEqual({ fn: 'set_feature_flag', params: { p_key: 'business_discovery_engine', p_enabled: false } });
  });

  it('overview shows the designed “not provisioned” state, never the raw missing-table error', async () => {
    sb.__setRpcError('radar_stats', "PGRST204 Could not find the table 'public.radar_candidates' in the schema cache");
    renderPanel();
    expect(await screen.findByText(/Some tables are not provisioned yet/)).toBeInTheDocument();
    expect(screen.queryByText(/PGRST204/)).not.toBeInTheDocument();
  });
});