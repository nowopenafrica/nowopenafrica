import {
  Home, Compass, Megaphone, Palette,
  Heart, MapPin, DoorOpen, Ticket,
  LayoutGrid, Store, Users, ShoppingBag, Sparkles, BarChart3,
} from 'lucide-react';

/**
 * The header, in three parts.
 *
 * PRIMARY is the platform's own lineup — Home, Discover, Promote, Create — and
 * is shown to everyone, signed in or not, alongside the "Africa is NowOpen"
 * dropdown written inline in the nav.
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
}

/**
 * The primary lineup, as it was.
 *
 * `Discover` points at the rails page rather than the raw directory: same
 * label, same position, and that page opens onto the full directory anyway.
 */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/adverts', label: 'Promote', icon: Megaphone },
  { to: '/media', label: 'Create', icon: Palette },
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
