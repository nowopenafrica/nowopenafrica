import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

/*
 * The Promote hub as a visitor gets it: the real /adverts page, with the
 * database, the products, the plan writer and the currency mocked. Nothing
 * here writes a row — the dev database is production.
 *
 * Expected mixes are DERIVED from buildMix over the same fixtures, never
 * written down, so a change to the mix rules fails mix.test.ts rather than
 * quietly re-pinning numbers here.
 */

const NGN_PER_USD = 1500;

const ADVERTS = vi.hoisted(() => [
  { id: 'sf1', title: 'Allen Avenue bus shelter', category: 'Street Furniture', location: 'Lagos, Nigeria', pricing: 0.4, dimensions: '6m x 3m', image_url: 'https://images.pexels.com/photos/1/bus-shelter.jpg', status: 'active', created_at: '2026-10-01' },
  { id: 'bb1', title: 'Third Mainland unipole', category: 'Billboard', location: 'Lagos, Nigeria', pricing: 20, list_price_per_day: 25, dimensions: '12m x 6m', image_url: 'https://abc.supabase.co/storage/v1/object/public/adverts/bb1.jpg', status: 'active', created_at: '2026-10-01' },
  { id: 'tr1', title: 'BRT bus wrap', category: 'Transit', location: 'Lagos, Nigeria', pricing: 3, dimensions: 'Full exterior', status: 'active', created_at: '2026-10-01' },
  { id: 'tr2', title: 'Keke fleet branding', category: 'Transit', location: 'Abuja, Nigeria', pricing: 2, dimensions: '', status: 'active', created_at: '2026-10-01' },
  { id: 'ds1', title: 'Lekki LED gantry', category: 'Digital Screen', location: 'Lagos, Nigeria', pricing: 5, dimensions: '15 seconds', status: 'active', created_at: '2026-10-01' },
  { id: 'ap1', title: 'Airport arrivals lightbox', category: 'Airport', location: 'Lagos, Nigeria', pricing: null, dimensions: '', status: 'active', created_at: '2026-10-01' },
  { id: 'rd1', title: 'Breakfast radio spot', category: 'Radio', location: 'Abuja, Nigeria', pricing: 10, dimensions: '30 seconds', status: 'active', created_at: '2026-10-01' },
  { id: 'pr1', title: 'Weekend newspaper half page', category: 'Print', location: 'Lagos, Nigeria', pricing: 1, dimensions: '', status: 'active', created_at: '2026-10-01' },
]);

const PRODUCTS = vi.hoisted(() => {
  const p = (slug: string, name: string, priceMinor: number, durationDays: number) => ({
    id: slug, slug, name, description: `${name} on NowOpen.`, kind: 'promotion', priceMinor,
    currency: 'NGN', durationDays, scopeCategory: null, scopeLocation: null, maxConcurrent: null,
    active: true, sortOrder: 0,
  });
  return {
    list: [
      p('city-spotlight', 'City spotlight', 1_950_000, 30),
      p('sponsored-result', 'Sponsored result', 500_000, 7),
      p('featured-offer', 'Featured offer', 1_000_000, 14),
    ],
    empty: false,
  };
});

type PlanOut = { ok: true; added: number; skipped: number } | { ok: false; error: string; added: number };
const plan = vi.hoisted(() => ({
  addAdvertsToPlan: vi.fn(async (list: { id: string }[]): Promise<PlanOut> => ({ ok: true, added: list.length, skipped: 0 })),
  /* The real helper, for the signed-out path: it must surface its own reason. */
  real: null as null | ((list: { id: string; pricing: number | null }[]) => Promise<PlanOut>),
}));
/* What "Use my location" detects; a test may swap in a district. */
const geo = vi.hoisted(() => ({ city: 'Abuja' }));
const toasts = vi.hoisted(() => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return t;
});
vi.mock('react-hot-toast', () => ({ default: toasts }));

vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ format: (n: number) => `$${n}`, ngnPerUsd: NGN_PER_USD }),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock('../lib/telemetry', () => ({ track: () => {} }));
vi.mock('../lib/promote/campaigns', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/promote/campaigns')>();
  plan.real = real.addAdvertsToPlan as typeof plan.real;
  return { ...real, addAdvertsToPlan: plan.addAdvertsToPlan };
});
vi.mock('../lib/geolocation', () => ({
  isGeolocationSupported: () => true,
  detectLocation: async () => ({ latitude: 0, longitude: 0, city: geo.city, label: `${geo.city}, Nigeria` }),
}));
vi.mock('../components/promote/AdPreviewStudio', () => ({ default: () => <div data-testid="preview-studio" /> }));
vi.mock('../lib/revenue/products', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/revenue/products')>();
  return {
    ...real,
    listSellableProducts: async () => ({ products: PRODUCTS.empty ? [] : PRODUCTS.list, failed: false }),
  };
});
vi.mock('../lib/supabase', () => {
  const rows: Record<string, unknown[]> = { advertisements: ADVERTS };
  const chain = (table: string): any => {
    const result = { data: rows[table] ?? [], error: null };
    const c: any = {
      select: () => c, eq: () => c, neq: () => c, in: () => c, order: () => c, range: () => c, limit: () => c,
      ilike: () => c, or: () => c,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (f?: any, r?: any) => Promise.resolve(result).then(f, r),
    };
    return c;
  };
  return {
    supabase: {
      from: (t: string) => chain(t),
      rpc: async () => ({ data: null, error: null }),
      /* Signed out: no user. Only the real plan helper (signed-out test) asks. */
      auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }) },
    },
  };
});

import Adverts from '../pages/Adverts';
import MediaPlan from '../pages/MediaPlan';
import AdvertiseRedirect from '../components/promote/AdvertiseRedirect';
import { marketingPageFor } from '../lib/marketingPageRender';
import { buildMix } from '../lib/promote/mix';
import { goalBySlug } from '../lib/promote/goals';
import { ADVERT_CATEGORY_GROUPS } from '../data/advertCategories';
import type { Advertisement } from '../types';
import type { RevenueProduct } from '../lib/revenue/products';

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  PRODUCTS.empty = false;
  plan.addAdvertsToPlan.mockClear();
  toasts.mockClear(); toasts.success.mockClear(); toasts.error.mockClear();
});

/* The address as the router holds it, and Back/Forward buttons, for the URL tests. */
function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div data-testid="location" data-search={location.search}>
      <button type="button" onClick={() => navigate(-1)}>Go back</button>
      <button type="button" onClick={() => navigate(1)}>Go forward</button>
    </div>
  );
}
const back = () => fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
const forward = () => fireEvent.click(screen.getByRole('button', { name: 'Go forward' }));
const search = () => new URLSearchParams(screen.getByTestId('location').getAttribute('data-search') ?? '');

const at = (url = '/adverts') => render(
  <MemoryRouter initialEntries={[url]}>
    <LocationProbe />
    <Routes>
      <Route path="/adverts" element={<Adverts />} />
    </Routes>
  </MemoryRouter>,
);

/** Waits until the placements have loaded (the medium browser shows its cards). */
const loaded = async () => {
  await waitFor(() => expect(screen.getAllByTestId('placement-card').length).toBeGreaterThan(0));
};

const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const goalView = (name: string) => screen.getByRole('region', { name });

