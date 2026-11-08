import { useMemo, useState } from 'react';
import { ImageIcon } from 'lucide-react';

import MockupView from './MockupView';
import { PreviewCard } from './TemplateGallery';
import { useMockupScenes } from '../../hooks/useMockupScenes';
import { mockupScenesFor } from '../../lib/create/templateDetail';
import { DESIGN_STYLES } from '../../lib/design/styles';
import type { DesignTemplate } from '../../lib/designTemplates';
import { localDateISO } from '../../lib/dates';
import { BADGE_LABELS, cardBadges, cardFacts } from '../../lib/create/templateCard';

/**
 * One design in the catalogue browse and the featured collections (spec §10,
 * Cards): the artwork at its true shape, then the name, subcategory,
 * direction (only when set), format and one practical line.
 *
 * The artwork is PreviewCard's, unchanged: the same renderer, the same link
 * to the detail page with the corner Edit button, and the same rule that the
 * TemplateSurface mounts only once the card is in view.
 *
 * "See it in place" appears only when an approved scene matches the design's
 * format within 1% (lib/create/mockup.ts). It places the artwork on the scene
 * for the eye only, labelled "Mockup: illustration only"; nothing exports it.
 *
 * Badges only when verified (lib/create/templateCard.ts): "Editable" when C7
 * passes, "Platform size" when the format's check is current. Never
 * "Print-ready" in P2.
 */

const STYLE = DESIGN_STYLES[0].key;
const BRAND = '#2563eb';

export default function TemplateCard({
  template, onEdit, today,
}: {
  template: DesignTemplate;
  onEdit: (tpl: DesignTemplate) => void;
  /** YYYY-MM-DD, local. Defaults to today (lib/dates.ts, never UTC). */
  today?: string;
}) {
  const facts = useMemo(() => cardFacts(template), [template]);
  const day = today ?? localDateISO();
  const badges = useMemo(() => cardBadges(template, day), [template, day]);

  const kind = [facts.subcategory, facts.direction].filter(Boolean);

  const pool = useMockupScenes();
  const scenes = useMemo(() => mockupScenesFor(template, pool), [template, pool]);
  const [inPlace, setInPlace] = useState(false);

  return (
    <div data-testid="template-card" data-key={template.key} className="min-w-0">
      <PreviewCard
        template={template}
        styleKey={STYLE}
        brand={BRAND}
        onOpen={() => onEdit(template)}
        body={(
          <div className="p-2.5">
            <p className="truncate text-[13px] font-bold leading-tight text-gray-900 group-hover:text-green-700 dark:text-white dark:group-hover:text-green-300">
              {facts.name}
            </p>
            {kind.length > 0 && (
              <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                {facts.subcategory}
                {facts.direction && (
                  <span data-testid="card-direction">{facts.subcategory ? ' · ' : ''}{facts.direction}</span>
                )}
              </p>
            )}
            {facts.format && (
              <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{facts.format}</p>
            )}
            <p data-testid="card-line" title={facts.line} className="mt-1 truncate text-[11px] text-gray-600 dark:text-gray-400">
              {facts.line}
            </p>
            {badges.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {badges.map((b) => (
                  <span
                    key={b}
                    data-testid="card-badge"
                    className="rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-300"
                  >
                    {BADGE_LABELS[b]}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      />
      {scenes.length > 0 && (
        <div className="mt-1.5">
          <button
            type="button"
            data-testid="card-see-in-place"
            aria-pressed={inPlace}
            onClick={() => setInPlace((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 px-3 text-xs font-semibold text-gray-800 dark:border-gray-600 dark:text-gray-200"
          >
            <ImageIcon size={14} /> See it in place
          </button>
          {inPlace && (
            <div className="mt-1.5">
              <MockupView scene={scenes[0]} template={template} styleKey={STYLE} brand={BRAND} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A card-shaped placeholder while the catalogue is still loading. */
export function TemplateCardSkeleton() {
  return (
    <div
      data-testid="card-skeleton"
      aria-hidden="true"
      className="animate-pulse overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
    >
      <div className="aspect-square w-full bg-gray-100 dark:bg-gray-900" />
      <div className="space-y-1.5 p-2.5">
        <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-2.5 w-1/2 rounded bg-gray-100 dark:bg-gray-700/60" />
        <div className="h-2.5 w-5/6 rounded bg-gray-100 dark:bg-gray-700/60" />
      </div>
    </div>
  );
}
