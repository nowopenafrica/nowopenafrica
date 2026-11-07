import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { useCurrency } from '../contexts/CurrencyContext';
import PromoteRequestBar from '../components/promote/PromoteRequestBar';
import GoalTiles from '../components/promote/GoalTiles';
import GoalView from '../components/promote/GoalView';
import PromoteMarketplace from '../components/promote/PromoteMarketplace';
import OnNowOpen from '../components/promote/OnNowOpen';
import MediumBrowser from '../components/promote/MediumBrowser';
import AdPreviewStudio from '../components/promote/AdPreviewStudio';
import { supabase } from '../lib/supabase';
import { generateAdverts, isSampleId } from '../data/populateData';
import { GOALS, goalBySlug, type GoalSlug } from '../lib/promote/goals';
import { buildMix } from '../lib/promote/mix';
import { fetchPlacementTrust, isListedPlacement, type PlacementTrust } from '../lib/promote/trust';
import { listSellableProducts, type RevenueProduct } from '../lib/revenue/products';
import { Advertisement } from '../types';
import { applySeo } from '../lib/seo';

/**
 * The Promote hub (/adverts, the nav's "Promote" tab).
 *
 * Goal-first, like Create: the page opens on "What do you want to achieve?"
 * and six goals, not on a catalogue of billboards. A small shop is steered
 * to the free tools and NowOpen placements, a brand to outdoor, and neither
 * has to learn our product list first. Order, per the hub spec §4:
 *
 *   1. the request bar and the goal tiles
 *   2. the goal view, once a goal is open (a recommended mix in four budgets)
 *   3. Out in the world — every placement, by medium
 *   4. Start free — the four free tools
 *   5. See your advert where it will run (#preview)
 *   6. On NowOpen (#on-nowopen) — the sellable revenue_products
 *   7. a footer strip
 *
 * ── THE URL IS THE STATE ─────────────────────────────────────────────────
 *
 * `?goal=<slug>&city=<city>` is read straight from the address, so a shared
 * link and Back both land on the same view. Opening a goal pushes a history
 * entry; changing the area replaces it, so Back leaves the goal rather than
 * stepping through every city tried. `?search=` and `?location=` still seed
 * the placement browser as they always did.
 */
