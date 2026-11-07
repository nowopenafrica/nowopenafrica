import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type { PlanLine } from '../lib/promote/campaignPlan';

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  localLines: [] as unknown[],
  localFails: false,
  planLines: [] as unknown[],
  trust: { map: new Map<string, unknown>(), failed: false } as { map: Map<string, unknown>; failed: boolean },
  campaigns: [] as unknown[],
  linesUnavailable: false,
  createCampaign: vi.fn(async () => ({ id: 'c-new' })),
}));

const PLAN_C1 = { id: 'c1', name: 'My plan', objective: null, audience: null, startsOn: null, endsOn: null, budget: null, currency: 'NGN', status: 'draft', updatedAt: '' };

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user, loading: false }) }));
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ currency: 'USD', format: (n: number) => `$${Math.round(n)}`, ngnPerUsd: 1500 }),
}));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('../components/PlatformEnquiryModal', () => ({ default: () => null }));
vi.mock('../components/promote/LineArtwork', () => ({
  default: (p: { line: { id: string } }) => <div data-testid={`artwork-${p.line.id}`} />,
}));
vi.mock('../lib/promote/trust', async (orig) => ({
  ...(await orig<typeof import('../lib/promote/trust')>()),
  fetchPlacementTrustResult: async () => h.trust,
}));
vi.mock('../lib/promote/campaigns', async (orig) => ({
  ...(await orig<typeof import('../lib/promote/campaigns')>()),
  fetchCampaigns: async () => ({ state: 'ready', campaigns: [...h.campaigns] }),
  fetchPlanLines: async () => (h.linesUnavailable
    ? { state: 'unavailable', reason: 'We could not load your plan just now.' }
    : { state: 'ready', lines: [...h.planLines] }),
  createCampaign: h.createCampaign,
  fetchLocalPlanLines: async () => {
    if (h.localFails) throw new Error('boom');
    return h.localLines;
  },
}));

import MediaPlan from './MediaPlan';
import { LOCAL_PLAN_KEY, notifyPlanChanged, readLocalPlan } from '../lib/promote/localPlan';
import * as campaigns from '../lib/promote/campaigns';

const base = (over: Partial<PlanLine>): PlanLine => ({
  id: 'x', advertId: 'a1', title: 'Shelter', type: 'Billboard', location: 'Lagos', dimensions: '12m x 6m',
  days: 30, ratePerDay: 10, priceBasis: 'indicative', currency: 'USD', artworkUrl: null, kind: 'placement',
  productId: null, priceMinor: null, artworkDesignId: null, artworkWidth: null, artworkHeight: null,
  offered: true, ...over,
});
const product = (over: Partial<PlanLine> = {}) => base({
  id: 'local:p1', advertId: null, title: 'City spotlight', type: null, location: null, dimensions: null,
  days: 30, ratePerDay: null, priceBasis: 'fixed', currency: 'NGN', kind: 'product', productId: 'p1',
  priceMinor: 1_950_000, ...over,
});

const page = () => render(<MemoryRouter initialEntries={['/advertise/plan']}><MediaPlan /></MemoryRouter>);

beforeEach(() => {
  h.user = null; h.localLines = []; h.localFails = false; h.planLines = [];
  h.trust = { map: new Map(), failed: true };
  h.campaigns = [PLAN_C1]; h.linesUnavailable = false; h.createCampaign.mockClear();
  window.localStorage.setItem(LOCAL_PLAN_KEY, JSON.stringify({ v: 1, lines: [{ kind: 'placement', advertId: 'a1', days: 30 }] }));
});
afterEach(() => { cleanup(); window.localStorage.clear(); });

