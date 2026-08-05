// Shared advertising-placement categories — used by the create-advert form,
// the public browse/filter page, and global search facets.
//
// ADVERT_CATEGORIES is the flat list every form/select/search facet imports.
// ADVERT_CATEGORY_GROUPS adds an icon + description + member set per medium so
// the browse page can render a rich, scannable category gallery. Group members
// are drawn from the flat list, so filtering by a group == "category in group".

import {
  Megaphone, Building2, Bus, MonitorPlay, Radio as RadioIcon, Newspaper, Globe,
  type LucideIcon,
} from 'lucide-react';

export const ADVERT_CATEGORIES: string[] = [
  'Billboard',
  'Digital Screen',
  'Transit',
  'Mall Media',
  'Airport',
  'Street Furniture',
  'Stadium',
  'Cinema',
  'Vehicle Wrap',
  'Radio',
  'Television',
  'Print',
  'Online',
];

export interface AdvertCategoryGroup {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Accent used for the group card (tailwind color family). */
  accent: string;
  /** Placement categories (from ADVERT_CATEGORIES) that belong to this medium. */
  members: string[];
}

export const ADVERT_CATEGORY_GROUPS: AdvertCategoryGroup[] = [
  {
    key: 'outdoor',
    label: 'Outdoor & OOH',
    description: 'Billboards, unipoles, street furniture and stadium boards',
    icon: Building2,
    accent: 'blue',
    members: ['Billboard', 'Street Furniture', 'Stadium'],
  },
  {
    key: 'transit',
    label: 'Transit & Airport',
    description: 'Vehicle wraps, bus & danfo branding, airport lightboxes',
    icon: Bus,
    accent: 'amber',
    members: ['Transit', 'Vehicle Wrap', 'Airport'],
  },
  {
    key: 'digital',
    label: 'Digital Screens',
    description: 'LED gantries, mall media and cinema (DOOH)',
    icon: MonitorPlay,
    accent: 'violet',
    members: ['Digital Screen', 'Mall Media', 'Cinema'],
  },
  {
    key: 'broadcast',
    label: 'Broadcast',
    description: 'Radio spots and television slots with mass reach',
    icon: RadioIcon,
    accent: 'rose',
    members: ['Radio', 'Television'],
  },
  {
    key: 'print',
    label: 'Print',
    description: 'Newspaper, magazine and large-format print',
    icon: Newspaper,
    accent: 'emerald',
    members: ['Print'],
  },
  {
    key: 'online',
    label: 'Online & Social',
    description: 'Display, social and search placements',
    icon: Globe,
    accent: 'cyan',
    members: ['Online'],
  },
];

// Fallback icon for any category not covered by a group.
export const DEFAULT_ADVERT_ICON: LucideIcon = Megaphone;

/** Find the group a placement category belongs to (or null). */
export function groupForAdvertCategory(category: string | undefined | null): AdvertCategoryGroup | null {
  if (!category) return null;
  return ADVERT_CATEGORY_GROUPS.find((g) => g.members.includes(category)) ?? null;
}
