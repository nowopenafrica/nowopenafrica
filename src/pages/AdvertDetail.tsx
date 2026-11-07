import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Calendar, ChevronLeft, DollarSign, Eye, ListPlus, Loader2, Mail, MapPin, MessageCircle, Phone, Share2, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../contexts/CurrencyContext';
import PaymentModal from '../components/PaymentModal';
import PlatformEnquiryModal from '../components/PlatformEnquiryModal';
import { generateAdverts, isSampleId } from '../data/populateData';
import { Advertisement } from '../types';
import { telHref, whatsappHref } from '../lib/phone';
import { applySeo } from '../lib/seo';
import { localDateISO } from '../lib/dates';
import LoadFailure from '../components/LoadFailure';
import SmartImg from '../components/SmartImg';
import StockPhotoCaption from '../components/StockPhotoCaption';
import { isStockPlaceholder } from '../lib/stockImage';
import { reportPlanAdd } from '../lib/promote/planToast';
import AdPreviewStudio from '../components/promote/AdPreviewStudio';
import { sceneForType } from '../lib/promote/mockupScenes';
import { describeDimensions, readAdDimensions } from '../lib/promote/adDimensions';
import { addAdvertsToPlan } from '../lib/promote/campaigns';
import { IMPORTED_FALLBACK, fetchPlacementTrust, isListedPlacement, ownerWebsiteHref, type PlacementTrust } from '../lib/promote/trust';
import { UNLISTED_LIFECYCLES_IN } from '../lib/promote/listing';
import { AvailabilityLine, TrustChip, priceBasisSuffix } from '../components/promote/PlacementLine';
import ClaimPlacementButton from '../components/promote/ClaimPlacementButton';
import PlanTray from '../components/promote/PlanTray';

const DURATION_PRESETS = [7, 14, 30, 60, 90];

