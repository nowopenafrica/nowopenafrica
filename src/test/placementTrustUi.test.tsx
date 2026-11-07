import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The trust label, the availability line and the price basis, as a visitor
 * reads them on the Promote surfaces: a placement card, a goal-view row, the
 * placement page and a plan line. The database is mocked; nothing here
 * writes a row (the dev database is production).
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  advert: null as Record<string, unknown> | null,
  trust: [] as Array<Record<string, unknown>>,
  trustError: false,
  trustCalls: 0,
  /** When set, trust reads wait on it: the "still loading" state. */
  hold: null as Promise<void> | null,
}));

vi.mock('../lib/supabase', () => {
  const chain = (table: string): any => {
    let ids: string[] | null = null;
    const result = () => {
      if (table !== 'placement_trust') return { data: [], error: null };
      db.trustCalls += 1;
      if (db.trustError) return { data: null, error: { message: 'boom' } };
      return { data: db.trust.filter((r) => !ids || ids.includes(r.advert_id as string)), error: null };
    };
    const c: any = {
      select: () => c, eq: () => c, neq: () => c, not: () => c, order: () => c, limit: () => c, range: () => c,
      in: (_col: string, v: string[]) => { ids = v; return c; },
      single: async () => (table === 'advertisements' ? { data: db.advert, error: null } : { data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (ok?: any, no?: any) =>
        (table === 'placement_trust' && db.hold ? db.hold : Promise.resolve()).then(result).then(ok, no),
    };
    return c;
  };
  return {
    supabase: {
      from: (t: string) => chain(t),
      rpc: async () => ({ data: null, error: null }),
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    },
  };
});
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({
    currency: 'USD', format: (n: number) => `$${n}`, formatUsd: (n: number) => `$${n}`, ngnPerUsd: 1500,
  }),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('../components/promote/AdPreviewStudio', () => ({ default: () => null }));
vi.mock('../lib/telemetry', () => ({ track: () => {} }));

const plan = vi.hoisted(() => ({
  lines: [] as Array<Record<string, unknown>>,
}));
vi.mock('../lib/promote/campaigns', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/promote/campaigns')>();
  return {
    ...real,
    addAdvertsToPlan: vi.fn(),
    fetchCampaigns: async () => ({
      state: 'ready',
      campaigns: [{ id: 'c1', name: 'My plan', objective: null, audience: null, startsOn: null, endsOn: null, budget: null, currency: 'NGN', status: 'draft', updatedAt: '2026-10-31' }],
    }),
    fetchPlanLines: async () => plan.lines,
  };
});

import MediumBrowser from '../components/promote/MediumBrowser';
import GoalView from '../components/promote/GoalView';
import AdvertDetail from '../pages/AdvertDetail';
import MediaPlan from '../pages/MediaPlan';
import { buildMix } from '../lib/promote/mix';
import { goalBySlug } from '../lib/promote/goals';
import type { PlacementTrust } from '../lib/promote/trust';
import type { Advertisement } from '../types';

afterEach(() => {
  cleanup();
  db.advert = null;
  db.trust = [];
  db.trustError = false;
  db.trustCalls = 0;
  db.hold = null;
  plan.lines = [];
});

const AID = '11111111-1111-1111-1111-111111111111';
const advert = (id = AID, over: Partial<Advertisement> = {}): Advertisement => ({
  id, title: `Bus shelter ${id.slice(0, 4)}`, description: '', category: 'Street Furniture',
  location: 'Lagos, Nigeria', pricing: 1, dimensions: '6m x 3m', status: 'active', ...over,
});
const trustRow = (advertId: string, over: Row = {}): Row => ({
  advert_id: advertId, trust_label: 'source_listed', availability: 'requires_confirmation',
  availability_confirmed_at: null, availability_valid_until: null, period_to: null,
  owner_name: null, owner_website: null, price_basis: 'source_listed', price_as_of: null,
  period_from: null, confirmed_by_name: null, confirmation_method: null, ...over,
});
/** The same row as the page holds it after fetchPlacementTrust. */
const trustOf = (r: Row): PlacementTrust => ({
  advertId: r.advert_id as string,
  trustLabel: r.trust_label as PlacementTrust['trustLabel'],
  availability: r.availability as PlacementTrust['availability'],
  availabilityConfirmedAt: (r.availability_confirmed_at as string) ?? null,
  periodFrom: (r.period_from as string) ?? null,
  periodTo: (r.period_to as string) ?? null,
  confirmedByName: (r.confirmed_by_name as string) ?? null,
  confirmationMethod: null,
  ownerName: (r.owner_name as string) ?? null,
  ownerWebsite: (r.owner_website as string) ?? null,
  priceBasis: (r.price_basis as PlacementTrust['priceBasis']) ?? null,
  priceAsOf: null,
});

const browser = (adverts: Advertisement[], trust?: Map<string, PlacementTrust>) => render(
  <MemoryRouter><MediumBrowser adverts={adverts} loading={false} error={null} trust={trust} /></MemoryRouter>,
);
const goalView = (adverts: Advertisement[], trust?: Map<string, PlacementTrust>) => {
  const goal = goalBySlug('nearby')!;
  const mix = buildMix(goal, { products: [], adverts, city: 'Lagos', ngnPerUsd: 1500, trust });
  return render(
    <MemoryRouter>
      <GoalView goal={goal} mix={mix} city="Lagos" cities={['Lagos']} placementsLoading={false} onCity={() => {}} onClose={() => {}} trust={trust} />
    </MemoryRouter>,
  );
};
const detail = async (a: Advertisement) => {
  db.advert = a as unknown as Row;
  const view = render(
    <MemoryRouter initialEntries={[`/adverts/${a.id}`]}>
      <Routes><Route path="/adverts/:id" element={<AdvertDetail />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { level: 1, name: a.title });
  return view;
};

/* With no trust row (loading, failed, or none) the basis is unknown: "indicative", and no rate-card claim. */
const HONEST = ['Source listed', 'Availability requires confirmation', 'indicative'];
const RATE_CARD = 'indicative · published rate card';

describe('placement trust on Promote', () => {
  it('imported placement reads honestly', async () => {
    const a = advert();

    const card = browser([a], new Map());
    const cardText = card.getByTestId('placement-card').textContent ?? '';
    for (const s of HONEST) expect(cardText).toContain(s);
    expect(cardText).not.toContain('published rate card');
    // One clear statement per price: "indicative" once on the card.
    expect(cardText.match(/indicative/g)).toHaveLength(1);
    cleanup();

    // With its source_listed row, the rate card is named, still one "indicative".
    const listed = browser([a], new Map([[AID, trustOf(trustRow(AID))]]));
    const listedText = listed.getByTestId('placement-card').textContent ?? '';
    expect(listedText).toContain(RATE_CARD);
    expect(listedText.match(/indicative/g)).toHaveLength(1);
    cleanup();

    const goal = goalView([a], new Map());
    const panel = goal.container.querySelector('#level-panel') as HTMLElement;
    expect(within(panel).getAllByTestId('placement-price').length).toBeGreaterThan(0);
    for (const s of HONEST) expect(panel.textContent).toContain(s);
    cleanup();

    const page = await detail(a);
    // Before and after the trust read resolves, the page says the honest thing.
    await waitFor(() => expect(db.trustCalls).toBeGreaterThan(0));
    for (const s of HONEST) expect(page.container.textContent).toContain(s);
  });

  it('a priced placement with no pricing source never claims a published rate card', () => {
    const a = advert();
    const card = browser([a], new Map([[AID, trustOf(trustRow(AID, { price_basis: null }))]]));
    const text = card.getByTestId('placement-price').textContent ?? '';
    expect(text).toMatch(/per day · indicative$/);
    expect(text).not.toContain('rate card');
  });

  it('verified and confirmed reads so, naming the owner who confirmed', async () => {
    db.trust = [trustRow(AID, {
      trust_label: 'partner_verified', availability: 'confirmed_available',
      availability_confirmed_at: '2026-11-03T12:00:00Z', owner_name: 'Acme Outdoor', confirmed_by_name: 'Acme Outdoor',
    })];
    const page = await detail(advert());
    await waitFor(() => expect(page.container.textContent).toContain('Partner verified'));
    expect(page.container.textContent).toContain('Available · confirmed 3 Nov 2026 by Acme Outdoor');
    expect(page.container.textContent).not.toContain('Source listed');
  });

  it('an admin check on a linked placement is never attributed to the owner', async () => {
    db.trust = [trustRow(AID, {
      trust_label: 'partner_supplied', availability: 'confirmed_available',
      availability_confirmed_at: '2026-11-03T12:00:00Z', owner_name: 'Acme Outdoor',
      confirmed_by_name: null, confirmation_method: 'admin',
    })];
    const page = await detail(advert());
    await waitFor(() => expect(page.container.textContent).toContain('Available · confirmed 3 Nov 2026'));
    expect(page.container.textContent).not.toContain('by Acme Outdoor');
  });

  it("a future period reads 'Available from', never 'Available' now", async () => {
    db.trust = [trustRow(AID, {
      trust_label: 'partner_verified', availability: 'available_from', period_from: '2027-03-01',
      availability_confirmed_at: '2026-11-03T12:00:00Z', confirmed_by_name: 'Acme Outdoor',
    })];
    const page = await detail(advert());
    await waitFor(() => expect(page.container.textContent).toContain('Available from 1 Mar 2027 · confirmed 3 Nov 2026'));
    expect(page.container.textContent).not.toContain('Available ·');
  });

  it("links the verified owner's website on the placement page, and only then", async () => {
    db.trust = [trustRow(AID, {
      trust_label: 'partner_verified', owner_name: 'Acme Outdoor', owner_website: 'https://acme.example',
    })];
    const page = await detail(advert());
    const link = await screen.findByRole('link', { name: /Acme Outdoor/ });
    expect(link.getAttribute('href')).toBe('https://acme.example');
    expect(link.getAttribute('rel')).toContain('noopener');
    cleanup();
    void page;

    db.trust = [trustRow(AID, {
      trust_label: 'partner_supplied', owner_name: 'Acme Outdoor', owner_website: 'https://acme.example',
    })];
    db.trustCalls = 0;
    await detail(advert());
    await waitFor(() => expect(screen.getByText('Partner supplied')).toBeTruthy());
    expect(screen.queryByRole('link', { name: /Acme Outdoor/ })).toBeNull();
  });

  it('the browser and the mix leave out rejected and archived placements', () => {
    const live = advert(AID);
    const archived = advert('22222222-2222-2222-2222-222222222222', { lifecycle: 'archived' });
    const rejected = advert('33333333-3333-3333-3333-333333333333', { lifecycle: 'rejected' });
    browser([live, archived, rejected], new Map());
    expect(screen.getAllByTestId('placement-card')).toHaveLength(1);
    expect(screen.queryByText(archived.title)).toBeNull();
    expect(screen.queryByText(rejected.title)).toBeNull();
    cleanup();

    goalView([archived, rejected], new Map());
    expect(screen.queryByText(archived.title)).toBeNull();
    expect(screen.queryByText(rejected.title)).toBeNull();
  });

  it('the hub filters the placements it loads (one read feeds the browser and the mix)', () => {
    const src = readFileSync('src/pages/Adverts.tsx', 'utf8');
    expect(src).toMatch(/isListedPlacement/);
    expect(src).toMatch(/\.filter\(isListedPlacement\)/);
  });

  it('never available without confirmation', async () => {
    const states: Row[] = [
      { availability: 'confirmed_available', availability_confirmed_at: '2026-11-03T12:00:00Z', owner_name: 'Acme Outdoor' },
      { availability: 'confirmed_available', availability_confirmed_at: null },
      { availability: 'booked', period_to: '2026-12-01' },
      { availability: 'unavailable' },
      { availability: 'maintenance' },
      { availability: 'requires_confirmation' },
      { availability: 'available_from', period_from: '2027-03-01', availability_confirmed_at: '2026-11-03T12:00:00Z' },
    ];
    const rows = (['source_listed', 'partner_verified'] as const).flatMap((label, li) =>
      states.map((s, si) => trustRow(`${li}${si}000000-0000-0000-0000-000000000000`, { trust_label: label, ...s })));
    expect(rows).toHaveLength(14);
    const ads = rows.map((r) => advert(r.advert_id as string));
    const confirmed = (r: Row) => r.availability === 'confirmed_available' && r.availability_confirmed_at != null;
    // "Available ·" is the claim of availability NOW; "Available from <date>" is not.
    const saysAvailable = (root: Element) =>
      [...root.querySelectorAll('*')].some((el) => /^Available ·/.test((el.textContent ?? '').trim()));

    browser(ads, new Map(rows.map((r) => [r.advert_id as string, trustOf(r)])));
    for (const card of screen.getAllByTestId('placement-card')) {
      const r = rows.find((x) => card.textContent?.includes((ads.find((a) => a.id === x.advert_id) as Advertisement).title))!;
      expect(saysAvailable(card), String(r.advert_id)).toBe(confirmed(r));
    }
    cleanup();

    db.trust = rows;
    for (const r of rows) {
      const page = await detail(ads.find((a) => a.id === r.advert_id)!);
      await waitFor(() => expect(db.trustCalls).toBeGreaterThan(0));
      await waitFor(() => expect(page.container.textContent).toContain(r.trust_label === 'partner_verified' ? 'Partner verified' : 'Source listed'));
      expect(saysAvailable(page.container), String(r.advert_id)).toBe(confirmed(r));
      cleanup();
      db.trustCalls = 0;
    }
  });

  it('never says Available while the trust read is pending', async () => {
    db.trust = [trustRow(AID, { trust_label: 'partner_verified', availability: 'confirmed_available', availability_confirmed_at: '2026-11-03T12:00:00Z' })];
    let release!: () => void;
    db.hold = new Promise<void>((r) => { release = r; });
    const page = await detail(advert());
    // The advert is on screen; the trust read has not answered.
    expect(db.trustCalls).toBe(0);
    for (const s of HONEST) expect(page.container.textContent).toContain(s);
    expect(page.container.textContent).not.toMatch(/Available ·|Partner verified/);
    release();
    await waitFor(() => expect(page.container.textContent).toContain('Available · confirmed 3 Nov 2026'));
  });

  it('the legacy available_until column never states availability', async () => {
    // No trust row: the page reads IMPORTED_FALLBACK, and the old column must not contradict it.
    const page = await detail(advert(AID, { available_until: '2026-12-31', duration: 30 }));
    await waitFor(() => expect(db.trustCalls).toBeGreaterThan(0));
    expect(page.container.textContent).toContain('Availability requires confirmation');
    expect(page.container.textContent).not.toMatch(/Available until/i);
    expect(page.container.textContent).not.toMatch(/31\/12\/2026|12\/31\/2026|2026-12-31|31 Dec 2026/);
  });

  it('falls back to the honest default when the trust read fails', async () => {
    db.trustError = true;
    const page = await detail(advert());
    await waitFor(() => expect(db.trustCalls).toBeGreaterThan(0));
    for (const s of HONEST) expect(page.container.textContent).toContain(s);
  });

  it('plan line for an archived placement', async () => {
    db.trust = [trustRow('live-1')];
    const line = (id: string, advertId: string, title: string) => ({
      id, advertId, title, type: null, location: null, dimensions: null, days: 30,
      ratePerDay: 1, priceBasis: 'indicative', currency: 'NGN', artworkUrl: null,
    });
    // 'gone-1' has no trust row and no advert row (fetchPlanLines' "Placement" default).
    plan.lines = [line('l1', 'live-1', 'Allen Avenue shelter'), line('l2', 'gone-1', 'Placement')];
    render(<MemoryRouter><MediaPlan /></MemoryRouter>);
    const gone = await screen.findByText('No longer listed');
    expect(gone.closest('li')?.textContent).toContain('Placement');
    expect(screen.getAllByText('No longer listed')).toHaveLength(1);
  });

  it('an all-archived plan shows No longer listed on every line', async () => {
    db.trust = [];
    plan.lines = [planLine('l1', 'gone-1', 'Old shelter'), planLine('l2', 'gone-2', 'Old gantry')];
    render(<MemoryRouter><MediaPlan /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText('No longer listed')).toHaveLength(2));
    for (const t of ['Old shelter', 'Old gantry']) {
      expect(screen.getByText(t).closest('li')?.textContent).toContain('No longer listed');
    }
    expect(screen.queryByText('Listing status could not be checked just now')).toBeNull();
  });

  it('a failed trust read shows the note and no line is called delisted', async () => {
    db.trustError = true;
    plan.lines = [planLine('l1', 'live-1', 'Allen Avenue shelter'), planLine('l2', 'gone-1', 'Old gantry')];
    render(<MemoryRouter><MediaPlan /></MemoryRouter>);
    await screen.findByText('Listing status could not be checked just now');
    expect(screen.queryByText('No longer listed')).toBeNull();
    // Every line reads as the imported default.
    for (const t of ['Allen Avenue shelter', 'Old gantry']) {
      const li = screen.getByText(t).closest('li')!;
      expect(li.textContent).toContain('Source listed');
      expect(li.textContent).toContain('Availability requires confirmation');
    }
  });
});

const planLine = (id: string, advertId: string, title: string) => ({
  id, advertId, title, type: null, location: null, dimensions: null, days: 30,
  ratePerDay: 1, priceBasis: 'indicative', currency: 'NGN', artworkUrl: null,
});

describe('availability has one source on Promote', () => {
  it('no Promote surface reads available_until or available_from', () => {
    const surfaces = [
      'src/components/promote/MediumBrowser.tsx', 'src/components/promote/GoalView.tsx',
      'src/components/promote/PlacementLine.tsx', 'src/pages/Adverts.tsx',
      'src/pages/AdvertDetail.tsx', 'src/pages/MediaPlan.tsx',
    ];
    const offenders = surfaces.filter((f) => /available_(until|from)/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('one string source', () => {
  it('one string source', () => {
    const roots = ['src/components', 'src/pages'];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(name)) files.push(p);
      }
    };
    roots.forEach(walk);
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((f) => /partner verified|requires confirmation/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
