import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/*
 * Where the claim button appears on a placement page: only while the
 * placement has no owner, and only when it is listed. Who may SEE the button
 * (a signed-in media-owner member) is the button's own rule, covered in
 * claimPlacement.test.tsx; it is stubbed here. Harness copied from
 * advertDetailHonesty.test.tsx; nothing here writes a row.
 */

const row = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
/* The plan write and its toast, so "Save to my plan" can be pressed without writing anything. */
const planAdd = vi.hoisted(() => ({
  add: vi.fn(async () => ({ ok: true as const, added: 1, skipped: 0, local: true })),
  report: vi.fn(),
}));
vi.mock('../lib/promote/campaigns', async (orig) => ({
  ...(await orig<typeof import('../lib/promote/campaigns')>()),
  addAdvertsToPlan: planAdd.add,
}));
vi.mock('../lib/promote/planToast', () => ({ reportPlanAdd: planAdd.report }));

vi.mock('../lib/supabase', () => {
  const chain = (table: string): any => {
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      neq: vi.fn(() => c),
      not: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      in: vi.fn(() => c),
      range: vi.fn(() => c),
      single: vi.fn(() => Promise.resolve(table === 'advertisements' ? { data: row.current, error: null } : { data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: (ok: any, no: any) => Promise.resolve({ data: [], error: null }).then(ok, no),
    };
    return c;
  };
  return { supabase: { from: vi.fn((t: string) => chain(t)) } };
});
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    currency: 'NGN', setCurrency: vi.fn(), format: (n: number) => `₦${n}`, formatUsd: (n: number) => `$${n}`,
    convert: (n: number) => n, rate: 1, ngnPerUsd: 1,
  }),
}));
const toasts = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toasts }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));
vi.mock('../components/promote/AdPreviewStudio', () => ({ default: () => null }));
vi.mock('../components/promote/ClaimPlacementButton', () => ({
  default: ({ advertId }: { advertId: string }) => <div data-testid="claim-button">{advertId}</div>,
}));

import AdvertDetail from '../pages/AdvertDetail';

const ID = '11111111-1111-1111-1111-111111111111';
const advert = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  title: 'Allen Avenue bus shelter',
  description: '',
  category: 'Street Furniture',
  location: 'Lagos, Nigeria',
  pricing: 12,
  dimensions: '6m x 3m',
  status: 'active',
  image_url: 'https://abc.supabase.co/x.jpg',
  ...extra,
});

const open = () => render(
  <MemoryRouter initialEntries={[`/adverts/${ID}`]}>
    <Routes><Route path="/adverts/:id" element={<AdvertDetail />} /></Routes>
  </MemoryRouter>,
);

afterEach(() => { cleanup(); row.current = null; });

describe('the claim button on a placement page', () => {
  it('is offered on a listed placement that has no owner', async () => {
    row.current = advert({ owner_id: null });
    open();
    expect((await screen.findByTestId('claim-button')).textContent).toBe(ID);
  });

  it('is not offered once the placement has an owner', async () => {
    row.current = advert({ owner_id: 'o1' });
    open();
    await screen.findByRole('heading', { name: 'Allen Avenue bus shelter' });
    expect(screen.queryByTestId('claim-button')).toBeNull();
  });

  it('is not offered on a placement that is no longer listed', async () => {
    row.current = advert({ owner_id: null, lifecycle: 'archived' });
    open();
    await screen.findByRole('heading', { name: 'No longer listed' });
    expect(screen.queryByTestId('claim-button')).toBeNull();
  });
});

describe('"Save to my plan" on a placement page', () => {
  it('signed out, the add goes through the shared toast, which says it is on this device only', async () => {
    row.current = advert({ owner_id: 'o1' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Save to my plan/ }));
    await waitFor(() => expect(planAdd.report).toHaveBeenCalledWith({ ok: true, added: 1, skipped: 0, local: true }));
    expect(toasts.success).not.toHaveBeenCalledWith('Added to your plan.');
  });
});
