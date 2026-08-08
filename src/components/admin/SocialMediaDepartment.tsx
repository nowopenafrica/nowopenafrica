import { Store, Megaphone, CalendarClock, Video } from 'lucide-react';
import SchedulePublish from '../studio/SchedulePublish';
import StudioToolModule, { type ModuleProps } from './StudioToolModule';

// The Social Media Department (#5). The internal team works like an agency:
// pick any business on the platform, then drop straight into the real
// Schedule & Publish tool that business already uses — every channel,
// publish now / scheduled, from one place.
//
// Reuses: SchedulePublish (embedded 1:1). SocialStudioHub is per-business and
// stays in the Studio; the department's own calendar and AI coach views come
// next.

export default function SocialMediaDepartment(_props: ModuleProps) {
  return (
    <StudioToolModule
      idPrefix="admin-social"
      title={(b) => `Schedule & Publish — ${b.name}`}
      stats={(m) => [
        { label: 'Businesses to publish for', value: m.businesses.length, icon: Store, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
        { label: 'Posts published (backend)', value: m.published, icon: Megaphone, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
        { label: 'Scheduled posts (this machine)', value: m.local.scheduledPosts, icon: CalendarClock, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
        { label: 'Videos in production (this machine)', value: m.local.videoQueue, icon: Video, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
      ]}
      render={(b) => <SchedulePublish business={b} />}
    />
  );
}
