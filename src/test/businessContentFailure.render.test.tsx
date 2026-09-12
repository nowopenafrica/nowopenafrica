import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * The behavioural half of businessContentFailure.test.ts.
 *
 * That file asserts the wiring, and a falsification run showed exactly how far
 * that gets you: disabling the detection (`setContentFailed(false)`) broke
 * ONE of its nine tests. The eight render assertions kept passing, because the
 * branch still existed in the source — it simply could never be true.
 *
 * Which is the same mistake this whole programme has been correcting: a test
 * that proves code was written, not that it runs. So this file renders the
 * page with a profile that loads and a content read that FAILS, and asks what
 * the visitor is actually shown.
 *
 * The distinction being tested is narrow and easy to get backwards:
 *
 *   business loads + content empty  → "This business hasn't listed its
 *                                      services yet."   (true, keep it)
 *   business loads + content FAILED → "We could not load this business's
 *                                      details."        (was the first one)
 */

let contentFails = true;

const BUSINESS = {
  id: '33333333-3333-4333-8333-333333333333',
  username: 'zanzibar-coffee',
  name: 'Zanzibar Coffee',
  category: 'Café & Bakery',
  secondary_categories: [],
  description: 'Coffee in Lagos.',
  location: 'Lagos, Nigeria',
  phone: '09000000000',
  verified: false,
  is_listable: true,
  created_at: new Date().toISOString(),
};

vi.mock('../lib/supabase', () => {
  const CONTENT = ['business_services', 'business_products', 'business_gallery', 'business_reviews'];

  const chain = (table: string): any => {
    const settle = () => {
      if (CONTENT.includes(table)) {
        return contentFails
          ? { data: null, error: { message: 'TypeError: Failed to fetch' } }
          : { data: [], error: null };
      }
      if (table === 'businesses') return { data: BUSINESS, error: null };
      return { data: [], error: null };
    };

    const c: any = {
      // The chain is fluent, so every filter a caller might use has to return
      // `c`. `ilike` is the one BusinessDetail resolves a username with, and
      // leaving it out made the BUSINESS read fail — which then rendered the
      // Phase 8 failure state and looked like this test passing for the wrong
      // reason.
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      neq: vi.fn(() => c),
      or: vi.fn(() => c),
      in: vi.fn(() => c),
      is: vi.fn(() => c),
      not: vi.fn(() => c),
      ilike: vi.fn(() => c),
      gte: vi.fn(() => c),
      lte: vi.fn(() => c),
      range: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => Promise.resolve(settle())),
      single: vi.fn(() => Promise.resolve(settle())),
      maybeSingle: vi.fn(() => Promise.resolve(settle())),
      then: (ok: any, no: any) => Promise.resolve(settle()).then(ok, no),
    };
    return c;
  };

  return {
    supabase: {
      from: vi.fn((t: string) => chain(t)),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        unsubscribe: vi.fn(),
      })),
      removeChannel: vi.fn(),
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null } })) },
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));

vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    currency: 'NGN',
    setCurrency: vi.fn(),
    format: (n: number) => `₦${n}`,
    convert: (n: number) => n,
    rate: 1,
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import BusinessDetail from '../pages/BusinessDetail';

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/zanzibar-coffee']}>
      <Routes>
        <Route path="/:username" element={<BusinessDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  contentFails = true;
});

describe('a profile whose content read failed', () => {
  it('does not assert the business has nothing', async () => {
    /*
     * A count of 0 is a claim. This is what the visitor sees FIRST: they land
     * on Overview, and the tab bar read "Services 0 · Menu 0 · Gallery 0 ·
     * Reviews 0" for a business that may well have all four.
     *
     * The tab PANELS had already been fixed when this test was written. The
     * tab BAR had not, and only rendering the page showed it.
     */
    const { container } = renderProfile();

    await waitFor(() => expect(container.textContent).toMatch(/zanzibar coffee/i), { timeout: 4000 });
    await waitFor(() => expect(container.textContent).toMatch(/could not load/i), { timeout: 4000 });

    expect(container.textContent).not.toMatch(/Services0/);
    expect(container.textContent).not.toMatch(/Gallery0/);
  });

  it('says outright that this is not an empty profile', async () => {
    const { container } = renderProfile();
    await waitFor(
      () => expect(container.textContent).toMatch(/does not mean there is nothing here/i),
      { timeout: 4000 },
    );
  });

  it('announces the failure to assistive tech', async () => {
    renderProfile();
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0), {
      timeout: 4000,
    });
  });

  it('offers a retry', async () => {
    renderProfile();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /try again/i }).length)
      .toBeGreaterThan(0), { timeout: 4000 });
  });
});

describe('a profile that genuinely has no content', () => {
  it('shows the real counts and no failure message', async () => {
    /*
     * The regression this change could most easily cause: turning every
     * unfinished profile into "we could not load it", which would be a new
     * lie replacing the old one. A business with nothing listed SHOULD show
     * zeroes — that is true, and useful to the owner.
     */
    contentFails = false;
    const { container } = renderProfile();

    await waitFor(() => expect(container.textContent).toMatch(/zanzibar coffee/i), { timeout: 4000 });
    await waitFor(() => expect(container.textContent).toMatch(/Services0/), { timeout: 4000 });
    expect(container.textContent).not.toMatch(/could not load/i);
  });
});
