import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PlanLine } from '../../lib/promote/campaignPlan';
import { summarise } from '../../lib/promote/campaignPlan';

const h = vi.hoisted(() => ({
  snap: null as unknown,
  user: null as null | { id: string },
  migrate: vi.fn(),
  local: [] as unknown[],
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('react-hot-toast', () => ({ default: h.toast }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user, loading: false }) }));
vi.mock('../../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ format: (n: number) => `$${n}`, ngnPerUsd: 1500 }),
}));
vi.mock('../../lib/promote/usePlanSnapshot', () => ({ usePlanSnapshot: () => h.snap }));
vi.mock('../../lib/promote/localPlan', () => ({ readLocalPlan: () => h.local }));
vi.mock('../../lib/promote/campaigns', () => ({ migrateLocalPlan: h.migrate }));

import PlanTray from './PlanTray';
import PlanSync from './PlanSync';

const line = (id: string, over: Partial<PlanLine> = {}): PlanLine => ({
  id, advertId: id, title: id, type: 'Billboard', location: null, dimensions: null,
  days: 10, ratePerDay: 10, priceBasis: 'indicative', currency: 'USD', artworkUrl: null,
  kind: 'placement', productId: null, priceMinor: null, artworkDesignId: null,
  artworkWidth: null, artworkHeight: null, offered: true, ...over,
});

function snapshot(lines: PlanLine[], over: Record<string, unknown> = {}) {
  return {
    lines, summary: lines.length ? summarise(lines, 1500) : null,
    planId: null, loading: false, failed: false, ...over,
  };
}
const renderTray = () => render(<MemoryRouter><PlanTray /></MemoryRouter>);

beforeEach(() => { h.user = null; h.local = []; h.migrate.mockReset(); h.toast.mockReset(); h.toast.success.mockReset(); });
afterEach(cleanup);

describe('PlanTray', () => {
  it('renders nothing at 0 lines', () => {
    h.snap = snapshot([]);
    const { container } = renderTray();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while loading or when the read failed', () => {
    h.snap = snapshot([line('a')], { loading: true });
    const a = renderTray();
    expect(a.container.firstChild).toBeNull();
    a.unmount();
    h.snap = snapshot([], { failed: true });
    const b = renderTray();
    expect(b.container.firstChild).toBeNull();
    expect(screen.queryByText(/empty|no plan/i)).toBeNull();
  });

  it('shows separate amounts per basis and never a total', () => {
    h.snap = snapshot([
      line('p', { kind: 'product', advertId: null, productId: 'p', priceBasis: 'fixed', currency: 'NGN', priceMinor: 15_000_000, days: 30, ratePerDay: null }),
      line('a'), // indicative 10 x 10 = 100
    ]);
    renderTray();
    const region = screen.getByRole('region', { name: 'Your plan' });
    expect(region.textContent).toContain('2 in your plan');
    expect(region.textContent).toContain('$100 indicative');
    expect(region.textContent).toMatch(/\$\d+ NowOpen price/);
    expect(region.textContent).not.toMatch(/total/i);
    expect(region.textContent).not.toContain('$200');
  });

  it('says "to be quoted" for an uncosted group and for unpriced lines', () => {
    h.snap = snapshot([
      line('a', { days: null }),
      line('u', { priceBasis: 'unpriced', ratePerDay: null }),
    ]);
    renderTray();
    expect(screen.getAllByText('to be quoted').length).toBeGreaterThanOrEqual(2);
  });

  it('has a same-height spacer in flow and is not a dialog', () => {
    h.snap = snapshot([line('a')]);
    renderTray();
    expect(screen.getByTestId('plan-tray-spacer')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Your plan' }).getAttribute('aria-modal')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('links to the plan id when signed in, else the bare plan page', () => {
    h.user = { id: 'u1' };
    h.snap = snapshot([line('a')], { planId: 'c-9' });
    const a = renderTray();
    expect(screen.getByRole('link', { name: /open plan/i }).getAttribute('href')).toBe('/advertise/plan/c-9');
    a.unmount();
    h.user = null;
    h.snap = snapshot([line('a')], { planId: null });
    renderTray();
    expect(screen.getByRole('link', { name: /open plan/i }).getAttribute('href')).toBe('/advertise/plan');
  });
});

describe('PlanSync', () => {
  const mount = () => render(<PlanSync />);

  it('migrates once for a user, not again on re-render with the same id', async () => {
    h.user = { id: 'u1' };
    h.local = [{ kind: 'product', productId: 'p' }];
    h.migrate.mockResolvedValue({ moved: 2, kept: 0 });
    const r = mount();
    await waitFor(() => expect(h.migrate).toHaveBeenCalledTimes(1));
    h.user = { id: 'u1' }; // a restored-session SIGNED_IN hands back a new object, same id
    r.rerender(<PlanSync />);
    await Promise.resolve();
    expect(h.migrate).toHaveBeenCalledTimes(1);
    expect(h.toast.success).toHaveBeenCalledWith('Moved 2 lines into your plan.');
  });

  it('never migrates when nothing is held locally', async () => {
    h.user = { id: 'u1' };
    h.local = [];
    mount();
    await Promise.resolve();
    expect(h.migrate).not.toHaveBeenCalled();
  });

  it('never migrates signed out', async () => {
    h.local = [{ kind: 'product', productId: 'p' }];
    mount();
    await Promise.resolve();
    expect(h.migrate).not.toHaveBeenCalled();
  });

  it('singular line and the kept suffix', async () => {
    h.user = { id: 'u1' };
    h.local = [{ kind: 'product', productId: 'p' }];
    h.migrate.mockResolvedValue({ moved: 1, kept: 3 });
    mount();
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('Moved 1 line into your plan. · 3 kept on this device'));
  });

  it('no toast when the result is null or moved is 0', async () => {
    h.user = { id: 'u1' };
    h.local = [{ kind: 'product', productId: 'p' }];
    h.migrate.mockResolvedValue({ moved: 0, kept: 2 });
    mount();
    await waitFor(() => expect(h.migrate).toHaveBeenCalled());
    await Promise.resolve();
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
  });
});
