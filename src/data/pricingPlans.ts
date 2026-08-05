// Central pricing data for the whole platform — one place to see (and
// change) every purchasable plan, add-on and module. Every price is stored
// in USD (the app's canonical currency; CurrencyContext converts for
// display at live rates) at roughly the naira figures in the growth-model
// pricing brief, using the bundled NGN fallback rate (₦1,500/$1) as the
// reference point — exact displayed NGN will float with live rates like
// everywhere else on the site.
//
// The growth model: "Join for free. Grow with NowOpen. Upgrade when your
// business grows." Four business tiers — Free Launch (₦0), Growth
// (₦5,000/mo, ₦50,000/yr), Business Pro (₦18,000/mo, ₦180,000/yr) and
// Enterprise (custom) — with AI credits bundled per tier (50 / 500 / 2,000).
// Advertising (Promote) and booking fees are separate revenue streams.
//
// This file describes *what's for sale and at what price*, and (via the
// helpers at the bottom) maps a stored tier id back to its catalogue entry.
//
// Subscriptions ARE now tracked on the account: every signup is provisioned on
// the free Free Launch tier (users.plan default), and a verified subscription
// payment activates the paid tier server-side (see supabase/functions/
// _shared/planActivation.ts + the subscriptions migration). The Dashboard
// shows the current plan and an upgrade path.
//
// What's still NOT enforced is hard feature-gating — e.g. blocking a second
// branch on Growth, or hiding the Live tab until Business Pro. Every business
// keeps the capabilities it already has regardless of plan; the plan is
// surfaced and upsold, not locked. Turning these tiers into hard entitlement
// walls is a separate, larger project.

export interface BusinessTier {
  id: string;
  name: string;
  tagline: string;
  monthlyUsd: number | null; // null = free
  annualUsd: number | null; // total per year; null = free or custom
  custom?: boolean; // Enterprise — "Contact us" instead of a price
  /** Included AI credits per month (null = custom / not advertised). */
  aiCredits: number | null;
  features: string[];
  highlight?: boolean;
}

