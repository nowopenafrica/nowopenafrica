import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Award, BadgeInfo, Globe2, Loader2, Megaphone, Plus, Ruler, X } from 'lucide-react';

import LocationAutocomplete from '../LocationAutocomplete';
import SuggestInput from '../SuggestInput';
import SmartImg from '../SmartImg';
import StockPhotoCaption from '../StockPhotoCaption';
import { ADVERT_CATEGORY_GROUPS, groupForAdvertCategory } from '../../data/advertCategories';
import { AFRICAN_PLACES } from '../../data/locations';
import { addAdvertsToPlan } from '../../lib/promote/campaigns';
import { describeDimensions, readAdDimensions } from '../../lib/promote/adDimensions';
import { normalize } from '../../lib/search';
import { buildSuggestions } from '../../lib/suggest';
import type { Advertisement } from '../../types';
import { isListedPlacement, type PlacementTrust } from '../../lib/promote/trust';
import { reportPlanAdd } from '../../lib/promote/planToast';
import { PlacementPrice, PlacementWhere, TrustChip, trustFor } from './PlacementLine';

/** "6m × 3m", "15 second slot" — or, when the listing does not say, that. */
const sizeOf = (raw: string | null | undefined) => {
  const d = readAdDimensions(raw);
  return d.kind === 'unknown' ? 'Size to confirm' : describeDimensions(d);
};