export default function Adverts() {
  const { ngnPerUsd } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<RevenueProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsFailed, setProductsFailed] = useState(false);
  /* placement_trust by advert id. Empty until read, and on failure: every card then reads the honest default. */
  const [trust, setTrust] = useState<Map<string, PlacementTrust>>(() => new Map());
  /* A city asked for with no goal: shown in the placement browser's city filter. */
  const [cityRequest, setCityRequest] = useState<{ city: string; n: number } | null>(null);

  const goal = goalBySlug(searchParams.get('goal') ?? '');
  const city = searchParams.get('city')?.trim() || null;
  /* Focus moves to the goal view only when the visitor opened it, never on load. */
  const focusGoal = useRef(false);

  useEffect(() => {
    return applySeo({
      // No "Book": nothing on this page books anything. A plan is an
      // enquiry the media owners confirm, so the title says what is here.
      title: 'Advertise across Africa — goals, placements and plans',
      description:
        // Checked against the data: 42 cities across 21 countries, so "20+
        // African markets" is accurate rather than a round number.
        'Pick a goal and get a plan from real advertising placements across 20+ African markets — billboards, transit, digital screens and broadcast — plus free ways to be found by people already searching on NowOpen.',
      path: '/adverts',
      image: '/og-image.png',
    });
  }, []);

  useEffect(() => {
    const fetchAdverts = async () => {
      try {
        const { data, error: supabaseError } = await supabase
          .from('advertisements').select('*').order('created_at', { ascending: false });
        if (supabaseError) throw new Error(supabaseError.message || 'Database query failed');
        // The sample set only exists in dev (see populateData SAMPLES_ENABLED),
        // so in production this deliberately leaves the list empty rather than
        // inventing placements that nobody can actually book.
        //
        // select('*') carries lifecycle. The table is publicly readable, so a
        // rejected or archived placement comes back too: it is dropped here,
        // once, and so never reaches the browser, the mix or the trust read.
        setAdverts(data && data.length > 0
          ? (data as Advertisement[]).filter(isListedPlacement)
          : (generateAdverts() as Advertisement[]));
        setError(null);
      } catch (err: any) {
        // Keep the error. Swallowing it here meant a failed query rendered as
        // "No placements match your filters" — indistinguishable from an empty
        // catalogue, which is how a live outage stayed invisible.
        console.error('Error fetching adverts:', err);
        setAdverts(generateAdverts() as Advertisement[]);
        setError(err?.message || 'Could not load placements.');
      } finally {
        setLoading(false);
      }
    };
    fetchAdverts();
  }, []);

  /*
   * Trust is read once, for the placements this page loaded — the same list
   * the browser and the mix show — not per card. Dev sample ids are not
   * uuids and have no trust row, so they are not asked about.
   */
  useEffect(() => {
    const ids = adverts.map((a) => String(a.id)).filter((id) => !isSampleId(id));
    if (ids.length === 0) return undefined;
    let live = true;
    fetchPlacementTrust(ids).then((m) => { if (live) setTrust(m); });
    return () => { live = false; };
  }, [adverts]);

  useEffect(() => {
    let live = true;
    listSellableProducts('promotion').then(({ products: rows, failed }) => {
      if (!live) return;
      setProducts(rows);
      setProductsFailed(failed);
      setProductsLoading(false);
    });
    return () => { live = false; };
  }, []);

  /*
   * Runs on every goal change, including Back/Forward, but focuses only
   * when the visitor opened the goal just now. The flag is cleared either
   * way, so an earlier click can never make a later history step steal focus.
   */
  useEffect(() => {
    const wanted = focusGoal.current;
    focusGoal.current = false;
    if (goal && wanted) document.getElementById('goal-view-title')?.focus();
  }, [goal]);

  /* Cities with placements, by the first comma segment ("Lagos, Nigeria" → Lagos), as the mix matches them. */
  const cities = useMemo(
    () => [...new Set(adverts.map((a) => (a.location ?? '').split(',')[0].trim()).filter(Boolean))].sort(),
    [adverts],
  );

  const mix = useMemo(
    () => (goal ? buildMix(goal, { products, adverts, city, ngnPerUsd, trust }) : null),
    [goal, products, adverts, city, ngnPerUsd, trust],
  );

  /** A tile: open the goal in the current area. Re-picking the open goal does nothing. */
  const pickGoal = (slug: GoalSlug) => {
    if (goal?.slug === slug) return;
    focusGoal.current = true;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('goal', slug);
      return next;
    });
  };

  /**
   * A request: the words decide both goal and area. A request that names no
   * city clears the old one rather than silently keeping it.
   */
  const requestGoal = (slug: GoalSlug, requestedCity: string | null) => {
    if (goal?.slug === slug && city === requestedCity) {
      document.getElementById('goal-view-title')?.focus();
      return;
    }
    focusGoal.current = goal?.slug !== slug;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('goal', slug);
      if (requestedCity) next.set('city', requestedCity); else next.delete('city');
      return next;
    }, { replace: goal?.slug === slug });
    if (goal?.slug === slug) document.getElementById('goal-view-title')?.focus();
  };

  /** A request that named only a place: filter the placements to it, visibly. */
  const requestCity = (c: string) => {
    setCity(c);
    setCityRequest((prev) => ({ city: c, n: (prev?.n ?? 0) + 1 }));
  };

  const setCity = (c: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (c) next.set('city', c); else next.delete('city');
      return next;
    }, { replace: true });
  };

  /** Close, and hand focus back to the tile that opened it rather than drop it to <body>. */
  const closeGoal = () => {
    const was = goal?.slug;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('goal');
      return next;
    });
    if (was) document.querySelector<HTMLElement>(`[data-testid="goal-tile"][data-goal="${was}"]`)?.focus();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="site-container space-y-10 py-6 sm:space-y-12 sm:py-10">
        <PromoteRequestBar goal={goal?.slug ?? null} onGoal={requestGoal} onCity={requestCity}>
          <GoalTiles goals={GOALS} active={goal?.slug ?? ''} onPick={pickGoal} />
        </PromoteRequestBar>

        {goal && mix && (
          <GoalView
            key={goal.slug}
            goal={goal}
            mix={mix}
            city={city}
            cities={cities}
            placementsLoading={loading}
            trust={trust}
            onCity={setCity}
            onClose={closeGoal}
          />
        )}

        {/*
          * The world first, then NowOpen.
          *
          * This order was the other way round. "Out in the world" is every
          * placement by medium — billboards, transit, screens, broadcast — and
          * it is what a business means when it says "advertise". Leading with
          * NowOpen's own products asked them to care about our inventory before
          * they had seen the one they came for. Both stay; only the pitch
          * changes hands.
          */}
        <MediumBrowser
          adverts={adverts}
          trust={trust}
          loading={loading}
          error={error}
          initialSearch={searchParams.get('search') ?? ''}
          /* ?location= as always; a ?city= with no goal open filters here too, so a shared /adverts?city=Lagos shows Lagos. */
          initialLocation={searchParams.get('location') || (!goal && city) || ''}
          cityRequest={cityRequest}
        />

        {/*
          * The free tools follow the paid inventory, not the other way round.
          *
          * "Start free" used to sit above the medium browser and read as the
          * page's main proposition. It is the smaller offer: four tools for a
          * business with no budget yet. Putting it after the placements lets
          * the visitor price the thing they came for first, then discover what
          * costs nothing.
          */}
        <PromoteMarketplace />

        {/*
          * See it before you buy it, and see it before our own inventory.
          *
          * A listing tells a business the price and the road. What it cannot
          * show is their own artwork on the thing — whether the words survive
          * at that shape, how much the bus windows eat. That question belongs
          * to the placements above, so the studio sits directly under them,
          * ahead of On NowOpen: a visitor can try their creative on a real
          * surface before being asked to consider our sellable stock.
          */}
        <section id="preview" aria-labelledby="preview-title" data-promote-section="preview" className="scroll-mt-24">
          <h2 id="preview-title" className="text-lg font-bold text-gray-900 dark:text-white sm:text-xl">
            See your advert where it will run
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Upload your artwork and place it on a billboard, a digital screen, a bus or a social
            feed. The surfaces are drawn to scale with the windows and chrome in front, so you
            can see what survives the medium before you commission anything.
          </p>
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <AdPreviewStudio />
          </div>
        </section>

        <OnNowOpen products={products} loading={productsLoading} failed={productsFailed} />

        <nav aria-label="More from Promote" data-promote-section="footer" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-gray-200 pt-5 text-sm dark:border-gray-700">
          <Link to="/advertise/plan" className="inline-flex min-h-[44px] items-center gap-1 px-2 font-semibold text-gray-800 hover:text-orange-700 dark:text-gray-200 dark:hover:text-orange-300">
            Your plan <ArrowRight size={14} aria-hidden />
          </Link>
          <span aria-hidden className="text-gray-300 dark:text-gray-600">·</span>
          <Link to="/dashboard?tab=adverts" className="inline-flex min-h-[44px] items-center px-2 text-gray-600 hover:text-orange-700 dark:text-gray-400 dark:hover:text-orange-300">
            Media owners: list your site
          </Link>
          <span aria-hidden className="text-gray-300 dark:text-gray-600">·</span>
          <Link to="/contact" className="inline-flex min-h-[44px] items-center px-2 text-gray-600 hover:text-orange-700 dark:text-gray-400 dark:hover:text-orange-300">
            Help
          </Link>
        </nav>
      </div>
    </div>
  );
}