describe('the Promote hub', () => {
  it('shows the page in order', async () => {
    at();
    await loaded();
    const ask = screen.getByRole('heading', { name: 'What do you want to achieve?' });
    const tiles = screen.getAllByTestId('goal-tile');
    expect(tiles).toHaveLength(6);
    const free = screen.getByRole('heading', { name: 'Start free' });
    const world = screen.getByRole('heading', { name: 'Out in the world' });
    const onNowOpen = screen.getByRole('heading', { name: 'On NowOpen' });
    const preview = screen.getByRole('heading', { name: 'See your advert where it will run' });
    /*
     * The world before our own inventory. A business arriving on "Promote"
     * means billboards, transit, screens and broadcast; leading with NowOpen's
     * products asked it to care about our sellable stock first. Both sections
     * remain, and both keep their anchors — only the pitch order changed.
     *
     * The free tools come last of the three: they are the offer for a business
     * with no budget yet, and putting them above the placements made them read
     * as the page's main proposition.
     *
     * The preview studio follows the placements, not On NowOpen: it answers a
     * question about the surface the visitor just looked at, so it belongs
     * beside them rather than after our own inventory.
     */
    const order = [ask, ...tiles, world, free, preview, onNowOpen];
    for (let i = 1; i < order.length; i += 1) expect(before(order[i - 1], order[i]), `item ${i}`).toBe(true);
    // The duplicated carousel + category select pair is gone.
    expect(screen.queryByRole('combobox', { name: 'Filter by category' })).toBeNull();
  });

  it('opens a goal', async () => {
    at();
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: /Get customers nearby/ }));
    const region = goalView('Get customers nearby');
    const heading = within(region).getByRole('heading', { name: 'Get customers nearby' });
    expect(document.activeElement).toBe(heading);
    expect(search().get('goal')).toBe('nearby');
    const tabs = within(within(region).getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Free', 'Starter', 'Growth', 'Campaign']);
  });

  it('restores a goal from the URL', async () => {
    at('/adverts?goal=sale&city=Lagos');
    await loaded();
    const region = goalView('Run a sale or offer');
    expect(within(region).getByTestId('area-chip').textContent).toContain('Lagos');
  });

  it('request bar opens the goal and city', async () => {
    at();
    await loaded();
    fireEvent.change(screen.getByLabelText('Describe what you want to achieve'), { target: { value: 'black friday sale in Lagos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find my mix' }));
    const region = await waitFor(() => goalView('Run a sale or offer'));
    expect(within(region).getByTestId('area-chip').textContent).toContain('Lagos');
    expect(search().get('goal')).toBe('sale');
    expect(search().get('city')).toBe('Lagos');
  });

  it('levels show honest money', async () => {
    at('/adverts?goal=nearby&city=Lagos');
    await loaded();
    const region = goalView('Get customers nearby');
    for (const tab of within(region).getAllByRole('tab')) {
      fireEvent.click(tab);
      for (const price of within(region).queryAllByTestId('placement-price')) {
        const text = price.textContent ?? '';
        // The basis follows the rate ("indicative · published rate card"), saying "indicative" once.
        expect(text).toMatch(/\$[\d.]+ per day · indicative(?: · .+)?$/);
        expect(text.match(/indicative/g)).toHaveLength(1);
      }
      for (const cost of within(region).queryAllByTestId('placement-cost')) {
        expect(cost.textContent ?? '').toMatch(/^about \$[\d.]+ for 30 days · indicative$/);
      }
      // One line per price basis; "indicative" only on the placement line.
      const total = within(region).getByTestId('level-total');
      const products = within(total).queryByTestId('total-products');
      const placements = within(total).queryByTestId('total-placements');
      if (products) expect(products.textContent).toMatch(/^NowOpen ads \$[\d.]+$/);
      if (placements) expect(placements.textContent).toMatch(/^Placements about \$[\d.]+ · indicative$/);
      if (!products && !placements) expect(total.textContent).toBe('Free');
      // Never a naira figure beside a dollar one: all money went through format().
      expect(region.textContent).not.toContain('₦');
    }
    // At least one level carried a placement, so the loop above checked something.
    fireEvent.click(within(region).getByRole('tab', { name: 'Campaign' }));
    expect(within(region).getAllByTestId('placement-price').length).toBeGreaterThan(0);
    for (const el of region.querySelectorAll('*')) {
      expect(el.textContent ?? '').not.toMatch(/reach|impressions|views/i);
    }
  });

  it('adds a level to the plan', async () => {
    at('/adverts?goal=nearby&city=Lagos');
    await loaded();
    const region = goalView('Get customers nearby');
    fireEvent.click(within(region).getByRole('tab', { name: 'Starter' }));
    fireEvent.click(within(region).getByRole('button', { name: 'Add all to plan' }));
    await waitFor(() => expect(plan.addAdvertsToPlan).toHaveBeenCalledTimes(1));

    const mix = buildMix(goalBySlug('nearby')!, {
      products: PRODUCTS.list as RevenueProduct[], adverts: ADVERTS as Advertisement[], city: 'Lagos', ngnPerUsd: NGN_PER_USD,
    });
    const starter = mix.levels.find((l) => l.key === 'starter')!;
    const expected = starter.items.flatMap((i) => (i.kind === 'placement' ? [i.advert.id] : []));
    expect(expected.length).toBeGreaterThan(0);
    const sent = plan.addAdvertsToPlan.mock.calls[0][0] as { id: string }[];
    expect(sent.map((a) => a.id)).toEqual(expected);
  });

  it("design links go to Create", async () => {
    at('/adverts?goal=sale');
    await loaded();
    const region = goalView('Run a sale or offer');
    const designs = within(region).getByRole('list', { name: "Designs you'll need" });
    const links = within(designs).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.getAttribute('href')).toMatch(/^\/media\?need=[a-z-]+&item=[a-z-]+$/);
  });

  it('medium browser filters', async () => {
    at();
    await loaded();
    expect(screen.getAllByTestId('medium-chips')).toHaveLength(1);
    fireEvent.click(within(screen.getByTestId('medium-chips')).getByRole('button', { name: /Transit & Airport/ }));
    const members = ADVERT_CATEGORY_GROUPS.find((g) => g.key === 'transit')!.members;
    const cards = screen.getAllByTestId('placement-card');
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) expect(members).toContain(c.getAttribute('data-category'));
    expect(cards).toHaveLength(ADVERTS.filter((a) => members.includes(a.category)).length);
  });

  it('On NowOpen shows the label customers see', async () => {
    at();
    const cards = await waitFor(() => {
      const found = screen.getAllByTestId('product-card');
      expect(found).toHaveLength(PRODUCTS.list.length);
      return found;
    });
    for (const card of cards) {
      expect(card.textContent).toMatch(/Sponsored|Featured/);
      expect(card.querySelector('[data-placement]')).not.toBeNull();
    }
  });

  it('empty products are honest', async () => {
    PRODUCTS.empty = true;
    at();
    const section = await waitFor(() => {
      const s = document.getElementById('on-nowopen');
      expect(s).not.toBeNull();
      expect(s!.textContent).toContain('Advertising is not open for self-serve yet');
      return s!;
    });
    expect(within(section).queryAllByTestId('product-card')).toHaveLength(0);
  });
});

