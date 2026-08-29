import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MapPin, DollarSign, Calendar, Eye, Star, ChevronLeft, Phone, Share2, MessageCircle, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../contexts/CurrencyContext';
import PaymentModal from '../components/PaymentModal';
import PlatformEnquiryModal from '../components/PlatformEnquiryModal';
import { generateAdverts, isSampleId } from '../data/populateData';
import { Advertisement } from '../types';
import { telHref, whatsappHref } from '../lib/phone';
import { applySeo } from '../lib/seo';
import { localDateISO } from '../lib/dates';

const DURATION_PRESETS = [7, 14, 30, 60, 90];

export default function AdvertDetail() {
  const { id } = useParams<{ id: string }>();
  const { format, formatUsd, currency } = useCurrency();
  const [advert, setAdvert] = useState<Advertisement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [ownerBusiness, setOwnerBusiness] = useState<{ id: string; name: string; username?: string; phone?: string; location?: string } | null>(null);
  const [similar, setSimilar] = useState<Advertisement[]>([]);
  const [days, setDays] = useState(30);
  const [customDays, setCustomDays] = useState('');
  const [startDate, setStartDate] = useState(() => localDateISO());

  useEffect(() => {
    if (!advert) return undefined;
    if (isSampleId(advert.id)) {
      return applySeo({
        title: 'Advertise in Africa — NowOpen Africa',
        description: 'Book real-world and digital advertising placements across 20+ African markets.',
        path: window.location.pathname,
        robots: 'noindex, nofollow',
      });
    }
    const location = advert.location ?? 'Africa';
    return applySeo({
      title: `${advert.title} — Advertise in ${location} | NowOpen Africa`,
      description:
        (advert.description ?? '').trim().slice(0, 300) ||
        `Book this ${advert.category ?? 'advert placement'} in ${location} on NowOpen Africa.`,
      path: `/adverts/${advert.id}`,
      image: advert.image_url || '/og-image.png',
    });
  }, [advert]);

  const fetchAdvert = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Sample ids (e.g. "advert_5") come from the fallback data on the
      // homepage — resolve them locally instead of querying the database.
      if (isSampleId(id!)) {
        const sample = generateAdverts().find(a => a.id === id);
        if (!sample) throw new Error('Advert not found');
        setAdvert(sample as Advertisement);
        setDays((sample as Advertisement).duration || 30);
        return;
      }

      const { data, error: supabaseError } = await supabase
        .from('advertisements')
        .select('*')
        .eq('id', id)
        .single();

      if (supabaseError) {
        console.error('Supabase error:', supabaseError);
        throw supabaseError;
      }

      setAdvert(data);
      setDays(data.duration || 30);
    } catch (err: any) {
      console.error('Error fetching advert:', err);
      setError(err.message || 'Failed to load advert details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchAdvert();
  }, [id, fetchAdvert]);

  // Owner contact — if this placement is linked to a business account,
  // surface its real (publicly-readable) phone/WhatsApp instead of a dead
  // generic mailto.
  useEffect(() => {
    if (!advert?.business_id || isSampleId(String(advert.business_id))) { setOwnerBusiness(null); return; }
    supabase
      .from('businesses')
      .select('id, name, username, phone, location')
      .eq('id', advert.business_id)
      .maybeSingle()
      .then(({ data }) => setOwnerBusiness(data));
  }, [advert?.business_id]);

  // Similar placements — same category, elsewhere in the marketplace.
  useEffect(() => {
    if (!advert) return;
    if (isSampleId(String(advert.id))) {
      const pool = generateAdverts().filter(a => a.id !== advert.id && (!advert.category || a.category === advert.category));
      setSimilar(pool.slice(0, 4) as Advertisement[]);
      return;
    }
    let query = supabase.from('advertisements').select('*').neq('id', advert.id).limit(4);
    if (advert.category) query = query.eq('category', advert.category);
    query.then(({ data }) => setSimilar(data || []));
  }, [advert]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading advert details...</p>
        </div>
      </div>
    );
  }

  if (error || !advert) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <Eye size={32} className="text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Advert Not Found</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error || 'The advert you are looking for does not exist.'}</p>
          <Link
            to="/adverts"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            <ChevronLeft size={18} />
            Back to Adverts
          </Link>
        </div>
      </div>
    );
  }

  const effectiveDays = Math.max(1, days);
  const totalPrice = advert.pricing ? Number(advert.pricing) * effectiveDays : 0;
  const whatsappLink = ownerBusiness?.phone
    ? whatsappHref(String(ownerBusiness.phone), ownerBusiness.location, `Hi, I'm interested in booking "${advert.title}" on NowOpen Africa.`)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Breadcrumb */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="site-container py-4">
          <nav className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Link to="/adverts" className="hover:text-blue-600 flex items-center gap-1">
              <ChevronLeft size={16} />
              Adverts
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white font-medium line-clamp-1">{advert.title}</span>
          </nav>
        </div>
      </div>

      <div className="site-container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {advert.image_url ? (
                <img
                  src={advert.image_url}
                  alt={advert.title}
                  className="w-full h-48 sm:h-72 md:h-96 object-cover"
                />
              ) : (
                <div className="w-full h-48 sm:h-72 md:h-96 bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center">
                  <Eye size={64} className="text-white/50" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <div className="flex items-start justify-between mb-4 gap-3">
                <div className="min-w-0">
                  {advert.category && (
                    <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-full mb-2">
                      {advert.category}
                    </span>
                  )}
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{advert.title}</h1>
                </div>
                <button
                  aria-label="Share this placement"
                  title="Share"
                  onClick={async () => {
                    const shareData = { title: advert.title, url: window.location.href };
                    try {
                      if (navigator.share) {
                        await navigator.share(shareData);
                      } else {
                        await navigator.clipboard.writeText(window.location.href);
                        toast.success('Link copied to clipboard');
                      }
                    } catch {
                      // user dismissed the share sheet — nothing to do
                    }
                  }}
                  className="p-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  <Share2 size={18} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-6">{advert.description}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {advert.location && (
                  <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <MapPin size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Location</p>
                      <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{advert.location}</p>
                    </div>
                  </div>
                )}
                {advert.pricing && (
                  <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <DollarSign size={20} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Price per day</p>
                      <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{format(advert.pricing)}</p>
                    </div>
                  </div>
                )}
                {advert.dimensions && (
                  <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <Eye size={20} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Dimensions</p>
                      <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{advert.dimensions}</p>
                    </div>
                  </div>
                )}
                {advert.traffic_density && (
                  <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <Star size={20} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Traffic Density</p>
                      <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white capitalize">{advert.traffic_density}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Info */}
            {(advert.duration || advert.available_until) && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Availability</h2>
                <div className="space-y-3">
                  {advert.duration && (
                    <div className="flex items-center gap-3">
                      <Calendar size={18} className="text-gray-400" />
                      <span className="text-gray-600 dark:text-gray-400">Minimum booking: <span className="font-medium text-gray-900 dark:text-white">{advert.duration} days</span></span>
                    </div>
                  )}
                  {advert.available_until && (
                    <div className="flex items-center gap-3">
                      <Calendar size={18} className="text-gray-400" />
                      <span className="text-gray-600 dark:text-gray-400">Available until: <span className="font-medium text-gray-900 dark:text-white">{new Date(advert.available_until).toLocaleDateString()}</span></span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Similar Placements */}
            {similar.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4">Similar Placements</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {similar.map((a) => (
                    <Link
                      key={a.id}
                      to={`/adverts/${a.id}`}
                      className="flex gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition"
                    >
                      <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0 overflow-hidden">
                        {a.image_url && <img loading="lazy" decoding="async" src={a.image_url} alt={a.title} className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.location}</p>
                        {a.pricing && <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">{format(a.pricing)}/day</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <div className="text-center mb-6">
                <span className={`inline-block px-4 py-2 rounded-full text-sm font-medium ${
                  advert.status === 'active' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                  advert.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' :
                  'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}>
                  {(advert.status || 'active').charAt(0).toUpperCase() + (advert.status || 'active').slice(1)}
                </span>
              </div>

              {advert.pricing != null && (
                <>
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Campaign length</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {DURATION_PRESETS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => { setDays(d); setCustomDays(''); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                            days === d && !customDays
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {d} days
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={customDays}
                      onChange={(e) => { setCustomDays(e.target.value); const n = parseInt(e.target.value, 10); if (n > 0) setDays(n); }}
                      placeholder="Custom number of days"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Start date</label>
                    <input
                      type="date"
                      min={localDateISO()}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="text-center mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                      {format(totalPrice, { compact: true })}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400">for {effectiveDays} day{effectiveDays === 1 ? '' : 's'} ({format(advert.pricing)}/day)</p>
                    {currency !== 'USD' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">≈ {formatUsd(totalPrice)} USD</p>
                    )}
                  </div>
                </>
              )}

              <button
                onClick={() => setCheckoutOpen(true)}
                className="block text-center w-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition mb-3"
              >
                Book This Placement
              </button>

              {ownerBusiness?.phone ? (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <a
                    href={telHref(String(ownerBusiness.phone))}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    <Phone size={15} /> Call
                  </a>
                  {whatsappLink ? (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
                    >
                      <MessageCircle size={15} /> WhatsApp
                    </a>
                  ) : (
                    <button
                      onClick={() => setEnquiryOpen(true)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                      <Mail size={15} /> Enquire
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setEnquiryOpen(true)}
                  className="flex items-center justify-center gap-2 w-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition mb-3"
                >
                  <Mail size={16} /> Contact Owner
                </button>
              )}

              {ownerBusiness?.username && (
                <Link
                  to={`/${ownerBusiness.username}`}
                  className="block text-center text-xs text-blue-600 dark:text-blue-400 hover:underline mb-2"
                >
                  View {ownerBusiness.name}'s profile
                </Link>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                Reserve now — you approve before any payment is taken.
              </p>
            </div>

            {/* Trust signals */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Why book with NowOpen</h3>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-start gap-3">
                  <Star size={18} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span>Every placement is verified on-site before it's listed</span>
                </div>
                <div className="flex items-start gap-3">
                  <DollarSign size={18} className="text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                  <span>At launch: payments held securely until your campaign goes live</span>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <span>At launch: free cancellation up to 7 days before your start date</span>
                </div>
                <div className="flex items-start gap-3">
                  <Phone size={18} className="text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                  <span>Local support team in your market, on WhatsApp</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {checkoutOpen && advert.pricing != null && (
        <PaymentModal
          item={{
            kind: 'placement_booking',
            itemId: String(advert.id),
            title: `${advert.title} — ${effectiveDays}-day campaign starting ${new Date(startDate).toLocaleDateString()}`,
            amountUsd: totalPrice,
            amountNote: `for ${effectiveDays} days`,
          }}
          onClose={() => setCheckoutOpen(false)}
        />
      )}

      {enquiryOpen && (
        <PlatformEnquiryModal
          kind="advert"
          itemId={String(advert.id)}
          itemTitle={advert.title}
          subjectPrefix="Placement enquiry"
          onClose={() => setEnquiryOpen(false)}
        />
      )}
    </div>
  );
}
