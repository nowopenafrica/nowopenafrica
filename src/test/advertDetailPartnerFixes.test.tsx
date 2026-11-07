import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/*
 * AdvertDetail, partner portal final review (M10, M12, M13). Harness copied
 * from advertDetailHonesty.test.tsx, plus a record of every query-builder
 * call so the similar strip's filter can be checked. Nothing writes a row.
 */

const row = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
const builder = vi.hoisted(() => ({ calls: [] as { table: string; op: string; args: unknown[] }[] }));

vi.mock('../lib/supabase', () => {
  const chain = (table: string): any => {
    const rec = (op: string) => vi.fn((...args: unknown[]) => { builder.calls.push({ table, op, args }); return c; });
    const c: any = {
      select: rec('select'),
      eq: rec('eq'),
      neq: rec('neq'),
      not: rec('not'),
      order: rec('order'),
      limit: rec('limit'),
      in: rec('in'),
      range: rec('range'),
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
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));
vi.mock('../components/promote/AdPreviewStudio', () => ({ default: () => null }));

import AdvertDetail from '../pages/AdvertDetail';
import { UNLISTED_LIFECYCLES_IN } from '../lib/promote/listing';

const ID = '11111111-1111-1111-1111-111111111111';
const REAL = 'https://abc.supabase.co/storage/v1/object/public/business-images/placements/a/1.jpg';
const REAL_2 = 'https://abc.supabase.co/storage/v1/object/public/business-images/placements/a/2.jpg';
const STOCK = 'https://images.pexels.com/photos/2/shelter.jpg';

const base = {
  id: ID,
  title: 'Allen Avenue bus shelter',
  description: '',
  category: 'Street Furniture',
  location: 'Lagos, Nigeria',
  pricing: 12,
  status: 'active',
  image_url: REAL,
  lifecycle: 'imported',
};

const open = () => render(
  <MemoryRouter initialEntries={[`/adverts/${ID}`]}>
    <Routes><Route path="/adverts/:id" element={<AdvertDetail />} /></Routes>
  </MemoryRouter>,
);

afterEach(() => { cleanup(); row.current = null; builder.calls.length = 0; });

describe('M10: a placement waiting for review was never listed', () => {
  it('reads "Not listed yet", offers nothing, and is noindexed', async () => {
    row.current = { ...base, lifecycle: 'pending_review', owner_id: 'o1' };
    open();
    await screen.findByRole('heading', { name: 'Not listed yet' });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/No longer listed/);
    expect(text).toContain('Allen Avenue bus shelter');
    expect(text).not.toMatch(/₦12|Price per day/);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/));
    expect(document.title).not.toMatch(/No longer listed/);
  });

  it.each(['rejected', 'archived'])('a %s placement still reads "No longer listed"', async (lifecycle) => {
    row.current = { ...base, lifecycle };
    open();
    await screen.findByRole('heading', { name: 'No longer listed' });
  });
});

describe('M12: what an owner entered is shown to visitors', () => {
  it('shows the site address and every extra photo of an owner placement', async () => {
    row.current = {
      ...base, lifecycle: 'partner_verified', owner_id: 'o1',
      site_address: 'Opposite Ikeja City Mall', media_urls: [REAL, REAL_2, STOCK],
    };
    open();
    await screen.findByRole('heading', { name: 'Allen Avenue bus shelter' });
    expect(screen.getByText('Opposite Ikeja City Mall')).toBeInTheDocument();
    const gallery = screen.getByRole('list', { name: 'More photos of this site' });
    const imgs = within(gallery).getAllByRole('img');
    // The cover is not repeated; the other two are shown.
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([REAL_2, STOCK]);
    // The stock-photo rule applies to every picture: alt and caption.
    expect(within(gallery).getByAltText(/^Stock photograph standing in for/)).toBeTruthy();
    expect(within(gallery).getAllByTestId('stock-photo-caption')).toHaveLength(1);
  });

  it('shows no address line and no gallery when the owner gave none', async () => {
    row.current = { ...base, lifecycle: 'partner_supplied', owner_id: 'o1', site_address: null, media_urls: [REAL] };
    open();
    await screen.findByRole('heading', { name: 'Allen Avenue bus shelter' });
    expect(screen.queryByText('Site address')).toBeNull();
    expect(screen.queryByRole('list', { name: 'More photos of this site' })).toBeNull();
  });
});

describe('M13: the similar strip filters lifecycle in the query, then limits', () => {
  it('asks for listed placements only, four of them', async () => {
    row.current = { ...base };
    open();
    await screen.findByRole('heading', { name: 'Allen Avenue bus shelter' });
    await waitFor(() => expect(builder.calls.some((c) => c.op === 'neq')).toBe(true));
    const similar = builder.calls.filter((c) => c.table === 'advertisements');
    const neqAt = similar.findIndex((c) => c.op === 'neq' && c.args[0] === 'id');
    const after = similar.slice(neqAt);
    const not = after.findIndex((c) => c.op === 'not');
    const limit = after.findIndex((c) => c.op === 'limit');
    expect(after[not]?.args).toEqual(['lifecycle', 'in', UNLISTED_LIFECYCLES_IN]);
    expect(after[limit]?.args).toEqual([4]);
  });
});