describe('the Promote hub, fix round 1', () => {
  const tile = (name: RegExp) => screen.getByRole('button', { name });
  const NEARBY = /Get customers nearby/;
  const SALE = /Run a sale or offer/;
  const selectedTab = (region: HTMLElement) =>
    within(region).getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.textContent);

  it('its h1 is the one the crawler is told (rendered, by role)', async () => {
    at();
    await loaded();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe(marketingPageFor('/adverts')!.h1);
    expect(screen.getByRole('heading', { name: 'What do you want to achieve?' })).toBe(h1);
  });

  it('back and forward restore goal and city; a goal pushes, a city replaces', async () => {
    at();
    await loaded();
    fireEvent.click(tile(NEARBY));
    expect(search().get('goal')).toBe('nearby');
    fireEvent.change(screen.getByLabelText('Choose an area'), { target: { value: 'Lagos' } });
    expect(search().get('city')).toBe('Lagos');
    fireEvent.click(tile(SALE));
    expect(search().get('goal')).toBe('sale');
    expect(search().get('city')).toBe('Lagos');

    back();
    const nearby = goalView('Get customers nearby');
    expect(within(nearby).getByTestId('area-chip').textContent).toContain('Lagos');
    // History moved the view; it must not take the visitor's focus with it.
    expect(document.activeElement).not.toBe(within(nearby).getByRole('heading', { name: 'Get customers nearby' }));

    forward();
    expect(goalView('Run a sale or offer')).toBeTruthy();

    // Two steps back is the bare page: the city change replaced its entry.
    back();
    back();
    expect(search().get('goal')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Get customers nearby' })).toBeNull();
  });

  it('closing a goal pushes, so Back reopens it', async () => {
    at('/adverts?goal=nearby');
    await loaded();
    fireEvent.click(within(goalView('Get customers nearby')).getByRole('button', { name: 'Close' }));
    expect(search().get('goal')).toBeNull();
    back();
    expect(search().get('goal')).toBe('nearby');
  });

  it('clicking the open goal tile adds no history entry', async () => {
    at();
    await loaded();
    fireEvent.click(tile(NEARBY));
    fireEvent.click(tile(NEARBY));
    back();
    expect(search().get('goal')).toBeNull();
  });

  it('says when a city has no matching placements', async () => {
    at('/adverts?goal=nearby&city=Kano');
    await loaded();
    expect(within(goalView('Get customers nearby')).getByTestId('no-city-placements').textContent)
      .toBe('No matching placements in Kano yet — these work anywhere.');
  });

  it('says when a budget level has nothing in it, and opens on Free then', async () => {
    PRODUCTS.empty = true;
    at('/adverts?goal=nearby&city=Kano');
    await loaded();
    const region = goalView('Get customers nearby');
    expect(selectedTab(region)).toEqual(['Free']);
    fireEvent.click(within(region).getByRole('tab', { name: 'Starter' }));
    expect(within(region).getByTestId('empty-level').textContent).toBe('Nothing in this budget in Kano yet');
    expect(within(region).getByTestId('level-total').textContent).toBe('Free');
  });

  it('level tabs: Starter by default, arrows, Home and End, one selected', async () => {
    at('/adverts?goal=nearby&city=Lagos');
    await loaded();
    const region = goalView('Get customers nearby');
    const tab = (name: string) => within(region).getByRole('tab', { name });
    await waitFor(() => expect(selectedTab(region)).toEqual(['Starter']));
    expect(tab('Starter').tabIndex).toBe(0);
    expect(tab('Free').tabIndex).toBe(-1);

    const steps: [string, string, string][] = [
      ['Starter', 'ArrowRight', 'Growth'],
      ['Growth', 'ArrowLeft', 'Starter'],
      ['Starter', 'End', 'Campaign'],
      ['Campaign', 'ArrowRight', 'Free'],
      ['Free', 'ArrowLeft', 'Campaign'],
      ['Campaign', 'Home', 'Free'],
    ];
    for (const [from, key, to] of steps) {
      fireEvent.keyDown(tab(from), { key });
      expect(selectedTab(region), `${from} ${key}`).toEqual([to]);
      expect(document.activeElement).toBe(tab(to));
    }
  });

  it('switching goals starts the new goal at its default level', async () => {
    at('/adverts?goal=nearby&city=Lagos');
    await loaded();
    fireEvent.click(within(goalView('Get customers nearby')).getByRole('tab', { name: 'Campaign' }));
    fireEvent.click(tile(SALE));
    expect(selectedTab(goalView('Run a sale or offer'))).toEqual(['Starter']);
  });

  it('says what happened after "Add all to plan"', async () => {
    at('/adverts?goal=nearby&city=Lagos');
    await loaded();
    const region = goalView('Get customers nearby');
    await waitFor(() => expect(selectedTab(region)).toEqual(['Starter']));
    const addAll = () => within(region).getByRole('button', { name: 'Add all to plan' });

    const cases: [PlanOut, ReturnType<typeof vi.fn>, string][] = [
      [{ ok: true, added: 1, skipped: 0 }, toasts.success, 'Added 1 to your plan.'],
      [{ ok: true, added: 2, skipped: 1 }, toasts.success, 'Added 2 to your plan. · 1 already there'],
      [{ ok: true, added: 0, skipped: 1 }, toasts, 'Already in your plan.'],
      [{ ok: false, error: 'We could not load your plans just now.', added: 0 }, toasts.error, 'We could not load your plans just now.'],
    ];
    for (const [out, fn, text] of cases) {
      plan.addAdvertsToPlan.mockResolvedValueOnce(out);
      await waitFor(() => expect(addAll()).not.toBeDisabled());
      fireEvent.click(addAll());
      await waitFor(() => expect(fn).toHaveBeenLastCalledWith(text));
    }
  });

  it('signed out, the toast says it is kept on this device and offers sign-in', async () => {
    at('/adverts?goal=nearby&city=Lagos');
    await loaded();
    const region = goalView('Get customers nearby');
    await waitFor(() => expect(selectedTab(region)).toEqual(['Starter']));
    plan.addAdvertsToPlan.mockImplementationOnce((list) => plan.real!(list as { id: string; pricing: number | null }[]));
    fireEvent.click(within(region).getByRole('button', { name: 'Add all to plan' }));
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
    // Kept in this browser, and a way to keep it for good: a sign-in link back to this page.
    const { container } = render(<>{toasts.success.mock.calls[0][0]}</>);
    expect(container.textContent).toContain('Added to your plan on this device. Sign in to keep it.');
    const link = within(container).getByRole('link', { name: 'Sign in' });
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    expect(link.getAttribute('href')).toBe(`/login?next=${encodeURIComponent(here)}`);
  });

  it('product "Get started" goes to /contact?product=<slug>', async () => {
    at('/adverts?goal=nearby&city=Lagos');
    await loaded();
    const region = goalView('Get customers nearby');
    await waitFor(() => expect(selectedTab(region)).toEqual(['Starter']));
    expect(within(region).getByRole('link', { name: 'Get started with City spotlight' }).getAttribute('href'))
      .toBe('/contact?product=city-spotlight');
    for (const card of screen.getAllByTestId('product-card')) {
      const slug = card.getAttribute('data-product');
      expect(within(card).getByRole('link', { name: /Get started/ }).getAttribute('href')).toBe(`/contact?product=${slug}`);
    }
  });

  it('a request naming no city clears the old one', async () => {
    at('/adverts?goal=nearby&city=Lagos');
    await loaded();
    fireEvent.change(screen.getByLabelText('Describe what you want to achieve'), { target: { value: 'a big sale this weekend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find my mix' }));
    const region = goalView('Run a sale or offer');
    expect(search().get('city')).toBeNull();
    expect(within(region).getByTestId('area-chip').textContent).toContain('All cities');
  });

  it('a city-only request filters the placements, visibly, and keeps the tiles', async () => {
    at();
    await loaded();
    fireEvent.change(screen.getByLabelText('Describe what you want to achieve'), { target: { value: 'in Abuja please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find my mix' }));
    expect(screen.getByTestId('promote-no-match').textContent).toBe('Showing placements in Abuja. Pick a goal to see a plan.');
    expect(screen.getAllByTestId('goal-tile')).toHaveLength(6);
    expect(document.getElementById('promote-goal')).toBeNull();
    expect(search().get('city')).toBe('Abuja');
    expect((screen.getByLabelText('Filter by location') as HTMLInputElement).value).toBe('Abuja');
    const cards = screen.getAllByTestId('placement-card');
    expect(cards).toHaveLength(ADVERTS.filter((a) => a.location.startsWith('Abuja')).length);
  });

  it('medium chips are one row that scrolls sideways on a phone', async () => {
    at();
    await loaded();
    const row = screen.getByTestId('medium-chips');
    expect(row.className).toContain('overflow-x-auto');
    expect(row.className).not.toMatch(/(^|\s)flex-wrap/);
  });
});

