import { Store, Flame, Megaphone, CalendarClock } from 'lucide-react';
import TrendRadarPanel from '../studio/TrendRadarPanel';
import StudioToolModule, { type ModuleProps } from './StudioToolModule';

// Trend Discovery (#14) — what's moving near each business right now, from
// the same Trend Radar the Studio uses.
//
// Reuses: TrendRadarPanel (embedded 1:1). Cross-platform scanning across
// Google, TikTok, Instagram, YouTube and news lands with the Analytics War
// Room.

export default function TrendDiscovery(_props: ModuleProps) {
  return (
    <StudioToolModule
      idPrefix="admin-trends"
      title={(b) => `Trend Radar — ${b.name}`}
      stats={(m) => [
        { label: 'Businesses to scan', value: m.businesses.length, icon: Store, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
        { label: 'Trend markets', value: '5+', icon: Flame, tone: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300' },
        { label: 'Posts published (backend)', value: m.published, icon: Megaphone, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
        { label: 'Scheduled posts (this machine)', value: m.local.scheduledPosts, icon: CalendarClock, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
      ]}
      render={(b) => <TrendRadarPanel business={b} />}
    />
  );
}
