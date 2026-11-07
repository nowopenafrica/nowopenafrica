/**
 * NowOpen Create — the rules that must not quietly stop holding.
 *
 * Two of these guard against the specific failure a creation hub invites: a
 * confident tile that leads nowhere. The rest guard the auth handoff, which is
 * the only part of this feature that can lose somebody's work.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  CREATE_ACTIONS, ACTIONS_BY_TYPE, actionsByProminence,
  permissionFor, permissionMessage, type CreateAction,
} from '../lib/universalCreate/intents';
import {
  rememberIntent, takePendingIntent, hasPendingIntent, clearPendingIntent,
} from '../lib/universalCreate/pendingIntent';

/**
 * Every route the app actually serves, from App.tsx. Kept here deliberately:
 * if a destination is renamed in the router, this list stops matching and the
 * test below fails, which is the point.
 */
/**
 * The dashboard's real tabs, from the TabId union in src/pages/Dashboard.tsx.
 * Anything else silently renders Overview.
 */
const DASHBOARD_TABS = new Set(['overview', 'businesses', 'adverts', 'media', 'inbox']);

/** The `?open=` values Dashboard.tsx actually handles. */
const DASHBOARD_PANELS = new Set(['content', 'offers', 'live', 'team', 'trust', 'form']);

/** ModuleKey from src/lib/studioHubs.ts — what /studio?module= accepts. */
const STUDIO_MODULES = new Set([
  'home', 'brand-kit', 'card', 'design', 'video', 'social', 'copywriter', 'assistant',
  'campaigns', 'promotions', 'live-promo', 'planner', 'landing',
  'quotations', 'invoices', 'receipts', 'catalogues', 'customers', 'keeps', 'loyalty',
  'health', 'analytics', 'challenges', 'media', 'export', 'enrichment',
]);

const REAL_ROUTES = new Set([
  '/', '/add-business', '/adverts', '/dashboard', '/studio', '/media', '/offers',
  // /create/:type, which CreateRoute serves.
  '/create', '/create/reel',
]);

const action = (over: Partial<CreateAction> = {}): CreateAction => ({
  type: 'offer', label: 'Open an Offer', description: '', icon: 'Tag',
  audience: 'business_owner', destination: '/dashboard?tab=offers',
  buildable: true, prominence: 'secondary', ...over,
});

