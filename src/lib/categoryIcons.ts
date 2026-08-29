import {
  UtensilsCrossed, ShoppingBag, Cpu, HeartPulse, Briefcase, Wrench,
  Home, GraduationCap, Music, Scissors, Store, Truck, LayoutGrid,
} from 'lucide-react';

/**
 * An icon and a short name for each top-level category group.
 *
 * Separate from the carousel so the component file exports only a component —
 * mixing the two breaks fast refresh, and this map is also the thing a test
 * needs to check every group is covered.
 */
export const GROUP_ICONS: Record<string, typeof Store> = {
  'Food & Hospitality': UtensilsCrossed,
  'Retail & Commerce': ShoppingBag,
  'Technology & Media': Cpu,
  'Health & Wellness': HeartPulse,
  'Professional Services': Briefcase,
  'Trades & Industry': Wrench,
  'Home & Personal Services': Home,
  'Education & Community': GraduationCap,
  'Arts & Entertainment': Music,
  'Fashion & Beauty': Scissors,
  'Local & Everyday Business': Store,
  'Logistics & Mobility': Truck,
};

/** Two words at most on a tile — the full group name wraps to three lines. */
export const GROUP_SHORT: Record<string, string> = {
  'Food & Hospitality': 'Food',
  'Retail & Commerce': 'Retail',
  'Technology & Media': 'Tech',
  'Health & Wellness': 'Health',
  'Professional Services': 'Professional',
  'Trades & Industry': 'Trades',
  'Home & Personal Services': 'Home',
  'Education & Community': 'Education',
  'Arts & Entertainment': 'Arts',
  'Fashion & Beauty': 'Beauty',
  'Local & Everyday Business': 'Everyday',
  'Logistics & Mobility': 'Transport',
};

/** Every group is covered; the fallback only guards a renamed group. */
export const iconFor = (group: string) => GROUP_ICONS[group] ?? LayoutGrid;
export const shortLabel = (group: string) => GROUP_SHORT[group] ?? group;
