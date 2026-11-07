import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { I18nProvider } from '../contexts/I18nContext';
import { ThemeProvider } from '../contexts/ThemeContext';
import { CurrencyProvider } from '../contexts/CurrencyContext';
import { AuthProvider } from '../contexts/AuthContext';
import BusinessDetail from '../pages/BusinessDetail';

/*
 * Regression: the public profile rendered as a blank page for every visitor.
 *
 * BusinessDetail computes its banner values (cover video / cover photo) in the
 * component body, and `business` is `useState<any | null>(null)` — the load
 * guard is further down, so the very first render dereferenced a null business:
 *
 *     const coverVideo = business.cover_video_url;   // TypeError on first paint
 *
 * Because the state is typed `any`, `tsc` could not see it, and there was no
 * render test, so nothing caught it — the error boundary turned the whole
 * profile into a blank screen. This drives the real component through the real
 * provider stack so a first-render null dereference fails loudly here.
 */

// jsdom lacks a few browser APIs the page's widgets touch. Neutral stubs so the
// render reports real crashes, not environment gaps.
if (!window.matchMedia) {
  window.matchMedia = (() => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
if (!('IntersectionObserver' in window)) {
  (window as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (!('ResizeObserver' in window)) {
  (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (typeof (window.HTMLElement.prototype as unknown as { play?: unknown }).play !== 'function') {
  (window.HTMLElement.prototype as unknown as { play: () => Promise<void> }).play = () =>
    Promise.resolve();
}

// Visible to both the module mock below and the tests.
const { dataset } = vi.hoisted(() => ({
  dataset: {
    business: null as Record<string, unknown> | null,
    rows: {} as Record<string, unknown[]>,
  },
}));

vi.mock('../lib/supabase', () => {
  const resolveFor = (table: string) =>
    table === 'businesses'
      ? { data: dataset.business, error: null }
      : { data: dataset.rows[table] ?? [], error: null };

  const fakeQuery = (table: string) => {
    const self: any = {
      table,
      select: () => self,
      eq: () => self,
      ilike: () => self,
      order: () => self,
      limit: () => self,
      upsert: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve(resolveFor(table)),
      then: (onF: (v: unknown) => unknown) => Promise.resolve(resolveFor(table)).then(onF),
    };
    return self;
  };

  return {
    supabase: {
      from: (table: string) => fakeQuery(table),
      channel: (name: string) => ({
        name,
        on: function () { return this; },
        subscribe: function () { return this; },
      }),
      removeChannel: () => Promise.resolve(),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
    },
  };
});

vi.mock('../lib/analytics', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return { ...mod, track: () => Promise.resolve() };
});

const baseBusiness = () => ({
  id: '885a79c0-2445-4881-a32d-3069e4e8c7fe',
  username: 'test-business-co',
  name: 'Test Business Co.',
  category: 'Restaurant & Food',
  description: 'A fixture listing for the profile render.',
  location: 'Addis Ababa, Ethiopia',
  image_url: 'https://picsum.photos/seed/cover/1600/900',
  cover_video_url: null as string | null,
  logo_url: 'https://picsum.photos/seed/logo/200/200',
  phone: null,
  email: null,
  rating: null,
  verified: false,
  opening_hours: null,
  services: null,
});

const renderProfile = () =>
  render(
    <MemoryRouter initialEntries={['/businesses/885a79c0-2445-4881-a32d-3069e4e8c7fe']}>
      <I18nProvider>
        <ThemeProvider>
          <CurrencyProvider>
            <AuthProvider>
              <Routes>
                <Route path="/businesses/:id" element={<BusinessDetail />} />
              </Routes>
            </AuthProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </I18nProvider>
    </MemoryRouter>,
  );

describe('the public business profile', () => {
  beforeEach(() => {
    dataset.rows = {
      business_services: [],
      business_products: [],
      business_gallery: [],
      business_reviews: [],
      business_media_assets: [],
      business_streams: [],
    };
    dataset.business = baseBusiness();
  });

  it('renders a published business instead of blanking on the first paint', async () => {
    renderProfile();
    expect((await screen.findAllByText('Test Business Co.')).length).toBeGreaterThan(0);
  });

  it('renders when the owner has set a video banner', async () => {
    dataset.business = {
      ...baseBusiness(),
      cover_video_url: 'https://cdn.example.com/reel.mp4',
    };
    renderProfile();
    expect((await screen.findAllByText('Test Business Co.')).length).toBeGreaterThan(0);
  });

  // Live is no longer a verified-only feature: every listing, claimed or
  // unclaimed, offers the tab. The fixture is `verified: false` on purpose.
  it('offers the Live tab to an unverified, unclaimed listing', async () => {
    renderProfile();
    await screen.findAllByText('Test Business Co.');
    expect(screen.getByRole('tab', { name: /live/i })).toBeInTheDocument();
  });
});