import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Layers, ShieldCheck, Sparkles, MapPin } from 'lucide-react';
import { applySeo } from '../lib/seo';
import { PILLARS, INDUSTRIES, UNIVERSAL_FEATURES } from '../data/industrySystems';
import { OS_SHOWCASE } from '../data/osShowcase';
import PlatformEnquiryModal from '../components/PlatformEnquiryModal';

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="The NowOpen Advantage"
            title="Ten capabilities, one platform"
            sub="Every industry system is powered by the same ten platform-wide engines — the moat a simple listing site can’t match."
          />
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            {PILLARS.map(({ name, tagline, icon: Icon }) => (
              <button
                key={name}
                onClick={() => setActivePillar(name)}
                className={`bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-5 border text-left transition hover:-translate-y-0.5 ${
                  activePillar === name
                    ? 'border-blue-500 dark:border-blue-500 shadow-md ring-2 ring-blue-500/20'
                    : 'border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700'
                }`}
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Icon size={22} className="text-white" />
                </div>
                <h3 className="mt-4 font-bold text-gray-900 dark:text-white">{name}</h3>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{tagline}</p>
              </button>
            ))}
          </div>

          {/* Pillar deep-dive */}
          <div className="mt-6 rounded-3xl border border-gray-100 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
            <div className="p-6 sm:p-8 grid lg:grid-cols-[1fr_1.4fr] gap-8">
              <div>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <pillar.icon size={28} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{pillar.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{pillar.tagline}</p>
                  </div>
                </div>
                <p className="mt-5 text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">Why it matters: </span>
                  {pillar.benefit}
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">What it includes</div>
                <div className="flex flex-wrap gap-2">
                  {pillar.features.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100"
                    >
                      <Check size={14} className="text-green-500 flex-shrink-0" />
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ INDUSTRIES -- */}
      <section id="industries" className="scroll-mt-20 py-16 sm:py-20 bg-white dark:bg-gray-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
                          <Check size={14} className="text-green-500 flex-shrink-0" />
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="See it live"
            title="A real profile for every industry"
            sub="These are live demo profiles — tap any card to open the actual operating system that industry runs on."
          />
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
            {OS_SHOWCASE.map((c) => (
              <Link
                key={c.username}
                to={`/business/${c.username}`}
                className="group flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:shadow-lg hover:-translate-y-0.5 transition"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={c.image}
                    alt={c.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />
                  <span className="absolute top-2.5 left-2.5 inline-flex items-center rounded-full bg-white/90 dark:bg-gray-900/80 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-gray-800 dark:text-gray-100">
                    {c.category}
                  </span>
                </div>
                <div className="flex flex-col flex-1 p-4">
                  <h3 className="font-bold text-gray-900 dark:text-white leading-tight">{c.name}</h3>
                  {c.location && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <MapPin size={12} className="flex-shrink-0" /> {c.location}
                    </p>
                  )}
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 flex-1">{c.blurb}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400 group-hover:gap-2 transition-all">
                    View live profile <ArrowRight size={15} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- UNIVERSAL -- */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
