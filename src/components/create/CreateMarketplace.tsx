import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Clapperboard, Megaphone, PackageSearch, Store,
} from 'lucide-react';

import {
  CATALOGUE, PACKS, CREDIT_BUNDLES, packAsItem, priceLabel,
  sellable, type CatalogueItem,
} from '../../lib/create/catalogue';
import CreateConfigurator from './CreateConfigurator';
import IntentComposer from './IntentComposer';
import CatalogueBrowser from './CatalogueBrowser';
import NeedTiles from './NeedTiles';
import PopularNow from './PopularNow';
import NeedView from './NeedView';
import ProductCarousel from './ProductCarousel';
import TemplateCustomiser from './TemplateCustomiser';
import CollectionStrip from './CollectionStrip';
import CategoryBrowse from './CategoryBrowse';
import { shownSubcategories } from '../../lib/create/catalogueTaxonomy';
import { DESIGN_STYLES } from '../../lib/design/styles';
import type { DesignTemplate } from '../../lib/designTemplates';
import { useDesignCatalogue } from '../../hooks/useDesignCatalogue';
import {
  NEEDS, POPULAR, isListed, listedFor, needFor, needFromLegacy, shownNeeds, type NeedSlug,
} from '../../lib/create/needs';

/**
 * NowOpen Create — the public page on /media.
 *
 * This is the PUBLIC page behind the "Create" nav item, not the signed-in
 * Studio. Somebody who has never heard of NowOpen has to be able to see what
 * can be made before deciding to sign up.
 *
 * ── ONE QUESTION, TOP TO BOTTOM ──────────────────────────────────────────
 *
 * Spec §4, and nothing else:
 *   1. the request bar — the box and the need tiles, then a slow strip of
 *      real designs (the founder's products carousel);
 *   2. Popular now — six things, one tap each;
 *   3. the need view, once a tile, a chip or a request resolves — the things
 *      inside the need, the designs, and a slim made-for-you · prints lane;
 *   4. featured collections (spec §10, lib/create/collections.ts), then
 *      Browse by category — the latter only once a product spans four
 *      directions, which none does yet;
 *   5. a footer strip — Track an order · All services.
 *
 * The page used to stack about fourteen sections: thirteen discipline cards,
 * a facts strip, the gallery, free tools, the priced catalogue, promotion
 * links, business packs, credits, order tracking, then a creator directory.
 * Every one of them was true and together they buried the one thing a
 * visitor came to do. Everything about having it made — creators, services,
 * packs, credits — now lives on /media/services, moved intact
 * (`CreateServices` below); the facts strip is gone.
 *
 * ON THE PRICES: every printed item is an estimate derived from a competitor's
 * public retail price. No production partner has quoted them, so they can be
 * requested and not bought. See lib/create/catalogue.ts — the honesty is in the
 * data, and this component only renders what the data admits.
 */

type Focus = {
  need: NeedSlug | '';
  deliverable: string;
  n: number;
  /* A thing that was asked for and has no finished design yet (see `settle`). */
  missing?: string;
};

/**
 * Old links: `?category=<discipline or gallery category>` lands on its need.
 *
 * Video and photography are hired, not templated (they map to no need), so
 * their old links open the services lane rather than an empty need.
 */
const SERVICE_ONLY = new Set(['video', 'photography']);

const isNeed = (slug: string | null): slug is NeedSlug => NEEDS.some((x) => x.slug === slug);

/**
 * Never hold a thing that has nothing to show.
 *
 * A request can name a real deliverable with no finished design yet —
 * "packaging", "a compliment slip", "a pitch deck". Holding it would leave
 * no chip pressed over a grid of the whole need and hide "Order prints".
 * It is dropped to the need, and remembered as `missing` so the view can
 * say so plainly.
 */
function settle(need: NeedSlug | '', deliverable: string, listed: DesignTemplate[]): Pick<Focus, 'deliverable' | 'missing'> {
  if (!need || !deliverable) return { deliverable: '' };
  const inNeed = NEEDS.find((x) => x.slug === need)?.deliverables.some((d) => d.slug === deliverable);
  if (!inNeed) return { deliverable: '' };
  return listedFor(deliverable, listed).length > 0 ? { deliverable } : { deliverable: '', missing: deliverable };
}