describe('no tile may lead nowhere', () => {
  it('gives every buildable action a destination', () => {
    // The failure this prevents: a tile that looks ready and opens a 404.
    for (const a of CREATE_ACTIONS) {
      if (a.buildable) {
        expect(a.destination, `${a.type} is buildable with no destination`).toBeTruthy();
      }
    }
  });

  it('points every destination at a route the app actually serves', () => {
    for (const a of CREATE_ACTIONS) {
      if (!a.destination) continue;
      const path = a.destination.split('?')[0];
      expect(REAL_ROUTES.has(path), `${a.type} -> ${path} is not a route in App.tsx`).toBe(true);
    }
  });

  it('names a dashboard tab that exists', () => {
    /*
     * ── THE ONE THAT GOT THROUGH ───────────────────────────────────────
     *
     * MEASURED 2026-10-06, after this shipped: five actions pointed at
     * ?tab=services, ?tab=content, ?tab=offers, ?tab=live and ?tab=locations.
     * Dashboard.tsx defines exactly five tabs and falls back to 'overview' for
     * anything else WITHOUT complaining, so all five tiles quietly dropped
     * people on the Overview panel.
     *
     * The test above passed throughout, because it checked the path and threw
     * the query string away. A destination is the whole string; validating
     * half of it proves half of nothing.
     */
    for (const a of CREATE_ACTIONS) {
      if (!a.destination?.startsWith('/dashboard')) continue;
      const tab = new URLSearchParams(a.destination.split('?')[1] ?? '').get('tab');
      if (tab === null) continue; // no tab means the default, which is valid
      expect(DASHBOARD_TABS.has(tab), `${a.type} -> ?tab=${tab} is not a tab in Dashboard.tsx`).toBe(true);
    }
  });

  it('makes an unbuildable action explain itself instead of navigating', () => {
    for (const a of CREATE_ACTIONS) {
      if (a.buildable) continue;
      // Both halves matter: no destination to navigate to, and words saying why.
      expect(a.destination, `${a.type} is not buildable but has a destination`).toBeNull();
      expect(a.comingNote, `${a.type} is not buildable and says nothing`).toBeTruthy();
    }
  });

  it('still lists event and ai, rather than hiding what is missing', () => {
    /*
     * They are deliberately present and deliberately not clickable. Hiding
     * them would make the hub look complete; a tile that says "not yet" tells
     * somebody the truth about where the product is going.
     */
    expect(ACTIONS_BY_TYPE.event?.buildable).toBe(false);
    expect(ACTIONS_BY_TYPE.ai?.buildable).toBe(false);
  });

  it('opens the camera in place rather than navigating away', () => {
    /*
     * "Record an OpenReel" used to land on /dashboard?tab=businesses, from
     * which somebody still had to find their business, open the content
     * manager, find the gallery tab and press a camera button — four steps
     * after they had already said what they wanted.
     *
     * The destination must still be a REAL route (the deep link, and the
     * no-dead-tile rule), but the hub runs it without going there.
     */
    const reel = ACTIONS_BY_TYPE.reel;
    expect(reel.opensInPlace).toBe(true);
    expect(reel.destination).toBe('/create/reel');
  });

  it('never marks a navigating action as in-place, or vice versa', () => {
    for (const a of CREATE_ACTIONS) {
      if (a.opensInPlace) {
        // An in-place action whose destination went elsewhere would make the
        // deep link and the tile do two different things.
        expect(a.destination, `${a.type} opens in place but points elsewhere`)
          .toBe(`/create/${a.type}`);
      }
    }
  });

  it('opens the panel itself, not the screen the panel lives on', () => {
    /*
     * The whole point of the second correction. "Add a Service" pointing at
     * the business LIST is true and useless: find your business, press
     * Content, find Services — three steps after somebody said what they
     * wanted. Every dashboard action must name a panel Dashboard can open.
     */
    const dashboardActions = CREATE_ACTIONS.filter(
      (a) => a.buildable && a.destination?.startsWith('/dashboard'),
    );
    expect(dashboardActions.length).toBeGreaterThan(0);

    for (const a of dashboardActions) {
      const q = new URLSearchParams(a.destination!.split('?')[1] ?? '');
      const open = q.get('open');
      expect(open, `${a.type} lands on the dashboard without opening anything`).toBeTruthy();
      expect(DASHBOARD_PANELS.has(open!), `${a.type} -> ?open=${open} is not a panel Dashboard handles`).toBe(true);
    }
  });

  it('names a content tab that exists when it asks for one', () => {
    for (const a of CREATE_ACTIONS) {
      const q = new URLSearchParams(a.destination?.split('?')[1] ?? '');
      const panel = q.get('panel');
      if (!panel) continue;
      // ContentTab in BusinessContentManager. A tab it does not know falls
      // back to enquiries, which is the silent-wrong-panel bug again.
      expect(['enquiries', 'services', 'products', 'gallery', 'reviews', 'locations'])
        .toContain(panel);
    }
  });

  /*
   * Products were the gap the hub could not answer for a shop, a restaurant,
   * a pharmacy or a car dealer: they sell things, and the tiles offered them a
   * service form and a gallery. The products panel has existed all along, so
   * this tile has to open it — not the business list, and not the content
   * manager's default tab.
   */
  it('offers Add a Product, opening the products panel itself', () => {
    const product = ACTIONS_BY_TYPE.product;
    expect(product, 'there is no Add a Product tile in the hub').toBeTruthy();
    expect(product.buildable).toBe(true);
    expect(product.destination).toBe('/dashboard?tab=businesses&open=content&panel=products');
    // Behind "More" it would be as hidden as it was before the tile existed.
    expect(product.prominence).not.toBe('more');
  });

  it('offers OpenReel, reachable without expanding More', () => {
    const reel = ACTIONS_BY_TYPE.reel;
    expect(reel, 'OpenReel is not in the hub').toBeTruthy();
    expect(reel.buildable).toBe(true);
    // Hidden behind "More" it would be no more findable than it already was
    // inside the content manager, which is the reason for adding it.
    expect(reel.prominence).not.toBe('more');
  });

  it('keeps the hub from opening as a wall of equal tiles', () => {
    // Progressive disclosure is a stated requirement, not a preference.
    expect(actionsByProminence('primary').length).toBeLessThanOrEqual(5);
    expect(actionsByProminence('more').length).toBeGreaterThan(0);
  });
});

