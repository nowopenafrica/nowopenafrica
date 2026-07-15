import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, ArrowRight, ChevronRight, Shield, Zap, Target, BarChart3 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateAdverts, generateBusinesses, generateMediaServices } from '../data/populateData';
import { Advertisement, Business, MediaService } from '../types';
import { useCacheBuster } from '../hooks/useCacheBuster';
import { InfiniteSlider } from '../components/InfiniteSlider';

// ─── Hero background video ───────────────────────────────────────────────
// To change the banner video: drop your .mp4 into the `public/` folder and
// set the filename here (paths are relative to `public/`, so a file at
// public/hero-background.mp4 is '/hero-background.mp4').
// Set HERO_VIDEO to '' to disable the video and keep the plain gradient.
const HERO_VIDEO = '/hero-background.mp4';
// Optional still image shown before the video plays (also from public/).
const HERO_VIDEO_POSTER = '';
// ─────────────────────────────────────────────────────────────────────────

export default function Home() {
  const { cacheKey } = useCacheBuster();
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [mediaServices, setMediaServices] = useState<MediaService[]>([]);
  const [videoReady, setVideoReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('businesses');
  const [searchLocation, setSearchLocation] = useState('');

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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchType === 'businesses') {
      window.location.href = `/businesses?search=${encodeURIComponent(searchQuery)}&location=${encodeURIComponent(searchLocation)}`;
    } else if (searchType === 'adverts') {
      window.location.href = `/adverts?search=${encodeURIComponent(searchQuery)}&location=${encodeURIComponent(searchLocation)}`;
    } else if (searchType === 'media') {
      window.location.href = `/media?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  // Full class strings (not template-built) so Tailwind's compiler sees them
  const features = [
    {
      icon: Shield,
      title: 'Verified Listings',
      description: 'All businesses and advertising placements are verified for authenticity and quality.',
      iconBg: 'bg-blue-100',
      iconText: 'text-blue-600',
    },
    {
      icon: Zap,
      title: 'Instant Booking',
      description: 'Book advertising placements and media services instantly with our streamlined process.',
      iconBg: 'bg-purple-100',
      iconText: 'text-purple-600',
    },
    {
      icon: Target,
      title: 'Targeted Reach',
      description: 'Reach your ideal audience with precision targeting and analytics-driven insights.',
      iconBg: 'bg-green-100',
      iconText: 'text-green-600',
    },
    {
      icon: BarChart3,
      title: 'Performance Tracking',
      description: 'Monitor campaign performance in real-time with comprehensive analytics dashboards.',
      iconBg: 'bg-orange-100',
      iconText: 'text-orange-600',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Banner Section.
          The gradient below is the always-on base. A video (HERO_VIDEO,
          defined at the top of this file) fades in on top of it once it can
          play, so the banner looks identical to the gradient-only version
          while the video is loading or if the file is missing. */}
      <section className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 text-white overflow-hidden" style={{ maxHeight: '450px', minHeight: '450px' }}>
        {HERO_VIDEO && (
          <>
            <video
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
              src={HERO_VIDEO}
              poster={HERO_VIDEO_POSTER}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-hidden="true"
              onCanPlay={() => setVideoReady(true)}
              onError={() => setVideoReady(false)}
            />
            {/* Legibility tint — only shown while the video is visible, so the
                gradient keeps its exact look when there's no video */}
            <div
              className={`absolute inset-0 bg-gradient-to-r from-blue-900/70 via-purple-900/50 to-blue-900/70 transition-opacity duration-700 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden="true"
            />
          </>
        )}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-center pt-16">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Trusted by 15,000+ businesses
            </div>

            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
              The Operating System for
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400">
                Business Growth in Africa
              </span>
            </h1>

            <p className="text-base md:text-lg text-blue-100 max-w-2xl mx-auto">
              Helping Africa's 100M+ businesses get discovered, advertise effectively, and access creative services from one ecosystem.
            </p>
          </div>
        </div>
      </section>

      {/* Global Search Bar - Below Slider */}
      <section className="relative -mt-8 z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search Type Selector */}
              <div className="md:w-48">
                <label className="block text-xs font-medium text-gray-500 mb-1">Search In</label>
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50"
                >
                  <option value="businesses">Businesses</option>
                  <option value="adverts">Ad Placements</option>
                  <option value="media">Media Services</option>
                </select>
              </div>

              {/* Main Search Input */}
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {searchType === 'businesses' ? 'Search businesses...' : searchType === 'adverts' ? 'Search ad placements...' : 'Search media services...'}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder={searchType === 'businesses' ? 'e.g., Restaurants, Tech, Marketing...' : searchType === 'adverts' ? 'e.g., Billboards, Digital screens...' : 'e.g., Photography, Video production...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50"
                  />
                </div>
              </div>

              {/* Location Input (for businesses and adverts) */}
              {(searchType === 'businesses' || searchType === 'adverts') && (
                <div className="md:w-56">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="text"
                      placeholder="e.g., Lagos, Ikeja..."
                      value={searchLocation}
                      onChange={(e) => setSearchLocation(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50"
                    />
                  </div>
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
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500 py-1">Popular:</span>
              {searchType === 'businesses' ? (
                <>
                  <button type="button" onClick={() => setSearchQuery('Restaurants')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Restaurants</button>
                  <button type="button" onClick={() => setSearchQuery('Tech')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Tech</button>
                  <button type="button" onClick={() => setSearchQuery('Marketing')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Marketing</button>
                  <button type="button" onClick={() => setSearchQuery('Fashion')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Fashion</button>
                </>
              ) : searchType === 'adverts' ? (
                <>
                  <button type="button" onClick={() => setSearchQuery('Billboard')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Billboards</button>
                  <button type="button" onClick={() => setSearchQuery('Digital')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Digital Screens</button>
                  <button type="button" onClick={() => setSearchQuery('Transit')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Transit</button>
                  <button type="button" onClick={() => setSearchQuery('Indoor')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Indoor</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setSearchQuery('Photography')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Photography</button>
                  <button type="button" onClick={() => setSearchQuery('Video')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Video Production</button>
                  <button type="button" onClick={() => setSearchQuery('Design')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Graphic Design</button>
                  <button type="button" onClick={() => setSearchQuery('Social')} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-700 transition">Social Media</button>
                </>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Infinite Sliders Section */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {/* Businesses Slider */}
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Top Businesses</h2>
                <p className="text-gray-600 mt-1">Verified businesses NowOpen in Africa</p>
              </div>
              <Link to="/businesses" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium">
                View All <ChevronRight size={20} />
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
                <h2 className="text-2xl font-bold text-gray-900">Featured Ad Placements</h2>
                <p className="text-gray-600 mt-1">Premium advertising opportunities across top locations</p>
              </div>
              <Link to="/adverts" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium">
                View All <ChevronRight size={20} />
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
                price: ad.price_per_day,
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
                <h2 className="text-2xl font-bold text-gray-900">Media Services</h2>
                <p className="text-gray-600 mt-1">Professional media production and creative services</p>
              </div>
              <Link to="/media" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium">
                View All <ChevronRight size={20} />
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
      

      {/* Features Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center p-4 lg:p-6 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition">
                <div className={`w-12 h-12 mx-auto mb-4 ${feature.iconBg} rounded-full flex items-center justify-center`}>
                  <feature.icon size={24} className={feature.iconText} />
                </div>
                <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-xs lg:text-sm text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Grow Your Business?</h2>
          <p className="text-lg mb-8 text-blue-100">
            Join thousands of African businesses already in line for launch
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/waitlist"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition shadow-lg hover:shadow-xl"
            >
              Join the Waitlist
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

      {/* Stats Section */}
			

      {/* Footer */}
      
    </div>
  );
}
