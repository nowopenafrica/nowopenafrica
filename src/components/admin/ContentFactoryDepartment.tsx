import { Store, FileText, Megaphone, CalendarClock } from 'lucide-react';
import ContentFactory from '../studio/ContentFactory';
import StudioToolModule, { type ModuleProps } from './StudioToolModule';

// The Content Factory (#7) — the platform's AI writer. Captions, copy packs,
// and the whole NowOpen voice, per business. "Design this" and "Schedule"
// hand off to the Creative Studio and Social Media Department.
//
// Reuses: ContentFactory (embedded 1:1), CaptionEnginePanel and the AI
// assistant (MarketingAssistant). Press releases, emails and newsletters land
// with the Press Room.

export default function ContentFactoryDepartment({ onOpenSection }: ModuleProps) {
  return (
    <StudioToolModule
      idPrefix="admin-content"
      onOpenSection={onOpenSection}
      title={(b) => `Content Factory — ${b.name}`}
      stats={(m) => [
        { label: 'Businesses to write for', value: m.businesses.length, icon: Store, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
        { label: 'Copy goals', value: 12, icon: FileText, tone: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-300' },
        { label: 'Posts published (backend)', value: m.published, icon: Megaphone, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
        { label: 'Scheduled posts (this machine)', value: m.local.scheduledPosts, icon: CalendarClock, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
      ]}
      render={(b, open) => (
        <ContentFactory
          business={b}
          onDesign={() => open('creative')}
          onSchedule={() => open('social')}
          onNavigate={() => open('social')}
        />
      )}
    />
  );
}
