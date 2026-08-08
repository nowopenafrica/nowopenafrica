import { Store, Video, Clapperboard, CalendarClock } from 'lucide-react';
import StudioVideoStudio from '../studio/VideoStudio';
import StudioToolModule, { type ModuleProps } from './StudioToolModule';

// The AI Video Studio (#4) — idea → script → storyboard → voiceover → AI
// video → captions → music → export, for any selected business.
//
// This now embeds the real studio engine (the same one the businesses use):
// a generated reel script with scene-by-scene voiceover, a copyable shot list
// and captions, and a canvas renderer that actually produces a downloadable
// video. The "Videos in production (this machine)" stat counts queued admin
// renders in the session.
//
// Honest about what it is: designed graphics, stock footage or generated key
// art — filmed by the browser. No text-to-video model is claimed.

export default function VideoStudio(_props: ModuleProps) {
  return (
    <StudioToolModule
      idPrefix="admin-video"
      title={(b) => `AI Video Studio — ${b.name}`}
      stats={(m) => [
        { label: 'Businesses to produce for', value: m.businesses.length, icon: Store, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
        { label: 'Videos in production (this machine)', value: m.local.videoQueue, icon: Video, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
        { label: 'Aspect ratios', value: '9+', icon: Clapperboard, tone: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-300' },
        { label: 'Posts published (backend)', value: m.published, icon: CalendarClock, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
      ]}
      render={(b) => <StudioVideoStudio business={b} />}
    />
  );
}