describe('the Promote hub, old links and SEO', () => {
  const where = (url: string) => render(
    <MemoryRouter initialEntries={[url]}>
      <HashProbe />
      <Routes>
        <Route path="/advertise" element={<AdvertiseRedirect />} />
        <Route path="/advertise/plan" element={<MediaPlan />} />
        <Route path="/advertise/plan/:id" element={<MediaPlan />} />
        <Route path="/adverts" element={<Adverts />} />
      </Routes>
    </MemoryRouter>,
  );
  function HashProbe() {
    const l = useLocation();
    return <div data-testid="where">{l.pathname + l.hash}</div>;
  }

  it('redirects advertise links into the hub', async () => {
    where('/advertise');
    expect(screen.getByTestId('where').textContent).toBe('/adverts#on-nowopen');
    cleanup();
    where('/advertise#preview');
    expect(screen.getByTestId('where').textContent).toBe('/adverts#preview');
    await loaded();
    // Both anchors exist on the hub, so the hash has something to scroll to.
    expect(document.getElementById('on-nowopen')).not.toBeNull();
    expect(document.getElementById('preview')).not.toBeNull();
  });

  it('crawler snapshot is honest', () => {
    const snap = marketingPageFor('/adverts')!;
    const text = [snap.title, snap.description, snap.h1, ...snap.paragraphs].join(' ');
    expect(snap.h1).toBe('What do you want to achieve?');
    expect(text).not.toMatch(/guaranteed/i);
    expect(text).not.toMatch(/reach/i);
    expect(text).not.toMatch(/\bbook/i);
    expect(marketingPageFor('/advertise')).toBeFalsy();
  });

  it('plan route still renders', async () => {
    where('/advertise/plan');
    expect(screen.getByTestId('where').textContent).toBe('/advertise/plan');
    const link = await screen.findByRole('link', { name: /Back to Promote/ });
    expect(link.getAttribute('href')).toBe('/adverts');
  });

  it('the area controls meet the 44px touch minimum in explicit px', async () => {
    at('/adverts?goal=nearby');
    await loaded();
    const region = goalView('Get customers nearby');
    const btn = within(region).getByRole('button', { name: /Use my location/ });
    expect(btn.className).toContain('min-h-[44px]');
    expect(btn.className).toContain('min-w-[44px]');
  });
});

