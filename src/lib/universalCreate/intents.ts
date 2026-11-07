/**
 * Universal Create — what can be opened, and where each one actually goes.
 *
 * NOT "NowOpen Create" (src/lib/create/), which is the design and print
 * marketplace on /media. Same word, different product — this one opens
 * things on your own profile; that one sells printed cards and flyers.
 *
 * ── THE RULE THIS FILE ENFORCES ──────────────────────────────────────────
 *
 * Every action here points at a destination that EXISTS. An action whose
 * workflow has not been built is marked `buildable: false` and the hub shows
 * it as coming, rather than offering a button that leads nowhere.
 *
 * That matters more than it sounds. A creation hub is a promise about what the
 * platform can do, and nine confident tiles of which two dead-end is worse
 * than seven that work — the person who hits the dead end stops trusting the
 * other seven.
 *
 * ── WHAT THE AUDIT FOUND (2026-10-06) ────────────────────────────────────
 *
 * Eight of the brief's nine creation types already have a table and a working
 * surface. They are wired here, to those surfaces — not rebuilt:
 *
 *   business   businesses           BusinessForm / /add-business
 *   service    business_services    dashboard → services
 *   product    business_products    dashboard → products
 *   gallery    business_gallery     dashboard → content
 *   live       business_streams     dashboard → live
 *   offer      business_offers      OffersManager
 *   post       social_scheduled_posts  BusinessContentManager
 *   place      business_locations   LocationsManager
 *   ad         advertisements       AdvertForm / /adverts
 *
 * EVENT has neither a table nor a screen. It is the one type in the brief that
 * would be built from nothing, so it is listed as not yet buildable rather
 * than given a tile that opens an empty form.
 */

/** The things a person can open, plus the AI front door. */
export type CreateType =
  | 'business' | 'service' | 'product' | 'gallery' | 'reel' | 'live' | 'event'
  | 'offer' | 'post' | 'place' | 'ad' | 'ai';

/** Where the intent came from, so analytics can tell the surfaces apart. */
export type CreateSource = 'universal_create' | 'dashboard' | 'ai' | 'deep_link';

