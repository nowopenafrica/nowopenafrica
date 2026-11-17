import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, Sparkles, Building2, Rocket, Crown, Landmark, ChevronDown,
  Palette, Megaphone, Bot, Layers, Mail, ArrowUpRight, Gift, Boxes,
  Coins,
} from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';
import { supabase } from '../lib/supabase';
import PaymentModal, { CheckoutItem } from '../components/PaymentModal';
import {
  BUSINESS_TIERS, CREATIVE_TIERS, AI_ADDONS, CATEGORY_MODULES, BOOST_OPTIONS,
  DIGITAL_CAMPAIGN_STARTING_USD, FOUNDING_MEMBER_LIMIT, FOUNDING_MEMBER_DISCOUNT,
  moduleLimitForPlan,
} from '../data/pricingPlans';
import { Editable, PageContentProvider, useEditableSeo } from '../components/editor/PageContent';
import { track } from '../lib/telemetry';
import { fetchCreditActions, isActionLive, isCreditProgrammeLive, type CreditAction } from '../lib/credits/catalogue';
import { formatMinor } from '../lib/create/money';

const BUSINESS_ICONS: Record<string, typeof Building2> = {
  starter: Building2,
  growth: Rocket,
  'business-pro': Crown,
  enterprise: Landmark,
};

const faqs = [
  {
    q: 'How does placement pricing work?',
    a: 'Advertising placements are priced per day by the placement owner — from around $110/day for city boards in emerging markets to $900/day for premium digital spectaculars in Lagos, Johannesburg or Cairo. You only pay for the days you book, on any plan.',
  },
  {
    q: 'What are the booking fees?',
    a: 'Free Launch and Growth bookings include a 10% platform fee that funds verification, secure payments and support. Business Pro members pay 0% booking fees on creative services.',
  },
  {
    q: 'How do AI credits work?',
    a: 'Every plan includes a monthly AI credit (NOC) allowance, shown on its card and added to your wallet automatically each month. Credits power AI writing, images and your business assistant, and free credits are always used before any you buy. Top-up packs appear on your wallet page once they open.',
  },
  {
    q: "What if I only need one feature, like bookings or live streaming?",
    a: 'Add just that category module for a few dollars a month instead of upgrading your whole plan — see the à la carte modules below. Modules stack with any plan, including Free Launch.',
  },
  {
    q: "What's the Founder Launch Offer?",
    a: `The first ${FOUNDING_MEMBER_LIMIT} businesses to subscribe get ${FOUNDING_MEMBER_DISCOUNT * 100}% off their first year on any paid plan, automatically applied at checkout while spots remain.`,
  },
  {
    q: 'How does NowOpen make money?',
    a: 'From three simple streams: business subscriptions (Growth and Business Pro), Promote advertising (boosts and placements), and AI credits. Booking fees cover verification and secure payments — 0% for Business Pro members. You can grow your profile for free and pay only for what you actually use.',
  },
  {
    q: 'Can I pay in my local currency?',
    a: 'Yes. Prices are set in USD and shown in your currency at live exchange rates — use the currency picker in the top navigation. Checkout supports cards, bank transfer and mobile money (M-Pesa, MTN MoMo, Airtel Money), with naira, cedi, rand and shilling billing via Paystack.',
  },
  {
    q: 'Can I cancel or change plans anytime?',
    a: 'Yes — upgrade, downgrade or cancel from your dashboard at any time. Annual plans are refunded pro-rata for unused full months.',
  },
];

const SECTIONS = [
  { id: 'business-plans', label: 'Business Plans' },
  { id: 'ai-credits', label: 'AI Credits' },
  { id: 'creative-plans', label: 'Creative Marketplace' },
  { id: 'advertising', label: 'Promote' },
  { id: 'ai-addons', label: 'AI Add-ons' },
  { id: 'modules', label: 'Modules' },
];

export default function Pricing() {
  return (
    <PageContentProvider page="pricing">
      <PricingContent />
    </PageContentProvider>
  );
}

