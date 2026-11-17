import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';

import DesignSurface from '../studio/DesignSurface';
import ProductCarousel, { type CarouselCard } from './ProductCarousel';
import EngineGallery from './EngineGallery';
import { hasEngineGallery } from '../../lib/create/engineItems';
import { SUBCATEGORIES } from '../../lib/create/catalogueTaxonomy';
import { galleryFor, type GalleryDesign } from '../../lib/create/compose/gallery';
import { PHOTO_BASE } from '../../lib/create/compose/photoSet';
import { NEEDS, type NeedSlug } from '../../lib/create/needs';
import { FEATURED_ROWS, STRIP_ITEMS } from '../../lib/create/engineFeatured';
import { formatOf } from '../../lib/design/formats';
import { paletteOf } from '../../lib/design/palettes';
import { matchesTier, TIERS, useTemplateTiers, type TierFilter, type TierInfo, type TierTable } from '../../lib/create/tiers';
import { TierBadge, TierFilterBar, TierNote } from './TierControls';

/**
 * The Create page's default view, drawn by the engine (lib/create/compose/gallery.ts).
 *
 * The strip under the request box and the featured rows below Popular now
 * used to show the older templates. With the engine on (CONCEPTS_ON) they
 * show its designs instead, so the first thing a visitor sees meets the same
 * measured standard as the category galleries. A card opens its item's
 * gallery, where the design can be edited.
 */

const ROW = 6;

const needOf = (item: string): NeedSlug | null =>
  NEEDS.find((n) => n.deliverables.some((d) => d.slug === item))?.slug ?? null;
const nameOf = (item: string) => SUBCATEGORIES.find((s) => s.key === item)?.name ?? item;
const accentOf = (d: GalleryDesign) => paletteOf(d.palette)?.colours.primary ?? '#15803d';

function Card({ design, title, sub, onOpen, tabIndex, tier, tiers }: {
  design: GalleryDesign; title: string; sub: string; onOpen: () => void; tabIndex?: number;
  tier?: TierInfo; tiers?: TierTable | null;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      tabIndex={tabIndex}
      data-testid="engine-featured-card"
      className="group block w-full min-w-0 text-left"
    >
      <div className="relative overflow-hidden rounded-xl border border-gray-200 shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md dark:border-gray-700">
        <DesignSurface page={design.doc.pages[0]} accent={accentOf(design)} />
        <TierBadge info={tier} table={tiers ?? null} className="absolute left-2 top-2 max-w-[calc(100%-1rem)] shadow-sm" />
      </div>
      <span className="mt-2 block truncate text-[13px] font-semibold text-gray-900 dark:text-white">{title}</span>
      <span className="block truncate text-[12px] text-gray-600 dark:text-gray-400">{sub}</span>
    </button>
  );
}

/**
 * Browse by category, drawn by the engine: one chip per category, and that
 * category's gallery under it. It takes the place of the template browser on
 * the default view; the templates stay inside each category, under "More templates".
 */
