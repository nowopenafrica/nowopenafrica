import { Store, Rocket, Megaphone, CalendarClock } from 'lucide-react';
import CampaignManager from '../studio/CampaignManager';
import StudioToolModule, { type ModuleProps } from './StudioToolModule';
import PlatformCampaigns from './PlatformCampaigns';

// The Campaign Factory (#6). Two layers: the platform campaign ledger on top —
// Africa is NowOpen, Restaurant Week, Tailor Week — living on os_campaigns with
// honest statuses, and below it the real per-business Campaign Manager that the
// team uses to run outreach for any business the way the owner would.

export default function CampaignFactory(_props: ModuleProps) {
  return (
    <div className="space-y-6">
      <PlatformCampaigns />
      <StudioToolModule
        idPrefix="admin-campaign"
        title={(b) => `Campaign Manager — ${b.name}`}
        stats={(m) => [
          { label: 'Businesses to campaign for', value: m.businesses.length, icon: Store, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
          { label: 'Campaigns created (this machine)', value: m.local.campaigns, icon: Rocket, tone: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300' },
          { label: 'Posts published (backend)', value: m.published, icon: Megaphone, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
          { label: 'Scheduled posts (this machine)', value: m.local.scheduledPosts, icon: CalendarClock, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
        ]}
        render={(b) => <CampaignManager business={b} />}
      />
    </div>
  );
}
