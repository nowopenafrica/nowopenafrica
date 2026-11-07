import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Loader2, LocateFixed, MapPin, Palette, Plus, X } from 'lucide-react';

import { useCurrency } from '../../contexts/CurrencyContext';
import { addAdvertsToPlan } from '../../lib/promote/campaigns';
import { freeTool } from '../../lib/promote/freeTools';
import { parsePromoteIntent } from '../../lib/promote/promoteIntent';
import { detectLocation } from '../../lib/geolocation';
import { NEEDS } from '../../lib/create/needs';
import { formatPrice } from '../../lib/revenue/products';
import { ngnToUsd, productPriceUsd } from '../../lib/promote/hubMoney';
import { reportPlanAdd } from '../../lib/promote/planToast';
import type { Goal } from '../../lib/promote/goals';
import type { LevelKey, Mix, MixItem } from '../../lib/promote/mix';
import type { PlacementTrust } from '../../lib/promote/trust';
import type { Advertisement } from '../../types';
import { PlacementPrice, PlacementWhere, TrustChip, trustFor } from './PlacementLine';

const toPlan = (a: Advertisement) => ({ id: String(a.id), pricing: a.pricing ?? null });

/** The Create deliverable's own name, so the chip says what Create calls it. */
const designName = (need: string, deliverable: string) =>
  NEEDS.find((n) => n.slug === need)?.deliverables.find((d) => d.slug === deliverable)?.name
  ?? deliverable.replace(/-/g, ' ');

/**
 * The level a goal opens on: Starter, the first one that costs anything —
 * or Free when Starter holds nothing paid (no products, nothing in the area).
 */
const defaultLevel = (mix: Mix): LevelKey =>
  mix.levels.find((l) => l.key === 'starter')?.items.some((i) => i.kind !== 'free') ? 'starter' : 'free';

/**
 * The goal view: what opens when a tile or a request resolves to a goal.
 *
 * One section, in this order: the one sentence on what works, the area, the
 * four budget levels, what is priced on request, and the designs to make.
 * The page above stays exactly as it was, so changing your mind is one tap
 * on another tile — the same contract as Create's NeedView. The page mounts
 * it keyed by goal, so a different goal starts again at its default level.
 *
 * ── HONEST MONEY ─────────────────────────────────────────────────────────
 *
 * Every figure goes through useCurrency().format, so it reads in the
 * visitor's currency and only that. Placement figures are published rate
 * cards, not quotes for your dates, so each is "indicative"; a NowOpen
 * product's price is the price we set, so it is not. A level never sums the
 * two into one figure — set prices and indicative month costs are different
 * bases, so they are totalled on separate lines. There is no reach,
 * impression or audience figure anywhere, because we have none we could
 * stand behind.
 */
