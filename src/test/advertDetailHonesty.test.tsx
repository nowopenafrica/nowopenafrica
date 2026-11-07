import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/*
 * A placement page must not pass a stock photograph off as the site, and
 * must not promise a booking the page cannot make. Harness copied from
 * detailPageFailure.test.tsx; nothing here writes a row.
 */

const row = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

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
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));
vi.mock('../components/promote/AdPreviewStudio', () => ({ default: () => null }));

import AdvertDetail from '../pages/AdvertDetail';

const advert = (image_url: string) => ({
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Allen Avenue bus shelter',
  description: '',
  category: 'Street Furniture',
  location: 'Lagos, Nigeria',
  pricing: 12,
  dimensions: '6m x 3m',
  status: 'active',
  image_url,
});

const open = () => render(
  <MemoryRouter initialEntries={['/adverts/11111111-1111-1111-1111-111111111111']}>
    <Routes><Route path="/adverts/:id" element={<AdvertDetail />} /></Routes>
  </MemoryRouter>,
);

afterEach(() => { cleanup(); row.current = null; });

describe('a placement page is honest about its photo and its offer', () => {
  it('captions a stock photo "Stock photo — not this site"', async () => {
    row.current = advert('https://images.pexels.com/photos/2/shelter.jpg');
    open();
    const caption = await screen.findByTestId('stock-photo-caption');
    expect(caption.textContent).toBe('Stock photo — not this site');
    expect(screen.getByAltText(/^Stock photograph standing in for/)).toBeTruthy();
  });

  it('does not caption a real photo', async () => {
    row.current = advert('https://abc.supabase.co/storage/v1/object/public/adverts/shelter.jpg');
    open();
    await screen.findByRole('heading', { name: 'Allen Avenue bus shelter' });
    expect(screen.queryByTestId('stock-photo-caption')).toBeNull();
  });

  it('leads back to Promote and never says "Book" in its title or description', async () => {
    row.current = advert('https://abc.supabase.co/x.jpg');
    open();
    await screen.findByRole('heading', { name: 'Allen Avenue bus shelter' });
    expect(screen.getByRole('link', { name: /Promote/ }).getAttribute('href')).toBe('/adverts');
    await waitFor(() => expect(document.title).toBe('Allen Avenue bus shelter — advertise in Lagos | NowOpen Africa'));
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
    expect(description).toContain('Rates are indicative and confirmed on enquiry.');
    expect(`${document.title} ${description}`).not.toMatch(/\bbook/i);
  });

  it('says what each action does: "Pay to reserve these dates" opens payment, and an enquiry is offered', async () => {
    row.current = advert('https://abc.supabase.co/x.jpg');
    open();
    await screen.findByRole('heading', { name: 'Allen Avenue bus shelter' });
    // The checkout button names the payment rather than dressing it up as a request.
    expect(screen.getByRole('button', { name: 'Pay to reserve these dates' })).toBeTruthy();
    expect(screen.getByText(/^Enquire about this placement/)).toBeTruthy();
    // No button claims a booking, and none hides a payment behind request wording.
    for (const b of screen.getAllByRole('button')) {
      expect(b.textContent ?? '', b.outerHTML.slice(0, 80)).not.toMatch(/\bbook|Request these dates/i);
    }
    expect(document.body.textContent).not.toMatch(/Book This Placement|Reserve now/);
  });
});

describe('a rejected or archived placement is no longer listed', () => {
  it.each(['archived', 'rejected'])('a %s placement shows only "No longer listed": no price, no booking, no enquiry', async (lifecycle) => {
    row.current = { ...advert('https://abc.supabase.co/x.jpg'), lifecycle, duration: 30 };
    open();
    await screen.findByRole('heading', { name: 'No longer listed' });
    const text = document.body.textContent ?? '';
    expect(text).toContain('Allen Avenue bus shelter');
    expect(text).not.toMatch(/₦12|per day|Price per day|indicative/i);
    expect(screen.queryByTestId('price-basis')).toBeNull();
    expect(screen.queryByTestId('placement-availability')).toBeNull();
    // Nothing to act on but the way back.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(text).not.toMatch(/Pay to reserve|Enquire|Contact Owner|Save to my plan|WhatsApp/);
    expect(screen.getByRole('link', { name: /Back to Promote/ }).getAttribute('href')).toBe('/adverts');
    // And search engines are told so.
    await waitFor(() => expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/));
  });

  it('a listed placement (imported) is shown as normal', async () => {
    row.current = { ...advert('https://abc.supabase.co/x.jpg'), lifecycle: 'imported' };
    open();
    await screen.findByRole('heading', { name: 'Allen Avenue bus shelter' });
    expect(screen.queryByRole('heading', { name: 'No longer listed' })).toBeNull();
  });
});