function PricingContent() {
  /*
   * ── IS THERE A CREDIT PROGRAMME TO ADVERTISE? ──────────────────────────
   *
   * MEASURED 2026-10-06: this page told every visitor "Every plan comes with
   * AI credits each month … or top up when you need more", above a grid
   * reading 50 / 500 / 2,000.
   *
   * None of it was true. There was no wallet, no ledger, no grant, no way to
   * spend a credit and no way to top up. The numbers came from a hardcoded
   * field in pricingPlans.ts that nothing in the platform could honour.
   *
   * The credit system now exists, but it ships inert: every action is
   * unpriced and disabled until an operator sets a cost against measured
   * provider cost. So the page ASKS the database whether any of it is real,
   * and says "coming soon" until it is — at which point this starts making
   * the claim again, by itself. A marketing claim should be a reading of the
   * system rather than a constant that was true when somebody typed it.
   *
   * `null` means the answer has not arrived: render neither claim yet.
   */
  const [creditsLive, setCreditsLive] = useState<boolean | null>(null);
  const [liveActions, setLiveActions] = useState<CreditAction[]>([]);
  useEffect(() => {
    let alive = true;
    fetchCreditActions()
      .then((actions) => {
        if (!alive) return;
        setCreditsLive(isCreditProgrammeLive(actions));
        setLiveActions(actions.filter(isActionLive));
      })
      // A failed read must not be reported as "credits are live".
      .catch(() => { if (alive) setCreditsLive(false); });
    return () => { alive = false; };
  }, []);

  /*
   * The credit allowance is also written into each plan's feature bullets, so
   * hiding the badge and the grid was not enough — "50 AI credits / month"
   * still appeared on every card. Same rule: the bullet is a promise, and it
   * only appears once something can grant it.
   */
  /*
   * The allowance numbers come from credit_plan_allowances (what the database
   * actually grants), never from pricingPlans.ts. The "N AI credits / month"
   * bullets in that file are therefore always dropped: the badge on each card
   * shows the database's number instead, so an admin change to an allowance
   * is reflected without a deploy and the two can never disagree.
   */
  const [allowances, setAllowances] = useState<Record<string, number> | null>(null);
  const [topUpsLive, setTopUpsLive] = useState(false);
  // What one credit (NOC) is worth, from noc_markets — never a constant here.
  const [nocRate, setNocRate] = useState<{ minorPerNoc: number; currency: string } | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.from('credit_plan_allowances').select('plan,monthly_credits,enabled').then(({ data, error }) => {
      if (!alive || error) return;
      setAllowances(Object.fromEntries((data ?? [])
        .filter((r) => r.enabled && r.monthly_credits > 0)
        .map((r) => [r.plan as string, r.monthly_credits as number])));
    });
    supabase.from('noc_markets').select('purchase_mode,minor_per_noc,currency').eq('code', 'NG').maybeSingle().then(({ data, error }) => {
      if (!alive || error || !data) return;
      setTopUpsLive(data.purchase_mode === 'live');
      const minor = Number(data.minor_per_noc);
      if (Number.isFinite(minor) && minor > 0) setNocRate({ minorPerNoc: minor, currency: String(data.currency) });
    });
    return () => { alive = false; };
  }, []);
  const allowanceFor = (tierId: string): number | null => allowances?.[tierId] ?? null;

  const visibleFeatures = (features: string[]) =>
    features.filter((f) => !/AI credits?\s*\/\s*month/i.test(f));

  const { format, formatUsd, currency } = useCurrency();
  const [annual, setAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null);
  const [businessCount, setBusinessCount] = useState<number | null>(null);

  // The wording is editable. The numbers are not: prices, fees, credits and
  // plan features come from data and stay unreachable to the editor.
  useEditableSeo({
    titleSlot: 'pricing.seo.title',
    descriptionSlot: 'pricing.seo.description',
    title: 'Pricing — NowOpen Africa Plans for Businesses & Creatives',
    description:
      'Simple, honest pricing for African businesses and creatives — free listings, growth plans and enterprise options with founding-member discounts.',
    path: '/pricing',
    image: '/og-image.png',
  });

  useEffect(() => {
    /*
     * `plan_viewed` was a declared EventName with no call site, so the step
     * between interest and payment produced nothing — and it is the only
     * place the pricing page appears in any funnel.
     *
     * Once per mount, not per render or per plan card: the question is how
     * many people reached pricing, and firing per card would answer a
     * different question badly.
     */
    track('plan_viewed');
  }, []);

  useEffect(() => {
    supabase
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => setBusinessCount(count ?? 0));
  }, []);

  const founding = businessCount !== null && businessCount < FOUNDING_MEMBER_LIMIT;
  const discount = (usd: number) => (founding ? Math.round(usd * (1 - FOUNDING_MEMBER_DISCOUNT) * 100) / 100 : usd);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero */}
      {/*
        * One gradient, not six.
        *
        * This band used to run navy → violet → magenta → orange → amber →
        * green across its full width. Six hues is a colour test card rather
        * than a brand, and on the page where somebody decides whether to pay,
        * it competed with the plan cards that are the actual subject.
        *
        * A single deep field with two soft highlights keeps the depth and the
        * confidence, and lets the prices below be the loudest thing on screen.
        */}
      <section
        className="relative overflow-hidden text-white py-20"
        style={{
          backgroundColor: '#1e1b4b',
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 15% 0%, rgba(99,102,241,0.45), transparent 60%),' +
            'radial-gradient(ellipse 70% 60% at 85% 20%, rgba(217,70,239,0.28), transparent 62%),' +
            'linear-gradient(160deg, #1e1b4b 0%, #2e1065 55%, #1e1b4b 100%)',
        }}
      >
        {/* A hairline of light along the bottom edge, so the band ends on a
            deliberate line rather than a hard colour change. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium">
            <Sparkles size={16} className="text-yellow-300" />
            <Editable slot="pricing.hero.pill" as="span">Join for free. Grow with NowOpen. Upgrade when your business grows.</Editable>
          </div>
          <h1 className="text-3xl md:text-5xl font-bold">
            <Editable slot="pricing.hero.title" as="span">Pricing built for every African business</Editable>
          </h1>
          <p className="text-indigo-100/85 text-base md:text-lg max-w-2xl mx-auto">
            <Editable slot="pricing.hero.sub" as="span">
              From a neighborhood tailor to a multinational — start free with Free Launch, unlock essential tools
              with Growth, and move to Business Pro when you're ready to scale.
            </Editable>
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-full p-1.5 mt-4">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition ${!annual ? 'bg-white text-indigo-900 shadow-sm' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition inline-flex items-center gap-1.5 ${annual ? 'bg-white text-indigo-900 shadow-sm' : 'text-white/80 hover:text-white hover:bg-white/10'}`}
            >
              Annual
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${annual ? 'bg-green-100 text-green-700' : 'bg-green-400/90 text-green-950'}`}>
                2 MONTHS FREE
              </span>
            </button>
          </div>

          {/* Section nav */}
          <nav className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-inset ring-white/15 hover:bg-white/20 hover:ring-white/30 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* Founding member banner */}
      {founding && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl shadow-xl p-5 flex flex-col sm:flex-row items-center gap-4 text-white">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Gift size={24} />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-bold">Founder Launch Offer — {FOUNDING_MEMBER_DISCOUNT * 100}% off your first year</p>
              <p className="text-sm text-white/90">
                {businessCount === 0 ? 'Be our very first business' : `Only ${FOUNDING_MEMBER_LIMIT - (businessCount ?? 0)} founding spots left`} — applied automatically at checkout on any paid plan below.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Business Plans */}
      <section id="business-plans" className="site-container pt-10 pb-16 scroll-mt-20">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-white text-center">
          <Editable slot="pricing.plans.heading" as="span">Business plans</Editable>
        </h2>
        <p className="mt-2 text-center text-gray-600 dark:text-gray-400 mb-12 max-w-xl mx-auto">
          <Editable slot="pricing.plans.sub" as="span">Join for free. Grow with NowOpen. Upgrade when your business grows.</Editable>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {BUSINESS_TIERS.map((tier) => {
            const Icon = BUSINESS_ICONS[tier.id] ?? Building2;
            const free = tier.monthlyUsd === 0;
            const rawMonthly = tier.custom ? null : annual ? (tier.annualUsd! / 12) : tier.monthlyUsd!;
            const displayMonthly = rawMonthly === null ? null : discount(rawMonthly);
            const chargeAmount = tier.custom ? null : discount(annual ? tier.annualUsd! : tier.monthlyUsd!);
            const isDiscounted = founding && !free && !tier.custom;
            const annualSaving = !free && !tier.custom ? tier.monthlyUsd! * 12 - tier.annualUsd! : 0;
            // How many booking/order modules this plan lets a business switch on
            // in their profile editor (see BusinessForm's module selector).
            const modLimit = moduleLimitForPlan(tier.id);
            const modLabel = modLimit >= 999
              ? 'Unlimited booking modules'
              : `${modLimit} selectable booking module${modLimit === 1 ? '' : 's'}`;

            return (
              /*
               * The recommended plan is raised, not outlined.
               *
               * A 2px purple border around one card and hairline borders around
               * the others made the row read as "one of these is different"
               * rather than "this is the one to take". Lifting it, warming its
               * surface and deepening its shadow says the same thing the way a
               * physical shelf does — and it leaves the border free to mean
               * "edge of card" everywhere else on the page.
               */
              <div
                key={tier.id}
                className={`relative rounded-2xl p-6 flex flex-col transition-shadow ${
                  tier.highlight
                    ? 'bg-white dark:bg-gray-800 ring-1 ring-purple-200 dark:ring-purple-500/30 shadow-[0_20px_50px_-12px_rgba(147,51,234,0.25)] xl:-mt-5 xl:mb-[-1.25rem] xl:pt-8'
                    : 'bg-white/70 dark:bg-gray-800/60 ring-1 ring-gray-200 dark:ring-gray-700/60 shadow-sm hover:shadow-lg'
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-1 bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-[11px] font-semibold rounded-full tracking-wide whitespace-nowrap shadow-md shadow-purple-500/30">
                    Most popular
                  </span>
                )}
                {/* Deliberately quiet. On a pricing card the price is the
                    thing being compared, and a saturated blue tile above it was
                    winning that contest four times over. */}
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center mb-3">
                  <Icon size={18} strokeWidth={1.75} className="text-gray-500 dark:text-gray-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{tier.name}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 min-h-[2.5em]">{tier.tagline}</p>

                <div className="mb-5">
                  {tier.custom ? (
                    <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Custom pricing</span>
                  ) : free ? (
                    <span className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white tabular-nums">{format(0)}</span>
                  ) : (
                    <>
                      {isDiscounted && (
                        <span className="text-sm text-gray-400 line-through mr-2">{format(rawMonthly!)}</span>
                      )}
                      <span className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white tabular-nums">{format(displayMonthly!)}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-xs">/mo{annual ? ', billed annually' : ''}</span>
                      {currency !== 'USD' && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{formatUsd(displayMonthly!)} USD/month</p>
                      )}
                      {annual && annualSaving > 0 && (
                        <p className="text-[11px] font-semibold text-green-600 dark:text-green-400 mt-1">
                          Save {format(annualSaving)}/year
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Module allowance — mirrors the plan cap enforced in the
                    profile editor's booking-module selector. */}
                <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40">
                  <Boxes size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">{modLabel}</span>
                </div>

                {/* AI credits included in the plan — only once there is a
                    credit programme able to grant them. */}
                {allowanceFor(tier.id) !== null && creditsLive === true && (
                  <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/40">
                    <Coins size={16} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-purple-800 dark:text-purple-300">
                      {allowanceFor(tier.id)!.toLocaleString()} AI credits / month
                    </span>
                  </div>
                )}

                <ul className="space-y-2 mb-6 flex-1">
                  {visibleFeatures(tier.features).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                      <Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {free ? (
                  <Link
                    to="/register"
                    className="block text-center px-5 py-2.5 rounded-lg font-medium text-sm transition bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Join Free
                  </Link>
                ) : tier.custom ? (
                  <a
                    href="mailto:hello@nowopenafrica.com?subject=Enterprise%20plan%20enquiry"
                    className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg font-medium text-sm transition bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    <Mail size={14} /> Contact Sales
                  </a>
                ) : (
                  <button
                    onClick={() =>
                      setCheckout({
                        kind: 'subscription',
                        itemId: tier.id,
                        title: `${tier.name} plan — ${annual ? 'annual' : 'monthly'}${isDiscounted ? ' (founding member)' : ''}`,
                        amountUsd: chargeAmount!,
                        amountNote: annual ? 'per year (founding pricing applied)' : 'per month',
                      })
                    }
                    className={`w-full text-center px-5 py-2.5 rounded-lg font-medium text-sm transition ${
                      tier.highlight
                        ? 'bg-purple-600 text-white hover:bg-purple-700'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    Choose {tier.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">
          Placement owners and creative professionals list for free and keep 90% of every booking.
        </p>
      </section>

      {/* AI Credits — bundled with every plan */}
      <section id="ai-credits" className="bg-white dark:bg-gray-800 border-y border-gray-100 dark:border-gray-800 py-16 scroll-mt-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Coins size={22} className="text-purple-600 dark:text-purple-400" />
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white text-center">AI Credits</h2>
          </div>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-10">
            {creditsLive === true
              ? <>Every plan comes with AI credits each month, granted automatically. Spend them on
                  AI writing for your profile today — image and video generation follow.
                  {topUpsLive ? ' Need more? Top up any time from your wallet.' : ' Top-up packs will open later.'}</>
              : <>AI credits are coming. They will power copy, images and your business assistant across
                  Studio — we will publish the allowances and top-up prices here before they go live.</>}
          </p>
          {/* The per-tier numbers are a promise. They appear only when
              something can actually grant them. */}
          {creditsLive === true && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {BUSINESS_TIERS.filter((t) => allowanceFor(t.id) !== null).map((tier) => (
                <div key={tier.id} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 border border-gray-100 dark:border-gray-800 text-center">
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-1">
                    {allowanceFor(tier.id)!.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">AI credits / month</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{tier.name}</p>
                </div>
              ))}
            </div>
          )}
          {/* The credit's value and what it buys, read from noc_markets and
              credit_actions. NGN here is the credit's face value (an amount in
              naira, not a converted display price), hence formatMinor. */}
          {creditsLive === true && nocRate && (
            <div className="mt-8">
              <p className="text-center font-semibold text-gray-900 dark:text-white">
                1 AI credit (NOC) = {formatMinor(nocRate.minorPerNoc, nocRate.currency)}
              </p>
              {liveActions.length > 0 && (
                <ul className="mt-4 mx-auto max-w-2xl divide-y divide-gray-100 dark:divide-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                  {liveActions.map((a) => (
                    <li key={a.slug} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{a.name}</span>
                      <span className="shrink-0 text-right">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {a.creditCost!.toLocaleString()} credit{a.creditCost === 1 ? '' : 's'}
                        </span>
                        <span className="ml-2 text-gray-500 dark:text-gray-400">
                          ({formatMinor(a.creditCost! * nocRate.minorPerNoc, nocRate.currency)})
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {creditsLive === true && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
              Enterprise plans get custom AI credits — <a href="mailto:hello@nowopenafrica.com?subject=Enterprise%20AI%20credits" className="text-purple-600 dark:text-purple-400 underline">talk to us</a>.
            </p>
          )}
        </div>
      </section>

      {/* Marketplace pricing explainer */}
      <section className="bg-white dark:bg-gray-800 border-y border-gray-100 dark:border-gray-800 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white text-center mb-10">
            <Editable slot="pricing.marketplace.heading" as="span">Marketplace pricing at a glance</Editable>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">{format(110, { compact: true })}–{format(900, { compact: true })}<span className="text-base text-gray-500 dark:text-gray-400">/day</span></p>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                <Editable slot="pricing.marketplace.placements.title" as="span">Ad Placements</Editable>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <Editable slot="pricing.marketplace.placements.body" as="span">Billboards, digital screens, transit, airports and stadiums — priced per day by location and traffic.</Editable>
              </p>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <p className="text-3xl font-bold text-pink-600 dark:text-pink-400 mb-2">{format(15)}–{format(3000, { compact: true })}<span className="text-base text-gray-500 dark:text-gray-400">/project</span></p>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                <Editable slot="pricing.marketplace.creative.title" as="span">Creative Services</Editable>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <Editable slot="pricing.marketplace.creative.body" as="span">Photography, video, design, audio and social — transparent per-project or per-deliverable rates.</Editable>
              </p>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mb-2">10%<span className="text-base text-gray-500 dark:text-gray-400"> fee</span></p>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                <Editable slot="pricing.marketplace.bookings.title" as="span">Secure Bookings</Editable>
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <Editable slot="pricing.marketplace.bookings.body" as="span">One flat platform fee covers verification, escrow-style payments and dispute support. 0% on Business Pro.</Editable>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Creative Marketplace Plans */}
      <section id="creative-plans" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 scroll-mt-20">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Palette size={22} className="text-pink-600 dark:text-pink-400" />
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white text-center">Creative Marketplace</h2>
        </div>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-10">
          Separate from business subscriptions — for photographers, designers, videographers and studios.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CREATIVE_TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative bg-white dark:bg-gray-800 rounded-2xl p-6 flex flex-col ${
                tier.highlight ? 'shadow-2xl border-2 border-pink-500' : 'shadow-lg border border-gray-100 dark:border-gray-800'
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-pink-600 text-white text-xs font-bold rounded-full uppercase tracking-wide">
                  Best Value
                </span>
              )}
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{tier.name}</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 min-h-[2.5em]">{tier.tagline}</p>
              <div className="mb-5">
                <span className="text-3xl font-bold text-gray-900 dark:text-white">{format(tier.monthlyUsd ?? 0)}</span>
                {(tier.monthlyUsd ?? 0) > 0 && <span className="text-gray-500 dark:text-gray-400 text-xs">/month</span>}
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {visibleFeatures(tier.features).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {tier.monthlyUsd === 0 ? (
                <Link
                  to="/register"
                  className="block text-center px-5 py-2.5 rounded-lg font-medium text-sm transition bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Join Free
                </Link>
              ) : (
                <button
                  onClick={() =>
                    setCheckout({
                      kind: 'creative_subscription',
                      itemId: tier.id,
                      title: `${tier.name} — monthly`,
                      amountUsd: tier.monthlyUsd!,
                      amountNote: 'per month',
                    })
                  }
                  className={`w-full text-center px-5 py-2.5 rounded-lg font-medium text-sm transition ${
                    tier.highlight ? 'bg-pink-600 text-white hover:bg-pink-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  Subscribe
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Promote (advertising) — a separate revenue stream, on any plan */}
      <section id="advertising" className="bg-white dark:bg-gray-800 border-y border-gray-100 dark:border-gray-800 py-16 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Megaphone size={22} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white text-center">Promote</h2>
          </div>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-10">
            Advertising is separate from your subscription — boost visibility whenever you want, on any plan.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {BOOST_OPTIONS.map((opt) => (
              <div key={opt.id} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-800">
                <h3 className="font-semibold text-gray-900 dark:text-white">{opt.label}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{opt.description}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mb-3">{format(opt.usd)}</p>
                <button
                  onClick={() =>
                    setCheckout({ kind: 'ad_boost', itemId: opt.id, title: `Listing Boost — ${opt.label}`, amountUsd: opt.usd })
                  }
                  className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                >
                  Boost My Listing
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Digital Campaign</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                Facebook, Instagram, Google, YouTube & TikTok — managed through NowOpen Africa.
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                {format(DIGITAL_CAMPAIGN_STARTING_USD)}<span className="text-xs font-normal text-gray-500 dark:text-gray-400"> starting from</span>
              </p>
              <button
                onClick={() =>
                  setCheckout({ kind: 'ad_campaign', title: 'Digital Campaign (starting package)', amountUsd: DIGITAL_CAMPAIGN_STARTING_USD })
                }
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              >
                Start a Campaign
              </button>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Outdoor Advertising</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                Billboards, LED screens, transit ads, airport displays, lamppost banners & mall screens.
              </p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mb-3">Request a quote</p>
              <Link
                to="/adverts"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              >
                Browse Placements <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* AI Add-ons */}
      <section id="ai-addons" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 scroll-mt-20">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Bot size={22} className="text-purple-600 dark:text-purple-400" />
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white text-center">AI Add-ons</h2>
        </div>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-10">Dedicated AI subscriptions for heavier creative work — your plan's credits come first.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {AI_ADDONS.map((addon) => (
            <div key={addon.id} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-800 flex flex-col">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{addon.name}</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 min-h-[2.5em]">{addon.tagline}</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mb-5">
                {format(addon.monthlyUsd)}<span className="text-xs font-normal text-gray-500 dark:text-gray-400">/month</span>
              </p>
              <ul className="space-y-2 mb-6 flex-1">
                {addon.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() =>
                  setCheckout({ kind: 'ai_addon', itemId: addon.id, title: `${addon.name} — monthly`, amountUsd: addon.monthlyUsd, amountNote: 'per month' })
                }
                className="w-full px-5 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition"
              >
                Subscribe
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Category Modules */}
      <section id="modules" className="bg-white dark:bg-gray-800 border-y border-gray-100 dark:border-gray-800 py-16 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Layers size={22} className="text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white text-center">Category Modules</h2>
          </div>
          <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
            Only pay for the features your business actually uses — stacks with any plan.
          </p>
          <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-200 dark:divide-gray-800 overflow-hidden">
            {CATEGORY_MODULES.map((mod) => (
              <div key={mod.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{mod.name}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{format(mod.monthlyUsd)}/mo</span>
                  <button
                    onClick={() =>
                      setCheckout({ kind: 'module', itemId: mod.id, title: `${mod.name} module — monthly`, amountUsd: mod.monthlyUsd, amountNote: 'per month' })
                    }
                    className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition"
                  >
                    Add Module
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white text-center mb-10">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-4 text-left font-medium text-gray-900 dark:text-white"
              >
                {faq.q}
                <ChevronDown
                  size={18}
                  className={`text-gray-500 dark:text-gray-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                />
              </button>
              {openFaq === i && (
                <p className="px-6 pb-5 text-sm text-gray-600 dark:text-gray-400">{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-white py-14" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 20%, #831843 40%, #9a3412 60%, #92400e 80%, #166534 100%)' }}>
        <div className="max-w-3xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-2xl md:text-3xl font-bold">
          <Editable slot="pricing.cta.heading" as="span">Not ready to choose yet?</Editable>
        </h2>
          <p className="text-blue-100">
            <Editable slot="pricing.cta.body" as="span">
              Start free today with Free Launch — add modules, AI credits or Promote boosts whenever your
              business needs them, and upgrade as you grow.
            </Editable>
          </p>
          <Editable
            slot="pricing.cta.primary"
            to="/waitlist"
            className="inline-block px-8 py-4 bg-white text-blue-700 font-semibold rounded-lg hover:bg-blue-50 transition shadow-lg"
          >
            Join the Waitlist
          </Editable>
        </div>
      </section>

      {checkout && <PaymentModal item={checkout} onClose={() => setCheckout(null)} />}
    </div>
  );
}
