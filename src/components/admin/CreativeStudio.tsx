import { Store, BadgeCheck, Palette, Megaphone } from 'lucide-react';
import { OCCASION_TEMPLATES, SOCIAL_FORMATS } from '../../data/studioPresets';
import DesignStudio from '../studio/DesignStudio';
import StudioToolModule, { type ModuleProps } from './StudioToolModule';

// The Creative Studio (#2) — the internal design department. Pick any
// business and open the same Design Studio it uses, with every occasion
// template and social format, exporting PNG, PDF or MP4.
//
// Reuses: DesignStudio (embedded 1:1 with the studio presets). QuickCreate
// and the Free Canvas remain business-side for now.

export default function CreativeStudio(_props: ModuleProps) {
  return (
    <StudioToolModule
      idPrefix="admin-creative"
      title={(b) => `Design Studio — ${b.name}`}
      stats={(m) => [
        { label: 'Businesses to design for', value: m.businesses.length, icon: Store, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
        { label: 'Verified businesses', value: m.businesses.filter((b) => b.verified).length, icon: BadgeCheck, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
        { label: 'Design formats', value: SOCIAL_FORMATS.length, icon: Palette, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
        { label: 'Posts published (backend)', value: m.published, icon: Megaphone, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
      ]}
      render={(b) => (
        <DesignStudio
          business={b}
          templates={OCCASION_TEMPLATES}
          formats={SOCIAL_FORMATS}
          templateLabel="Post type"
          hint="Design posts & stories for every platform — export PNG, PDF, or MP4 video."
        />
      )}
    />
  );
}