export interface CreateIntent {
  type: CreateType;
  source: CreateSource;
  /** Set when an unfinished draft is being resumed. */
  draftId?: string;
  /** Which business this is for, when the person has more than one. */
  businessId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Who may do a thing.
 *
 * `guest` does not mean "blocked" — it means the hub will ask them to sign in
 * and then carry them to where they were going (see pendingIntent). Refusing
 * at the tile would lose the person; refusing after sign-in would waste their
 * time. Neither is necessary.
 */
export type CreateAudience = 'anyone' | 'signed_in' | 'business_owner';

export interface CreateAction {
  type: CreateType;
  /** Brand-first, per the brief: "Open a Business", not "Create business". */
  label: string;
  /** What it actually does, in plain words. */
  description: string;
  /** lucide-react icon name, resolved by the hub. */
  icon: string;
  audience: CreateAudience;
  /**
   * Where it goes. A route that exists today — verified against App.tsx.
   * `null` when nothing has been built yet, which forces `buildable: false`.
   */
  destination: string | null;
  /**
   * False when there is no workflow behind this yet. The hub renders it as
   * "coming" and refuses to navigate. Never set this true to make a tile
   * look complete.
   */
  buildable: boolean;
  /** Shown instead of a destination when not buildable. */
  comingNote?: string;
  /**
   * True when choosing this opens a workflow IN PLACE rather than navigating.
   *
   * OpenReel is the case: "record a reel" means the camera, and sending
   * somebody to a dashboard list to go and find a camera button is four steps
   * after they already said what they wanted. `destination` is still a real
   * route, so the deep link works and the no-dead-tile rule still holds.
   */
  opensInPlace?: boolean;
  /** Primary actions lead; the rest sit under "More". */
  prominence: 'primary' | 'secondary' | 'more';
}

/*
 * Destinations are the routes that exist in App.tsx today. The dashboard ones
 * carry a ?tab= so the hub lands on the right panel instead of the dashboard's
 * default — deep-linking into a screen somebody already built is the whole
 * reason this is a thin layer rather than nine new forms.
 */
/*
 * ── EVERY ACTION OPENS THE THING ITSELF ────────────────────────────
 *
 * Not the screen the thing lives on — the thing.
 *
 * Two rounds of getting this wrong are recorded here because both were
 * invisible from the code:
 *
 *   1. Shipped pointing at ?tab=services / content / offers / live /
 *      locations. Dashboard.tsx has exactly five tabs
 *      (overview | businesses | adverts | media | inbox) and falls back to
 *      'overview' for anything else SILENTLY, so five tiles dropped people on
 *      the wrong panel while the test passed — it checked the path and threw
 *      the query string away.
 *
 *   2. Corrected to ?tab=businesses, which was true but not useful: "Add a
 *      Service" still meant find your business, press Content, find Services.
 *      Three steps after somebody had already said what they wanted.
 *
 * So Dashboard now takes `?open=<panel>&panel=<tab>` and opens it on arrival,
 * picking the business automatically when the person has exactly one. The
 * `?tab=` value is still validated against the real union by a test, and
 * `?open=` against the panels Dashboard actually handles.
 *
 * The Studio tools below use `/studio?module=<ModuleKey>`, which already
 * existed for the onboarding brand-kit links.
 */
export const CREATE_ACTIONS: CreateAction[] = [
  {
    type: 'ai',
    label: 'Tell NowOpen AI',
    description: 'Describe what you want to open and we will set it up.',
    icon: 'Sparkles',
    audience: 'anyone',
    destination: null,
    // Honest: intent classification is not built. The tile explains rather
    // than opening a chat box that cannot answer.
    buildable: false,
    comingNote: 'Natural-language setup is being built. Pick what you want to open below.',
    prominence: 'primary',
  },
  {
    type: 'business',
    label: 'Open a Business',
    description: 'Get found by customers searching near you.',
    icon: 'Store',
    audience: 'anyone',
    // /add-business works signed out — it is the public submission funnel.
    destination: '/add-business',
    buildable: true,
    prominence: 'primary',
  },
  {
    type: 'service',
    label: 'Add a Service',
    description: 'List something you do, with a price and a booking option.',
    icon: 'Wrench',
    audience: 'business_owner',
    destination: '/dashboard?tab=businesses&open=content&panel=services',
    buildable: true,
    prominence: 'primary',
  },
  {
    /*
     * Products were the one obvious gap: a shop, a restaurant, a pharmacy and
     * a car dealer all sell THINGS, and the hub offered them a service form
     * and a gallery instead. The workflow has existed all along as the
     * `products` tab of BusinessContentManager (business_products, with the
     * label and fields the owner's own category needs — property, menu item,
     * vehicle, medicine), so this is a door to it, not a new form.
     *
     * Secondary rather than primary: the hub is capped at five leading tiles
     * on purpose, and "Open a Business" through "Get your Business Seen" is
     * the path somebody with nothing on their profile actually needs first.
     */
    type: 'product',
    label: 'Add a Product',
    description: 'List something you sell, with a price and what you have in stock.',
    icon: 'Package',
    audience: 'business_owner',
    destination: '/dashboard?tab=businesses&open=content&panel=products',
    buildable: true,
    prominence: 'secondary',
  },
  {
    type: 'gallery',
    label: 'Add to your Gallery',
    description: 'Show your work, your space or what you sell.',
    icon: 'Images',
    audience: 'business_owner',
    destination: '/dashboard?tab=businesses&open=content&panel=gallery',
    buildable: true,
    prominence: 'primary',
  },
  {
    type: 'ad',
    label: 'Get your Business Seen',
    description: 'Put your business in front of people searching nearby.',
    icon: 'Megaphone',
    audience: 'business_owner',
    destination: '/adverts',
    buildable: true,
    prominence: 'primary',
  },
  {
    /*
     * OpenReel is NowOpen's own capture — a short video recorded in the
     * browser, length capped by plan (60s free, up to 10 minutes on Business
     * Pro). It is one of the few genuinely distinctive things a business can
     * make here, so it earns a tile rather than living only inside the content
     * manager where people have to know to look.
     *
     * Real surface: OpenReelCapture, mounted by BusinessContentManager — which
     * opens from the businesses tab, per business.
     */
    type: 'reel',
    label: 'Record an OpenReel',
    description: 'Film a short video of your business, straight from your phone.',
    icon: 'Video',
    audience: 'business_owner',
    // A real route, so /create/reel is linkable — but the hub opens the camera
    // without going anywhere.
    destination: '/create/reel',
    opensInPlace: true,
    buildable: true,
    prominence: 'secondary',
  },
  {
    type: 'offer',
    label: 'Open an Offer',
    description: 'A discount or promotion customers can see and claim.',
    icon: 'Tag',
    audience: 'business_owner',
    destination: '/dashboard?tab=businesses&open=offers',
    buildable: true,
    prominence: 'secondary',
  },
  {
    type: 'post',
    label: "Share What's Happening",
    description: 'Tell customers what is new today.',
    icon: 'MessageSquare',
    audience: 'business_owner',
    destination: '/dashboard?tab=businesses&open=content&panel=gallery',
    buildable: true,
    prominence: 'secondary',
  },
  {
    type: 'live',
    label: 'Go Live',
    description: 'Stream to the people following your business.',
    icon: 'Radio',
    audience: 'business_owner',
    destination: '/dashboard?tab=businesses&open=live',
    buildable: true,
    prominence: 'secondary',
  },
  {
    type: 'place',
    label: 'Open a Place',
    description: 'Add a branch, a venue or another location.',
    icon: 'MapPin',
    audience: 'business_owner',
    destination: '/dashboard?tab=businesses&open=content&panel=locations',
    buildable: true,
    prominence: 'more',
  },
  {
    type: 'event',
    label: 'Open an Event',
    description: 'Something happening on a date, that people can come to.',
    icon: 'Calendar',
    audience: 'business_owner',
    /*
     * The one type with nothing behind it: no table, no screen, nothing in the
     * dashboard. Shown so the hub tells the truth about what is coming, and
     * deliberately not clickable — a tile that opens an empty page is worse
     * than a tile that says "not yet".
     */
    destination: null,
    buildable: false,
    comingNote: 'Events are not built yet — there is no events workflow in NowOpen today.',
    prominence: 'more',
  },
];

export const ACTIONS_BY_TYPE: Record<string, CreateAction> =
  Object.fromEntries(CREATE_ACTIONS.map((a) => [a.type, a]));

/**
 * Can this person do this, right now?
 *
 * Returns `needs_auth` rather than a bare false so the caller can send them to
 * sign in and bring them back, instead of just refusing.
 */
export type CreatePermission = 'allowed' | 'needs_auth' | 'needs_business' | 'not_built';

export function permissionFor(
  action: CreateAction,
  ctx: { signedIn: boolean; hasBusiness: boolean },
): CreatePermission {
  if (!action.buildable) return 'not_built';
  if (action.audience === 'anyone') return 'allowed';
  if (!ctx.signedIn) return 'needs_auth';
  if (action.audience === 'business_owner' && !ctx.hasBusiness) return 'needs_business';
  return 'allowed';
}

/** What to say when somebody cannot do it yet — never a bare refusal. */
export function permissionMessage(p: CreatePermission, action: CreateAction): string | null {
  switch (p) {
    case 'allowed': return null;
    case 'needs_auth': return 'Sign in to continue — we will bring you straight back here.';
    case 'needs_business': return 'You need a business on NowOpen first. Opening one takes a minute.';
    case 'not_built': return action.comingNote ?? 'This is not available yet.';
  }
}

/** Actions in the order the hub shows them, filtered by prominence. */
export function actionsByProminence(p: CreateAction['prominence']): CreateAction[] {
  return CREATE_ACTIONS.filter((a) => a.prominence === p);
}

/*
 * ── BUSINESS TOOLS ────────────────────────────────────────
 *
 * The day-to-day things a business reaches for repeatedly: a receipt, an
 * invoice, a business card. Every one is an EXISTING Studio module
 * (ReceiptStudio, InvoicesStudio, BrandCardStudio, …) reached through
 * /studio?module=<ModuleKey>, which Studio already honours.
 *
 * They are separate from CREATE_ACTIONS because they are a different kind of
 * thing: an action opens something new on your profile, a tool is a workbench
 * you come back to. They are also the list a person can PIN — which of these
 * matters is entirely down to the trade, and a caterer's shortcuts are not a
 * photographer's.
 */
export interface CreateTool {
  key: string;
  label: string;
  description: string;
  icon: string;
  /** A real /studio?module= route. Verified against ModuleKey by a test. */
  destination: string;
  /** Shown by default to somebody who has pinned nothing. */
  defaultPinned?: boolean;
}

export const CREATE_TOOLS: CreateTool[] = [
  { key: 'receipts', label: 'Receipt', description: 'Issue a receipt for a payment you have taken.',
    icon: 'ReceiptText', destination: '/studio?module=receipts', defaultPinned: true },
  { key: 'invoices', label: 'Invoice', description: 'Bill a customer for work or goods.',
    icon: 'FileText', destination: '/studio?module=invoices', defaultPinned: true },
  { key: 'card', label: 'Business card', description: 'Your card, built from your brand.',
    icon: 'CreditCard', destination: '/studio?module=card', defaultPinned: true },
  { key: 'design', label: 'Design', description: 'Posters, flyers and posts in your brand.',
    icon: 'Palette', destination: '/studio?module=design', defaultPinned: true },
  { key: 'quotations', label: 'Quotation', description: 'Price a job before you start it.',
    icon: 'FileSpreadsheet', destination: '/studio?module=quotations' },
  { key: 'catalogues', label: 'Catalogue', description: 'A shareable list of what you sell.',
    icon: 'BookOpen', destination: '/studio?module=catalogues' },
  { key: 'campaigns', label: 'Campaign', description: 'Plan and run a promotion.',
    icon: 'Rocket', destination: '/studio?module=campaigns' },
  { key: 'brand-kit', label: 'Brand kit', description: 'Your logo, colours and fonts in one place.',
    icon: 'Sparkle', destination: '/studio?module=brand-kit' },
  { key: 'planner', label: 'Content planner', description: 'Decide what to post, and when.',
    icon: 'CalendarRange', destination: '/studio?module=planner' },
  { key: 'customers', label: 'Customers', description: 'Who has bought, booked or asked.',
    icon: 'Users', destination: '/studio?module=customers' },
  { key: 'analytics', label: 'Analytics', description: 'What your profile is actually doing.',
    icon: 'BarChart3', destination: '/studio?module=analytics' },
  { key: 'loyalty', label: 'Loyalty', description: 'Reward the customers who come back.',
    icon: 'Heart', destination: '/studio?module=loyalty' },
];

export const TOOLS_BY_KEY: Record<string, CreateTool> =
  Object.fromEntries(CREATE_TOOLS.map((t) => [t.key, t]));

/** The tools shown when somebody has never pinned anything. */
export const DEFAULT_PINNED: string[] =
  CREATE_TOOLS.filter((t) => t.defaultPinned).map((t) => t.key);
