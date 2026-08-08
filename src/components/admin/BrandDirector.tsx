import toast from 'react-hot-toast';
import { Store, Bot, Megaphone, CalendarClock } from 'lucide-react';
import MarketingDirector from '../studio/MarketingDirector';
import { growthModuleToSection } from '../../lib/adminCreator';
import StudioToolModule, { type ModuleProps } from './StudioToolModule';

// The AI Brand Director (#12) — "launch our restaurant campaign" → strategy,
// timeline, flyers, videos, emails, landing page, ads, budget and KPIs. The
// assistant chat is per business; suggestions that map to a department open
// that department here, everything else falls back to the business Studio.

export default function BrandDirector({ onOpenSection }: ModuleProps) {
  return (
    <StudioToolModule
      idPrefix="admin-director"
      onOpenSection={onOpenSection}
      title={(b) => `AI Brand Director — ${b.name}`}
      stats={(m) => [
        { label: 'Businesses to direct', value: m.businesses.length, icon: Store, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
        { label: 'AI assistant', value: 'online', icon: Bot, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
        { label: 'Posts published (backend)', value: m.published, icon: Megaphone, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
        { label: 'Scheduled posts (this machine)', value: m.local.scheduledPosts, icon: CalendarClock, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
      ]}
      render={(b, open) => (
        <MarketingDirector
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