describe('permissions answer with a next step, not a refusal', () => {
  const guest = { signedIn: false, hasBusiness: false };
  const user = { signedIn: true, hasBusiness: false };
  const owner = { signedIn: true, hasBusiness: true };

  it('lets a signed-out visitor open a business', () => {
    // /add-business is the public funnel — gating it would lose the person
    // with the highest intent on the platform.
    expect(permissionFor(ACTIONS_BY_TYPE.business, guest)).toBe('allowed');
  });

  it('asks a guest to sign in rather than refusing outright', () => {
    const p = permissionFor(action(), guest);
    expect(p).toBe('needs_auth');
    // The message has to promise the return trip, because that is what makes
    // the interruption acceptable.
    expect(permissionMessage(p, action())).toMatch(/bring you (straight )?back/i);
  });

  it('tells a signed-in user with no business what is missing', () => {
    const p = permissionFor(action(), user);
    expect(p).toBe('needs_business');
    expect(permissionMessage(p, action())).toMatch(/business/i);
  });

  it('allows an owner', () => {
    expect(permissionFor(action(), owner)).toBe('allowed');
  });

  it('reports not_built before anything else', () => {
    // An owner must not be told to sign in for something that does not exist.
    const a = action({ buildable: false, destination: null, comingNote: 'Not yet.' });
    expect(permissionFor(a, owner)).toBe('not_built');
    expect(permissionFor(a, guest)).toBe('not_built');
  });
});

describe('the auth handoff', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('carries the destination across a sign-in', () => {
    rememberIntent({ type: 'offer', source: 'universal_create' }, '/dashboard?tab=offers');
    expect(hasPendingIntent()).toBe(true);
    expect(takePendingIntent()?.destination).toBe('/dashboard?tab=offers');
  });

  it('clears on read, so it cannot fire again later', () => {
    /*
     * An intent left behind would redirect the NEXT sign-in to somewhere the
     * person never asked to go — days later, from a different page.
     */
    rememberIntent({ type: 'ad', source: 'universal_create' }, '/adverts');
    expect(takePendingIntent()).not.toBeNull();
    expect(takePendingIntent()).toBeNull();
  });

  it('refuses an external destination', () => {
    // sessionStorage is writable by any script on the origin, so a stored
    // destination is untrusted input. Honouring one would be an open redirect.
    rememberIntent({ type: 'ad', source: 'universal_create' }, 'https://evil.example/pay');
    expect(takePendingIntent()).toBeNull();

    rememberIntent({ type: 'ad', source: 'universal_create' }, '//evil.example/pay');
    expect(takePendingIntent()).toBeNull();
  });

  it('ignores a stale intent', () => {
    sessionStorage.setItem('nowopen.create.pending', JSON.stringify({
      intent: { type: 'offer', source: 'universal_create' },
      destination: '/dashboard?tab=offers',
      at: Date.now() - 60 * 60 * 1000, // an hour ago
    }));
    expect(takePendingIntent()).toBeNull();
  });

  it('survives unreadable storage instead of throwing', () => {
    /*
     * Private windows and blocked site data make these throw. Losing the
     * destination is acceptable; throwing on the way back from a SUCCESSFUL
     * sign-in is not — the person would be signed in and looking at an error.
     */
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => takePendingIntent()).not.toThrow();
    expect(takePendingIntent()).toBeNull();
    expect(() => hasPendingIntent()).not.toThrow();
    spy.mockRestore();

    const spy2 = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberIntent({ type: 'offer', source: 'ai' }, '/dashboard')).not.toThrow();
    spy2.mockRestore();
  });

  it('survives corrupt stored data', () => {
    sessionStorage.setItem('nowopen.create.pending', 'not json at all');
    expect(() => takePendingIntent()).not.toThrow();
    expect(takePendingIntent()).toBeNull();
  });

  it('can be forgotten deliberately', () => {
    rememberIntent({ type: 'post', source: 'universal_create' }, '/dashboard?tab=content');
    clearPendingIntent();
    expect(hasPendingIntent()).toBe(false);
  });
});

/*
 * The Radar → Create link.
 *
 * The MATCHING is `claimable_for_me()` in Postgres, proven there against the
 * live database with six assertions including the probe case (an editable
 * profile phone must not match, or anyone could fish for listings by typing
 * numbers). None of that is re-testable here, and a mock asserting it would
 * only test the mock.
 *
 * What IS testable is the wording and the failure behaviour — the two places
 * this could mislead somebody or get in their way.
 */