/**
 * Where the page opens, read once from the address.
 *
 * `?need=` (and `&item=`) is what this page writes; `?template=` is a shared
 * design link, opened in its need so the gallery mounts and its own
 * `?template=&look=` reader runs; `?category=` is the old discipline and
 * gallery link. An unknown or unlisted template is ignored quietly.
 */
function fromLink(params: URLSearchParams, listed: DesignTemplate[]): { focus: Focus; servicesLane: boolean } {
  const none: Focus = { need: '', deliverable: '', n: 0 };
  const need = params.get('need');
  if (isNeed(need)) return { focus: { need, ...settle(need, params.get('item') ?? '', listed), n: 1 }, servicesLane: false };

  const linked = params.get('template');
  const template = linked ? listed.find((t) => t.key === linked) : undefined;
  const templateNeed = template ? needFor(template) : null;
  if (templateNeed) return { focus: { need: templateNeed, deliverable: '', n: 1 }, servicesLane: false };

  const category = params.get('category');
  if (!category) return { focus: none, servicesLane: false };
  if (SERVICE_ONLY.has(category)) return { focus: none, servicesLane: true };
  const legacy = isNeed(category) ? category : needFromLegacy(category);
  return { focus: legacy ? { need: legacy, deliverable: '', n: 1 } : none, servicesLane: false };
}

