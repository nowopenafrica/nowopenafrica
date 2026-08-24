import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Target, BarChart3, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { INDUSTRIES } from '../data/industrySystems';
import { generateAdverts, generateBusinesses, generateMediaServices } from '../data/populateData';
import { Advertisement, Business, MediaService } from '../types';
import { useCacheBuster } from '../hooks/useCacheBuster';
import { applySeo } from '../lib/seo';
import BrandMarquee from '../components/BrandMarquee';
import HeroSlider from '../components/HeroSlider';
import ListingExplorer from '../components/home/ListingExplorer';
import { loadHeroSettings, heroBackground, DEFAULT_HERO, type HeroSettings } from '../lib/heroSettings';

export default function Home() {
  const { cacheKey } = useCacheBuster();
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [mediaServices, setMediaServices] = useState<MediaService[]>([]);
  const [textVisible, setTextVisible] = useState(true);
  // Exact row counts for the stats band. head:true fetches no rows, so this
  // is three cheap COUNT queries rather than three more result sets.
  const [counts, setCounts] = useState<{ businesses: number | null; adverts: number | null; media: number | null }>({
    businesses: null, adverts: null, media: null,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const q = (t: string) => supabase.from(t).select('id', { count: 'exact', head: true });
      const [b, a, m] = await Promise.all([q('businesses'), q('advertisements'), q('media_services')]);
      if (!alive) return;
      setCounts({ businesses: b.count ?? null, adverts: a.count ?? null, media: m.count ?? null });
    })().catch(() => { /* a missing count hides its tile; never blocks the page */ });
    return () => { alive = false; };
  }, []);
  // Starts at the default so the hero paints the brand gradient on first frame;
  // the stored preference swaps in once it loads, with no flash of blank banner.
  const [hero, setHero] = useState<HeroSettings>(DEFAULT_HERO);

  useEffect(() => {
    let alive = true;
    loadHeroSettings().then((s) => { if (alive) setHero(s); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    return applySeo({
      title: 'NowOpen Africa — The Operating System for Business Growth in Africa',
      description:
        'Get your business discovered across Africa. Verified listings, ad placements, creative services and an AI-powered Studio — built for 20+ African markets.',
      path: '/',
      image: '/og-image.png',
    });
  }, []);

  // Free-running fade, used only when the slider is NOT driving the text.
  // Both at once would fight: the timer could hide the headline halfway
  // through a clip that the slider had just faded it in for.
  const sliderDrivesText = hero.videoEnabled && hero.textSyncWithVideo;

  useEffect(() => {
    // A repeating fade is exactly what prefers-reduced-motion is for, and it
    // was honoured in only three places site-wide. Leave the headline up.
    if (typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTextVisible(true);
      return;
    }
    if (sliderDrivesText) {
      // Leaving it hidden here would strand the headline invisible if the
      // setting is switched on while nothing is playing.
      setTextVisible(true);
      return;
    }
    const VISIBLE_MS = 15000;
    const HIDDEN_MS = 15000;
    let timeout: ReturnType<typeof setTimeout>;

    const cycle = () => {
      setTextVisible(true);
      timeout = setTimeout(() => {
        setTextVisible(false);
        timeout = setTimeout(cycle, HIDDEN_MS);
      }, VISIBLE_MS);
    };

    cycle();
    return () => clearTimeout(timeout);
  }, [sliderDrivesText]);

  useEffect(() => {
    // Fetch real data for the sliders; fall back to sample data while the
    // database is empty so the homepage never looks bare.
    const fetchSliderData = async () => {
      const [advertRes, businessRes, mediaRes] = await Promise.all([
        supabase.from('advertisements').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('businesses').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('media_services').select('*').order('created_at', { ascending: false }).limit(30),
      ]);

      setAdverts(advertRes.data && advertRes.data.length > 0 ? advertRes.data : generateAdverts(30));
      setBusinesses(businessRes.data && businessRes.data.length > 0 ? businessRes.data : generateBusinesses(30));
      setMediaServices(mediaRes.data && mediaRes.data.length > 0 ? mediaRes.data : generateMediaServices(30));
    };

    fetchSliderData().catch(err => {
      console.error('Error fetching homepage data, showing sample data:', err);
      setAdverts(generateAdverts(30));
      setBusinesses(generateBusinesses(30));
      setMediaServices(generateMediaServices(30));
    });
  }, [cacheKey]);




  // Full class strings (not template-built) so Tailwind's compiler sees them
  const features = [
    {
      icon: Shield,
      title: 'Verified Listings',
      description: 'All businesses and advertising placements are verified for authenticity and quality.',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconText: 'text-blue-600 dark:text-blue-400',
    },
    {
      icon: Zap,
      title: 'Instant Booking',
      description: 'Book advertising placements and media services instantly with our streamlined process.',
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconText: 'text-purple-600 dark:text-purple-400',
    },
    {
      icon: Target,
      title: 'Targeted Reach',
      description: 'Reach your ideal audience with precision targeting and analytics-driven insights.',
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      iconText: 'text-green-600 dark:text-green-400',
    },
    {
      icon: BarChart3,
      title: 'Performance Tracking',
      description: 'Monitor campaign performance in real-time with comprehensive analytics dashboards.',
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconText: 'text-orange-600 dark:text-orange-400',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero Banner Section.
          The gradient below is the always-on base. A video (HERO_VIDEO,
          defined at the top of this file) fades in on top of it once it can
          play, so the banner looks identical to the gradient-only version
          while the video is loading or if the file is missing. */}
      {/* height (not min/max-height) so the h-full flex child below can
          actually resolve its percentage height and truly center — CSS only
          lets height:100% resolve against an ancestor's explicit height. */}
      <section className="relative text-white overflow-hidden" style={{ height: '450px', background: heroBackground(hero) }}>
        {/* Not mounted at all when switched off, so the videos are never even
            requested — a real saving on the mobile data this audience uses. */}
        {hero.videoEnabled && (
          <HeroSlider
            overlayStyle={{ background: 'linear-gradient(135deg, rgba(30,58,95,0.15) 0%, rgba(76,29,149,0.15) 20%, rgba(131,24,67,0.15) 40%, rgba(154,52,18,0.15) 60%, rgba(146,64,14,0.15) 80%, rgba(22,101,52,0.15) 100%)' }}
            onTextVisibilityChange={sliderDrivesText ? setTextVisible : undefined}
          />
        )}
        <div
          className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col items-center justify-center gap-6"
          style={{
            opacity: textVisible ? 1 : 0,
            // The CTAs fade with the copy, and unlike the copy they are
            // interactive — so opacity alone is not enough. A button at
            // opacity 0 is still clickable and still in the tab order, which
            // means someone can activate a control they cannot see.
            //
            // `visibility` fixes both: it removes the subtree from hit-testing
            // AND from the accessibility tree and tab order. The 2s delay
            // applies only while hiding, so it disappears after the fade
            // finishes rather than snapping out at the start; showing has no
            // delay, so it reappears immediately and then fades up.
            visibility: textVisible ? 'visible' : 'hidden',
            transition: `opacity 2s ease-in-out, visibility 0s linear ${textVisible ? '0s' : '2s'}`,
          }}
        >
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Built for Africa's 100M+ businesses
            </div>

            {/* Fixed px-based fluid size (not rem) so this title is immune to
                the site-wide mobile font-size reduction below — the video
                banner headline stays exactly this size on every device. */}
            <h1 className="text-[clamp(28px,4vw_+_15px,41.6px)] font-bold leading-tight">
              <span style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)' }}>The Operating System for</span>
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400">
                Business Growth in Africa
              </span>
            </h1>

            <p className="text-base md:text-lg text-blue-100 max-w-2xl mx-auto" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
              Discover customers. Advertise everywhere. Create anything. Grow with AI.
            </p>
          </div>

          {/* CTAs fade with the copy — see the wrapper above for why they
              also need visibility, not just opacity. */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/businesses" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition shadow-lg">
              Explore businesses <ArrowRight size={18} />
            </Link>
            <Link to="/waitlist" className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold rounded-lg hover:bg-white/20 transition">
              List your business
            </Link>
          </div>
        </div>
      </section>





      {/* Industry Operating Systems */}
      <section className="py-16 bg-white dark:bg-gray-800/40 border-y border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
              <Layers size={14} /> Not a directory. An operating system.
            </span>
            <h2 className="mt-4 text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">An operating system for every industry</h2>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Every category gets a purpose-built profile — property portals, restaurant menus, repair queues, booking
              engines and more — so a business feels designed specifically for its industry.
            </p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {INDUSTRIES.slice(0, 14).map((ind) => {
              const Icon = ind.icon;
              return (
                <Link
                  key={ind.slug}
                  to="/platform"
                  className="group flex flex-col items-center gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center hover:-translate-y-0.5 hover:shadow-md transition"
                >
                  <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ind.accent} flex items-center justify-center`}>
                    <Icon size={20} className="text-white" />
                  </span>
                  <span className="text-[11px] sm:text-xs font-semibold text-gray-800 dark:text-gray-100 leading-tight">{ind.name}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <Link
              to="/platform"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold rounded-lg hover:opacity-90 transition"
            >
              Explore the platform <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>




      {/* Browse — search, type toggle, category chips and the card grid,
          in one block. Replaces the standalone search band and the separate
          tabbed listings section. */}
      <ListingExplorer businesses={businesses} adverts={adverts} mediaServices={mediaServices} />

      {/* Stats band */}
      <section className="pt-12" aria-label="NowOpen Africa at a glance">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-200 dark:divide-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 overflow-hidden">
            {/* Real numbers only.
                "30+", "20+", "3-in-1" and "AI" were three vague claims and one
                that is not a statistic at all. These are counted: the industry
                total comes from the config that drives the industry pages, and
                the rest are exact COUNT queries. A tile whose count is unknown
                or zero is dropped rather than shown as "0" or rounded up —
                which is the same rule the Trust Panel follows, and it means the
                band strengthens on its own as the platform fills. */}
            {[
              // Three counted tiles, then AI. The grid is four columns, so
              // dropping empty counts left a visible gap; capping the counted
              // ones at three keeps the row complete now and still complete
              // once ad placements exist. AI is a property of the product
              // rather than a metric, so it needs no count to be true.
              ...([
                { value: String(INDUSTRIES.length), label: 'Industry systems' },
                { value: counts.businesses ? String(counts.businesses) : null, label: 'Businesses listed' },
                { value: counts.media ? String(counts.media) : null, label: 'Creative services' },
                { value: counts.adverts ? String(counts.adverts) : null, label: 'Ad placements' },
              ].filter((t): t is { value: string; label: string } => Boolean(t.value)).slice(0, 3)),
              { value: 'AI', label: 'Built in' },
            ].map((s) => (
              <div key={s.label} className="px-3 py-5 text-center">
                <div className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white">{s.value}</div>
                <div className="mt-1 text-[11px] sm:text-xs font-medium text-gray-500 dark:text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Features Section */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">Why businesses choose NowOpen</h2>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Everything you need to get discovered, book, sell and grow — in one trusted platform.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center p-4 lg:p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition">
                <div className={`w-12 h-12 mx-auto mb-4 ${feature.iconBg} rounded-full flex items-center justify-center`}>
                  <feature.icon size={24} className={feature.iconText} />
                </div>
                <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-xs lg:text-sm text-gray-600 dark:text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* CTA Section */}
      <section className="py-16 text-white" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 20%, #831843 40%, #9a3412 60%, #92400e 80%, #166534 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-xl sm:text-3xl md:text-4xl font-bold mb-4">Ready to Grow Your Business?</h2>
          {/* This read "Join thousands of African businesses already in line
              for launch". The waitlist table has zero rows, so it was simply
              untrue — and an invented number on the most-visited page
              contradicts the standard the rest of the product holds itself to.
              Replaced with what is actually on offer, which needs no count. */}
          <p className="text-lg mb-8 text-blue-100">
            Invite-only early access. Founding members keep launch pricing for
            twelve months and a verified badge.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/waitlist"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition shadow-lg hover:shadow-xl"
            >
              Africa is NowOpen
              <ArrowRight size={20} />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 transition backdrop-blur-sm"
            >
              View Pricing
            </Link>
          </div>
          <p className="mt-6 text-sm text-blue-200">
            Registering a business?{' '}
            <Link to="/digital-forms" className="underline hover:text-white">
              Use our digital forms
            </Link>
          </p>
        </div>
      </section>




      {/* Brands using NowOpen */}
      <section aria-label="Brands using NowOpen" className="py-14 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-8">
            Some of the amazing businesses and brands using NowOpen Africa
          </p>
          <BrandMarquee
            brands={businesses.map(b => ({
              name: b.name,
              logo: (b as any).logo_url,
              href: (b as any).username ? `/${(b as any).username}` : `/businesses/${b.id}`,
            }))}
          />
        </div>
      </section>
    </div>
  );
}
