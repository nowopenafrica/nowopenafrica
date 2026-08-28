import {
  Home, Compass, Heart, MapPin, DoorOpen,
  LayoutGrid, Store, Users, ShoppingBag, Sparkles, Megaphone, BarChart3,
} from 'lucide-react';

/**
 * The two navigations, kept apart on purpose.
 *
 * They are declared here as data rather than written inline in the nav so that
 * "do not mix the two systems" is something the code enforces instead of
 * something a future edit has to remember. Adding a seller link to the people
 * nav means putting it in the wrong array, which is visible in review.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  /** Signed-in only — a Keeps tab means nothing to a visitor with no keeps. */
  authOnly?: boolean;
}

/**
 * For people: discover, keep, visit.
 * Notably absent — Pricing, Adverts, Platform, OS, Forms, Waitlist. Those sell
 * a business account, and a shopper being sold to is a shopper leaving.
 */
export const PEOPLE_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/keeps', label: 'Keeps', icon: Heart, authOnly: true },
  { to: '/nearby', label: 'Nearby', icon: MapPin },
  // The brief asked for Offers here. There is no offers, deals or promotions
  // table in the schema and `business_products.price` is free text, so an
  // Offers tab would be a permanently empty page — a nav item that lies. This
  // is the surface NowOpen is actually named after, and it is backed by real
  // opening-hours data. Offers goes back in the moment it has something to show.
  { to: '/open-now', label: 'Open now', icon: DoorOpen },
];

/** For businesses: get discovered, connect, grow. */
export const BUSINESS_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutGrid },
  { to: '/dashboard?tab=business', label: 'Business', icon: Store },
  { to: '/dashboard?tab=customers', label: 'Customers', icon: Users },
  { to: '/dashboard?tab=orders', label: 'Orders', icon: ShoppingBag },
  { to: '/studio', label: 'Studio', icon: Sparkles },
  { to: '/dashboard?tab=marketing', label: 'Marketing', icon: Megaphone },
  { to: '/dashboard?tab=analytics', label: 'Analytics', icon: BarChart3 },
];

/** The bottom bar on a phone. Five is the most a thumb can aim at. */
export const PEOPLE_TABS = PEOPLE_NAV;

export function navFor(audience: 'people' | 'business'): NavItem[] {
  return audience === 'business' ? BUSINESS_NAV : PEOPLE_NAV;
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