describe('the Promote hub, final fixes', () => {
  afterEach(() => { geo.city = 'Abuja'; });
  const tile = (slug: string) => screen.getAllByTestId('goal-tile').find((t) => t.getAttribute('data-goal') === slug)!;
  const ask = (text: string) => {
    fireEvent.change(screen.getByLabelText('Describe what you want to achieve'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Find my mix' }));
  };

  it('closing a goal hands focus back to its tile', async () => {
    at();
    await loaded();
    fireEvent.click(tile('sale'));
    fireEvent.click(within(goalView('Run a sale or offer')).getByRole('button', { name: 'Close' }));
    expect(document.getElementById('promote-goal')).toBeNull();
    expect(document.activeElement).toBe(tile('sale'));
  });

  it('"Use my location" files a district under its city', async () => {
    geo.city = 'Ikeja';
    at('/adverts?goal=nearby');
    await loaded();
    const region = goalView('Get customers nearby');
    fireEvent.click(within(region).getByRole('button', { name: /Use my location/ }));
    await waitFor(() => expect(search().get('city')).toBe('Lagos'));
    expect(within(region).getByTestId('area-chip').textContent).toContain('Lagos');
    expect(within(region).queryByTestId('no-city-placements')).toBeNull();
  });

  it('a stock placement photo says so on the card; a real one does not', async () => {
    at();
    await loaded();
    const card = (id: string) => screen.getAllByTestId('placement-card')
      .find((c) => within(c).queryByRole('link', { name: ADVERTS.find((a) => a.id === id)!.title }))!;
    expect(within(card('sf1')).getByTestId('stock-photo-caption').textContent).toBe('Stock photo — not this site');
    expect(within(card('bb1')).queryByTestId('stock-photo-caption')).toBeNull();
  });

  it('a city-only request with a goal open just changes the area', async () => {
    at('/adverts?goal=nearby');
    await loaded();
    ask('in Lagos please');
    expect(search().get('goal')).toBe('nearby');
    expect(search().get('city')).toBe('Lagos');
    expect(screen.queryByTestId('promote-no-match')).toBeNull();
  });

  it('picking a tile clears the request note', async () => {
    at();
    await loaded();
    ask('zzzz');
    expect(screen.getByTestId('promote-no-match').textContent).toContain('could not match');
    fireEvent.click(tile('event'));
    expect(screen.queryByTestId('promote-no-match')).toBeNull();
  });

  it('a ?city= with no goal filters Out in the world; ?location= still does', async () => {
    at('/adverts?city=Abuja');
    await loaded();
    const abuja = ADVERTS.filter((a) => a.location.startsWith('Abuja')).length;
    expect(screen.getAllByTestId('placement-card')).toHaveLength(abuja);
    cleanup();
    at('/adverts?location=Abuja');
    await loaded();
    expect(screen.getAllByTestId('placement-card')).toHaveLength(abuja);
  });
});

describe('the Promote hub, Partner portal', () => {
  /*
   * advertisements is publicly readable, so an unverified owner's new
   * placement (lifecycle pending_review) arrives with every other row. It
   * must not appear anywhere on the hub until an admin approves it.
   */
  it('never lists a pending_review placement', async () => {
    const waiting = {
      id: 'pr-wait', title: 'Ikeja waiting unipole', category: 'Billboard', location: 'Lagos, Nigeria',
      pricing: 8, dimensions: '12m × 6m', status: 'active', created_at: '2026-10-01', lifecycle: 'pending_review',
    };
    (ADVERTS as Record<string, unknown>[]).push(waiting);
    try {
      at();
      await loaded();
      fireEvent.click(within(screen.getByTestId('medium-chips')).getByRole('button', { name: /Outdoor & OOH/ }));
      const titles = screen.getAllByTestId('placement-card').map((c) => c.textContent ?? '');
      // Control: the live Billboard in the same city is listed.
      expect(titles.some((t) => t.includes('Third Mainland unipole'))).toBe(true);
      expect(titles.some((t) => t.includes('Ikeja waiting unipole'))).toBe(false);
      expect(screen.queryByText('Ikeja waiting unipole')).toBeNull();
    } finally {
      ADVERTS.splice(ADVERTS.indexOf(waiting as never), 1);
    }
  });
});
