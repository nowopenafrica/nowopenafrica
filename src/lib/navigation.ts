import {
  Home, Compass, Megaphone, Palette,
  Heart, MapPin, DoorOpen, Ticket,
  LayoutGrid, Store, Users, ShoppingBag, Sparkles, BarChart3,
  Cpu, UserPlus, Instagram, BadgeDollarSign,
} from 'lucide-react';

/**
 * The header, in three parts.
 *
 * PRIMARY is the platform's own lineup — Discover, Create, Promote — and is
 * shown to everyone, signed in or not, alongside the "Africa is NowOpen"
 * menu declared at the bottom of this file and rendered by both the desktop
 * dropdown and the mobile menu.
 *
 * Beneath it sit two menus that never merge: the people surfaces and the
 * business surfaces. Which one is offered follows the Browse/Manage switch, so
 * a shopper is never handed Orders and an owner never hunts for Customers among
 * discovery links.
 *
 * Declaring them as separate arrays is the point. Putting a seller link in
 * PEOPLE_MENU means putting it in the wrong array, which shows up in review and
 * trips the test asserting the two share no destination.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  /** Signed-in only — a Keeps link means nothing to a visitor with no keeps. */
  authOnly?: boolean;
  /** Secondary line shown under the label inside a dropdown. */
  blurb?: string;
  /**
   * The colour of the section this item opens.
   *
   * Promote paints its pages orange and Create paints its pages green, so the
   * item that takes you there has to agree with them — otherwise the bar says
   * "blue" while the page says "orange" and the header stops belonging to the
   * section. Discover has no colour of its own and keeps the platform blue.
   */
  accent?: 'blue' | 'orange' | 'green';
}

/**
 * Header classes per accent.
 *
 * Written out as whole class strings rather than assembled from a variable:
 * Tailwind scans source text, so `text-${accent}-700` would never be emitted.
 * The 700 shade is the text-safe one on white (green 5.0:1, orange 4.9:1);
 * the 300 shade carries the same hue on the dark bar.
 */
export const NAV_ACCENT_CLASS: Record<
  'blue' | 'orange' | 'green',
  { active: string; idle: string }
> = {
  blue: {
    active: 'text-blue-600 dark:text-blue-400',
    idle: 'text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400',
  },
  orange: {
    active: 'text-orange-700 dark:text-orange-300',
    idle: 'text-gray-700 dark:text-gray-300 hover:text-orange-700 dark:hover:text-orange-300',
  },
  green: {
    active: 'text-green-700 dark:text-green-300',
    idle: 'text-gray-700 dark:text-gray-300 hover:text-green-700 dark:hover:text-green-300',
  },
};

/**
 * The primary lineup.
 *
 * Three doors, in the order the platform wants them read: find what exists
 * (Discover), make something (Create), put it in front of people (Promote).
 * Home is deliberately not one of them — the wordmark in the header already
 * goes there, and a fourth item only repeats it.
 *
 * `Discover` points at the rails page rather than the raw directory: same
 * label, same position, and that page opens onto the full directory anyway.
 */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/media', label: 'Create', icon: Palette, accent: 'green' },
  { to: '/adverts', label: 'Promote', icon: Megaphone, accent: 'orange' },
];

/**
 * Icon colours per tone, as whole class strings — Tailwind reads source text,
 * so an interpolated `text-${tone}-600` would never be emitted.
 */
export const AFRICA_TONE_CLASS: Record<
  'blue' | 'purple' | 'pink' | 'emerald',
  string
> = {
  blue: 'text-blue-600 dark:text-blue-400',
  purple: 'text-purple-600 dark:text-purple-400',
  pink: 'text-pink-600 dark:text-pink-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
};

/**
 * The "Africa is NowOpen" menu.
 *
 * Written once and rendered twice — the desktop dropdown and the mobile menu —
 * because for a while it was written twice and the two drifted: Instagram and
 * "Add your business" existed only on the pointer, so a phone could not reach
 * either. Sharing the array is what keeps the invitation list honest; a link
 * added here shows up in both places without anyone having to remember.
 *
 * Labels are i18n keys rather than text, since the dropdown translates and a
 * second hard-coded copy would not.
 */
export interface AfricaMenuItem {
  to: string;
  /** Key in the dictionary, resolved with t() at render time. */
  labelKey: string;
  /** The second line in the desktop dropdown. */
  descKey?: string;
  /**
   * Some entries read better as an instruction on a phone, where there is no
   * description line to explain them. "Join NowOpen" becomes "Join NowOpen —
   * apply here"; the desktop keeps the shorter pair.
   */
  mobileLabelKey?: string;
  icon: typeof Home;
  /** Icon colour inside the dropdown. */
  tone: keyof typeof AFRICA_TONE_CLASS;
  /** Draw a rule above this entry, separating the last group. */
  dividerBefore?: boolean;
}

