import { Store, Boxes, BadgeCheck, Megaphone } from 'lucide-react';
import MediaLibrary from '../studio/MediaLibrary';
import StudioToolModule, { type ModuleProps } from './StudioToolModule';

// The Brand Asset Manager (#9) — every asset with smart search, per business:
// logos, covers, photos and the downloadable files the business owns.
//
// Reuses: MediaLibrary (embedded 1:1). Fonts, templates, Lottie and the
// guidelines download centre arrive with the Design System and Press Room.

export default function BrandAssetManager(_props: ModuleProps) {
  return (
    <StudioToolModule
      idPrefix="admin-assets"
      title={(b) => `Brand Assets — ${b.name}`}
      stats={(m) => [
        { label: 'Businesses to manage', value: m.businesses.length, icon: Store, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
        { label: 'Verified businesses', value: m.businesses.filter((b) => b.verified).length, icon: BadgeCheck, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
        { label: 'Asset categories', value: '5+', icon: Boxes, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
        { label: 'Posts published (backend)', value: m.published, icon: Megaphone, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
      ]}
      render={(b) => <MediaLibrary business={b} />}
    />
  );
}