describe('the claim prompt', () => {
  it('asks rather than asserts', async () => {
    const { claimPromptFor } = await import('../lib/universalCreate/claimable');
    const prompt = claimPromptFor({
      id: 'b1', name: 'Bella Beauty Salon', location: 'Abuja',
      category: 'beauty', imageUrl: null, matchedOn: 'email',
    });

    /*
     * "We found your business" asserts a relationship the platform cannot
     * know — the evidence is one shared contact detail. Getting that wrong
     * means telling somebody a stranger's business is theirs.
     */
    expect(prompt).toMatch(/Is it yours\?$/);
    expect(prompt).not.toMatch(/we found your business/i);
    expect(prompt).toContain('Bella Beauty Salon');
    expect(prompt).toContain('Abuja');
    // Says WHY it appeared, so the prompt is explicable rather than uncanny.
    expect(prompt).toMatch(/your email address/i);
  });

  it('names the phone channel when that is what matched', async () => {
    const { claimPromptFor } = await import('../lib/universalCreate/claimable');
    const prompt = claimPromptFor({
      id: 'b2', name: 'Kaduna Motors', location: null,
      category: null, imageUrl: null, matchedOn: 'phone',
    });
    expect(prompt).toMatch(/your phone number/i);
    // No location, so no dangling " in ".
    expect(prompt).not.toMatch(/\sin\s+(,|and)/);
  });

  it('returns nothing rather than throwing when the lookup fails', async () => {
    /*
     * This is a helpful extra on a screen whose job is something else. A
     * failed lookup must not stop somebody creating a business.
     */
    vi.resetModules();
    vi.doMock('../lib/supabase', () => ({
      supabase: { rpc: vi.fn(async () => ({ data: null, error: { message: 'down' } })) },
    }));
    const { fetchClaimableForMe } = await import('../lib/universalCreate/claimable');
    await expect(fetchClaimableForMe()).resolves.toEqual([]);
    vi.doUnmock('../lib/supabase');
    vi.resetModules();
  });
})


describe('the tools strip', () => {
  it('points every tool at a module Studio actually serves', async () => {
    const { CREATE_TOOLS } = await import('../lib/universalCreate/intents');
    expect(CREATE_TOOLS.length).toBeGreaterThan(0);
    for (const t of CREATE_TOOLS) {
      expect(t.destination.startsWith('/studio?module='), `${t.key} is not a studio link`).toBe(true);
      const key = new URLSearchParams(t.destination.split('?')[1]).get('module');
      // Studio resolves ?module= against ModuleKey and IGNORES anything else,
      // so a wrong key silently lands on the Studio home.
      expect(STUDIO_MODULES.has(key!), `${t.key} -> module=${key} is not a ModuleKey`).toBe(true);
    }
  });

  it('includes the tools a business actually reaches for', async () => {
    const { TOOLS_BY_KEY } = await import('../lib/universalCreate/intents');
    for (const k of ['receipts', 'invoices', 'card', 'design']) {
      expect(TOOLS_BY_KEY[k], `${k} is missing from the tools catalogue`).toBeTruthy();
    }
  });

  it('shows something to somebody who has pinned nothing', async () => {
    const { DEFAULT_PINNED, TOOLS_BY_KEY } = await import('../lib/universalCreate/intents');
    // An empty menu reads as a broken feature to every new owner.
    expect(DEFAULT_PINNED.length).toBeGreaterThan(0);
    for (const k of DEFAULT_PINNED) expect(TOOLS_BY_KEY[k]).toBeTruthy();
  });

  it('keeps the default menu within what the database will accept', async () => {
    const { DEFAULT_PINNED } = await import('../lib/universalCreate/intents');
    // set_create_tool_pins refuses more than 12.
    expect(DEFAULT_PINNED.length).toBeLessThanOrEqual(12);
  });

  it('drops a stale key rather than saving one the catalogue lost', async () => {
    vi.resetModules();
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    vi.doMock('../lib/supabase', () => ({ supabase: { rpc, from: vi.fn() } }));
    const { savePinnedTools } = await import('../lib/universalCreate/pins');
    await savePinnedTools(['receipts', 'a-tool-that-was-removed', 'invoices']);
    expect(rpc).toHaveBeenCalledWith('set_create_tool_pins', { p_keys: ['receipts', 'invoices'] });
    vi.doUnmock('../lib/supabase');
    vi.resetModules();
  });
});