function EngineBrowse() {
  const tiers = useTemplateTiers();
  const [tier, setTier] = useState<TierFilter>('all');
  const allGroups = useMemo(() => NEEDS
    .map((n) => ({ slug: n.slug, title: n.title, items: n.deliverables.map((d) => d.slug).filter(hasEngineGallery) }))
    .filter((g) => g.items.length > 0), []);
  /* Under a tier, a category shows only if it holds an item in that tier. */
  const groups = useMemo(
    () => (tiers ? allGroups.filter((g) => g.items.some((i) => matchesTier(tier, tiers.byItem.get(i)))) : allGroups),
    [allGroups, tiers, tier],
  );
  const counts = useMemo(() => {
    const items = allGroups.flatMap((g) => g.items);
    const c: Partial<Record<TierFilter, number>> = { all: items.length };
    if (tiers) for (const t of TIERS) c[t] = items.filter((i) => tiers.byItem.get(i)?.tier === t).length;
    return c;
  }, [allGroups, tiers]);
  /* Open on a category the featured rows above do not already show. */
  const [on, setOn] = useState(() => (allGroups.find((g) => !g.items.some((i) => FEATURED_ROWS.some((r) => r.item === i))) ?? allGroups[0])?.slug ?? '');
  const group = groups.find((g) => g.slug === on) ?? groups[0];
  if (!group) return null;
  return (
    <section data-create-section="browse" data-testid="engine-browse" aria-labelledby="engine-browse-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="engine-browse-title" className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">Browse by category</h2>
        <TierFilterBar id="engine-browse-tier" value={tier} onChange={setTier} counts={counts} />
      </div>
      {tiers && tier !== 'free' && (counts.premium ?? 0) + (counts.signature ?? 0) > 0 && <div className="mt-2"><TierNote /></div>}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Category">
        {groups.map((g) => (
          <button
            key={g.slug}
            type="button"
            aria-pressed={g.slug === group.slug}
            onClick={() => setOn(g.slug)}
            className={`min-h-[44px] rounded-full border px-4 text-[13px] font-semibold ${g.slug === group.slug ? 'border-green-700 bg-green-700 text-white' : 'border-gray-300 text-gray-700 hover:border-gray-500 dark:border-gray-600 dark:text-gray-300'}`}
          >
            {g.title}
          </button>
        ))}
      </div>
      <div className="mt-6">
        <EngineGallery key={`${group.slug}:${tier}`} deliverables={group.items} dense tier={tier} />
      </div>
    </section>
  );
}

export default function EngineFeatured({ part, onPick }: {
  part: 'strip' | 'rows' | 'browse';
  onPick: (need: NeedSlug, item: string) => void;
}) {
  if (part === 'browse') return <EngineBrowse />;
  return <Featured part={part} onPick={onPick} />;
}

function Featured({ part, onPick }: {
  part: 'strip' | 'rows';
  onPick: (need: NeedSlug, item: string) => void;
}) {
  const tiers = useTemplateTiers();
  const strip = useMemo(() => (part !== 'strip' ? [] : STRIP_ITEMS.flatMap((item, i) => {
    /* A different design per item, so the strip is not twelve of the same composition. */
    const g = galleryFor(item, { count: (i % 4) + 1, photos: PHOTO_BASE || undefined });
    const need = needOf(item);
    const design = g[g.length - 1];
    return design && need ? [{ item, need, design }] : [];
  })), [part]);

  const rows = useMemo(() => (part !== 'rows' ? [] : FEATURED_ROWS.flatMap((r) => {
    const need = needOf(r.item);
    const designs = galleryFor(r.item, { count: ROW, photos: PHOTO_BASE || undefined });
    return need && designs.length ? [{ ...r, need, designs }] : [];
  })), [part]);

  if (part === 'strip') {
    const cards: CarouselCard[] = strip.map(({ item, need, design }) => ({
      key: design.id,
      render: (clone) => (
        <Card design={design} title={nameOf(item)} sub={design.movement} tabIndex={clone ? -1 : undefined} onOpen={() => onPick(need, item)} tier={tiers?.byItem.get(item)} tiers={tiers} />
      ),
    }));
    return <ProductCarousel listed={[]} onOpen={() => undefined} cards={cards} />;
  }

  if (rows.length === 0) return null;
  return (
    <section data-create-section="collections" data-testid="engine-featured" aria-label="Featured designs" className="space-y-8">
      {rows.map((r) => {
        const f = formatOf(SUBCATEGORIES.find((s) => s.key === r.item)?.formats[0] ?? '');
        const wide = f ? f.w / f.h > 1.3 : false;
        return (
          <div key={r.item} data-testid="engine-featured-row" data-item={r.item}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{r.title}</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{r.blurb}</p>
              </div>
              <button
                type="button"
                onClick={() => onPick(r.need, r.item)}
                className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-green-700 hover:text-green-800 dark:text-green-400"
              >
                See all <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
            {/* Landscape items (a card) show one row of four, at a size close to the portrait rows. */}
            <div className={`mt-3 grid gap-4 ${wide ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
              {r.designs.slice(0, wide ? 4 : ROW).map((d) => (
                <Card key={d.id} design={d} title={d.movement} sub={d.type} onOpen={() => onPick(r.need, r.item)} tier={tiers?.byItem.get(r.item)} tiers={tiers} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