export default function AdvertDetail() {
  const { id } = useParams<{ id: string }>();
  const { format, formatUsd, currency } = useCurrency();
  const [advert, setAdvert] = useState<Advertisement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /*
   * A failed READ, as distinct from an advert that does not exist. Both used
   * to render "The advert you are looking for does not exist", which is a
   * claim about the listing made when the truth was about the connection.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [ownerBusiness, setOwnerBusiness] = useState<{ id: string; name: string; username?: string; phone?: string; location?: string } | null>(null);
  const [similar, setSimilar] = useState<Advertisement[]>([]);
  const [days, setDays] = useState(30);
  /*
   * This placement's placement_trust row. Null until the read answers, when
   * it has no row, and when the read fails — all three render the honest
   * default (IMPORTED_FALLBACK), so the page never says "Available" on the
   * strength of a request still in flight.
   */
  const [trust, setTrust] = useState<PlacementTrust | null>(null);

  /*
   * Which scene is a fair preview of this placement, if any.
   *
   * Null for radio, television, cinema and print: a broadcast slot shown on
   * a billboard is not a preview, it is a mistake with a picture attached.
   * The section simply does not appear.
   */
  /*
   * Saving into a plan. Creates one on first use rather than making a
   * business set up a plan before it knows it wants one — the first
   * placement they like IS the moment they want a plan.
   */
  const [savingPlan, setSavingPlan] = useState(false);
  const saveToPlan = async () => {
    if (!advert) return;
    setSavingPlan(true);
    const out = await addAdvertsToPlan([{ id: String(advert.id), pricing: advert.pricing ?? null }]);
    setSavingPlan(false);
    /* Every result shares the hub's toast: a signed-out add says it is on this device only and offers sign-in. */
    reportPlanAdd(out);
  };

  const previewScene = useMemo(
    () => sceneForType(advert?.type) ?? sceneForType(advert?.category),
    [advert?.type, advert?.category],
  );
  const [customDays, setCustomDays] = useState('');
  const [startDate, setStartDate] = useState(() => localDateISO());

  useEffect(() => {
    if (!advert) return undefined;
    if (isSampleId(advert.id)) {
      return applySeo({
        title: 'Advertise across Africa — NowOpen Africa',
        description: 'Plan real-world and digital advertising placements across 20+ African markets. Rates are indicative and confirmed on enquiry.',
        path: window.location.pathname,
        robots: 'noindex, nofollow',
      });
    }
    // A placement that is not public (waiting for review, rejected or
    // archived) is not offered, so it is not indexed either. Waiting for
    // review was never listed, so it is not "no longer" listed.
    if (!isListedPlacement(advert)) {
      const waiting = advert.lifecycle === 'pending_review';
      return applySeo({
        title: waiting ? 'Not listed yet — NowOpen Africa' : 'No longer listed — NowOpen Africa',
        description: waiting
          ? 'This advertising placement is not listed on NowOpen Africa yet.'
          : 'This advertising placement is no longer listed on NowOpen Africa.',
        path: `/adverts/${advert.id}`,
        robots: 'noindex, nofollow',
      });
    }
    const location = advert.location ?? 'Africa';
    /*
     * No "Book": a placement is enquired about, and the media owner confirms
     * the dates and the price. The city is the first part of "Lagos, Nigeria".
     */
    const city = location.split(',')[0].trim() || location;
    const what = `${advert.category ?? 'Advertising placement'} in ${location}.`;
    const rates = 'Rates are indicative and confirmed on enquiry.';
    const own = (advert.description ?? '').trim();
    return applySeo({
      title: `${advert.title} — advertise in ${city} | NowOpen Africa`,
      description: (own ? `${own.slice(0, 240)} ${rates}` : `${what} ${rates}`).trim(),
      path: `/adverts/${advert.id}`,
      image: advert.image_url || '/og-image.png',
    });
  }, [advert]);

  const fetchAdvert = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadFailed(false);

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
        /*
         * PGRST116 is `.single()` reporting that no row matched — a real
         * 404, and the only error here that means the advert is absent.
         * Everything else (network, RLS, 5xx) is a failure to load, and
         * saying "does not exist" for those is how a dropped connection
         * came to tell somebody their listing was gone.
         */
        if (supabaseError.code !== 'PGRST116') setLoadFailed(true);
        throw supabaseError;
      }

      setAdvert(data);
      setDays(data.duration || 30);
    } catch (err: any) {
      console.error('Error fetching advert:', err);
      // A thrown error is never a "no such row" — that arrives as PGRST116
      // and is handled above — so anything landing here failed to load.
      if (err?.code !== 'PGRST116') setLoadFailed(true);
      setError(err.message || 'Failed to load advert details');
    } finally {
      setLoading(false);
    }
  }, [id, reloadKey]);

  useEffect(() => {
    if (id) fetchAdvert();
  }, [id, fetchAdvert]);

  useEffect(() => {
    setTrust(null);
    const advertId = advert ? String(advert.id) : null;
    if (!advertId || isSampleId(advertId)) return undefined;
    let live = true;
    fetchPlacementTrust([advertId]).then((m) => { if (live) setTrust(m.get(advertId) ?? null); });
    return () => { live = false; };
  }, [advert?.id]);

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
    // The table is publicly readable, so unlisted placements (waiting for
    // review, rejected, archived) are left out IN the query, before the
    // limit: filtering after it could show fewer than four (listing.ts).
    let query = supabase.from('advertisements').select('*').neq('id', advert.id)
      .not('lifecycle', 'in', UNLISTED_LIFECYCLES_IN);
    if (advert.category) query = query.eq('category', advert.category);
    query.limit(4).then(({ data }) => setSimilar(((data || []) as Advertisement[]).filter(isListedPlacement).slice(0, 4)));
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

  /* Checked BEFORE the not-found branch: both states have `advert === null`,
     so whichever is evaluated first is the one the visitor is told. */
  if (loadFailed) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <LoadFailure what="this advert" onRetry={() => setReloadKey((k) => k + 1)} />
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
          {/* Deliberately NOT {error}. A dead advert link rendered the raw
              PostgREST string — "Cannot coerce the result to a single JSON
              object" — straight to the visitor. Genuine load failures are
              handled above by LoadFailure, so everything reaching here means
              the advert is absent, and there is one honest sentence for that. */}
          <p className="text-gray-600 dark:text-gray-400 mb-6">The advert you are looking for does not exist.</p>
          <Link
            to="/adverts"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            <ChevronLeft size={18} />
            Back to Promote
          </Link>
        </div>
      </div>
    );
  }

  /*
   * Not public: the row is still publicly readable, but the placement is not
   * offered. One plain statement and the way back, with no price,
   * availability, booking or enquiry. Rejected or archived reads "No longer
   * listed", matching the plan page; waiting for review (pending_review) was
   * never listed, so it reads "Not listed yet", with no promise of when.
   */
  if (!isListedPlacement(advert)) {
    const waiting = advert.lifecycle === 'pending_review';
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{waiting ? 'Not listed yet' : 'No longer listed'}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {waiting ? `${advert.title} is not listed on NowOpen Africa yet.` : `${advert.title} is no longer listed on NowOpen Africa.`}
          </p>
          <Link
            to="/adverts"
            className="inline-flex min-h-[44px] items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            <ChevronLeft size={18} />
            Back to Promote
          </Link>
        </div>
      </div>
    );
  }

  const effectiveDays = Math.max(1, days);
  /* A row left over from the placement viewed before this one never applies here. */
  const trustNow = trust && trust.advertId === String(advert.id) ? trust : IMPORTED_FALLBACK(String(advert.id));
  /* The linked owner's website, only once that owner is verified (trust.ts decides). */
  const ownerSite = ownerWebsiteHref(trustNow);
  /*
   * What a media owner entered in the portal: the street or landmark, and
   * the photos beyond the cover. Owner placements only (owner_id set); the
   * cover is not repeated. Each photo follows the stock-photo rule.
   */
  const isOwned = !!advert.owner_id;
  const siteAddress = isOwned ? advert.site_address?.trim() || null : null;
  const morePhotos = isOwned
    ? [...new Set((advert.media_urls ?? []).filter((u): u is string => typeof u === 'string' && u.trim() !== ''))]
      .filter((u) => u !== advert.image_url)
    : [];
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
              Promote
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
            <div className="relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {advert.image_url ? (
                <>
                  <SmartImg
                    src={advert.image_url}
                    alt={isStockPlaceholder(advert.image_url) ? `Stock photograph standing in for ${advert.title}` : advert.title}
                    className="w-full h-48 sm:h-72 md:h-96 object-cover"
                  />
                  {/* Stock, not the site: said on the picture, as business profiles do. */}
                  <StockPhotoCaption url={advert.image_url} />
                </>
              ) : (
                <div className="w-full h-48 sm:h-72 md:h-96 bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center">
                  <Eye size={64} className="text-white/50" />
                </div>
              )}
            </div>

            {morePhotos.length > 0 && (
              <ul aria-label="More photos of this site" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {morePhotos.map((url) => (
                  <li key={url} className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <SmartImg
                      src={url}
                      alt={isStockPlaceholder(url) ? `Stock photograph standing in for ${advert.title}` : `${advert.title}, another view`}
                      className="w-full h-32 sm:h-40 object-cover"
                    />
                    <StockPhotoCaption url={url} compact />
                  </li>
                ))}
              </ul>
            )}

            {/* Details */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <div className="flex items-start justify-between mb-4 gap-3">
                <div className="min-w-0">
                  {/* The trust label beside the medium; its words come from lib/promote/trust.ts. */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    {advert.category && (
                      <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-full">
                        {advert.category}
                      </span>
                    )}
                    <TrustChip trust={trustNow} />
                  </div>
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">{advert.title}</h1>
                  {ownerSite && (
                    <p data-testid="owner-website" className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Owner:{' '}
                      <a href={ownerSite} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        {trustNow.ownerName ?? ownerSite}
                      </a>
                    </p>
                  )}
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
                {siteAddress && (
                  <div className="flex items-center gap-3 p-3 sm:p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <MapPin size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Site address</p>
                      <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{siteAddress}</p>
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
                      {/*
                        Read rather than printed raw. The column is free text
                        and says five different things across the inventory —
                        a size, a count of faces, an extent, airtime, or
                        nothing usable. See lib/promote/adDimensions.ts.
                      */}
                      <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                        {describeDimensions(readAdDimensions(advert.dimensions))}
                      </p>
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

            {/*
              Booking terms. This section used to print "Available until"
              from the listing's own column — a date nobody confirmed, which
              contradicted the availability line beside the price. Whether a
              placement is available is said in one place only: trust.ts's
              availabilityText, under the price. The column stays in the data.
            */}
            {advert.duration && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Booking</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Calendar size={18} className="text-gray-400" />
                    <span className="text-gray-600 dark:text-gray-400">Minimum booking: <span className="font-medium text-gray-900 dark:text-white">{advert.duration} days</span></span>
                  </div>
                </div>
              </div>
            )}

            {/*
              See your own advert on THIS placement.
              *
              * The listing says the price and the road. What a business
              * cannot picture is their artwork on it — whether the words
              * survive at that shape, how much the bus windows eat. The
              * scene is matched to this placement's own medium, and its
              * confirmed size drives the surface where there is one.
              */}
            {previewScene && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                  See your advert here
                </h2>
                <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-gray-400">
                  Upload your artwork to place it on this {previewScene.name.toLowerCase()}.
                </p>
                <AdPreviewStudio
                  initialScene={previewScene.id}
                  placement={{
                    id: advert.id,
                    title: advert.title,
                    type: advert.type ?? advert.category ?? '',
                    location: advert.location,
                    dimensions: advert.dimensions,
                    imageUrl: advert.image_url,
                  }}
                />
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
                      <div className="relative w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0 overflow-hidden">
                        {a.image_url && <SmartImg loading="lazy" decoding="async" src={a.image_url} alt={a.title} className="w-full h-full object-cover" />}
                        {/* Too small for the words: the mark, with the notice as its name. */}
                        <StockPhotoCaption url={a.image_url} compact />
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
                    <p data-testid="price-basis" className="text-xs text-gray-500 dark:text-gray-400 mt-1">{priceBasisSuffix(trustNow)}</p>
                    {currency !== 'USD' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">≈ {formatUsd(totalPrice)} USD</p>
                    )}
                  </div>
                </>
              )}

              {/* Under the price: what is known about the dates, and who said so. */}
              <AvailabilityLine trust={trustNow} className="text-center mb-4" />

              <button
                onClick={() => setCheckoutOpen(true)}
                className="block text-center w-full px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition mb-3"
              >
                {/* This opens the Paystack checkout, so it says so. Whether payment should come before a media owner confirms is the founder's Promote step-3 decision. */}
                Pay to reserve these dates
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

              {/*
                Most advertising is not one board. Saving a placement into a
                plan is what lets a business compare three billboards, a bus
                and a screen and take them to the media owners together,
                rather than sending five separate enquiries.
              */}
              <button
                onClick={() => void saveToPlan()}
                disabled={savingPlan}
                className="flex items-center justify-center gap-2 w-full px-4 sm:px-6 py-2.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition mb-3 disabled:opacity-50"
              >
                {savingPlan ? <Loader2 size={15} className="animate-spin" /> : <ListPlus size={15} />}
                Save to my plan
              </button>

              {/*
                "Is this your site? Claim it": only while the placement has no
                owner. The button itself shows only to a signed-in member of a
                media-owner business, and says "Claim sent for review" once a
                claim is pending. Never on a sample or an unlisted placement.
              */}
              {!advert.owner_id && !isSampleId(String(advert.id)) && isListedPlacement(advert) && (
                <div className="mb-3">
                  <ClaimPlacementButton advertId={String(advert.id)} />
                </div>
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
                Enquire about this placement — you approve before any payment is taken.
              </p>
            </div>

            {/* Trust signals */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Why book with NowOpen</h3>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-start gap-3">
                  <Star size={18} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                  {/* Was "Every placement is verified on-site before it's
                      listed". That describes a physical inspection programme
                      across 97 sites in 42 cities which has not happened. What
                      IS true is that each listing carries its medium, exact
                      location, dimensions and rate. */}
                  <span>Every placement lists its exact site, medium, dimensions and rate</span>
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
      <PlanTray />
    </div>
  );
}
