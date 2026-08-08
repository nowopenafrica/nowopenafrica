import toast from 'react-hot-toast';
import { Store, TrendingUp, Megaphone, CalendarClock } from 'lucide-react';
import CampaignAnalytics from '../studio/CampaignAnalytics';
import { growthModuleToSection } from '../../lib/adminCreator';
import StudioToolModule, { type ModuleProps } from './StudioToolModule';

// The Analytics War Room (#13) — the platform heartbeat, per business:
// campaign performance, reach and engagement funnels from the real analytics
// engine. Platform-wide maps, attribution and retention land next.

export default function AnalyticsWarRoom({ onOpenSection }: ModuleProps) {
  return (
    <StudioToolModule
      idPrefix="admin-analytics"
      onOpenSection={onOpenSection}
      title={(b) => `Campaign Analytics — ${b.name}`}
      stats={(m) => [
        { label: 'Businesses to analyse', value: m.businesses.length, icon: Store, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
        { label: 'Campaigns created (this machine)', value: m.local.campaigns, icon: TrendingUp, tone: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300' },
        { label: 'Posts published (backend)', value: m.published, icon: Megaphone, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
        { label: 'Scheduled posts (this machine)', value: m.local.scheduledPosts, icon: CalendarClock, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
      ]}
      render={(b, open) => (
        <CampaignAnalytics
          business={b}
          onNavigate={(mod) => {
            const section = growthModuleToSection(mod);
            if (section) open(section);
            else toast('Opens in the business Studio — the Admin Creator wires this next.');
          }}
        />
      )}
    />
  );
}
