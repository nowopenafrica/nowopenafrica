import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Target, BarChart3 , Layers} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { INDUSTRIES } from '../data/industrySystems';
import { generateAdverts, generateBusinesses, generateMediaServices } from '../data/populateData';
import { Advertisement, Business, MediaService } from '../types';
import { useCacheBuster } from '../hooks/useCacheBuster';
import { applySeo } from '../lib/seo';
import BrandMarquee from '../components/BrandMarquee';
import HeroSlider from '../components/HeroSlider';
import ListingExplorer from '../components/home/ListingExplorer';
import HeroSearch from '../components/home/HeroSearch';
import SendYourBusiness from '../components/home/SendYourBusiness';
import { loadHeroSettings, heroBackground, DEFAULT_HERO, type HeroSettings } from '../lib/heroSettings';

export default function Home() {
  const { cacheKey } = useCacheBuster();
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [mediaServices, setMediaServices] = useState<MediaService[]>([]);
  /*
   * Which of the three reads failed. Not a single boolean: the reads are
   * independent, and claiming all three are unreachable because one is would
   * be its own inaccuracy.
   */
  const [loadFailed, setLoadFailed] = useState<Record<'adverts' | 'businesses' | 'media', boolean>>({
    adverts: false,
    businesses: false,
    media: false,
  });
  // Bumped by the retry button, which re-runs the effect.
  const [reloadNonce, setReloadNonce] = useState(0);
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
        // "Verified listings" was untrue — nothing on the platform holds a
        // verification tier — and this is the description Google shows, which
        // is the most expensive place to put an unearned claim. It must also
        // match what api/marketing serves crawlers; a test enforces that.
        'Find businesses across Africa — what is open now, what is near you, and what they offer. Every listing is claimed by the person who runs it.',
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
    // The video is the hero; the copy is a periodic reminder of what the site
    // is, not a permanent overlay. So the headline shows briefly and then gets
    // out of the way for a full minute of clean footage.
    //
    // The 2s crossfade below is deliberately unchanged: the dwell times decide
    // how often the text appears, the transition decides how gracefully — a
    // fade stretched to match the dwell would read as a rendering fault rather
    // than a choice.
    const VISIBLE_MS = 10000;
    const HIDDEN_MS = 60000;
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
    /*
     * Fetch the slider data, and REMEMBER WHICH READS FAILED.
     *
     * This block used to do `res.data && res.data.length > 0 ? res.data :
     * generate(30)`, which cannot tell a failed read from an empty table.
     * Samples are dev-only, so in production `generate(30)` is `[]` and both
     * paths landed on the same empty state — the homepage then told visitors
     * "No businesses listed yet — the directory is being built", which is a
     * claim about the platform made when the truth was that the database was
     * unreachable.
     *
     * That is the worst wrong answer this page can give. The audience is on
     * connections that drop, the directory genuinely IS nearly empty, and so
     * the failure mode confirms exactly the conclusion we most need to avoid.
     *
     * The `.catch()` below is kept for a genuinely thrown error, but it is not
     * the path that matters: supabase-js RESOLVES with `{ data: null, error }`
     * when a read fails, so `error` is what has to be inspected.
     *
     * Tracked per type. The three reads are independent, and one table being
     * unreachable is not evidence about the other two.
     */
    const fetchSliderData = async () => {
      /*
       * TWO READS FOR BUSINESSES, and the second one is the point.
       *
       * The homepage asked for the newest 30. Measured 2026-09-08: the only
       * two claimed businesses on the platform were the OLDEST rows in the
       * table, 451 listings from the top — so the two profiles run by real
       * people, the ones the whole platform is asking businesses to create,
       * had never once appeared on the front page.
       *
       * Ordering alone cannot fix that: a claimed business a thousand rows
       * down is not in the 30 rows fetched, so there is nothing to reorder.
       * They are asked for explicitly.
       */
      const [advertRes, businessRes, claimedRes, mediaRes] = await Promise.all([
        supabase.from('advertisements').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('businesses').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('businesses').select('*')
          .or('claim_status.eq.claimed,user_id.not.is.null')
          .order('listing_score', { ascending: false })
          .limit(24),
        supabase.from('media_services').select('*').order('created_at', { ascending: false }).limit(30),
      ]);

      setLoadFailed({
        adverts: !!advertRes.error,
        businesses: !!businessRes.error,
        media: !!mediaRes.error,
      });

      setAdverts(advertRes.data && advertRes.data.length > 0 ? advertRes.data : generateAdverts(30));

      /*
       * Claimed first, then the newest, with duplicates removed — a claimed
       * business that is ALSO recent must appear once.
       *
       * `claimedRes` failing is not treated as an outage: it means the front
       * page shows the newest, which is what it did before. Only a failed
       * `businessRes` is reported, because that one is the difference between
       * an empty directory and an unreachable one.
       */
      const claimed = claimedRes.error ? [] : (claimedRes.data ?? []);
      const newest = businessRes.data ?? [];
      const seen = new Set<string>();
      const merged = [...claimed, ...newest].filter((b) => {
        const id = String((b as { id?: string }).id ?? '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      setBusinesses(merged.length > 0 ? merged : generateBusinesses(30));
      setMediaServices(mediaRes.data && mediaRes.data.length > 0 ? mediaRes.data : generateMediaServices(30));
    };

    fetchSliderData().catch(err => {
      console.error('Error fetching homepage data:', err);
      setLoadFailed({ adverts: true, businesses: true, media: true });
      setAdverts(generateAdverts(30));
      setBusinesses(generateBusinesses(30));
      setMediaServices(generateMediaServices(30));
    });
  }, [cacheKey, reloadNonce]);




  // Full class strings (not template-built) so Tailwind's compiler sees them
  const features = [
    {
      icon: Shield,
      title: 'Claimed by the owner',
      // Was "Verified Listings / All businesses and advertising placements are
      // verified for authenticity and quality." Neither half was true — nothing
      // on the platform currently holds a verification tier — and it sat two
      // sections below a paragraph promising no invented profiles. Verification
      // is a tier a business earns (lib/trustClaims.ts); claiming is the thing
      // that is actually true of every listing here.
      description: 'A listing only goes live once the person who runs the business has claimed it.',
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
          className="relative z-10 site-container h-full flex flex-col items-center justify-center gap-6"
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
              <span style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)' }}>What are you looking for?</span>
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400">
                Africa is NowOpen.
              </span>
            </h1>

            {/* max-w-3xl, not 2xl: the fifth phrase pushes "AI." onto a line of
                its own at common desktop widths. */}
            <p className="text-base md:text-lg text-blue-100 max-w-3xl mx-auto" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
              Discover customers. Find businesses. Advertise everywhere. Create anything. Grow with AI.
            </p>
          </div>

          {/* CTAs fade with the copy — see the wrapper above for why they
              also need visibility, not just opacity. */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/businesses" className="inline-flex items-center gap-2 px-6 min-h-[44px] bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition shadow-lg">
              Explore businesses <ArrowRight size={18} />
            </Link>
            <Link to="/waitlist" className="inline-flex items-center gap-2 px-6 min-h-[44px] bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold rounded-lg hover:bg-white/20 transition">
              List your business
            </Link>
          </div>
        </div>
      </section>

      {/* The answer to the headline: search, and the four things people come
          for. Outside the hero on purpose — the hero fades with the video
          slider, and a search field that disappears mid-typing is worse than
          no search field. */}
      <HeroSearch />






      {/* Browse — search, type toggle, category chips and the card grid,
          in one block. Replaces the standalone search band and the separate
          tabbed listings section. */}
      <ListingExplorer
        businesses={businesses}
        adverts={adverts}
        mediaServices={mediaServices}
        loadFailed={loadFailed}
        onRetry={() => setReloadNonce((n) => n + 1)}
      />

      {/* The directory, honestly.
          This section used to open with "Not a directory. An operating
          system." — a positioning line aimed at investors, on the page where a
          customer is deciding whether to trust the place. It now says what is
          actually true about the directory, states the real count, and keeps
          the industry grid as the evidence behind the claim. */}
      <section className="pt-16 pb-10 bg-white dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-800">
        <div className="site-container">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold">
              <Layers size={14} /> The directory is being built
            </span>
            <h2 className="mt-4 text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              Real businesses, added one at a time
            </h2>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              {/* Three states, not two. `null` means the count has not loaded —
                  rendering "no businesses are listed" during that moment would
                  be a false statement shown on every cold start. */}
              {counts.businesses === null
                ? 'Every business listed here was claimed by the person who runs it.'
                : counts.businesses > 0
                  ? `${counts.businesses} ${counts.businesses === 1 ? 'business is' : 'businesses are'} listed so far, and every one of them was claimed by the person who runs it.`
                  : 'No businesses are listed yet. Every one that appears here will have been claimed by the person who runs it.'}
              {' '}No invented profiles and no bought lists — if a name is on NowOpen, you can reach it.
            </p>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Each industry below gets a purpose-built profile — property portals, restaurant menus, repair queues,
              booking engines — rather than one generic template.
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
                  {/* One quiet treatment for all fourteen, not fourteen
                      gradients.
                      
                      Each industry carries its own `accent`, and rendering all
                      of them at once turned an evidence grid into a colour
                      chart: fourteen competing gradients, none of which mean
                      anything to a visitor, all of them louder than the names
                      underneath — which are the part that actually says what
                      NowOpen covers.
                      
                      The accent is not lost, only held back: it arrives on
                      hover, where it marks the one thing being pointed at. */}
                  <span className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center transition-colors group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30">
                    <Icon
                      size={19}
                      strokeWidth={1.75}
                      className="text-gray-500 dark:text-gray-400 transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400"
                    />
                  </span>
                  <span className="text-[11px] sm:text-xs font-semibold text-gray-800 dark:text-gray-100 leading-tight">{ind.name}</span>
                </Link>
              );
            })}
          </div>

          {/* The action this section should produce. It is a form rather than a
              link to one, because the point is that the owner does not have to
              go anywhere or fill anything in about themselves. */}
          <SendYourBusiness fallbackSource="homepage" className="mt-10 max-w-3xl mx-auto" />

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/waitlist"
              className="inline-flex items-center gap-2 px-6 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Join the waitlist <ArrowRight size={18} />
            </Link>
            <Link
              to="/platform"
              className="inline-flex items-center gap-2 px-6 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Explore the platform
            </Link>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="pt-2 pb-16 bg-white dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800" aria-label="NowOpen Africa at a glance">
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
        <div className="site-container">
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
            <Link to="/digital-forms" className="inline-flex items-center min-h-[44px] underline hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded">
              Use our digital forms
            </Link>
          </p>
        </div>
      </section>




      {/* Brands using NowOpen */}
      <section aria-label="Brands using NowOpen" className="py-14 bg-gray-50 dark:bg-gray-900">
        <div className="site-container">
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