// Growth-model tiers: join for free, upgrade when your business grows.
export const BUSINESS_TIERS: BusinessTier[] = [
  {
    id: 'starter',
    name: 'Free Launch',
    tagline: 'Join for free — get discovered and start growing',
    monthlyUsd: 0,
    annualUsd: 0,
    aiCredits: 50,
    features: [
      'Basic business profile',
      '1 business category',
      'Up to 10 photos',
      'Contact details, location & map',
      'Business hours',
      'Reviews & ratings',
      'WhatsApp button & social links',
      'Basic search visibility',
      '50 AI credits / month',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'Small businesses ready for essential tools',
    monthlyUsd: 3.33,
    annualUsd: 33.33,
    aiCredits: 500,
    highlight: true,
    features: [
      'Everything in Free Launch',
      'Unlimited photos & gallery',
      'Up to 50 products/services',
      '1 booking/appointment module',
      'Bookings & enquiries inbox',
      'AI business profile optimization',
      'Business analytics',
      'Promotions & offers',
      'Verified business badge',
      'Priority search ranking',
      'Basic AI content generation',
      '500 AI credits / month',
    ],
  },
  {
    id: 'business-pro',
    name: 'Business Pro',
    tagline: 'Established businesses — the sweet spot for most SMEs',
    monthlyUsd: 12,
    annualUsd: 120,
    aiCredits: 2000,
    features: [
      'Everything in Growth',
      'Unlimited products & modules',
      'Multiple business branches',
      'Staff management',
      'Multiple booking modules',
      'NowOpen Live streaming',
      'AI business assistant (chat + Q&A)',
      'AI advertising tools',
      'Marketing dashboard & CRM',
      'Advanced booking & inventory',
      'AI automation, reports & recommendations',
      'API integrations',
      'Premium analytics',
      'Review & campaign management',
      '0% booking fees on services',
      'Custom branding',
      'Premium support',
      'Early feature access',
      '2,000 AI credits / month',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Banks, airlines, universities, telecoms & governments',
    monthlyUsd: null,
    annualUsd: null,
    custom: true,
    aiCredits: null,
    features: [
      'Unlimited everything',
      'Dedicated account manager',
      'Custom integrations & API access',
      'White-label options',
      'SSO & advanced security',
      'SLA & dedicated infrastructure',
      'Custom AI models',
    ],
  },
];

export interface CreativeTier {
  id: string;
  name: string;
  tagline: string;
  monthlyUsd: number | null;
  features: string[];
  highlight?: boolean;
}

export const CREATIVE_TIERS: CreativeTier[] = [
  {
    id: 'creative-starter',
    name: 'Creative Starter',
    tagline: 'Get your portfolio in front of real clients',
    monthlyUsd: 0,
    features: ['Portfolio', 'Up to 10 projects', 'Receive enquiries'],
  },
  {
    id: 'creative-pro',
    name: 'Creative Pro',
    tagline: 'For working creatives who want to stand out',
    monthlyUsd: 3.5,
    highlight: true,
    features: [
      'Unlimited portfolio',
      'Verified profile',
      'Featured placement',
      'AI proposal generator',
      'AI portfolio optimization',
      'Analytics',
      'Priority support',
    ],
  },
  {
    id: 'creative-studio',
    name: 'Creative Studio',
    tagline: 'For agencies and studios',
    monthlyUsd: 10,
    features: [
      'Everything in Creative Pro',
      'Team members',
      'Unlimited portfolios',
      'CRM',
      'Project management',
      'Branded proposals',
      'Premium AI tools',
    ],
  },
];

export interface AiAddon {
  id: string;
  name: string;
  tagline: string;
  monthlyUsd: number;
  features: string[];
}

export const AI_ADDONS: AiAddon[] = [
  {
    id: 'ai-content',
    name: 'AI Content',
    tagline: 'Never stare at a blank caption box again',
    monthlyUsd: 2.5,
    features: ['Social captions', 'Blog posts', 'Product descriptions'],
  },
  {
    id: 'ai-marketing',
    name: 'AI Marketing',
    tagline: 'Plan campaigns like you have a marketing team',
    monthlyUsd: 5,
    features: ['Campaign ideas', 'Ad copy', 'Audience suggestions', 'Performance insights'],
  },
  {
    id: 'ai-studio',
    name: 'AI Studio',
    tagline: 'Full creative production, powered by AI',
    monthlyUsd: 10,
    features: ['Image generation', 'Video concepts', 'Voiceover scripts', 'Marketing creatives'],
  },
];

export interface CategoryModule {
  id: string;
  name: string;
  monthlyUsd: number;
}

export const CATEGORY_MODULES: CategoryModule[] = [
  { id: 'module-booking', name: 'Booking & Appointments', monthlyUsd: 1.67 },
  { id: 'module-hotel', name: 'Hotel Reservations', monthlyUsd: 3.33 },
  { id: 'module-restaurant', name: 'Restaurant Ordering', monthlyUsd: 2 },
  { id: 'module-event', name: 'Event Booking', monthlyUsd: 2 },
  { id: 'module-property', name: 'Property Listings', monthlyUsd: 2.67 },
  { id: 'module-marketplace', name: 'Marketplace', monthlyUsd: 2 },
  { id: 'module-live', name: 'Live Streaming', monthlyUsd: 3.33 },
  { id: 'module-crm', name: 'CRM', monthlyUsd: 2.67 },
  { id: 'module-inventory', name: 'Inventory', monthlyUsd: 2.67 },
  { id: 'module-staff', name: 'Staff Management', monthlyUsd: 1.67 },
];

export interface BoostOption {
  id: string;
  label: string;
  description: string;
  usd: number;
}

export const BOOST_OPTIONS: BoostOption[] = [
  { id: 'boost-7', label: '7-Day Boost', description: 'Featured search placement for a week', usd: 3.5 },
  { id: 'boost-14', label: '14-Day Boost', description: 'Featured search + homepage visibility', usd: 7 },
  { id: 'boost-30', label: '30-Day Boost', description: 'Featured search, homepage & category boost', usd: 13 },
];

export const DIGITAL_CAMPAIGN_STARTING_USD = 17;

// First-1000-businesses launch incentive — 50% off is applied automatically
// at checkout while eligible (see isFoundingMemberEligible below). The "6
// months of Growth free" alternative from the founder brief isn't wired
// here since a $0 checkout has nothing for Paystack to verify — offering it
// would need account-side subscription tracking (start date, auto-expiry)
// that doesn't exist yet; treat it as a manually-applied perk in the
// meantime (same pattern as the admin-toggled verified badge).
export const FOUNDING_MEMBER_LIMIT = 1000;
export const FOUNDING_MEMBER_DISCOUNT = 0.5;

// Launch promo: every NEW business registration is provisioned on the top
// all-access tier free for this many months (see the new-registration trial
// migration + handle_new_user trigger), after which it reverts to Free Launch.
export const TRIAL_MONTHS = 3;
export const TRIAL_TIER = 'business-pro'; // "all access"

// ---------------------------------------------------------------------------
// Plan lookup helpers — used by the account/subscription UI to turn a stored
// tier id (users.plan / users.creative_plan) back into its catalogue entry.
// The free defaults every new account is provisioned with at signup:
export const DEFAULT_BUSINESS_PLAN = 'starter';
export const DEFAULT_CREATIVE_PLAN = 'creative-starter';

// Upgrade ranking for business tiers (higher = more capable). Used to decide
// whether a plan is "paid", and which upgrade to suggest.
export const BUSINESS_TIER_RANK: Record<string, number> = {
  starter: 0, growth: 1, 'business-pro': 2, enterprise: 3,
};

export function getBusinessTier(id: string | null | undefined): BusinessTier | undefined {
  return BUSINESS_TIERS.find((t) => t.id === (id || DEFAULT_BUSINESS_PLAN));
}

// How many booking modules a business may switch on, by plan. Free gets the
// one default category module; paid tiers unlock more. (999 = effectively
// unlimited.) Used to gate the module selector in the business form.
export const MODULE_LIMITS: Record<string, number> = {
  starter: 1,
  growth: 5,
  'business-pro': 999,
  enterprise: 999,
};

export function moduleLimitForPlan(plan: string | null | undefined): number {
  return MODULE_LIMITS[plan || DEFAULT_BUSINESS_PLAN] ?? 1;
}

export function getCreativeTier(id: string | null | undefined): CreativeTier | undefined {
  return CREATIVE_TIERS.find((t) => t.id === (id || DEFAULT_CREATIVE_PLAN));
}

// The next tier up from the current one (for an "Upgrade to …" nudge), or null
// if already on the top paid tier.
export function nextBusinessTier(id: string | null | undefined): BusinessTier | null {
  const rank = BUSINESS_TIER_RANK[id || DEFAULT_BUSINESS_PLAN] ?? 0;
  return BUSINESS_TIERS.find((t) => (BUSINESS_TIER_RANK[t.id] ?? 0) === rank + 1) ?? null;
}
