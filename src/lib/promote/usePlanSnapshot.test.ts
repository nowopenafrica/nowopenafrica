import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PlanLine } from './campaignPlan';

const h = vi.hoisted(() => ({
  user: null as null | { id: string },
  authLoading: false,
  local: [] as unknown[],
  listener: null as null | (() => void),
  fetchCampaigns: vi.fn(),
  fetchPlanLines: vi.fn(),
  fetchLocalPlanLines: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.user, loading: h.authLoading }),
}));
vi.mock('../../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ format: (n: number) => `$${n}`, ngnPerUsd: 1500 }),
}));
vi.mock('./localPlan', () => ({
  readLocalPlan: () => h.local,
  onPlanChanged: (cb: () => void) => {
    h.listener = cb;
    return () => { h.listener = null; };
  },
}));
vi.mock('./campaigns', () => ({
  fetchCampaigns: h.fetchCampaigns,
  fetchPlanLines: h.fetchPlanLines,
  fetchLocalPlanLines: h.fetchLocalPlanLines,
}));

import { usePlanSnapshot } from './usePlanSnapshot';

const line = (id: string, over: Partial<PlanLine> = {}): PlanLine => ({
  id, advertId: id, title: id, type: 'Billboard', location: null, dimensions: null,
  days: 7, ratePerDay: 10, priceBasis: 'indicative', currency: 'USD', artworkUrl: null,
  kind: 'placement', productId: null, priceMinor: null, artworkDesignId: null,
  artworkWidth: null, artworkHeight: null, offered: true, ...over,
});

beforeEach(() => {
  h.user = null; h.authLoading = false; h.local = [];
  h.fetchCampaigns.mockReset(); h.fetchPlanLines.mockReset(); h.fetchLocalPlanLines.mockReset();
});
afterEach(cleanup);

describe('usePlanSnapshot', () => {
  it('signed out: resolves the browser-held lines', async () => {
    h.local = [{ kind: 'placement', advertId: 'a', days: 7 }];
    h.fetchLocalPlanLines.mockResolvedValue([line('a')]);
    const { result } = renderHook(() => usePlanSnapshot());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lines).toHaveLength(1);
    expect(result.current.summary?.lines).toBe(1);
    expect(result.current.planId).toBeNull();
    expect(result.current.failed).toBe(false);
  });

  it('signed out with nothing local does not hit the network', async () => {
    const { result } = renderHook(() => usePlanSnapshot());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(h.fetchLocalPlanLines).not.toHaveBeenCalled();
    expect(result.current.lines).toEqual([]);
  });

  it('signed out: a throwing read is failed, not empty', async () => {
    h.local = [{ kind: 'product', productId: 'p' }];
    h.fetchLocalPlanLines.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => usePlanSnapshot());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(true);
  });

  it('signed in: reads the newest campaign', async () => {
    h.user = { id: 'u1' };
    h.fetchCampaigns.mockResolvedValue({ state: 'ready', campaigns: [{ id: 'c-new' }, { id: 'c-old' }] });
    h.fetchPlanLines.mockResolvedValue([line('a'), line('b')]);
    const { result } = renderHook(() => usePlanSnapshot());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(h.fetchPlanLines).toHaveBeenCalledWith('c-new');
    expect(result.current.planId).toBe('c-new');
    expect(result.current.lines).toHaveLength(2);
  });

  it('signed in: unavailable campaigns is failed', async () => {
    h.user = { id: 'u1' };
    h.fetchCampaigns.mockResolvedValue({ state: 'unavailable', reason: 'x' });
    const { result } = renderHook(() => usePlanSnapshot());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(result.current.lines).toEqual([]);
  });

  it('signed in with no campaigns: no lines, no plan id, not failed', async () => {
    h.user = { id: 'u1' };
    h.fetchCampaigns.mockResolvedValue({ state: 'ready', campaigns: [] });
    const { result } = renderHook(() => usePlanSnapshot());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.planId).toBeNull();
    expect(result.current.failed).toBe(false);
    expect(h.fetchPlanLines).not.toHaveBeenCalled();
  });

  it('re-reads when the plan changes', async () => {
    h.local = [{ kind: 'placement', advertId: 'a', days: 7 }];
    h.fetchLocalPlanLines.mockResolvedValue([line('a')]);
    const { result } = renderHook(() => usePlanSnapshot());
    await waitFor(() => expect(result.current.loading).toBe(false));
    h.fetchLocalPlanLines.mockResolvedValue([line('a'), line('b')]);
    await act(async () => { h.listener?.(); });
    await waitFor(() => expect(result.current.lines).toHaveLength(2));
  });

  it('waits for auth to settle before reading', async () => {
    h.authLoading = true;
    const { result } = renderHook(() => usePlanSnapshot());
    expect(result.current.loading).toBe(true);
    expect(h.fetchCampaigns).not.toHaveBeenCalled();
    expect(h.fetchLocalPlanLines).not.toHaveBeenCalled();
  });
});
