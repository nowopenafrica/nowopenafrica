/**
 * The six things a business owner is actually trying to do when they come to
 * Promote. Goal-first on purpose: a small shop should be steered to the free
 * tools and NowOpen placements, a brand to outdoor plans, and the hub should
 * not make either of them learn our product catalogue first.
 *
 * Everything here is data. Nothing in it claims reach, impressions or an
 * audience, because we have no measured figures to back one. `why` says what
 * tends to work for the goal and nothing more.
 */

export type GoalSlug = 'nearby' | 'launch' | 'sale' | 'event' | 'awareness' | 'hiring';

export type ChannelKind =
  /** A free tool already in the product. */
  | { kind: 'free'; tool: 'offer' | 'keeps' | 'profile' | 'insights' }
  /** One of the seven `revenue_products` sold on NowOpen. */
  | { kind: 'product'; slug: string }
  /** Outdoor / media placements, by ADVERT_CATEGORIES value. */
  | { kind: 'placement'; categories: string[] };

export interface Goal {
  slug: GoalSlug;
  /** The tile. */
  label: string;
  /** The one honest line under the tile. */
  line: string;
  /** One sentence on what works for this goal, shown in the goal view. */
  why: string;
  /** Ordered: the mix fills greedily from the top, so free comes first. */
  channels: ChannelKind[];
  /** Create deliverables worth making for this goal (need + deliverable slugs). */
  designs: { need: string; deliverable: string }[];
}

const free = (tool: 'offer' | 'keeps' | 'profile' | 'insights'): ChannelKind => ({ kind: 'free', tool });
const product = (slug: string): ChannelKind => ({ kind: 'product', slug });
const placement = (...categories: string[]): ChannelKind => ({ kind: 'placement', categories });

export const GOALS: Goal[] = [
  {
    slug: 'nearby',
    label: 'Get customers nearby',
    line: 'Be findable where people search, then seen on their route',
    why: 'People near you search first, so a complete profile and a local spotlight work before anything on the street.',
    channels: [
      free('profile'), free('offer'),
      product('city-spotlight'), product('category-spotlight'),
      placement('Street Furniture'), placement('Billboard'), placement('Transit'), placement('Vehicle Wrap'),
    ],
    // The pavement A-board and the shopfront fascia are both filed under
    // shopfront-sign, so it appears once here rather than as a duplicate link.
    designs: [
      { need: 'outdoor', deliverable: 'shopfront-sign' },
      { need: 'flyers', deliverable: 'flyer' },
    ],
  },
  {
    slug: 'launch',
    label: 'Launch something new',
    line: 'Make noise for a new shop, product or service',
    why: 'A launch needs a few places that all say the same thing in the same week, starting with your own profile.',
    channels: [
      free('profile'),
      product('homepage-feature'), product('featured-business'),
      placement('Billboard'), placement('Digital Screen'), placement('Mall Media'), placement('Radio'),
    ],
    designs: [
      { need: 'brand', deliverable: 'brand-launch' },
      { need: 'flyers', deliverable: 'flyer' },
      { need: 'outdoor', deliverable: 'roll-up' },
    ],
  },
  {
    slug: 'sale',
    label: 'Run a sale or offer',
    line: 'Give people a reason to buy this week',
    why: 'A reason to buy this week, shown to people already deciding.',
    channels: [
      free('offer'), free('keeps'),
      product('featured-offer'), product('sponsored-result'),
      placement('Digital Screen'), placement('Mall Media'), placement('Transit'),
    ],
    designs: [
      { need: 'flyers', deliverable: 'flyer' },
      { need: 'social', deliverable: 'instagram-post' },
      { need: 'social', deliverable: 'story' },
    ],
  },
  {
    slug: 'event',
    label: 'Fill an event',
    line: 'Put the date in front of the right crowd',
    why: 'An event has a deadline, so tell the people who already follow you first, then the crowd in your city.',
    channels: [
      free('offer'), free('keeps'),
      product('city-spotlight'),
      placement('Billboard'), placement('Digital Screen'), placement('Radio'), placement('Cinema'),
    ],
    designs: [
      { need: 'events', deliverable: 'event-poster' },
      { need: 'events', deliverable: 'ticket' },
      { need: 'outdoor', deliverable: 'banner' },
    ],
  },
  {
    slug: 'awareness',
    label: 'Build awareness',
    line: 'Be the name people already know',
    why: 'Awareness comes from being seen in the same few places again and again, online and on the street.',
    channels: [
      free('profile'),
      product('featured-business'), product('industry-takeover'),
      placement('Billboard'), placement('Digital Screen'), placement('Transit'),
      placement('Television'), placement('Airport'),
    ],
    designs: [
      { need: 'outdoor', deliverable: 'billboard' },
      // The LED screen ad template is filed under outdoor/billboard, so this
      // one link covers both the billboard and the LED screen ad.
      { need: 'social', deliverable: 'instagram-post' },
    ],
  },
  {
    slug: 'hiring',
    label: 'Hire staff',
    line: 'Reach people looking for work near you',
    why: 'Job seekers look close to home, so tell your own followers and put the vacancy where people pass daily.',
    channels: [
      free('profile'), free('keeps'),
      product('sponsored-result'),
      placement('Street Furniture'), placement('Transit'), placement('Print'), placement('Online'),
    ],
    // The vacancy template is filed under flyers/notice.
    designs: [
      { need: 'flyers', deliverable: 'notice' },
      { need: 'social', deliverable: 'instagram-post' },
    ],
  },
];

export const goalBySlug = (s: string): Goal | null => GOALS.find((g) => g.slug === s) ?? null;
