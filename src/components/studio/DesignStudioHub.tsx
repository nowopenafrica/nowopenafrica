import { useState, useRef } from 'react';
import { Business } from '../../types';
import DesignStudio, { DesignStudioSeed } from './DesignStudio';
import QuickCreatePanel from './QuickCreatePanel';
import { QuickCreateItem } from '../../data/quickCreate';
import {
  OCCASION_TEMPLATES, POSTER_TEMPLATES, BANNER_TEMPLATES, PROMO_TEMPLATES,
  DESIGN_FORMATS, StudioTemplate,
} from '../../data/studioPresets';

// One Creative Studio that can produce flyers, posters, banners, stories and
// social graphics. Pick a template category, then any size — the design
// engines, layouts and exports are all shared underneath.
const GROUPS: { key: string; label: string; labelShort: string; templates: StudioTemplate[] }[] = [
  { key: 'occasion', label: 'Occasions & Offers', labelShort: 'Occasion', templates: OCCASION_TEMPLATES },
  { key: 'poster', label: 'Industry Posters', labelShort: 'Poster', templates: POSTER_TEMPLATES },
  { key: 'banner', label: 'Banners & Covers', labelShort: 'Banner', templates: BANNER_TEMPLATES },
  { key: 'promo', label: 'Promotions', labelShort: 'Promotion', templates: PROMO_TEMPLATES },
];

export default function DesignStudioHub({ business, initialTab = GROUPS[0].key }: { business: Business; initialTab?: string }) {
  const [groupKey, setGroupKey] = useState(initialTab);
  const [seed, setSeed] = useState<DesignStudioSeed | null>(null);
  const tokenRef = useRef(0);
  const group = GROUPS.find((g) => g.key === groupKey) ?? GROUPS[0];

  // A Quick Create card preloads the right template group + template + format
  // in one tap. The token bumps the DesignStudio key so it remounts fresh even
  // when the chosen card lives in the currently-open group.
  const handleQuickPick = (item: QuickCreateItem) => {
    const target = GROUPS.find((g) => g.templates.some((t) => t.key === item.templateKey)) ?? GROUPS[0];
    setGroupKey(target.key);
    setSeed({ token: ++tokenRef.current, templateKey: item.templateKey, formatKey: item.formatKey, runCampaign: !!item.fullCampaign });
  };

  return (
    <div className="space-y-4">
      <QuickCreatePanel onPick={handleQuickPick} />

      <div>
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Template type</label>
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <button key={g.key} onClick={() => { setGroupKey(g.key); setSeed(null); }}
              className={`inline-flex items-center px-3 .5 rounded-lg text-xs font-semibold border transition ${groupKey === g.key ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'} min-h-[44px]`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <DesignStudio
        key={`${business.id}-${groupKey}-${seed?.token ?? 0}`}
        business={business}
        templates={group.templates}
        formats={DESIGN_FORMATS}
        templateLabel={group.labelShort}
        seed={seed}
        hint="One design engine, every size — story, social post, flyer, poster, banner and cover. Export PNG, PDF, or MP4 video (5–60s) with gentle motion."
      />
    </div>
  );
}
