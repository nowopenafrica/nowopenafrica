import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Layers, ShieldCheck, Sparkles, MapPin, Plus } from 'lucide-react';
import { applySeo } from '../lib/seo';
import { PILLARS, INDUSTRIES, UNIVERSAL_FEATURES, liveModulesFor } from '../data/industrySystems';
import { OS_SHOWCASE } from '../data/osShowcase';
import { INDUSTRY_EXAMPLES, demoUsernameFor, examplePath } from '../lib/industryExamples';
import PlatformEnquiryModal from '../components/PlatformEnquiryModal';
import SmartImg from '../components/SmartImg';

const AFRICA_GRADIENT =
  'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 20%, #831843 40%, #9a3412 60%, #92400e 80%, #166534 100%)';

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="max-w-2xl mb-10">
      <div className="text-sm font-semibold tracking-wide text-blue-600 dark:text-blue-400 uppercase">{eyebrow}</div>
      <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">{title}</h2>
      {sub && <p className="mt-3 text-lg text-gray-600 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

export default function Platform() {
  const [activeSlug, setActiveSlug] = useState(INDUSTRIES[0].slug);
  const active = INDUSTRIES.find((i) => i.slug === activeSlug)!;
  // Computed from the shipped module map, so this list cannot claim a
  // capability the product does not actually have. See liveModulesFor.
  const liveModules = liveModulesFor(active);

  /*
   * The industries with no demo profile of their own.
   *
   * OS_SHOWCASE is 45 curated spotlight records and every one of them is
   * already on the page — so "more industries" cannot come from more
   * spotlights without inventing more businesses, which is off the table.
   *
   * Six industries have never had a demo profile (car rentals, dental,
   * training, tailors, home services, courier). They do have example pages:
   * the layout, filled from the shipped module config, named after the
   * INDUSTRY and never after a business. Showing those completes the section
   * honestly — the cards say "page layout", not "a real business".
   */
  const layoutOnly = INDUSTRY_EXAMPLES.filter((ex) => !demoUsernameFor(ex.slug));
  const [activePillar, setActivePillar] = useState(PILLARS[0].name);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const pillar = PILLARS.find((p) => p.name === activePillar)!;

  useEffect(() => {
    return applySeo({
      title: 'Industry Operating Systems — NowOpen Africa',
      description:
        'NowOpen Africa isn’t a generic directory. Every industry gets a purpose-built operating system — real estate portals, restaurant ordering, hotel booking, creative studios and more — on one platform for African business.',
      path: '/platform',
      type: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Industry Operating Systems — NowOpen Africa',
        about: INDUSTRIES.map((i) => i.name),
        isPartOf: { '@type': 'WebSite', name: 'NowOpen Africa', url: 'https://nowopenafrica.com' },
      },
    });
  }, []);

  return (
    <div className="bg-gray-50 dark:bg-gray-900">
      {/* ------------------------------------------------------------ HERO -- */}
      <section className="relative text-white overflow-hidden" style={{ background: AFRICA_GRADIENT }}>
        <div className="site-container py-16 sm:py-24 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium">
            <Layers size={16} className="text-yellow-300" />
            Not a directory. An operating system.
          </span>
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight max-w-4xl mx-auto">
            An operating system for every industry
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-white/85 max-w-2xl mx-auto">
            NowOpen Africa doesn’t give businesses one generic profile. Each category gets a
            purpose-built system of features — so it feels designed specifically for that industry,
            and impossible to copy as a whole.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <a href="#industries" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition">
              Explore the industries <ArrowRight size={18} />
            </a>
            <a href="#live-examples" className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold rounded-lg hover:bg-white/20 transition">
              See live examples
            </a>
            <button type="button" onClick={() => setEnquiryOpen(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold rounded-lg hover:bg-white/20 transition">
              Put your business on it
            </button>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-white/80">
            <span>{INDUSTRIES.length}+ industry systems</span>
            <span className="hidden sm:inline">·</span>
            <span>10 platform-wide capabilities</span>
            <span className="hidden sm:inline">·</span>
            <span>{UNIVERSAL_FEATURES.length} universal features</span>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- PILLARS -- */}
      <section className="py-16 sm:py-20">
        <div className="site-container">
          <SectionHeading
            eyebrow="The NowOpen Advantage"
            title="Ten capabilities, one platform"
            sub="Every industry system runs on the same ten engines. Pick one to see what it does."
          />

          {/* A selector, not ten cards.
              This was a 10-card grid, each card carrying the pillar's tagline —
              and then a panel below that repeated the tagline of whichever card
              was active. Ten paragraphs competing for attention, one of them
              duplicated, before the reader had chosen anything. Now the row
              only identifies the ten, and the panel does the explaining. */}
          <div
            role="tablist"
            aria-label="Platform capabilities"
            className="flex flex-wrap gap-2"
          >
            {PILLARS.map(({ name, icon: Icon }, i) => {
              const selected = activePillar === name;
              return (
                <button
                  key={name}
                  id={`pillar-tab-${i}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls="pillar-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActivePillar(name)}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    e.preventDefault();
                    const next = (i + (e.key === 'ArrowRight' ? 1 : PILLARS.length - 1)) % PILLARS.length;
                    setActivePillar(PILLARS[next].name);
                    document.getElementById(`pillar-tab-${next}`)?.focus();
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border pl-2 pr-4 py-2 text-sm font-semibold transition ${
                    selected
                      ? 'border-transparent bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      selected ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'
                    }`}
                  >
                    <Icon size={15} className={selected ? 'text-white' : 'text-blue-600 dark:text-blue-400'} />
                  </span>
                  {name.replace(/^NowOpen /, '')}
                </button>
              );
            })}
          </div>

          {/* Pillar deep-dive */}
          <div
            id="pillar-panel"
            role="tabpanel"
            aria-labelledby={`pillar-tab-${PILLARS.findIndex((p) => p.name === pillar.name)}`}
            className="mt-6 rounded-3xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800"
          >
            <div className="p-6 sm:p-8 grid lg:grid-cols-[1fr_1.2fr] gap-6 lg:gap-10">
              <div>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <pillar.icon size={28} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{pillar.name}</h3>
                </div>
                <p className="mt-5 text-lg text-gray-800 dark:text-gray-100 leading-relaxed">
                  {pillar.benefit}
                </p>
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {pillar.tagline}
                </p>
              </div>
              <div className="lg:border-l lg:border-gray-100 lg:dark:border-gray-700 lg:pl-10">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  What this engine covers
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pillar.features.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100"
                    >
                      <Plus size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                      {f}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  The scope of the engine — see any industry below for the modules live on
                  profiles today.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ INDUSTRIES -- */}
      <section id="industries" className="scroll-mt-20 py-16 sm:py-20 bg-white dark:bg-gray-800/40">
        <div className="site-container">
          <SectionHeading
            eyebrow="Industry Operating Systems"
            title="Pick an industry"
            sub="Each one ships a tailored set of features — listings, tours, menus, calculators, live and more."
          />

          <div className="grid lg:grid-cols-[300px_1fr] gap-8">
            {/* Selector */}
            <div className="lg:max-h-[640px] lg:overflow-y-auto lg:pr-2 -mx-1 px-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-2">
                {INDUSTRIES.map((ind) => {
                  const Icon = ind.icon;
                  const isActive = ind.slug === activeSlug;
                  return (
                    <button
                      key={ind.slug}
                      onClick={() => setActiveSlug(ind.slug)}
                      aria-pressed={isActive}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition border ${
                        isActive
                          ? 'bg-blue-600 border-blue-600 text-white shadow'
                          : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-white/20' : 'bg-white dark:bg-gray-700'}`}>
                        <Icon size={17} className={isActive ? 'text-white' : 'text-blue-600 dark:text-blue-400'} />
                      </span>
                      <span className="text-sm font-medium leading-tight">{ind.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active panel */}
            <div className="rounded-3xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800">
              <div className={`p-6 sm:p-8 bg-gradient-to-br ${active.accent} text-white`}>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                    <active.icon size={28} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold">{active.name}</h3>
                    <p className="text-white/85">{active.tagline}</p>
                  </div>
                </div>
              </div>
              <div className="p-6 sm:p-8 space-y-7">
                {/* Live today — derived from the module map, not written by hand.
                    This block and the roadmap below deliberately look different:
                    the whole panel used to render a green tick beside features
                    that were not built, which reads as a claim. */}
                {liveModules.length > 0 && (
                  <div className="rounded-2xl border border-green-200 dark:border-green-900/60 bg-green-50/70 dark:bg-green-900/15 p-4 sm:p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">
                        Working today
                      </div>
                      <div className="text-xs text-green-800/70 dark:text-green-300/70">
                        {liveModules.length} {liveModules.length === 1 ? 'module' : 'modules'} across{' '}
                        {active.categories.length}{' '}
                        {active.categories.length === 1 ? 'category' : 'categories'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {liveModules.map((mod) => (
                        <span
                          key={mod.label}
                          title={`Runs on ${mod.categories} of ${active.categories.length} ${active.name} categories`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-gray-800 border border-green-300 dark:border-green-800 px-3 py-1.5 text-sm font-medium text-gray-900 dark:text-gray-50"
                        >
                          <Check size={14} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                          {mod.label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-green-900/70 dark:text-green-200/60">
                      Live booking, ordering and enquiry modules on every profile in this industry — a
                      business can run several at once.
                    </p>
                  </div>
                )}

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    The full system we are building
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    The complete feature map for this industry. Some of it ships today; the rest is
                    what we are building towards.
                  </p>
                </div>

                {active.groups.map((group) => (
                  <div key={group.label}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-3">
                      {group.label}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.features.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100"
                        >
                          <Plus size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- LIVE EXAMPLES -- */}
      <section id="live-examples" className="scroll-mt-20 py-16 sm:py-20">
        <div className="site-container">
          <SectionHeading
            eyebrow="See it live"
            title="Open the system for any industry"
            sub="Demo profiles running the real operating system, plus the page layout for the few industries still waiting on one. Tap any card."
          />
          {/* Six across on a wide screen, so the whole set reads as one wall of
              industries rather than a long scroll. The card text steps down
              with the column count — at six the blurb is the first thing that
              would become unreadable, so it goes. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
            {OS_SHOWCASE.map((c) => (
              <Link
                key={c.username}
                to={`/business/${c.username}`}
                className="group flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5 transition"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <SmartImg
                    src={c.image}
                    alt={c.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <span className="absolute bottom-2 left-2 right-2 text-[11px] font-semibold text-white/90 truncate">
                    {c.category}
                  </span>
                </div>
                <div className="flex flex-col flex-1 p-3">
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white leading-tight line-clamp-2">
                    {c.name}
                  </h3>
                  {c.location && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <MapPin size={11} className="flex-shrink-0" />
                      <span className="truncate">{c.location}</span>
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400 flex-1 line-clamp-3 xl:hidden">
                    {c.blurb}
                  </p>
                  <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:gap-1.5 transition-all">
                    View profile <ArrowRight size={13} />
                  </span>
                </div>
              </Link>
            ))}

            {/* Industries with no demo profile. Deliberately distinct — dashed,
                no photograph, and labelled a layout — because there is no
                business behind them and the card must not imply one. */}
            {layoutOnly.map((ex) => {
              const Icon = ex.icon;
              return (
                <Link
                  key={ex.slug}
                  to={examplePath(ex.slug)}
                  className="group flex flex-col rounded-2xl overflow-hidden bg-gray-50 dark:bg-gray-800/60 border border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-600 hover:-translate-y-0.5 transition"
                >
                  <div className="relative aspect-[4/3] flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700/60 dark:to-gray-800">
                    <Icon size={30} className="text-gray-400 dark:text-gray-500" />
                    <span className="absolute bottom-2 left-2 right-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">
                      Page layout
                    </span>
                  </div>
                  <div className="flex flex-col flex-1 p-3">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white leading-tight line-clamp-2">
                      {ex.name}
                    </h3>
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      No demo profile yet
                    </p>
                    <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400 flex-1 line-clamp-3 xl:hidden">
                      See how the page is laid out for this industry.
                    </p>
                    <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:gap-1.5 transition-all">
                      See the layout <ArrowRight size={13} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- UNIVERSAL -- */}
      <section className="py-16 sm:py-20">
        <div className="site-container">
          <SectionHeading
            eyebrow="Universal Foundation"
            title="Every business, fully equipped"
            sub="No matter the industry, every NowOpen profile stands on the same powerful base."
          />
          <div className="bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6 sm:p-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
              {UNIVERSAL_FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <ShieldCheck size={15} className="text-blue-500 flex-shrink-0" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- CTA -- */}
      <section className="pb-20">
        <div className="site-container">
          <div className="rounded-3xl overflow-hidden text-white text-center px-8 py-14 sm:py-16" style={{ background: AFRICA_GRADIENT }}>
            <Sparkles size={28} className="mx-auto text-yellow-300" />
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold max-w-2xl mx-auto">
              Businesses don’t just get listed. They run on NowOpen.
            </h2>
            <p className="mt-3 text-lg text-white/85 max-w-2xl mx-auto">
              Discover, book, sell, advertise, broadcast, collaborate and grow — from one platform
              built for African business.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <button type="button" onClick={() => setEnquiryOpen(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition">
              Get early access <ArrowRight size={18} />
            </button>
              <Link to="/pricing" className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold rounded-lg hover:bg-white/20 transition">
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {enquiryOpen && (
        <PlatformEnquiryModal
          kind="platform"
          itemId="platform-page"
          itemTitle="Getting my business on NowOpen Africa"
          subjectPrefix="Platform enquiry"
          onClose={() => setEnquiryOpen(false)}
        />
      )}
    </div>
  );
}
