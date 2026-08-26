// NowOpen Studio — information architecture.
//
// Studio had grown to 17 modules across 8 sibling groups (Growth, Brand,
// Content, Marketing, Sales, Customers, Insights, Manage). Eight peer groups is
// not a menu anyone reads; it's a list you scan and give up on. Worse, the
// groups were named after internal domains rather than after anything a business
// owner wants to DO.
//
// So the modules are unchanged and the shelving is rebuilt. Three hubs, named
// as verbs, matching how the work actually splits:
//
//   Create   — make the thing (designs, brand, pages)
//   Promote  — put it in front of people (social, campaigns, offers)
//   Manage   — run the business behind it (quotes, invoices, customers, assets)
//
// Growth is deliberately NOT a fourth hub. It is the front door — the screen you
// land on, which tells you what to do next and sends you into a hub to do it.
// Demoting it to a peer would make it just another menu item to ignore.
//
// This file is data, not layout, so the IA can be tested. The test that matters
// asserts every module sits in exactly one hub: when three modules were removed
// recently the registry was edited by hand in four places, which is precisely
// how a tool silently becomes unreachable.

export type ModuleKey =
  | 'home' | 'brand-kit' | 'card'
  | 'design' | 'video' | 'social' | 'copywriter' | 'assistant'
  | 'campaigns' | 'promotions' | 'live-promo' | 'planner' | 'landing'
  | 'quotations' | 'invoices' | 'catalogues' | 'loyalty'
  | 'health' | 'analytics' | 'challenges'
  | 'media' | 'export';

export type HubKey = 'create' | 'promote' | 'manage';

export interface Hub {
  key: HubKey;
  label: string;
  /** One line, addressed to the owner — what this hub is for. */
  blurb: string;
  modules: ModuleKey[];
}

/**
 * The three hubs, in the order they're shown.
 *
 * Order within a hub is deliberate: the module someone reaches for most often
 * comes first, so the common case is the top of the list rather than a scan.
 */
export const HUBS: Hub[] = [
  {
    key: 'create',
    label: 'Create',
    blurb: 'Make the thing — designs, your brand, and pages that sell.',
    modules: ['design', 'video', 'brand-kit', 'card', 'landing'],
  },
  {
    key: 'promote',
    label: 'Promote',
    blurb: 'Put it in front of people — social, campaigns and live offers.',
    modules: ['social', 'campaigns', 'live-promo'],
  },
  {
    key: 'manage',
    label: 'Manage',
    blurb: 'Run the business behind it — money, customers, assets and results.',
    modules: ['quotations', 'invoices', 'catalogues', 'loyalty', 'health', 'analytics', 'media', 'export'],
  },
];

/** Shown above the hubs, not inside them. */
export const HOME_MODULES: ModuleKey[] = ['home', 'challenges'];

/**
 * Modules reachable only by deep link or redirect — merged into a bigger tool
 * but kept resolvable so old links and emailed brand kits don't 404.
 */
export const HIDDEN_MODULES: ModuleKey[] = ['promotions', 'planner', 'copywriter', 'assistant'];

/** Which hub a module lives in, or undefined for home/hidden modules. */
export function hubOf(key: ModuleKey): HubKey | undefined {
  return HUBS.find((h) => h.modules.includes(key))?.key;
}

// --- The intent launcher -----------------------------------------------------

/**
 * "What do you want to create today?"
 *
 * The point of these is that they are phrased as OUTCOMES, not tool names. A
 * business owner does not wake up wanting to open a "Brand OS"; they want a
 * poster for Saturday. Each tile names the outcome and quietly routes to the
 * module that produces it.
 *
 * Every target is a module that exists and is wired up today. Nothing here is a
 * placeholder — a tile that opens an empty page is worse than no tile.
 */
export interface Intent {
  id: string;
  label: string;
  /** What the owner gets, in their words. */
  outcome: string;
  target: ModuleKey;
}

export const INTENTS: Intent[] = [
  { id: 'design', label: 'Design', outcome: 'A flyer, poster or social post', target: 'design' },
  { id: 'video', label: 'Motion', outcome: 'A motion graphic you can post', target: 'video' },
  { id: 'promo', label: 'Offer', outcome: 'A promotion with a countdown', target: 'live-promo' },
  { id: 'social', label: 'Social', outcome: 'Captions and a week of posts', target: 'social' },
  { id: 'campaign', label: 'Campaign', outcome: 'Email, SMS and WhatsApp together', target: 'campaigns' },
  { id: 'page', label: 'Page', outcome: 'A one-page site for a launch', target: 'landing' },
  { id: 'brand', label: 'Brand', outcome: 'Your logo, colours and fonts', target: 'brand-kit' },
  { id: 'sell', label: 'Sell', outcome: 'A quote, invoice or catalogue', target: 'quotations' },
  { id: 'grow', label: 'Grow', outcome: 'What to fix to get found', target: 'health' },
];

/**
 * Time-of-day greeting.
 *
 * Takes the hour as an argument rather than reading the clock, so it is
 * testable and so callers control impurity — the same reason Date.now() was
 * hoisted out of the trust panel's memo.
 */
export function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