function PlacementCard({
  advert, trust, adding, onAdd,
}: {
  advert: Advertisement;
  trust: PlacementTrust;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <article
      data-testid="placement-card"
      data-category={advert.category ?? ''}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:border-orange-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-orange-700"
    >
      <Link to={`/adverts/${advert.id}`} tabIndex={-1} aria-hidden className="relative block h-28 overflow-hidden">
        {/* 16 of the 97 placement photos are hotlinked from an operator's site
            that blocks them. A missing photograph should look like a plain
            card, not a page that failed to load, and it must not depend on a
            third party's URL staying alive. */}
        {advert.image_url ? (
          <>
            <SmartImg
              src={advert.image_url}
              alt=""
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            {/* Every placement photo was stock when this was written; say so on the picture. */}
            <StockPhotoCaption url={advert.image_url} />
          </>
        ) : (
          <div className="grid h-full w-full place-items-center bg-gray-100 text-gray-300 dark:bg-gray-900 dark:text-gray-600">
            <Megaphone size={28} />
          </div>
        )}
        {advert.awards ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-amber-300 backdrop-blur">
            <Award size={11} /> {advert.awards}
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col p-3">
        {/* The trust chip sits beside the medium, in the card body: the photo
            already carries the stock-photo caption along its bottom edge and
            the award top-left, so nothing on the picture competes with it. */}
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <p className="text-xs font-medium text-orange-700 dark:text-orange-300">{advert.category || 'Advertisement'}</p>
          <TrustChip trust={trust} />
        </div>
        <h4 className="line-clamp-2 text-sm font-bold text-gray-900 dark:text-white">
          <Link to={`/adverts/${advert.id}`} className="hover:text-orange-700 dark:hover:text-orange-300">{advert.title}</Link>
        </h4>
        <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
          <PlacementWhere advert={advert} />
          <p className="flex items-center gap-1.5"><Ruler size={13} className="shrink-0 text-gray-400" aria-hidden /><span className="line-clamp-1">{sizeOf(advert.dimensions)}</span></p>
        </div>
        <div className="mt-auto pt-3">
          <PlacementPrice advert={advert} trust={trust} />
          <button
            type="button"
            onClick={onAdd}
            disabled={adding}
            aria-label={`Add ${advert.title} to plan`}
            className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-3 text-sm font-semibold text-gray-800 hover:border-orange-400 disabled:opacity-60 dark:border-gray-600 dark:text-gray-200"
          >
            {adding ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />} Add to plan
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * "Out in the world": every outdoor, transit, screen, broadcast, print and
 * online placement, browsed by medium.
 *
 * ── ONE ROW OF MEDIUM CHIPS ──────────────────────────────────────────────
 *
 * This page used to carry the same filter twice: a "Browse by medium"
 * carousel and a category <select> under the search box, each able to
 * contradict the other. Now there is one row of medium chips — on a phone
 * it scrolls sideways inside itself (never the page), from `sm` it wraps —
 * plus a search box and a city filter. Every medium is
 * shown even at zero: the marketplace is a supply problem, and an empty
 * medium is a gap a seller may want to fill. The count says so plainly.
 *
 * A category picked from the search suggestions narrows inside its medium
 * and shows as a chip of its own, so it is never a hidden filter.
 */
export default function MediumBrowser({
  adverts: allAdverts, trust, loading, error, initialSearch = '', initialLocation = '', cityRequest,
}: {
  adverts: Advertisement[];
  /** placement_trust by advert id, read once by the page. Empty while it loads or if it failed. */
  trust?: Map<string, PlacementTrust>;
  loading: boolean;
  error: string | null;
  initialSearch?: string;
  initialLocation?: string;
  /** A city asked for in the request bar; `n` counts asks so a repeat still applies. */
  cityRequest?: { city: string; n: number } | null;
}) {
  /* Rejected and archived placements are never listed, counted or suggested; the page filters too, this holds wherever the browser is used. */
  const adverts = useMemo(() => allAdverts.filter(isListedPlacement), [allAdverts]);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [locationFilter, setLocationFilter] = useState(initialLocation);

  /* A city-only request ("billboards in Abuja") lands here, visibly, in the city filter. */
  useEffect(() => {
    if (cityRequest) setLocationFilter(cityRequest.city);
  }, [cityRequest]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of adverts) {
      const g = groupForAdvertCategory(a.category);
      if (g) counts[g.key] = (counts[g.key] ?? 0) + 1;
    }
    return counts;
  }, [adverts]);

  // Placements, the places they sit in, and the media categories — one list.
  const suggestions = useMemo(() => buildSuggestions({
    items: adverts,
    name: (a: Advertisement) => a.title ?? '',
    detail: (a: Advertisement) => [a.category, a.location].filter(Boolean).join(' · ') || undefined,
    categories: [...new Set(adverts.map((a) => a.category).filter(Boolean) as string[])].sort(),
    places: AFRICAN_PLACES,
  }, searchQuery), [adverts, searchQuery]);

  const activeGroupObj = ADVERT_CATEGORY_GROUPS.find((g) => g.key === activeGroup) ?? null;
  const hasFilters = !!searchQuery.trim() || !!locationFilter.trim() || !!activeGroup || !!categoryFilter;

  let shown = adverts;
  if (categoryFilter) shown = shown.filter((a) => a.category === categoryFilter);
  if (activeGroupObj) shown = shown.filter((a) => a.category && activeGroupObj.members.includes(a.category));
  if (searchQuery.trim()) {
    const q = normalize(searchQuery);
    shown = shown.filter((a) => normalize(a.title ?? '').includes(q) || normalize(a.description ?? '').includes(q) || normalize(a.category ?? '').includes(q));
  }
  if (locationFilter.trim()) {
    const q = normalize(locationFilter.split(',')[0]);
    shown = shown.filter((a) => normalize(a.location ?? '').includes(q));
  }

  const clearAll = () => { setSearchQuery(''); setLocationFilter(''); setActiveGroup(null); setCategoryFilter(''); };

  const add = async (a: Advertisement) => {
    if (adding) return;
    setAdding(String(a.id));
    try {
      reportPlanAdd(await addAdvertsToPlan([{ id: String(a.id), pricing: a.pricing ?? null }]));
    } finally {
      setAdding(null);
    }
  };

  const chip = (on: boolean) => `inline-flex shrink-0 snap-start items-center gap-1.5 min-h-[44px] rounded-full border px-4 text-sm font-semibold transition ${
    on
      ? 'border-transparent bg-orange-700 text-white'
      : 'border-gray-300 bg-white text-gray-700 hover:border-orange-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
  }`;

  return (
    <section aria-labelledby="out-in-the-world" data-promote-section="world" className="scroll-mt-24">
      <h2 id="out-in-the-world" className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
        <Globe2 size={18} className="text-orange-600 dark:text-orange-400" aria-hidden />
        Out in the world
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
        {/* Not "verified": nobody has inspected these sites, so the word would
            be a claim the platform could not stand behind. */}
        {adverts.length > 0 ? `${adverts.length} placements` : 'Placements'} across outdoor, transit,
        digital screens, broadcast, print and online.
      </p>

      {/* Where the numbers come from — said beside the numbers. */}
      <div className="mt-4 flex gap-3 rounded-2xl bg-gray-50 p-4 dark:bg-gray-900/60">
        <BadgeInfo size={18} className="mt-0.5 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <strong>Rates are derived from published Nigerian OOH rate cards</strong>, so every price is
          indicative. Where a card price is struck through, the figure beside it is the discounted
          rate. Availability and the final price for your dates are confirmed when you enquire —
          outdoor is booked by the month and priced by site, season and duration.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SuggestInput
          value={searchQuery}
          onChange={setSearchQuery}
          suggestions={suggestions}
          onPick={(s) => {
            if (s.kind === 'place') { setSearchQuery(''); setLocationFilter(s.value); return; }
            if (s.kind === 'category') {
              setSearchQuery('');
              setActiveGroup(groupForAdvertCategory(s.value)?.key ?? null);
              setCategoryFilter(s.value);
              return;
            }
            setSearchQuery(s.value);
          }}
          placeholder="Search placements…"
          ariaLabel="Search placements"
          itemNoun="Placement"
          listId="advert-suggestions"
        />
        <LocationAutocomplete
          value={locationFilter}
          onChange={setLocationFilter}
          extraOptions={adverts.map((a) => a.location ?? '')}
          placeholder="Filter by city…"
          className="min-h-[44px] bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
        />
      </div>

      {/* One row: it scrolls sideways inside itself on a phone (never the page) and wraps from sm. */}
      <div data-testid="medium-chips" role="group" aria-label="Medium" className="mt-4 flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        <button type="button" aria-pressed={!activeGroup} onClick={() => { setActiveGroup(null); setCategoryFilter(''); }} className={chip(!activeGroup)}>
          All <span className={!activeGroup ? 'text-white/70' : 'text-gray-400'}>{adverts.length}</span>
        </button>
        {ADVERT_CATEGORY_GROUPS.map((g) => {
          const on = activeGroup === g.key;
          const Icon = g.icon;
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={on}
              onClick={() => { setActiveGroup(on ? null : g.key); setCategoryFilter(''); }}
              className={chip(on)}
            >
              <Icon size={15} aria-hidden /> {g.label}
              <span className={on ? 'text-white/70' : 'text-gray-400'}>{groupCounts[g.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {(categoryFilter || hasFilters) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {categoryFilter && (
            <button type="button" onClick={() => setCategoryFilter('')} className={chip(true)} aria-label={`Remove ${categoryFilter} filter`}>
              {categoryFilter} <X size={14} aria-hidden />
            </button>
          )}
          {hasFilters && (
            <button type="button" onClick={clearAll} className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 px-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
              <X size={15} aria-hidden /> Clear filters
            </button>
          )}
        </div>
      )}

      <div className="mb-3 mt-5 flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-900 dark:text-white">
          {categoryFilter || (activeGroupObj ? activeGroupObj.label : 'All placements')}
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">{shown.length}</span>
        </h3>
        {(activeGroupObj || categoryFilter) && (
          <button type="button" onClick={() => { setActiveGroup(null); setCategoryFilter(''); }} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-orange-700 dark:text-orange-300">
            View all <ArrowRight size={15} aria-hidden />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading advertising placements…
        </div>
      ) : error ? (
        /* Kept apart from "no matches": a failed query used to render as an
           empty catalogue, which is how a live outage stayed invisible. */
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800 sm:p-12">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-red-100 dark:bg-red-900/30"><X size={32} className="text-red-600 dark:text-red-400" /></div>
          <h4 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">Failed to load advertising placements</h4>
          <p className="mb-6 text-gray-600 dark:text-gray-400">{error}</p>
          <button type="button" onClick={() => window.location.reload()} className="min-h-[44px] rounded-xl bg-gray-900 px-6 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900">Try again</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center">
          <Megaphone size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" aria-hidden />
          {adverts.length === 0 ? (
            <>
              <p className="font-medium text-gray-900 dark:text-white">No placements are published yet.</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">New advertising inventory is added regularly — check back soon.</p>
            </>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">No placements match your filters.</p>
          )}
        </div>
      ) : (
        /* Two across on a phone, six at 1536px: cards are mostly image and a
           rate, so they read fine narrow, and 97 at four across is a lot of
           scrolling. */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {shown.map((a) => (
            <PlacementCard key={a.id} advert={a} trust={trustFor(trust, a.id)} adding={adding === String(a.id)} onAdd={() => add(a)} />
          ))}
        </div>
      )}
    </section>
  );
}