describe('plan page, signed out', () => {
  it('shows the local lines with the device-only banner and no send button', async () => {
    h.localLines = [base({ id: 'local:a1', title: 'Allen Avenue gantry' }), base({ id: 'local:a2', advertId: 'a2', title: 'Ikorodu shelter' })];
    page();
    await screen.findByText('Allen Avenue gantry');
    expect(screen.getByText('Ikorodu shelter')).toBeTruthy();
    expect(screen.getByText('This plan is on this device only. Sign in to keep it and send it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Send this plan/ })).toBeNull();
    const signIn = screen.getAllByRole('link', { name: /Sign in/ });
    expect(signIn.every((a) => a.getAttribute('href') === '/login?next=%2Fadvertise%2Fplan')).toBe(true);
    expect(screen.queryByText('Sign in to build a media plan.', { exact: false })).toBeNull();
  });

  it('a failed read says so, never "empty"', async () => {
    h.localFails = true;
    page();
    await screen.findByText('We could not load your plan just now');
    expect(screen.queryByText(/Nothing in this plan yet/)).toBeNull();
  });
});

describe('plan page, signed out edits stay on the device', () => {
  it('remove goes through localPlan only', async () => {
    const rm = vi.spyOn(campaigns, 'removePlacement');
    const days = vi.spyOn(campaigns, 'setLineDays');
    h.localLines = [base({ id: 'local:a1', title: 'Allen Avenue gantry' })];
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Allen Avenue gantry from this plan' }));
    await waitFor(() => expect(readLocalPlan().some((l) => l.kind === 'placement' && l.advertId === 'a1')).toBe(false));
    expect(rm).not.toHaveBeenCalled();
    expect(days).not.toHaveBeenCalled();
  });

  it('days change goes through localPlan only', async () => {
    const rm = vi.spyOn(campaigns, 'removePlacement');
    const days = vi.spyOn(campaigns, 'setLineDays');
    h.localLines = [base({ id: 'local:a1', title: 'Allen Avenue gantry' })];
    page();
    fireEvent.change(await screen.findByLabelText('Days for Allen Avenue gantry'), { target: { value: '45' } });
    await waitFor(() => expect(readLocalPlan()).toEqual([{ kind: 'placement', advertId: 'a1', days: 45 }]));
    expect(rm).not.toHaveBeenCalled();
    expect(days).not.toHaveBeenCalled();
  });
});

describe('plan page lines', () => {
  it('a product line has price basis, period and no artwork, days, trust or placement link', async () => {
    h.localLines = [product(), base({ id: 'local:a1', title: 'Allen Avenue gantry' })];
    page();
    const li = (await screen.findByText('City spotlight')).closest('li')!;
    expect(within(li).getByText('NowOpen price')).toBeTruthy();
    expect(within(li).getByText('30 days')).toBeTruthy();
    expect(within(li).queryByLabelText(/Days for/)).toBeNull();
    expect(within(li).queryByTestId('artwork-local:p1')).toBeNull();
    expect(within(li).queryByText(/Source listed|Availability/)).toBeNull();
    expect(li.querySelector('a')).toBeNull();
    expect(document.querySelector('a[href="/adverts/null"]')).toBeNull();
    expect(screen.getByTestId('artwork-local:a1')).toBeTruthy();
  });

  it('a withdrawn line says so, offers Remove only, and leaves the totals', async () => {
    h.localLines = [product({ offered: false, title: 'Old product' }), base({ id: 'local:a1', title: 'Allen Avenue gantry' })];
    page();
    const li = (await screen.findByText('Old product')).closest('li')!;
    expect(within(li).getByText('No longer on offer')).toBeTruthy();
    expect(within(li).getByRole('button', { name: /Remove/ })).toBeTruthy();
    expect(within(li).queryByLabelText(/Days for/)).toBeNull();
    expect(screen.queryByText(/NowOpen price/)).toBeNull();
  });

  it('a placement missing from placement_trust leaves the totals', async () => {
    h.trust = { map: new Map(), failed: false };
    h.localLines = [base({ id: 'local:a1', title: 'Allen Avenue gantry' })];
    page();
    await screen.findByText('No longer listed');
    expect(screen.getByText(/1 line is no longer on offer/)).toBeTruthy();
    expect(screen.queryByText('$300')).toBeNull();
  });

  it('a failed trust read leaves the totals alone', async () => {
    h.localLines = [base({ id: 'local:a1', title: 'Allen Avenue gantry' })];
    page();
    await screen.findByText('Allen Avenue gantry');
    await screen.findByText('Listing status could not be checked just now');
    expect(screen.queryByText(/no longer on offer/)).toBeNull();
  });

  it('the header counts artwork against the lines that need it', async () => {
    h.localLines = [
      product(),
      base({ id: 'local:a1', title: 'One', artworkUrl: 'p' }),
      base({ id: 'local:a2', advertId: 'a2', title: 'Two' }),
    ];
    page();
    await screen.findByText('1 of 2 lines have artwork');
    expect(screen.queryByText(/Artwork ready on/)).toBeNull();
  });
});

describe('plan page, signed in', () => {
  it('keeps the send button and has no device-only banner', async () => {
    h.user = { id: 'u1' };
    h.planLines = [base({ id: 'l1', title: 'Allen Avenue gantry' })];
    page();
    await screen.findByText('Allen Avenue gantry');
    await waitFor(() => expect(screen.getByRole('button', { name: /Send this plan/ })).toBeTruthy());
    expect(screen.queryByText(/on this device only/)).toBeNull();
    expect(document.querySelector('a[href="/adverts/a1"]')).not.toBeNull();
  });
});

describe('plan page, signed in, stays current', () => {
  it('a plan-changed event after mount shows the new lines', async () => {
    h.user = { id: 'u1' };
    h.planLines = [base({ id: 'l1', title: 'Allen Avenue gantry' })];
    page();
    await screen.findByText('Allen Avenue gantry');
    h.planLines = [...h.planLines, base({ id: 'l2', advertId: 'a2', title: 'Ikorodu shelter' })];
    notifyPlanChanged();
    await screen.findByText('Ikorodu shelter');
  });

  it('"Start a plan" opens the plan the re-read finds instead of making a second one', async () => {
    h.user = { id: 'u1' };
    h.campaigns = [];
    page();
    const startBtn = await screen.findByRole('button', { name: /Start a plan/ });
    h.campaigns = [PLAN_C1];
    h.planLines = [base({ id: 'l1', title: 'Allen Avenue gantry' })];
    fireEvent.click(startBtn);
    await screen.findByText('Allen Avenue gantry');
    expect(h.createCampaign).not.toHaveBeenCalled();
  });

  it('"Start a plan" creates one when the re-read still finds none', async () => {
    h.user = { id: 'u1' };
    h.campaigns = [];
    page();
    fireEvent.click(await screen.findByRole('button', { name: /Start a plan/ }));
    await waitFor(() => expect(h.createCampaign).toHaveBeenCalledTimes(1));
  });

  it('a failed lines read is a failed read, never an empty plan', async () => {
    h.user = { id: 'u1' };
    h.linesUnavailable = true;
    page();
    await screen.findByText('We could not load your plan just now.');
    expect(screen.queryByText(/Nothing in this plan yet/)).toBeNull();
  });
});

describe('plan page, the rate-card note', () => {
  const NOTE = /indicative rates from published rate cards/;

  it('shows when a line is indicative', async () => {
    h.localLines = [base({ id: 'local:a1', title: 'Allen Avenue gantry' })];
    page();
    await screen.findByText('Allen Avenue gantry');
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it('is absent when no line is indicative', async () => {
    h.localLines = [product(), base({ id: 'local:a1', title: 'Allen Avenue gantry', priceBasis: 'unpriced', ratePerDay: null })];
    page();
    await screen.findByText('Allen Avenue gantry');
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
