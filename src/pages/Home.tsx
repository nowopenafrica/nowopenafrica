import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowRight, ChevronRight, Shield, Zap, Target, BarChart3, Store, Megaphone, Palette, Layers } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { INDUSTRIES } from '../data/industrySystems';
import { generateAdverts, generateBusinesses, generateMediaServices } from '../data/populateData';
import { Advertisement, Business, MediaService } from '../types';
import { useCacheBuster } from '../hooks/useCacheBuster';
import { applySeo } from '../lib/seo';
import { track } from '../lib/telemetry';
import { InfiniteSlider } from '../components/InfiniteSlider';
import GlobalSearchInput from '../components/GlobalSearchInput';
import LocationAutocomplete from '../components/LocationAutocomplete';
import BrandMarquee from '../components/BrandMarquee';
import HeroSlider from '../components/HeroSlider';
import { loadHeroSettings, heroBackground, DEFAULT_HERO, type HeroSettings } from '../lib/heroSettings';

export default function Home() {
  const navigate = useNavigate();
  const { cacheKey } = useCacheBuster();
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [mediaServices, setMediaServices] = useState<MediaService[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('businesses');
  const [searchLocation, setSearchLocation] = useState('');
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
        supabase.from('advertisements').select('*').order('created_at', { ascending: false }).limit(12),
        supabase.from('businesses').select('*').order('created_at', { ascending: false }).limit(12),
        supabase.from('media_services').select('*').order('created_at', { ascending: false }).limit(12),
      ]);

      setAdverts(advertRes.data && advertRes.data.length > 0 ? advertRes.data : generateAdverts(12));
      setBusinesses(businessRes.data && businessRes.data.length > 0 ? businessRes.data : generateBusinesses(12));
      setMediaServices(mediaRes.data && mediaRes.data.length > 0 ? mediaRes.data : generateMediaServices(12));
    };

    fetchSliderData().catch(err => {
      console.error('Error fetching homepage data, showing sample data:', err);
      setAdverts(generateAdverts(12));
      setBusinesses(generateBusinesses(12));
      setMediaServices(generateMediaServices(12));
    });
  }, [cacheKey]);

  // SPA navigation — the target pages read these params via useSearchParams
  const runSearch = (query: string, location: string) => {
    if (searchType === 'businesses') {
      navigate(`/businesses?search=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`);
    } else if (searchType === 'adverts') {
      navigate(`/adverts?search=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`);
    } else if (searchType === 'media') {
      navigate(`/media?search=${encodeURIComponent(query)}`);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    // Term is length-capped by sanitizeProps; no identity is attached.
    track('search_performed', { type: searchType, term: searchQuery, hasLocation: Boolean(searchLocation) });
    e.preventDefault();
    runSearch(searchQuery, searchLocation);
  };

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
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex flex-col items-center justify-center gap-6">
          <div
            className="text-center space-y-6"
            style={{
              opacity: textVisible ? 1 : 0,
              transition: 'opacity 2s ease-in-out',
            }}
          >
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

          {/* Always-visible CTAs (outside the fading block) */}
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

      {/* Global Search Bar - Below Slider */}
      <section aria-label="Search businesses, placements and creative services" className="relative -mt-8 z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-100 dark:border-gray-800">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search Type Selector */}
              <div className="md:w-48">
                <label htmlFor="home-search-type" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Search In</label>
                <select
                  id="home-search-type"
                  name="searchType"
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 dark:bg-gray-900"
                >
                  <option value="businesses">Businesses</option>
                  <option value="adverts">Ad Placements</option>
                  <option value="media">Media Services</option>
                </select>
              </div>

              {/* Main Search Input — live suggestions for listings, categories and places */}
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {searchType === 'businesses' ? 'Search businesses...' : searchType === 'adverts' ? 'Search ad placements...' : 'Search media services...'}
                </label>
                <GlobalSearchInput
                  searchType={searchType as 'businesses' | 'adverts' | 'media'}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onPickCategory={(category) => {
                    setSearchQuery(category);
                    runSearch(category, searchLocation);
                  }}
                  onPickLocation={(location) => setSearchLocation(location)}
                  placeholder={searchType === 'businesses' ? 'e.g., Restaurants, Tech, Marketing...' : searchType === 'adverts' ? 'e.g., Billboards, Digital screens...' : 'e.g., Photography, Video production...'}
                />
              </div>

              {/* Location Input (for businesses and adverts) */}
              {(searchType === 'businesses' || searchType === 'adverts') && (
                <div className="md:w-56">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Location</label>
                  <LocationAutocomplete
                    value={searchLocation}
                    onChange={setSearchLocation}
                    className="py-3 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  />
                </div>
              )}

              {/* Search Button */}
              <div className="md:w-32 flex items-end">
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                >
                  <Search size={18} />
                  Search
                </button>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <span className="text-xs text-gray-500 dark:text-gray-400 py-1">Popular:</span>
              {searchType === 'businesses' ? (
                <>
                  <button type="button" onClick={() => setSearchQuery('Restaurants')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Restaurants</button>
                  <button type="button" onClick={() => setSearchQuery('Tech')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Tech</button>
                  <button type="button" onClick={() => setSearchQuery('Marketing')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Marketing</button>
                  <button type="button" onClick={() => setSearchQuery('Fashion')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Fashion</button>
                </>
              ) : searchType === 'adverts' ? (
                <>
                  <button type="button" onClick={() => setSearchQuery('Billboard')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Billboards</button>
                  <button type="button" onClick={() => setSearchQuery('Digital')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Digital Screens</button>
                  <button type="button" onClick={() => setSearchQuery('Transit')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Transit</button>
                  <button type="button" onClick={() => setSearchQuery('Indoor')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Indoor</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setSearchQuery('Photography')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Photography</button>
                  <button type="button" onClick={() => setSearchQuery('Video')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Video Production</button>
                  <button type="button" onClick={() => setSearchQuery('Design')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Graphic Design</button>
                  <button type="button" onClick={() => setSearchQuery('Social')} className="inline-flex items-center min-h-[44px] px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 transition">Social Media</button>
                </>
              )}
            </div>
          </form>
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

      {/* Infinite Sliders Section */}
      <section aria-label="Live listings across the platform" className="py-12 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Businesses Slider */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">Top Businesses</h2>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">Verified businesses NowOpen in Africa</p>
              </div>
              <Link to="/businesses" className="inline-flex items-center min-h-[44px] gap-1 sm:gap-2 text-sm sm:text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium flex-shrink-0">
                View All <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              </Link>
            </div>
            <InfiniteSlider
              cards={businesses.map(biz => ({
                id: biz.id,
                href: biz.username ? `/${biz.username}` : `/businesses/${biz.id}`,
                verified: biz.verified,
                title: biz.name,
                description: biz.description,
                image_url: biz.image_url || 'https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg?auto=compress&cs=tinysrgb&w=400',
                category: biz.category,
                rating: biz.rating,
                status: biz.status as 'open' | 'closed' | 'active',
                location: biz.location,
                type: 'business'
              }))}
              linkBase="businesses"
            />
          </div>

          {/* Ad Placements Slider */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">Featured Ad Placements</h2>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">Premium advertising opportunities across top locations</p>
              </div>
              <Link to="/adverts" className="inline-flex items-center min-h-[44px] gap-1 sm:gap-2 text-sm sm:text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium flex-shrink-0">
                View All <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              </Link>
            </div>
            <InfiniteSlider
              cards={adverts.map(ad => ({
                id: ad.id,
                title: ad.title,
                description: ad.description,
                image_url: ad.image_url || 'https://images.pexels.com/photos/257904/pexels-photo-257904.jpeg?auto=compress&cs=tinysrgb&w=400',
                category: ad.type || ad.category,
                status: ad.status as 'open' | 'closed' | 'active',
                price: ad.pricing ?? ad.price_per_day,
                location: ad.location,
                type: 'advert'
              }))}
              linkBase="adverts"
            />
          </div>

          {/* Media Services Slider */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">Media Services</h2>
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">Professional media production and creative services</p>
              </div>
              <Link to="/media" className="inline-flex items-center min-h-[44px] gap-1 sm:gap-2 text-sm sm:text-base text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium flex-shrink-0">
                View All <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              </Link>
            </div>
            <InfiniteSlider
              cards={mediaServices.map(media => ({
                id: media.id,
                title: media.title,
                description: media.description,
                image_url: media.image_url || 'https://images.pexels.com/photos/3182765/pexels-photo-3182765.jpeg?auto=compress&cs=tinysrgb&w=400',
                category: media.service_type,
                rating: media.rating,
                price: media.pricing,
                reach: media.reach,
                type: 'media'
              }))}
              linkBase="media"
            />
          </div>
        </div>
      </section>


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

      {/* Three ways to grow */}
      <section className="pt-14 pb-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white">One platform, three ways to grow</h2>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Discover customers, advertise everywhere and create anything — all in one place.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-5">
            {[
              { icon: Store, title: 'Discover', desc: 'Find and connect with verified African businesses across every industry.', to: '/businesses', cta: 'Browse businesses', grad: 'from-blue-500 to-indigo-600' },
              { icon: Megaphone, title: 'Advertise', desc: 'Book billboards, screens, transit and broadcast placements across Africa.', to: '/adverts', cta: 'Explore placements', grad: 'from-fuchsia-500 to-purple-600' },
              { icon: Palette, title: 'Create', desc: 'Hire photographers, designers, editors and studios for any project.', to: '/media', cta: 'Find creatives', grad: 'from-pink-500 to-rose-600' },
            ].map((p) => (
              <Link
                key={p.title}
                to={p.to}
                className="group flex flex-col rounded-xl sm:rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 sm:p-6 hover:shadow-lg hover:-translate-y-0.5 transition"
              >
                <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br ${p.grad} flex items-center justify-center`}>
                  <p.icon size={20} className="text-white" />
                </div>
                <h3 className="mt-2.5 sm:mt-4 text-sm sm:text-lg font-bold text-gray-900 dark:text-white">{p.title}</h3>
                <p className="mt-1 text-[11px] sm:text-sm text-gray-600 dark:text-gray-400 leading-snug sm:leading-relaxed flex-1">{p.desc}</p>
                <span className="mt-2 sm:mt-3 inline-flex items-center gap-1 text-[11px] sm:text-sm font-semibold text-blue-600 dark:text-blue-400 group-hover:gap-2 transition-all">
                  {p.cta} <ArrowRight size={13} className="flex-shrink-0" />
                </span>
              </Link>
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

      {/* Get the app */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <h2 className="text-xl sm:text-3xl md:text-4xl font-bold">Coming to Android and iOS</h2>
          <p className="text-gray-300 max-w-xl mx-auto">
            The NowOpen Africa app is coming to Android and iOS — discover businesses,
            book placements and manage your listings from your pocket.
          </p>

          <div className="flex flex-row items-center justify-center gap-3 sm:gap-4 pt-2">
            {/* Google Play badge — flex-1/min-w-0 lets both badges shrink to
                fit side by side on narrow phones instead of wrapping */}
            <Link
              to="/waitlist"
              aria-label="Google Play — coming soon, join the waitlist"
              className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-[190px] sm:max-w-[224px] px-3 sm:px-5 py-2.5 sm:py-3 bg-black border border-gray-700 rounded-xl hover:border-gray-500 hover:bg-gray-800 transition"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0" aria-hidden="true">
                <path d="M3.6 1.8 13.7 12 3.6 22.2c-.4-.2-.6-.6-.6-1.2V3c0-.6.2-1 .6-1.2Z" fill="#00D7FE" />
                <path d="m17.2 8.5-3.5 3.5-10.1-10.2c.2-.1.5-.1.8.1l12.8 6.6Z" fill="#00F076" />
                <path d="M17.2 15.5 4.4 22.1c-.3.2-.6.2-.8.1L13.7 12l3.5 3.5Z" fill="#F63448" />
                <path d="m20.9 13.6-3.7 1.9-3.5-3.5 3.5-3.5 3.7 1.9c1.1.6 1.1 2.6 0 3.2Z" fill="#FFC900" />
              </svg>
              <span className="text-left min-w-0">
                <span className="block text-[8px] sm:text-[10px] uppercase tracking-wide text-gray-400 truncate">Coming soon on</span>
                <span className="block text-sm sm:text-lg font-semibold leading-tight truncate">Google Play</span>
              </span>
            </Link>

            {/* App Store badge */}
            <Link
              to="/waitlist"
              aria-label="App Store — coming soon, join the waitlist"
              className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-[190px] sm:max-w-[224px] px-3 sm:px-5 py-2.5 sm:py-3 bg-black border border-gray-700 rounded-xl hover:border-gray-500 hover:bg-gray-800 transition"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0 fill-white" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8.98-.2 1.92-.86 3.32-.8 1.68.14 2.94.8 3.77 2.01-3.47 2.08-2.92 6.66.55 8.05-.64 1.67-1.47 3.32-2.72 2.91ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z" />
              </svg>
              <span className="text-left min-w-0">
                <span className="block text-[8px] sm:text-[10px] uppercase tracking-wide text-gray-400 truncate">Coming soon on the</span>
                <span className="block text-sm sm:text-lg font-semibold leading-tight truncate">App Store</span>
              </span>
            </Link>
          </div>

          <p className="text-sm text-gray-400">
            Africa is{' '}
            <Link to="/waitlist" className="text-blue-400 hover:text-blue-300 underline">
              NowOpen
            </Link>{' '}
            to be first in line when the apps launch — the web platform is ready for you today.
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