export const AFRICA_MENU: AfricaMenuItem[] = [
  {
    to: '/platform',
    labelKey: 'nav.platform',
    descKey: 'nav.platform.desc',
    icon: LayoutGrid,
    tone: 'blue',
  },
  {
    to: '/os',
    labelKey: 'nav.os',
    descKey: 'nav.os.desc',
    icon: Cpu,
    tone: 'purple',
  },
  {
    to: '/forms',
    labelKey: 'nav.join',
    descKey: 'nav.join.desc',
    mobileLabelKey: 'nav.joinMobile',
    icon: UserPlus,
    tone: 'purple',
  },
  {
    to: '/waitlist',
    labelKey: 'nav.africaNowOpen',
    descKey: 'nav.vision.desc',
    mobileLabelKey: 'nav.waitlistMobile',
    icon: Sparkles,
    tone: 'purple',
  },
  {
    /*
     * The one entry here that ADDS SUPPLY.
     *
     * It sat in the primary lineup first, which put a fourth item in a
     * three-item bar. This menu is where the platform's own invitations already
     * live — Join, Africa is NowOpen, Pricing — and it shows in either
     * audience, which is the point: the person who needs it is a business
     * owner browsing as a customer, to whom the Manage menu is invisible.
     */
    to: '/send-business',
    labelKey: 'footer.listYourBusiness',
    descKey: 'nav.listYourBusiness.desc',
    icon: Store,
    tone: 'purple',
  },
  {
    /*
     * Sits beside "Add your business" because it is the same intent arriving
     * from somewhere else: a business that is already on Instagram, checking
     * whether NowOpen already holds its listing. It costs no Instagram quota
     * and needs no login.
     */
    to: '/instagram',
    labelKey: 'nav.instagram',
    descKey: 'nav.instagram.desc',
    icon: Instagram,
    tone: 'pink',
  },
  {
    to: '/pricing',
    labelKey: 'nav.pricing',
    descKey: 'nav.pricing.desc',
    icon: BadgeDollarSign,
    tone: 'emerald',
    dividerBefore: true,
  },
];

/** For people: discover, keep, visit. */
export const PEOPLE_MENU: NavItem[] = [
  { to: '/keeps', label: 'Keeps', icon: Heart, authOnly: true, blurb: 'Businesses you follow' },
  { to: '/nearby', label: 'Nearby', icon: MapPin, blurb: 'What is around you' },
  { to: '/open-now', label: 'Open now', icon: DoorOpen, blurb: 'Doors open this minute' },
  // Withheld when Discover shipped, because there was no offers table and the
  // tab would have pointed at a page that could never fill. There is one now.
  { to: '/offers', label: 'Offers', icon: Ticket, blurb: 'Deals running right now' },
];

/** For businesses: get discovered, connect, grow. */
export const BUSINESS_MENU: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutGrid, blurb: 'How the business is doing' },
  { to: '/dashboard?tab=business', label: 'Business', icon: Store, blurb: 'Profile, hours, locations' },
  { to: '/dashboard?tab=customers', label: 'Customers', icon: Users, blurb: 'Who has been in touch' },
  { to: '/dashboard?tab=orders', label: 'Orders', icon: ShoppingBag, blurb: 'Bookings and enquiries' },
  { to: '/studio', label: 'Studio', icon: Sparkles, blurb: 'Brand kit and content' },
  { to: '/dashboard?tab=analytics', label: 'Analytics', icon: BarChart3, blurb: 'Reach and performance' },
];

/** Older names, kept so existing imports and tests stay readable. */
export const PEOPLE_NAV = PEOPLE_MENU;
export const BUSINESS_NAV = BUSINESS_MENU;

export function menuFor(audience: 'people' | 'business'): NavItem[] {
  return audience === 'business' ? BUSINESS_MENU : PEOPLE_MENU;
}

/** What that menu is called on each side. */
export function menuLabel(audience: 'people' | 'business'): string {
  return audience === 'business' ? 'Manage' : 'For you';
}

export function navFor(audience: 'people' | 'business'): NavItem[] {
  return menuFor(audience);
}

/** Active-state matching that treats /dashboard?tab=x as its own destination. */
export function isNavItemActive(item: NavItem, pathname: string, search: string): boolean {
  const [path, query] = item.to.split('?');
  if (path !== pathname) return false;
  if (!query) {
    // Bare /dashboard is "Overview": active only when no tab is selected.
    if (pathname === '/dashboard') return !new URLSearchParams(search).get('tab');
    return true;
  }
  const want = new URLSearchParams(query).get('tab');
  return new URLSearchParams(search).get('tab') === want;
}