export default function CreateMarketplace() {
  const [params, setParams] = useSearchParams();

  /*
   * The same catalogue the gallery reads (code layouts plus published
   * uploads), with the listing rule applied once here so the tiles, the
   * chips and the grid all count the same designs.
   */
  const { templates, ready, incomplete } = useDesignCatalogue();
  const listed = useMemo(() => templates.filter(isListed), [templates]);
  const tiles = useMemo(() => shownNeeds(listed), [listed]);
  /*
   * Browse by category appears only once a product spans four directions
   * (shownSubcategories). None does today, so the tiles and need view above
   * stay the way in; there is never an empty "Browse by category".
   */
  const browsable = useMemo(() => shownSubcategories(listed).length > 0, [listed]);
  /* Only an explicit `false` is "still loading": the code half is always here. */
  const loading = ready === false;
  const popular = useMemo(() => POPULAR.filter((p) => listedFor(p.deliverable, listed).length > 0), [listed]);

  /* Read once, on arrival: a link is where the visit starts, not a filter it is held to. */
  const [initial] = useState(() => fromLink(params, listed));

  /*
   * What the visitor asked for: a need, maybe one thing inside it, and a
   * counter so the same ask twice is still two asks (the gallery re-applies
   * its focus on every new `n`).
   */
  const [focus, setFocus] = useState<Focus>(initial.focus);
  const [servicesLane, setServicesLane] = useState(initial.servicesLane);
  const asked = useRef(initial.focus.n);

  /*
   * After a need opens: bring its top (title and chips) into view, and — when
   * the visitor asked for it rather than arrived on it — move focus to its
   * heading. Done a frame later, after ScrollToTop has had its turn, or an
   * old link's need would be scrolled to and then thrown back to the top.
   */
  const reveal = useRef<'scroll' | 'focus' | null>(initial.focus.need ? 'scroll' : null);
  /* The control that opened the need, so closing it can hand focus back. */
  const opener = useRef<HTMLElement | null>(null);
  const returnTo = useRef<NeedSlug | null>(null);

  /** The address carries the open need: refresh, Back and sharing keep it. */
  const writeUrl = (need: NeedSlug | '', deliverable: string, replace: boolean) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (need) next.set('need', need); else next.delete('need');
      if (need && deliverable) next.set('item', deliverable); else next.delete('item');
      /* Arrival links have done their job; a later reload must not re-open them. */
      for (const k of ['category', 'template', 'look']) next.delete(k);
      return next;
    }, { replace });
  };

  const apply = (need: NeedSlug | '', deliverable: string) => {
    asked.current += 1;
    setServicesLane(false);
    setFocus({ need, ...settle(need, deliverable, listed), n: asked.current });
  };

  /** Opening (or re-asking for) a need from the tiles, Popular now or the request box. */
  const open = (need: NeedSlug | '', deliverable = '') => {
    if (need) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
      reveal.current = 'focus';
    }
    const settled = settle(need, deliverable, listed);
    apply(need, deliverable);
    writeUrl(need, settled.deliverable, need === focus.need || !need);
  };

  /** A chip inside the open need: the same view, narrowed. Replaces history. */
  const narrow = (deliverable: string) => {
    if (!focus.need) return;
    apply(focus.need, deliverable);
    writeUrl(focus.need, deliverable, true);
  };

  const close = () => {
    returnTo.current = focus.need || null;
    apply('', '');
    writeUrl('', '', true);
  };

  /*
   * Back and Forward move the address without a click here; follow them.
   * Only a CHANGE in `?need=` counts, so an arrival by template or old link
   * (which has no `?need=`) is not closed on the first render.
   */
  const urlNeed = params.get('need');
  const urlItem = params.get('item') ?? '';
  const lastUrlNeed = useRef(urlNeed);
  useEffect(() => {
    if (urlNeed === lastUrlNeed.current) return;
    lastUrlNeed.current = urlNeed;
    const need = isNeed(urlNeed) ? urlNeed : '';
    if (need === focus.need) return;
    if (need) reveal.current = 'scroll';
    apply(need, urlItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlNeed]);

  /*
   * A shared design link whose template is an uploaded one arrives after the
   * first render; open its need once it lands. Code templates were handled
   * by `fromLink` already.
   */
  const linkedTemplate = useRef(initial.focus.need ? null : params.get('template'));
  useEffect(() => {
    const key = linkedTemplate.current;
    if (!key || focus.need) return;
    const template = listed.find((t) => t.key === key);
    const need = template ? needFor(template) : null;
    if (!need) return;
    linkedTemplate.current = null;
    reveal.current = 'scroll';
    apply(need, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listed]);

  useEffect(() => {
    if (focus.need && reveal.current) {
      const raf = requestAnimationFrame(() => {
        const how = reveal.current;
        reveal.current = null;
        document.getElementById('create-need')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        if (how === 'focus') document.getElementById('need-view-title')?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!focus.need && returnTo.current) {
      const slug = returnTo.current;
      returnTo.current = null;
      const back = opener.current?.isConnected ? opener.current
        : document.querySelector<HTMLElement>(`[data-testid="need-tile"][data-need="${slug}"]`)
          ?? document.getElementById('create-prompt');
      back?.focus();
    }
    return undefined;
  }, [focus.n, focus.need]);

  const openNeed = NEEDS.find((x) => x.slug === focus.need) ?? null;

  // The configurator is where "Order prints" lands: choose, price, order.
  const [configuring, setConfiguring] = useState<CatalogueItem | null>(null);
  // A carousel card opens the same customiser a gallery card does.
  const [editing, setEditing] = useState<DesignTemplate | null>(null);

  return (
    <div className="space-y-8 sm:space-y-10">
      <IntentComposer
        onCategory={(s) => (s.need ? open(s.need, s.deliverable) : open(''))}
        offer={tiles.map((t) => t.slug)}
      >
        <NeedTiles needs={tiles} active={focus.need} onPick={(need) => open(need)} />
      </IntentComposer>

      <ProductCarousel listed={listed} onOpen={setEditing} />

      {popular.length > 0 && (
        <section data-create-section="popular" aria-label="Popular now">
          <PopularNow items={popular} active={focus} onPick={(p) => open(p.need, p.deliverable)} />
        </section>
      )}

      {servicesLane && <ServicesLane onClose={() => setServicesLane(false)} />}

      {openNeed && (
        /*
         * Keyed by need: a new need is a new view. Without it the gallery's
         * search box and use filter carried over, so typing "menu" in Menus
         * and then opening Social media said "Nothing matches" over a need
         * holding eight designs.
         */
        <NeedView
          key={openNeed.slug}
          need={openNeed}
          deliverable={focus.deliverable}
          missing={focus.missing}
          n={focus.n}
          listed={listed}
          onDeliverable={narrow}
          onClose={close}
          onOrderPrints={setConfiguring}
        />
      )}

      {/* Spec §10: featured collections, then browse by category. Below the
          need view, so opening a need still lands right under its tile. */}
      <CollectionStrip listed={listed} loading={loading} onEdit={setEditing} />

      {browsable && (
        <CategoryBrowse listed={listed} loading={loading} error={incomplete ?? null} onEdit={setEditing} />
      )}

      {/* Printivo keeps Order Tracking in the top navigation, and it belongs
          there: somebody returning to check an order is not browsing. We built
          /order and then linked it from nowhere, so the only way back to an
          order was the reference in the confirmation screen. */}
      <section
        data-create-section="footer"
        aria-label="Orders and services"
        className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-6 dark:border-gray-800"
      >
        <PackageSearch size={20} className="shrink-0 text-gray-400" />
        <p className="min-w-[12rem] flex-1 text-sm text-gray-600 dark:text-gray-400">
          Already ordered, or want it made for you?
        </p>
        <Link to="/order"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:border-green-400">
          Track an order <ArrowRight size={14} />
        </Link>
        <Link to="/media/services"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:border-green-400">
          All services <ArrowRight size={14} />
        </Link>
      </section>

      {configuring && (
        <CreateConfigurator item={configuring} onClose={() => setConfiguring(null)} />
      )}

      {editing && (
        <TemplateCustomiser
          template={editing}
          initialStyle={DESIGN_STYLES[0].key}
          initialBrand="#2563eb"
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Where an old video or photography link lands.
 *
 * Those two disciplines are hired, not templated. Opening an empty need
 * would tell the visitor we make nothing of the kind; this says what is true
 * and points at the people who do it.
 */
function ServicesLane({ onClose }: { onClose: () => void }) {
  return (
    <section
      data-create-section="services-lane"
      aria-labelledby="services-lane-title"
      className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800/60 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300">
          <Clapperboard size={19} />
        </span>
        <div className="min-w-0">
          <h2 id="services-lane-title" className="text-lg font-bold text-gray-900 dark:text-white">
            Video and photography are made to order
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            There is no template for a shoot. Brief a creator and you get a price for your job.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/media/services"
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-green-700 text-sm font-bold text-white hover:bg-green-800">
          <Store size={15} /> Hire a creator
        </Link>
        <button type="button" onClick={onClose}
          className="inline-flex items-center min-h-[44px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:border-green-400">
          Make something else
        </button>
      </div>
    </section>
  );
}

/* ── Moved to /media/services, intact ──────────────────────────────────── */

/**
 * The step after a design exists. This is what a print shop cannot offer.
 *
 * Each of these must land on the thing it promises. Two of them did not:
 * "Share to WhatsApp" went to the Studio front door rather than the tool that
 * shares to WhatsApp, and "Publish an offer" went to /offers — the page where
 * customers BROWSE other people's offers, which is the opposite of publishing
 * one.
 */
const ADVERTISE = [
  { label: 'Promote on NowOpen', to: '/adverts', blurb: 'Sponsored placement where people are already searching.' },
  { label: 'Billboards & LED', to: '/adverts', blurb: 'Real-world placements across 42 cities.' },
  { label: 'Share to WhatsApp', to: '/studio?module=live-promo', blurb: 'The channel your customers actually open.' },
  { label: 'Publish an offer', to: '/studio?module=promotions', blurb: 'Put it in front of people looking for a reason to buy.' },
];

/**
 * The free Studio tools.
 *
 * Taken from the code catalogue rather than the database on purpose: these
 * carry no price, and what they DO carry is `studioModule` — the key that
 * decides which tool the button opens. That is a route, which belongs with
 * the routes, not a price, which belongs with the prices.
 */
const FREE_TOOLS: CatalogueItem[] = CATALOGUE.filter((item) => item.free);

/**
 * Everything about having it made, as it stood on the Create page — the
 * priced catalogue, the free tools, promotion, business packs and credits.
 * Moved to /media/services unchanged: same components, same data, same copy.
 */
export function CreateServices() {
  const [configuring, setConfiguring] = useState<CatalogueItem | null>(null);

  return (
    <div className="space-y-10">
      {/*
        And the priced catalogue, from the database.

        It replaced four hardcoded division lists. The prices are editable in
        the admin console, which is the whole reason they moved: a price that
        needs a deploy to change is a price that never gets corrected.
      */}
      <section id="made-for-you" className="scroll-mt-24">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Or have it made for you</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Briefed to a NowOpen creator or a production partner, delivered to your brand kit.
        </p>
        <div className="mt-4">
          <CatalogueBrowser onConfigure={setConfiguring} />
        </div>
      </section>

      {/*
        The free tools, which are tools and not services.

        These open the Studio and cost nothing, so they are routes rather than
        prices and they stay in code. Everything with a price now comes from
        the database — see CatalogueBrowser.
      */}
      <section>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Make it yourself, free</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Your logo, your colours, downloaded. No account needed to look.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {FREE_TOOLS.map((item) => (
            <ItemCard key={item.sku} item={item} onConfigure={() => setConfiguring(item)} />
          ))}
        </div>
      </section>

      {/*
        Two halves, one unit.

        "Then put it to work" and "Business packs" answer the same question —
        what happens once the design exists — so they share a row rather than
        stacking as two full-width sections: 30/70, because the four promotion
        links are a short list of destinations while a pack carries a name, a
        price, what is in it and a quote button. The cards are thin on
        purpose: a label and where it goes on one side, a name, a price and one
        line on the other. What a pack actually contains is in the configurator,
        one click away, where it can be priced and varied.
      */}
      <section className="grid gap-8 lg:grid-cols-[3fr_7fr]">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone size={18} className="text-green-600 dark:text-green-400" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Then put it to work</h3>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            A flyer nobody sees is a cost. This is the part a print shop cannot do for you.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-1">
            {ADVERTISE.map((a) => (
              <Link key={a.label} to={a.to} title={a.blurb}
                className="group flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3 text-sm font-semibold text-gray-900 dark:text-white hover:border-green-400 dark:hover:border-green-500">
                <span className="truncate">{a.label}</span>
                <ArrowRight size={14} className="shrink-0 text-gray-400 group-hover:text-green-600 dark:group-hover:text-green-300" />
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Business packs</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Everything a business needs at one stage, rather than buying it piece by piece.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            {PACKS.map((p) => (
              <div key={p.sku} className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-bold leading-tight text-gray-900 dark:text-white">{p.name}</h4>
                  {!sellable(p) && (
                    <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      Estimate
                    </span>
                  )}
                </div>
                <div className="mt-1 text-lg font-extrabold text-gray-900 dark:text-white">
                  ₦{p.price.toLocaleString('en-NG')}
                </div>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {p.includes.length} items · {p.turnaround[0]}–{p.turnaround[1]} working days
                </p>
                {/* Was the launch waitlist — a signup form that reached nobody who
                    could price the job. A pack is just a large order. */}
                <div className="mt-auto pt-3">
                  <button onClick={() => setConfiguring(packAsItem(p))}
                    className="inline-flex w-full items-center justify-center gap-1 min-h-[36px] rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-800 dark:text-gray-200 hover:border-green-400">
                    Request a quote <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
            Pack prices are estimates: each includes printing no partner has quoted yet.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-6">
        <h3 className="font-bold text-gray-900 dark:text-white">Create credits</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Making things in Studio is free. Credits cover AI generation, which costs real compute —
          and get better value the more you buy.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {CREDIT_BUNDLES.map((b) => (
            <div key={b.naira} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-center">
              <div className="font-bold text-gray-900 dark:text-white">₦{b.naira.toLocaleString('en-NG')}</div>
              <div className="text-xs text-gray-500">{b.credits} credits</div>
            </div>
          ))}
        </div>
      </section>

      {configuring && (
        <CreateConfigurator item={configuring} onClose={() => setConfiguring(null)} />
      )}
    </div>
  );
}

function ItemCard({ item, onConfigure }: { item: CatalogueItem; onConfigure: () => void }) {
  const estimate = item.basis === 'indicative';
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-bold text-sm text-gray-900 dark:text-white">{item.name}</h4>
        <span className={`text-xs font-semibold shrink-0 ${estimate ? 'text-amber-700 dark:text-amber-300' : 'text-gray-900 dark:text-white'}`}>
          {priceLabel(item)}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 flex-1">{item.blurb}</p>

      {item.tiers && item.tiers.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.tiers.map((t) => (
            <span key={t.qty} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {t.qty} · ₦{t.price.toLocaleString('en-NG')}
            </span>
          ))}
        </div>
      )}

      {/* flex-wrap so the button drops below the turnaround rather than
          squeezing it, once the column is six-across narrow. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500">
          {item.turnaround && item.turnaround[1] > 0
            ? `${item.turnaround[0]}–${item.turnaround[1]} working days`
            : 'Instant'}
        </span>
        {/* Opens the configurator rather than navigating away. Free items go to
            Studio — but to the tool that makes THIS thing, not the front door:
            Studio reads ?module=, and login carries the query through. */}
        {item.free ? (
          <Link to={`/studio?module=${item.studioModule ?? 'design'}`}
            className="min-h-[36px] inline-flex items-center px-3 rounded-lg text-xs font-semibold bg-green-700 text-white hover:bg-green-800">
            Create it free
          </Link>
        ) : (
          <button onClick={onConfigure}
            className="min-h-[36px] inline-flex items-center px-3 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-green-400">
            Configure &amp; price
          </button>
        )}
      </div>
    </div>
  );
}