export default function GoalView({
  goal, mix, city, cities, placementsLoading, onCity, onClose, trust,
}: {
  goal: Goal;
  mix: Mix;
  /** placement_trust by advert id, read once by the page. Empty while it loads or if it failed. */
  trust?: Map<string, PlacementTrust>;
  city: string | null;
  /** Cities that have placements, for the area picker. */
  cities: string[];
  placementsLoading: boolean;
  onCity: (city: string | null) => void;
  onClose: () => void;
}) {
  const { format, ngnPerUsd } = useCurrency();
  /* Null until the visitor picks, so the default follows the data as it loads. */
  const [picked, setPicked] = useState<LevelKey | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const level = picked ?? defaultLevel(mix);
  const current = mix.levels.find((l) => l.key === level) ?? mix.levels[0];
  const placements = current.items.flatMap((i) => (i.kind === 'placement' ? [i.advert] : []));
  const paid = current.items.filter((i) => i.kind !== 'free');
  const productsNgn = current.items.reduce((s, i) => s + (i.kind === 'product' ? i.costNgn : 0), 0);
  const placementsNgn = current.items.reduce((s, i) => s + (i.kind === 'placement' ? i.costNgn : 0), 0);

  const add = async (key: string, list: Advertisement[]) => {
    if (adding) return;
    setAdding(key);
    try {
      reportPlanAdd(await addAdvertsToPlan(list.map(toPlan)));
    } finally {
      setAdding(null);
    }
  };

  const useMyLocation = async () => {
    setLocating(true);
    setLocateError(null);
    try {
      const loc = await detectLocation();
      const found = loc.city || loc.label.split(',')[0].trim();
      /*
       * Geolocation names the district or LGA ("Ikeja", "Lagos Island"), but
       * placements are filed by city. The request bar's place table already
       * maps districts to their city, so the same answer comes either way.
       */
      if (found) onCity(parsePromoteIntent(found).city ?? found);
    } catch (err) {
      setLocateError(err instanceof Error ? err.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  /* Arrow keys, Home and End move between the level tabs (the WAI-ARIA tabs pattern). */
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = mix.levels.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n
      : e.key === 'ArrowLeft' ? (i - 1 + n) % n
        : e.key === 'Home' ? 0
          : e.key === 'End' ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setPicked(mix.levels[next].key);
    tabRefs.current[next]?.focus();
  };

  const knownCities = city && !cities.includes(city) ? [city, ...cities] : cities;

  return (
    <section
      id="promote-goal"
      data-promote-section="goal"
      data-goal={goal.slug}
      aria-labelledby="goal-view-title"
      className="scroll-mt-24 rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="goal-view-title" tabIndex={-1} className="text-xl font-bold text-gray-900 focus:outline-none dark:text-white sm:text-2xl">{goal.label}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{goal.why}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-white"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {/* The area: it filters placements by city; NowOpen and free tools work anywhere. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span
          data-testid="area-chip"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-transparent bg-gray-900 pl-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-900"
        >
          <MapPin size={15} aria-hidden /> {city ?? 'All cities'}
          {city ? (
            <button
              type="button"
              onClick={() => onCity(null)}
              aria-label="Show all cities"
              className="grid h-[44px] w-[44px] place-items-center rounded-full hover:bg-white/15 dark:hover:bg-gray-900/10"
            >
              <X size={14} aria-hidden />
            </button>
          ) : <span className="w-4" />}
        </span>
        <label className="sr-only" htmlFor="promote-area">Choose an area</label>
        <select
          id="promote-area"
          value={city ?? ''}
          onChange={(e) => onCity(e.target.value || null)}
          className="min-h-[44px] rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:border-orange-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
        >
          <option value="">All cities</option>
          {knownCities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:border-orange-400 disabled:opacity-60 dark:border-gray-600 dark:text-gray-300"
        >
          {locating ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <LocateFixed size={15} aria-hidden />}
          Use my location
        </button>
      </div>
      {locateError && <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-300">{locateError}</p>}

      {city && !placementsLoading && !mix.cityHasPlacements && (
        <p data-testid="no-city-placements" className="mt-4 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
          No matching placements in {city} yet — these work anywhere.
        </p>
      )}

      {/* The four budget levels. */}
      <div role="tablist" aria-label="Budget" className="mt-5 grid grid-cols-4 gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-gray-900/60">
        {mix.levels.map((l, i) => {
          const on = l.key === current.key;
          return (
            <button
              key={l.key}
              ref={(el) => { tabRefs.current[i] = el; }}
              type="button"
              role="tab"
              id={`level-tab-${l.key}`}
              aria-selected={on}
              aria-controls="level-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setPicked(l.key)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={`min-h-[44px] min-w-0 rounded-xl px-2 text-sm font-semibold transition ${
                on
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="level-panel" aria-labelledby={`level-tab-${current.key}`} className="mt-4">
        <ul className="divide-y divide-gray-200 rounded-2xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {current.items.map((item) => (
            <MixRow
              key={rowKey(item)}
              item={item}
              format={format}
              ngnPerUsd={ngnPerUsd}
              trust={trust}
              adding={adding === rowKey(item)}
              onAdd={(a) => add(rowKey(item), [a])}
            />
          ))}
        </ul>

        {current.key !== 'free' && paid.length === 0 && (
          <p data-testid="empty-level" className="mt-3 rounded-2xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            {city ? `Nothing in this budget in ${city} yet` : 'Nothing in this budget yet'}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* One line per price basis, never one sum across them (spec §9). */}
          <div data-testid="level-total" className="mr-auto space-y-0.5 text-sm font-semibold text-gray-900 dark:text-white">
            {paid.length === 0 ? (
              <p>Free</p>
            ) : (
              <>
                {productsNgn > 0 && <p data-testid="total-products">NowOpen ads {format(ngnToUsd(productsNgn, ngnPerUsd))}</p>}
                {placementsNgn > 0 && (
                  <p data-testid="total-placements">Placements about {format(ngnToUsd(placementsNgn, ngnPerUsd))} · indicative</p>
                )}
              </>
            )}
          </div>
          {placements.length > 0 && (
            <button
              type="button"
              onClick={() => add(`level:${current.key}`, placements)}
              disabled={adding !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-700 px-4 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-60"
            >
              {adding === `level:${current.key}` ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />}
              Add all to plan
            </button>
          )}
        </div>
        {placements.length > 0 && placements.length < paid.length && (
          /* Products join the plan in step 2; until then "Add all" is placements only. */
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            NowOpen ads are arranged with our team for now, so “Add all” adds the outdoor and media placements.
          </p>
        )}
      </div>

      {mix.onRequest.length > 0 && (
        <details className="group mt-5 rounded-2xl border border-gray-200 dark:border-gray-700">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-semibold text-gray-800 dark:text-gray-200">
            Price on request <span className="text-gray-400">{mix.onRequest.length}</span>
            <ChevronDown size={16} className="ml-auto transition group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="divide-y divide-gray-200 border-t border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {mix.onRequest.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <div className="mr-auto min-w-0">
                  <Link to={`/adverts/${a.id}`} className="text-sm font-semibold text-gray-900 hover:text-orange-700 dark:text-white dark:hover:text-orange-300">{a.title}</Link>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <PlacementWhere advert={a} withCategory />
                    <TrustChip trust={trustFor(trust, a.id)} />
                  </div>
                </div>
                <PlacementPrice advert={a} trust={trustFor(trust, a.id)} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {goal.designs.length > 0 && (
        <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-700">
          <h3 id="goal-designs" className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white">
            <Palette size={15} className="text-orange-600 dark:text-orange-400" aria-hidden /> Designs you&apos;ll need
          </h3>
          <ul aria-label="Designs you'll need" className="mt-3 flex flex-wrap gap-2">
            {goal.designs.map((d) => (
              <li key={`${d.need}/${d.deliverable}`}>
                <Link
                  to={`/media?need=${d.need}&item=${d.deliverable}`}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-full border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:border-orange-400 dark:border-gray-600 dark:text-gray-300"
                >
                  {designName(d.need, d.deliverable)} <ArrowRight size={14} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const rowKey = (i: MixItem) =>
  i.kind === 'free' ? `free:${i.tool}` : i.kind === 'product' ? `product:${i.product.id}` : `advert:${i.advert.id}`;

/** One line of a level: name, what it is, cost with its basis, and the action. */
function MixRow({
  item, format, ngnPerUsd, trust, adding, onAdd,
}: {
  item: MixItem;
  format: (usd: number) => string;
  ngnPerUsd: number;
  trust: Map<string, PlacementTrust> | undefined;
  adding: boolean;
  onAdd: (a: Advertisement) => void;
}) {
  /* Cost and action share one line under the name on a phone, and sit at the right from sm. */
  const side = 'mt-2 flex items-center justify-between gap-3 sm:mt-0 sm:shrink-0 sm:justify-end';
  const action = 'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-800 hover:border-orange-400 dark:border-gray-600 dark:text-gray-200';

  if (item.kind === 'free') {
    return (
      <li className="px-4 py-3 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 sm:mr-auto">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{freeTool(item.tool).blurb}</p>
        </div>
        <div className={side}>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Free</span>
          <Link to={item.to} aria-label={`Start: ${item.label}`} className={action}>Start</Link>
        </div>
      </li>
    );
  }

  if (item.kind === 'product') {
    const p = item.product;
    const usd = productPriceUsd(p, ngnPerUsd);
    return (
      <li className="px-4 py-3 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 sm:mr-auto">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{p.description ?? 'On NowOpen'}</p>
        </div>
        <div className={side}>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {usd != null ? format(usd) : formatPrice(p.priceMinor, p.currency)}{p.durationDays ? ` · ${p.durationDays} days` : ''}
          </span>
          {/* Products join the plan in step 2; until then this is an enquiry. */}
          <Link to={`/contact?product=${encodeURIComponent(p.slug)}`} aria-label={`Get started with ${p.name}`} className={action}>
            Get started
          </Link>
        </div>
      </li>
    );
  }

  const a = item.advert;
  const t = trustFor(trust, a.id);
  return (
    <li className="px-4 py-3 sm:flex sm:items-center sm:gap-4">
      <div className="min-w-0 sm:mr-auto">
        <Link to={`/adverts/${a.id}`} className="text-sm font-semibold text-gray-900 hover:text-orange-700 dark:text-white dark:hover:text-orange-300">{a.title}</Link>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <PlacementWhere advert={a} withCategory />
          <TrustChip trust={t} />
        </div>
      </div>
      <div className={side}>
        <PlacementPrice advert={a} trust={t} costNgn={item.costNgn} days={item.days} align="right" />
        <button
          type="button"
          onClick={() => onAdd(a)}
          disabled={adding}
          aria-label={`Add ${a.title} to plan`}
          className={action}
        >
          {adding ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />} Add
        </button>
      </div>
    </li>
  );
}
