import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateBusinesses, isSampleId } from '../data/populateData';
import VerifiedBadge from '../components/VerifiedBadge';
import TrustBadge from '../components/TrustBadge';
import BusinessTrustPanel from '../components/BusinessTrustPanel';
import BusinessLocations from '../components/BusinessLocations';
import KeepButton from '../components/KeepButton';
import { withDemoTrustAll } from '../data/demoTrust';
import OpeningHoursPanel from '../components/OpeningHoursPanel';
import { deriveTier, TIERS } from '../lib/trust';
import EnquiryModal from '../components/EnquiryModal';
import BookingModal from '../components/BookingModal';
import CartModal, { CartLine } from '../components/CartModal';
import LiveSection from '../components/live/LiveSection';
import BusinessStatusBadge from '../components/BusinessStatusBadge';
import OpenStateBadge from '../components/OpenStateBadge';
import BusinessStory from '../components/business/BusinessStory';
import type { ProfileStory } from '../lib/businessProfile';
import BusinessTimeline from '../components/BusinessTimeline';
import { resolveBusinessStatus, loadClockConfig, resolvePublicStatus } from '../lib/businessStatus';
import { applySeo, SITE_URL } from '../lib/seo';
import { track } from '../lib/telemetry';
import {
  GALLERY_FILTERS, galleryFilterCounts, matchesGalleryFilter, mediaKindOf,
  orientationOf, type GalleryFilter, type MediaKind,
} from '../lib/galleryMedia';
import { shareReel } from '../lib/reelShare';
import { parseVideoEmbed } from '../lib/videoEmbeds';
import VideoEmbedFrame from '../components/VideoEmbedFrame';
import GalleryThumb from '../components/GalleryThumb';
import { getActiveFeatures } from '../data/categoryFeatures';
import { getTabLabel } from '../data/categoryTabLabels';
import RealEstatePortal from '../components/RealEstatePortal';
import RestaurantMenu from '../components/RestaurantMenu';
import HotelRooms from '../components/HotelRooms';
import CarDealerInventory from '../components/CarDealerInventory';
import PharmacyStorefront from '../components/PharmacyStorefront';
import FitnessCenter from '../components/FitnessCenter';
import BeautySalon from '../components/BeautySalon';
import HealthCenter from '../components/HealthCenter';
import FashionBoutique from '../components/FashionBoutique';
import EducationCenter from '../components/EducationCenter';
import PhotographyStudio from '../components/PhotographyStudio';
import TransportHub from '../components/TransportHub';
import EventVendors from '../components/EventVendors';
import RetailStorefront from '../components/RetailStorefront';
import AgricultureMarket from '../components/AgricultureMarket';
import LegalPractice from '../components/LegalPractice';
import ServiceProviders from '../components/ServiceProviders';
import FinanceCenter from '../components/FinanceCenter';
import ManufacturingHub from '../components/ManufacturingHub';
import ConstructionFirm from '../components/ConstructionFirm';
import TravelAgency from '../components/TravelAgency';
import AutoServiceCenter from '../components/AutoServiceCenter';
import ChildcareCenter from '../components/ChildcareCenter';
import MusicEntertainment from '../components/MusicEntertainment';
import DesignStudio from '../components/DesignStudio';
import InsuranceCenter from '../components/InsuranceCenter';
import AccountingFirm from '../components/AccountingFirm';
import MarketingAgency from '../components/MarketingAgency';
import MoneyAgent from '../components/MoneyAgent';
import SoftwareStudio from '../components/SoftwareStudio';
import RepairShop from '../components/RepairShop';
import { SAMPLE_PROPERTIES, SPOTLIGHT_BUSINESSES } from '../data/sampleProperties';
import { SAMPLE_MENU, MENU_SPOTLIGHTS } from '../data/sampleMenu';
import { SAMPLE_ROOMS, HOTEL_FACILITIES, HOTEL_SPOTLIGHTS } from '../data/sampleHotel';
import { SAMPLE_VEHICLES, CAR_SPOTLIGHTS } from '../data/sampleCars';
import { SAMPLE_MEDICINES, PHARMACY_SPOTLIGHTS } from '../data/samplePharmacy';
import { SAMPLE_FITNESS, FITNESS_SPOTLIGHTS } from '../data/sampleFitness';
import { SAMPLE_TREATMENTS, SALON_STYLISTS, SALON_LOOKS, BEAUTY_SPOTLIGHTS } from '../data/sampleBeauty';
import { SAMPLE_DOCTORS, HEALTH_SPOTLIGHTS } from '../data/sampleHealth';
import { SAMPLE_FASHION, FASHION_SPOTLIGHTS } from '../data/sampleFashion';
import { SAMPLE_COURSES, EDUCATION_SPOTLIGHTS } from '../data/sampleEducation';
import { SAMPLE_PACKAGES, PHOTO_PORTFOLIO, PHOTO_EQUIPMENT, PHOTO_SPOTLIGHTS } from '../data/samplePhotography';
import { SAMPLE_ROUTES, TRANSPORT_FLEET, TRANSPORT_SPOTLIGHTS } from '../data/sampleTransport';
import { SAMPLE_VENDORS, EVENT_SPOTLIGHTS } from '../data/sampleEvents';
import { SAMPLE_RETAIL, RETAIL_SPOTLIGHTS } from '../data/sampleRetail';
import { SAMPLE_PRODUCE, AGRICULTURE_SPOTLIGHTS } from '../data/sampleAgriculture';
import { SAMPLE_PRACTICES, LEGAL_SPOTLIGHTS } from '../data/sampleLegal';
import { SAMPLE_JOBS, SERVICE_PROVIDER_SPOTLIGHTS } from '../data/sampleServiceProviders';
import { SAMPLE_FINANCIAL, FINANCE_SPOTLIGHTS } from '../data/sampleFinance';
import { SAMPLE_MANUFACTURED, MANUFACTURING_CERTS, MANUFACTURING_SPOTLIGHTS } from '../data/sampleManufacturing';
import { SAMPLE_BUILD_SERVICES, CONSTRUCTION_PROJECTS, CONSTRUCTION_CAPABILITIES, CONSTRUCTION_SPOTLIGHTS } from '../data/sampleConstruction';
import { SAMPLE_TRIPS, TRAVEL_SPOTLIGHTS } from '../data/sampleTravel';
import { SAMPLE_AUTO_SERVICES, AUTO_CAPABILITIES, AUTOMOTIVE_SPOTLIGHTS } from '../data/sampleAutomotive';
import { SAMPLE_CARE_PROGRAMS, CARE_CAPABILITIES, CHILDCARE_SPOTLIGHTS } from '../data/sampleChildcare';
import { SAMPLE_ACTS, SHOW_GALLERY, MUSIC_GENRES, MUSIC_SPOTLIGHTS } from '../data/sampleMusic';
import { SAMPLE_DESIGN_SERVICES, WORK_GALLERY, DESIGN_TOOLS, DESIGN_SPOTLIGHTS } from '../data/sampleDesign';
import { SAMPLE_POLICIES, INSURANCE_CAPABILITIES, INSURANCE_SPOTLIGHTS } from '../data/sampleInsurance';
import { SAMPLE_ACCOUNTING_SERVICES, ACCOUNTING_CAPABILITIES, ACCOUNTING_SPOTLIGHTS } from '../data/sampleAccounting';
import { SAMPLE_MARKETING_SERVICES, MARKETING_RESULTS, MARKETING_CHANNELS, MARKETING_SPOTLIGHTS } from '../data/sampleMarketing';
import { SAMPLE_MONEY_SERVICES, MONEY_PROVIDERS, MONEY_SPOTLIGHTS } from '../data/sampleMoney';
import { SAMPLE_SOFTWARE_SERVICES, SOFTWARE_STATS, SOFTWARE_STACK, SOFTWARE_SPOTLIGHTS } from '../data/sampleSoftware';
import { SAMPLE_REPAIRS, REPAIR_CAPABILITIES, REPAIR_SPOTLIGHTS } from '../data/sampleRepair';
import { NEW_INDUSTRY_SPOTLIGHTS } from '../data/sampleNewIndustries';
import { MORE_SPOTLIGHTS } from '../data/sampleMore';

// Categories whose Products tab renders a general retail storefront.
const RETAIL_CATEGORIES = ['Retail Store', 'Supermarket', 'Grocery / Mini-Mart', 'Electronics', 'Jewelry & Accessories', 'Furniture & Home', 'Online Store / E-commerce', 'Frozen Food Store', 'Meat & Poultry Shop', 'Produce / Fruit & Veg Market', 'Boutique', 'Phone & Gadget Store', 'Bookstore & Stationery', 'Cosmetics & Beauty Supply', 'Gift & Souvenir Shop', 'Spare Parts Store'];
// Categories whose profile renders a digital menu instead of the product grid.
const MENU_CATEGORIES = ['Restaurant', 'Fast Food', 'Café & Bakery', 'Bar & Lounge', 'Local Food Vendor', 'Food Truck', 'Suya & Grill', 'Shawarma & Kebab', 'Bakery & Pastry'];
// Categories whose Services tab renders bookable rooms instead of a service list.
const ROOM_CATEGORIES = ['Hotel & Lodging', 'Guesthouse & Short-let / B&B'];
// Categories whose Services tab renders a salon treatment menu.
const BEAUTY_CATEGORIES = ['Salon / Barber', 'Spa & Beauty'];
// Categories whose Services tab renders a departments + doctors directory.
const HEALTH_CATEGORIES = ['Hospital & Clinic', 'Dental Care', 'Veterinary Services'];
// Categories whose Services tab renders programmes + teachers.
const EDUCATION_CATEGORIES = ['School & Education', 'Training & Tutoring'];
// Curated demo listings that live outside the 30 generated samples.
// Demo spotlights carry the legacy `verified` flag but no trust signals, which
// made the header badge contradict the Trust Panel. withDemoTrustAll gives them
// earned signals; real rows are untouched.
const SPOTLIGHTS: Record<string, any> = withDemoTrustAll({ ...SPOTLIGHT_BUSINESSES, ...MENU_SPOTLIGHTS, ...HOTEL_SPOTLIGHTS, ...CAR_SPOTLIGHTS, ...PHARMACY_SPOTLIGHTS, ...FITNESS_SPOTLIGHTS, ...BEAUTY_SPOTLIGHTS, ...HEALTH_SPOTLIGHTS, ...FASHION_SPOTLIGHTS, ...EDUCATION_SPOTLIGHTS, ...PHOTO_SPOTLIGHTS, ...TRANSPORT_SPOTLIGHTS, ...EVENT_SPOTLIGHTS, ...RETAIL_SPOTLIGHTS, ...AGRICULTURE_SPOTLIGHTS, ...LEGAL_SPOTLIGHTS, ...SERVICE_PROVIDER_SPOTLIGHTS, ...FINANCE_SPOTLIGHTS, ...MANUFACTURING_SPOTLIGHTS, ...CONSTRUCTION_SPOTLIGHTS, ...TRAVEL_SPOTLIGHTS, ...AUTOMOTIVE_SPOTLIGHTS, ...CHILDCARE_SPOTLIGHTS, ...MUSIC_SPOTLIGHTS, ...DESIGN_SPOTLIGHTS, ...INSURANCE_SPOTLIGHTS, ...ACCOUNTING_SPOTLIGHTS, ...MARKETING_SPOTLIGHTS, ...MONEY_SPOTLIGHTS, ...SOFTWARE_SPOTLIGHTS, ...REPAIR_SPOTLIGHTS, ...NEW_INDUSTRY_SPOTLIGHTS, ...MORE_SPOTLIGHTS });
import { ArrowLeft, ShoppingBag, Clock, MapPin, Phone, Mail, Globe, Star, Tag, Image, Grid, Package, Users2, Navigation, Loader2, Send, MessageCircle, CalendarCheck, ShoppingCart, Minus, Plus, X, ChevronLeft, ChevronRight, Radio, Play, Share2 } from 'lucide-react';
import { telHref, whatsappHref } from '../lib/phone';

interface TabConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  /**
   * How many items are behind the tab, where that is knowable.
   *
   * Shown beside the label so a visitor can see a tab is empty before spending
   * a tap on it — on this page four of six tabs were empty for a young listing,
   * and the only way to discover that was to open each one.
   *
   * undefined means "not a countable tab" (Overview, Live, Contact), which is
   * different from 0 and must not render a badge.
   */
  count?: number;
}

// Sample data for tabs
const sampleServices = [
  { id: 1, name: 'Web Development', description: 'Custom websites and web applications', price: '$500-$5000' },
  { id: 2, name: 'Mobile App Development', description: 'iOS and Android app development', price: '$1000-$10000' },
  { id: 3, name: 'UI/UX Design', description: 'User interface and experience design', price: '$500-$3000' },
];

const sampleProducts = [
  { id: 1, name: 'Premium Widget', description: 'High-quality widget for professionals', price: '$99.99', image: 'https://picsum.photos/seed/product1/300/200.jpg' },
  { id: 2, name: 'Business Software Suite', description: 'Complete business management solution', price: '$299.99', image: 'https://picsum.photos/seed/product2/300/200.jpg' },
  { id: 3, name: 'Marketing Template Pack', description: 'Professional marketing templates', price: '$49.99', image: 'https://picsum.photos/seed/product3/300/200.jpg' },
];

const sampleGallery = [
  'https://picsum.photos/seed/gallery1/600/400.jpg',
  'https://picsum.photos/seed/gallery2/600/400.jpg',
  'https://picsum.photos/seed/gallery3/600/400.jpg',
];

const sampleReviews = [
  { id: 1, author: 'John Doe', rating: 5, comment: 'Excellent service! Highly recommend.', date: '2024-01-15' },
  { id: 2, author: 'Jane Smith', rating: 4, comment: 'Great work, very professional.', date: '2024-01-10' },
  { id: 3, author: 'Mike Johnson', rating: 5, comment: 'Outstanding results, exceeded expectations!', date: '2024-01-05' },
];

interface BusinessContent {
  services: any[];
  products: any[];
  gallery: any[];
  reviews: any[];
}

const EMPTY_CONTENT: BusinessContent = { services: [], products: [], gallery: [], reviews: [] };

export default function BusinessDetail() {
  // Reached via /businesses/:id (uuid or sample id) or /business/:username
  const { id, username } = useParams<{ id?: string; username?: string }>();
  const { user } = useAuth();
  const [business, setBusiness] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Tab state lives in the URL, not in useState alone.
   *
   * Without it "send me their menu" is impossible — every tab was the same
   * address, so a shared link always landed on Overview. Refresh lost the tab,
   * and Back left the business entirely instead of returning to the previous
   * tab, which is the behaviour a visitor actually expects.
   *
   * `replace` on tab changes, so flicking through tabs does not bury the page
   * a visitor came from under six history entries.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';
  const setActiveTab = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  /**
   * Which contact channel a visitor actually used.
   *
   * The page tracked business_viewed and nothing else, so we knew a listing got
   * looked at and nothing about whether it earned a call — which is the only
   * number an owner weighs when deciding the listing is worth paying for.
   */
  const trackContact = (channel: 'phone' | 'email' | 'website' | 'whatsapp') => {
    track('business_contact_clicked', { channel }, business?.id);
  };
  const [content, setContent] = useState<BusinessContent>(EMPTY_CONTENT);
  const [enquiry, setEnquiry] = useState<{ context?: string } | null>(null);
  const [booking, setBooking] = useState<{ moduleKey: string; itemId?: string } | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [productQty, setProductQty] = useState<Record<string, number>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>('all');
  const [galleryDims, setGalleryDims] = useState<Record<string, { w: number; h: number }>>({});
  const noteGalleryDim = useCallback((url: string, w: number, h: number) => {
    if (!w || !h) return;
    setGalleryDims((prev) => (prev[url] ? prev : { ...prev, [url]: { w, h } }));
  }, []);

  /**
   * Share a single reel. Points at /r/<id>, not this page: that route is
   * server-rendered with the reel's own Open Graph tags, so WhatsApp and friends
   * show the reel itself instead of the generic site card an SPA hands them.
   */
  const shareReelItem = useCallback(async (
    galleryId: string,
    mediaUrl: string,
    isVideo: boolean,
    caption?: string | null,
  ) => {
    const name = business?.name || 'NowOpen Africa';
    const pending = isVideo ? toast.loading('Preparing the video to share…') : null;
    try {
      // Hands the share sheet the file itself where the browser allows it, which
      // is the only way a reel actually plays in WhatsApp (and the only way it
      // can go to Status at all). Falls back to the /r/ link otherwise.
      const outcome = await shareReel({ mediaUrl, isVideo, businessName: name, caption, galleryId });
      if (pending) toast.dismiss(pending);
      if (outcome === 'copied') toast.success('Share link copied — paste it into WhatsApp.');
    } catch {
      if (pending) toast.dismiss(pending);
      toast.error('Could not share that reel.');
    }
  }, [business?.name]);
  const [hasLiveNow, setHasLiveNow] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (id || username) fetchBusiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, username]);

  const fetchBusiness = async () => {
    try {
      if (username) {
        const { data, error } = await supabase
          .from('businesses')
          .select('*')
          .ilike('username', username)
          .maybeSingle();

        if (error) {
          console.warn('Supabase fetch failed, falling back to sample data:', error.message);
        }
        if (data) {
          setBusiness(data);
          return;
        }
        // Sample businesses also have usernames, so /business/<slug> works
        // for fallback data too
        const sample = generateBusinesses(30).find(b => b.username === username.toLowerCase());
        const spotlight = Object.values(SPOTLIGHTS).find(
          (b: any) => b.username === username.toLowerCase()
        );
        if (sample) {
          setBusiness({
            ...sample,
            services: 'Web Development, Mobile App Development, UI/UX Design',
            opening_hours: 'Mon-Fri: 9AM-6PM, Sat: 10AM-4PM',
            email: 'hello@nowopen.africa',
          });
        } else if (spotlight) {
          setBusiness(spotlight);
        } else {
          console.error('Business not found:', username);
        }
        return;
      }

      // Sample ids (e.g. "business_12") come from the fallback data and
      // don't exist in the database — resolve them locally.
      if (!isSampleId(id!)) {
        const { data, error } = await supabase
          .from('businesses')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) {
          console.warn('Supabase fetch failed, falling back to sample data:', error.message);
        }
        if (data) {
          setBusiness(data);
          return;
        }
      }

      const foundBusiness = generateBusinesses(30).find(b => b.id === id);
      if (foundBusiness) {
        setBusiness({
          ...foundBusiness,
          services: 'Web Development, Mobile App Development, UI/UX Design',
          opening_hours: 'Mon-Fri: 9AM-6PM, Sat: 10AM-4PM',
          email: 'hello@nowopen.africa',
        });
      } else if (SPOTLIGHTS[id!]) {
        // Curated spotlight listings (e.g. the Real Estate / Restaurant demos)
        // live outside the 30 generated samples.
        setBusiness(SPOTLIGHTS[id!]);
      } else {
        console.error('Business not found:', id);
      }
    } catch (err) {
      console.error('Error fetching business:', err);
    } finally {
      setLoading(false);
    }
  };

  const isSample = business ? isSampleId(String(business.id)) : false;

  // Per-listing SEO. Real businesses get their own title, description,
  // canonical (friendly username URL when available) and LocalBusiness
  // JSON-LD, so each profile ranks as its own entity. Sample and unresolved
  // listings are noindexed — demo data must never appear in search results.
  // Recorded once per listing per mount, and never for the sample fallback —
  // counting placeholder views would corrupt the one number an owner cares
  // most about.
  useEffect(() => {
    if (!business || isSample) return;
    track('business_viewed', { category: business.category ?? null, verified: Boolean(business.verified) }, business.id);
  }, [business?.id, isSample]);

  useEffect(() => {
    if (!business) return undefined;
    if (isSample) {
      // noindex is what keeps demo data out of search results, and it stays.
      // The title does not need to lie to achieve that: it read "Page Not
      // Found" on a page visibly rendering a business, so the browser tab, the
      // history entry and any bookmark all disagreed with the screen.
      return applySeo({
        title: `${business.name ?? 'Sample listing'} (sample) — NowOpen Africa`,
        description: 'A sample listing used to demonstrate NowOpen Africa. Not a real business.',
        path: window.location.pathname,
        robots: 'noindex, nofollow',
      });
    }
    const name = business.name ?? 'Business';
    const category = business.category ?? 'business';
    const description =
      (business.description ?? '').trim().slice(0, 300) ||
      `${name} — a ${category} on NowOpen Africa.`;
    const path = business.username ? `/${business.username}` : `/businesses/${business.id}`;
    const image = business.cover_image_url || business.image_url || business.logo_url || '/og-image.png';
    const absImage = image.startsWith('http') ? image : `${SITE_URL}${image}`;
    const rating =
      typeof business.rating === 'number' && business.rating > 0 ? business.rating : undefined;

    return applySeo({
      title: `${name} — ${category} | NowOpen Africa`,
      description,
      path,
      image,
      type: 'profile',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name,
        description,
        url: `${SITE_URL}${path}`,
        image: [absImage],
        ...(business.phone ? { telephone: business.phone } : {}),
        ...(business.email ? { email: business.email } : {}),
        ...(business.location
          ? { address: { '@type': 'PostalAddress', addressLocality: business.location } }
          : {}),
        ...(rating !== undefined
          ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, bestRating: 5 } }
          : {}),
      },
    });
  }, [business, isSample]);

  // Real businesses: load their services/products/gallery/reviews. Tables may
  // not exist yet on a fresh project — fail soft to empty content.
  const fetchContent = useCallback(async (businessId: string) => {
    try {
      const [svc, prod, gal, rev] = await Promise.all([
        supabase.from('business_services').select('*').eq('business_id', businessId).order('created_at'),
        supabase.from('business_products').select('*').eq('business_id', businessId).order('created_at'),
        supabase.from('business_gallery').select('*').eq('business_id', businessId).order('created_at'),
        supabase.from('business_reviews').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      ]);
      setContent({
        services: svc.data ?? [],
        products: prod.data ?? [],
        gallery: gal.data ?? [],
        reviews: rev.data ?? [],
      });
    } catch (err) {
      console.warn('Business content unavailable:', err);
      setContent(EMPTY_CONTENT);
    }
  }, []);

  useEffect(() => {
    if (business && !isSampleId(String(business.id))) {
      fetchContent(String(business.id));
    }
  }, [business, fetchContent]);

  // Lightweight header indicator only — the Live tab itself does its own,
  // more detailed fetch (current viewers, scheduled/replay state, etc.).
  useEffect(() => {
    if (business && business.verified && !isSampleId(String(business.id))) {
      supabase
        .from('business_streams')
        .select('id')
        .eq('business_id', business.id)
        .eq('status', 'live')
        .limit(1)
        .then(({ data }) => setHasLiveNow(!!data && data.length > 0));
    }
  }, [business]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxIndex(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex]);

  // Demo content (sampleServices/Products/Gallery/Reviews) is only shown for
  // generated sample listings — real businesses show what they've added.
  const legacyServices: { id: number | string; name: string; description: string; price: string }[] =
    !isSample && business?.services && content.services.length === 0
      // Older listings stored services as comma-separated text on the business row
      ? String(business.services).split(',').map((s: string, i: number) => ({ id: `legacy-${i}`, name: s.trim(), description: '', price: '' })).filter(s => s.name)
      : [];
  // Hotels & guesthouses render their Services tab as bookable rooms;
  // gyms render memberships + a class schedule. Both source business_services.
  const isHotel = ROOM_CATEGORIES.includes(business?.category ?? '');
  const isFitness = business?.category === 'Fitness & Gym';
  const isBeauty = BEAUTY_CATEGORIES.includes(business?.category ?? '');
  const isHealth = HEALTH_CATEGORIES.includes(business?.category ?? '');
  const isEducation = EDUCATION_CATEGORIES.includes(business?.category ?? '');
  const isPhoto = business?.category === 'Photography & Video';
  const isTransport = business?.category === 'Logistics & Transport';
  const isEvents = business?.category === 'Event Planning';
  const isLegal = business?.category === 'Legal Services';
  const isServiceProvider = business?.category === 'Cleaning Services';
  const isFinance = business?.category === 'Financial Services';
  const isConstruction = business?.category === 'Construction';
  const isTravel = business?.category === 'Travel & Tourism';
  const isAutomotive = business?.category === 'Automotive';
  const isChildcare = business?.category === 'Childcare';
  const isMusic = business?.category === 'Music & Nightlife';
  const isDesign = business?.category === 'Art & Design';
  const isInsurance = business?.category === 'Insurance';
  const isAccounting = business?.category === 'Accounting & Tax';
  const isMarketing = business?.category === 'Digital Marketing';
  const isMoney = business?.category === 'Money Transfer / Mobile Money Agent';
  const isSoftware = business?.category === 'Software & IT';
  const isRepair = business?.category === 'Gadget & Device Repair';
  const services = isSample
    ? (isHotel ? SAMPLE_ROOMS : isFitness ? SAMPLE_FITNESS : isBeauty ? SAMPLE_TREATMENTS : isHealth ? SAMPLE_DOCTORS : isEducation ? SAMPLE_COURSES : isPhoto ? SAMPLE_PACKAGES : isTransport ? SAMPLE_ROUTES : isEvents ? SAMPLE_VENDORS : isLegal ? SAMPLE_PRACTICES : isServiceProvider ? SAMPLE_JOBS : isFinance ? SAMPLE_FINANCIAL : isConstruction ? SAMPLE_BUILD_SERVICES : isTravel ? SAMPLE_TRIPS : isAutomotive ? SAMPLE_AUTO_SERVICES : isChildcare ? SAMPLE_CARE_PROGRAMS : isMusic ? SAMPLE_ACTS : isDesign ? SAMPLE_DESIGN_SERVICES : isInsurance ? SAMPLE_POLICIES : isAccounting ? SAMPLE_ACCOUNTING_SERVICES : isMarketing ? SAMPLE_MARKETING_SERVICES : isMoney ? SAMPLE_MONEY_SERVICES : isSoftware ? SAMPLE_SOFTWARE_SERVICES : isRepair ? SAMPLE_REPAIRS : sampleServices)
    : content.services.length > 0
    ? content.services.map(s => ({
        id: s.id, name: s.name, description: s.description || '', price: s.price || '',
        image: s.image_url || '', capacity: s.capacity ?? null, amenities: s.amenities ?? null,
        // fitness attributes (null for non-gym rows)
        session_kind: s.session_kind ?? null, class_level: s.class_level ?? null,
        class_schedule: s.class_schedule ?? null, instructor: s.instructor ?? null, duration_min: s.duration_min ?? null,
        // beauty attributes (null for non-salon rows)
        service_category: s.service_category ?? null, home_service: s.home_service ?? false,
        // health attributes (null for non-clinic rows)
        is_telemedicine: s.is_telemedicine ?? false,
        // education attributes (null for non-school rows)
        is_online: s.is_online ?? false,
      }))
    : legacyServices;
  // Category-specific product rendering: Real Estate → property portal;
  // Restaurant/Fast Food/Café/Bar → digital menu. Both source business_products.
  const isRealEstate = business?.category === 'Real Estate';
  const isMenu = MENU_CATEGORIES.includes(business?.category ?? '');
  const isCarDealer = business?.category === 'Car Dealership';
  const isPharmacy = business?.category === 'Pharmacy';
  const isFashion = business?.category === 'Fashion & Apparel';
  const isAgriculture = business?.category === 'Agriculture';
  const isRetail = RETAIL_CATEGORIES.includes(business?.category ?? '');
  const isManufacturing = business?.category === 'Manufacturing';
  const products: any[] = isSample
    ? (isRealEstate ? SAMPLE_PROPERTIES.map(p => ({ ...p, stock: null }))
       : isMenu ? SAMPLE_MENU
       : isCarDealer ? SAMPLE_VEHICLES
       : isPharmacy ? SAMPLE_MEDICINES
       : isFashion ? SAMPLE_FASHION
       : isAgriculture ? SAMPLE_PRODUCE
       : isRetail ? SAMPLE_RETAIL
       : isManufacturing ? SAMPLE_MANUFACTURED
       : sampleProducts)
    : content.products.map(p => ({
        id: p.id, name: p.name, description: p.description || '', price: p.price || '',
        image: p.image_url || '', stock: p.stock_quantity ?? null,
        // property attributes (null for non-real-estate rows)
        listing_type: p.listing_type ?? null, property_type: p.property_type ?? null,
        bedrooms: p.bedrooms ?? null, bathrooms: p.bathrooms ?? null, area_sqm: p.area_sqm ?? null,
        property_location: p.property_location ?? null, is_featured: p.is_featured ?? false,
        gallery: p.image_url ? [p.image_url] : [], verified_property: business?.verified ?? false,
        // menu attributes (null for non-restaurant rows)
        menu_category: p.menu_category ?? null, is_special: p.is_special ?? false, is_recommended: p.is_recommended ?? false,
        // vehicle attributes (null for non-dealership rows)
        vehicle_make: p.vehicle_make ?? null, vehicle_model: p.vehicle_model ?? null, vehicle_year: p.vehicle_year ?? null,
        mileage_km: p.mileage_km ?? null, fuel_type: p.fuel_type ?? null, transmission: p.transmission ?? null,
        vin: p.vin ?? null, vehicle_condition: p.vehicle_condition ?? null,
        // pharmacy attributes (null for non-pharmacy rows)
        med_category: p.med_category ?? null, requires_prescription: p.requires_prescription ?? false, pack_size: p.pack_size ?? null,
        // fashion attributes (null for non-fashion rows)
        fashion_category: p.fashion_category ?? null, sizes: p.sizes ?? null, fabric: p.fabric ?? null,
        // retail / agriculture attributes
        product_category: p.product_category ?? null, unit: p.unit ?? null,
      }));
  // Category-driven modules — a category can have more than one at once
  // (e.g. Restaurant gets both a reservation module and a cart module).
  const features = getActiveFeatures(business?.category, business?.enabled_modules);
  const bookingModule = features.find(f => f.itemSource === 'service');
  const reservationModule = features.find(f => f.itemSource === 'none');
  // itemSource 'product' covers two different interactions: a multi-item
  // cart checkout (cartModule) vs a single-pick booking against a listing,
  // e.g. Real Estate's "Book a Viewing" against one property (productBookingModule).
  const cartModule = features.find(f => f.itemSource === 'product' && f.cart);
  const productBookingModule = features.find(f => f.itemSource === 'product' && !f.cart);
  const activeBookingModule = booking ? features.find(f => f.key === booking.moduleKey) : undefined;
  const bookingItems = activeBookingModule?.itemSource === 'product'
    ? products.map(p => ({ id: String(p.id), name: p.name, price: p.price }))
    : activeBookingModule?.itemSource === 'service'
    ? services.map(s => ({ id: String(s.id), name: s.name, price: s.price }))
    : [];

  const addToCart = (product: any, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(l => l.productId === String(product.id));
      if (existing) {
        return prev.map(l => l.productId === String(product.id) ? { ...l, quantity: l.quantity + quantity } : l);
      }
      return [...prev, { productId: String(product.id), name: product.name, price: product.price, quantity }];
    });
    toast.success(`${product.name} added to cart`);
  };
  const updateCartQuantity = (productId: string, quantity: number) => {
    setCart(prev => prev.map(l => l.productId === productId ? { ...l, quantity } : l));
  };
  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(l => l.productId !== productId));
  };

  const getProductQty = (productId: string | number) => productQty[String(productId)] ?? 1;
  const setProductQtyFor = (productId: string | number, quantity: number) => {
    setProductQty(prev => ({ ...prev, [String(productId)]: Math.max(1, quantity) }));
  };

  // Freeform price strings ("₦5,000", "From $200", "Contact us") aren't
  // reliably numeric — extract a leading currency symbol and the first
  // numeric run so quantity totals can still be shown when possible.
  const parsePrice = (price?: string): { amount: number; symbol: string } | null => {
    if (!price) return null;
    const match = price.match(/([^\d]*)([\d,]+(?:\.\d+)?)/);
    if (!match) return null;
    const amount = parseFloat(match[2].replace(/,/g, ''));
    if (Number.isNaN(amount)) return null;
    return { amount, symbol: match[1].trim() };
  };

  const handleWhatsAppOrder = (product: any) => {
    const isCart = !!cartModule;
    const qty = isCart ? getProductQty(product.id) : 1;
    const parsed = parsePrice(product.price);
    const lines = isCart
      ? [`Hi ${business.name}, I'd like to order:`, `${product.name} x${qty}`]
      : [`Hi ${business.name}, I'd like to ask about:`, product.name];
    if (parsed) {
      if (isCart) {
        const total = parsed.amount * qty;
        lines.push(`Price: ${parsed.symbol}${parsed.amount.toLocaleString()} each — Total: ${parsed.symbol}${total.toLocaleString()}`);
      } else {
        lines.push(`Price: ${parsed.symbol}${parsed.amount.toLocaleString()}`);
      }
    } else if (product.price) {
      lines.push(`Price: ${product.price}`);
    }
    const href = business.phone ? whatsappHref(String(business.phone), business.location, lines.join('\n')) : null;
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      toast.error("This business hasn't added a WhatsApp number yet.");
    }
  };
  // `id` is the business_gallery row id, needed to build the /r/<id> share URL.
  // Sample items have none — they aren't real rows, so they aren't shareable.
  const gallery: { id?: string; url: string; caption?: string; type: MediaKind }[] = isSample
    ? sampleGallery.map(url => ({ url, type: 'photo' as const }))
    : content.gallery
        // Scheduled reels stay off the profile until their time. RLS enforces
        // this too; filtering here keeps it right even on a database where the
        // scheduling migration hasn't been applied.
        .filter(g => !g.scheduled_for || new Date(g.scheduled_for).getTime() <= Date.now())
        .map(g => ({
          id: g.id,
          url: g.image_url,
          caption: g.caption || undefined,
          type: mediaKindOf(g.image_url),
        }));

  // Intrinsic size per URL, reported by the browser once each item loads. Only
  // the browser knows it, so the orientation filters populate as the grid
  // renders rather than being guessed from the URL.
  const galleryDimensions = galleryDims;
  const galleryItems = gallery.map((item) => {
    const dim = galleryDimensions[item.url];
    return { ...item, kind: item.type, orientation: orientationOf(dim?.w, dim?.h) };
  });
  const filterCounts = galleryFilterCounts(galleryItems);
  // Offer only filters that would actually show something.
  const availableFilters = GALLERY_FILTERS.filter(
    (f) => f.key === 'all' || filterCounts[f.key] > 0,
  );
  const visibleGallery = galleryItems.filter((i) => matchesGalleryFilter(i, galleryFilter));
  const reviews = isSample
    ? sampleReviews
    : content.reviews.map(r => ({
        id: r.id,
        author: r.author_name,
        rating: r.rating,
        comment: r.comment || '',
        date: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
      }));

  const myReview = user && !isSample
    ? content.reviews.find(r => String(r.user_id) === String(user.id))
    : undefined;

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !business || reviewRating === 0) return;
    setSubmittingReview(true);
    try {
      const { error } = await supabase.from('business_reviews').upsert(
        [{
          business_id: business.id,
          user_id: user.id,
          author_name: (user.email || 'NowOpen user').split('@')[0],
          rating: reviewRating,
          comment: reviewComment.trim() || null,
        }],
        { onConflict: 'business_id,user_id' }
      );
      if (error) throw error;
      toast.success(myReview ? 'Review updated' : 'Review posted — thank you!');
      setReviewRating(0);
      setReviewComment('');
      await fetchContent(String(business.id));
      // The DB trigger recomputed the business rating — reflect it in the header
      const { data: fresh } = await supabase.from('businesses').select('rating').eq('id', business.id).maybeSingle();
      if (fresh) setBusiness((prev: any) => ({ ...prev, rating: fresh.rating }));
    } catch (err: any) {
      console.error('Review failed:', err);
      toast.error(
        `Could not post review: ${err.message || 'unknown error'}. ` +
        'If this mentions a missing table, run scripts/sql/apply_all_migrations.sql in Supabase.'
      );
    } finally {
      setSubmittingReview(false);
    }
  };

  const tabs: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: <Grid size={18} /> },
    { id: 'services', label: getTabLabel(business?.category, 'services', 'Services'), icon: <ShoppingBag size={18} />, count: services.length },
    { id: 'products', label: getTabLabel(business?.category, 'products', 'Products'), icon: <Package size={18} />, count: products.length },
    { id: 'gallery', label: getTabLabel(business?.category, 'gallery', 'Gallery'), icon: <Image size={18} />, count: gallery.length },
    // Premium, verified-only feature — unconfigured/unverified businesses
    // keep the plain tab set.
    ...(business?.verified ? [{ id: 'live', label: '🔴 Live', icon: <Radio size={18} /> }] : []),
    { id: 'reviews', label: 'Reviews', icon: <Star size={18} />, count: reviews.length },
    { id: 'contact', label: 'Contact', icon: <Phone size={18} /> },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!business) {
    // The /:username route is also the site's catch-all, so this screen
    // doubles as the 404 page for any unknown URL.
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-6xl font-bold text-blue-600 dark:text-blue-400 mb-4">404</p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {id ? 'Business not found' : 'Page not found'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            {id
              ? "This business listing doesn't exist or may have been removed."
              : "This link doesn't match any page or business profile. Check the address, or explore from the homepage."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm"
            >
              Go to Homepage
            </Link>
            <Link
              to="/businesses"
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
            >
              Explore Businesses
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const clockConfig = loadClockConfig(business);

  // A visitor's open/closed must come from the business's OWN stored hours in
  // the business's OWN timezone — never from the viewer's localStorage or a
  // category guess. resolvePublicStatus handles that and returns null when the
  // stored text can't be parsed, so we show no claim at all rather than a
  // confident guess that could send someone to a closed shop.
  const publicStatus = resolvePublicStatus(business, new Date());
  // Owner-side signals (live now, manual override) are still viewer-local, so
  // they only refine a status we already know is real.
  const ownerStatus = resolveBusinessStatus(business, clockConfig, new Date());
  const liveStatus = publicStatus === null
    ? null
    : ownerStatus === 'live'
      ? 'live'
      : publicStatus;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-4 sm:mb-8">
          <Link
            to="/businesses"
            className="inline-flex items-center gap-2 min-h-[44px] -ml-1 pl-1 pr-2 rounded-lg text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowLeft size={18} />
            Back to Businesses
          </Link>
        </div>

        {/* Business Header - Behance-inspired */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden mb-5 sm:mb-8">
          {/* Cover Image */}
          <div className="relative">
            <div className="h-36 sm:h-72 md:h-96 bg-gray-200 dark:bg-gray-700 overflow-hidden">
              {business.image_url ? (
                <img
                  src={business.image_url}
                  alt={business.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
              )}
            </div>

            {/* Business Logo — sits outside the cover image's overflow-hidden so it isn't clipped */}
            <div className="absolute -bottom-8 sm:-bottom-16 left-4 sm:left-8">
              <div className="relative">
                <div className="w-16 h-16 sm:w-32 sm:h-32 bg-gray-300 dark:bg-gray-600 rounded-full border-2 sm:border-4 border-white dark:border-gray-800 shadow-lg flex items-center justify-center overflow-hidden">
                  {business.logo_url ? (
                    <img loading="lazy" decoding="async"
                      src={business.logo_url}
                      alt={business.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ShoppingBag className="w-5 h-5 sm:w-10 sm:h-10 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Business Content — pt clears the logo overlapping from the cover image above */}
          <div className="px-4 sm:px-8 pb-4 sm:pb-8 pt-9 sm:pt-20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
                    {business.name}
                  </h1>
                  {/* Derived from the trust model, not the legacy `verified`
                      boolean — otherwise the header can claim "Verified" while
                      the Trust Panel below reports nothing confirmed. */}
                  {TIERS[deriveTier(business)].rank > 0 && <VerifiedBadge size={18} />}
                  <TrustBadge tier={business.verification_tier} score={business.trust_score} size="md" />
                  {hasLiveNow && (
                    <button
                      onClick={() => setActiveTab('live')}
                      className="inline-flex items-center gap-1 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-md hover:bg-red-700 transition"
                    >
                      <Radio size={10} className="animate-pulse" /> LIVE
                    </button>
                  )}
                </div>
                <p className="text-xs sm:text-lg text-gray-600 dark:text-gray-400">{business.description}</p>
              </div>
              <div className="text-left sm:text-right">
                <div className="flex items-center gap-1 mb-1">
                  <Star size={16} className="fill-yellow-400 text-yellow-400 sm:hidden" />
                  <Star size={18} className="fill-yellow-400 text-yellow-400 hidden sm:block" />
                  <span className="text-base sm:text-xl font-bold text-gray-900 dark:text-white">
                    {business.rating ? business.rating.toFixed(1) : '0.0'}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Rating</p>
              </div>
            </div>

            {/* Business Status & Quick Info */}
            <div className="flex items-center gap-2 sm:gap-6 text-xs sm:text-sm flex-wrap">
              <div className="flex items-center gap-2">
                {/* Broadcasting beats the timetable — "Live" is the more useful
                    thing to know and is only ever true right now. Otherwise the
                    open state, which carries its own "hours not confirmed" and
                    so needs no fallback here. */}
                {liveStatus === 'live' ? (
                  <BusinessStatusBadge status="live" category={business.category} showSub />
                ) : (
                  <OpenStateBadge business={business} />
                )}
              </div>
              {business.category && (
                <div className="flex items-center gap-2">
                  <Tag size={16} className="text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-700 dark:text-gray-300">{business.category}</span>
                </div>
              )}
              {business.location && (
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-gray-500 dark:text-gray-400" />
                  <span className="text-gray-700 dark:text-gray-300">{business.location}</span>
                </div>
              )}
            </div>

            {/* Trust & verification — answers "can I trust this business?"
                before the visitor has to go looking for it. */}
            <div className="mt-4">
              <BusinessTrustPanel
                business={business}
                reviewCount={content.reviews.length}
                productCount={content.products.length}
                serviceCount={content.services.length}
              />

              <BusinessLocations business={business} />
            </div>

            {/* Also serves — secondary categories set by the owner */}
            {Array.isArray(business.secondary_categories) && business.secondary_categories.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {business.secondary_categories.filter(Boolean).map((cat: string) => (
                  <span key={cat} className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                    {cat}
                  </span>
                ))}
              </div>
            )}

            {/* CTA row — 2-up grid on mobile so 4 actions form 2 rows instead of stacking 1-per-row; single row from sm: up */}
            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-3 mt-4 sm:mt-6">
              {/* Keep leads: Call, WhatsApp and Directions are one-off
                  contacts, and this is the one that starts a relationship. */}
              {!isSample && (
                <KeepButton businessId={String(business.id)} businessName={business.name} />
              )}
              {business.phone && (
                <a
                  href={telHref(String(business.phone))}
                  onClick={() => {
                    trackContact('phone');
                    // Desktop browsers often have no telephony handler, so a
                    // bare tel: click looks dead — surface the number too.
                    navigator.clipboard?.writeText(String(business.phone).trim()).then(
                      () => toast.success(`${business.phone} — number copied to clipboard`),
                      () => toast(`Call ${business.phone}`)
                    );
                  }}
                  className="sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 min-h-[44px] bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-xs sm:text-sm"
                >
                  <Phone size={14} className="sm:hidden" />
                  <Phone size={16} className="hidden sm:block" />
                  Call Business
                </a>
              )}
              {business.phone && whatsappHref(String(business.phone), business.location, `Hi ${business.name}, I found you on NowOpen Africa and I'd like to make an enquiry.`) && (
                <a
                  href={whatsappHref(String(business.phone), business.location, `Hi ${business.name}, I found you on NowOpen Africa and I'd like to make an enquiry.`)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackContact('whatsapp')}
                  className="sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 min-h-[44px] bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition text-xs sm:text-sm"
                >
                  <MessageCircle size={14} className="sm:hidden" />
                  <MessageCircle size={16} className="hidden sm:block" />
                  WhatsApp
                </a>
              )}
              <button
                onClick={() => setEnquiry({})}
                className="sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-xs sm:text-sm"
              >
                <Mail size={14} className="sm:hidden" />
                <Mail size={16} className="hidden sm:block" />
                Send Enquiry
              </button>
              {reservationModule && (
                <button
                  onClick={() => setBooking({ moduleKey: reservationModule.key })}
                  className="sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 min-h-[44px] bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition text-xs sm:text-sm"
                >
                  <CalendarCheck size={14} className="sm:hidden" />
                  <CalendarCheck size={16} className="hidden sm:block" />
                  {reservationModule.ctaLabel}
                </button>
              )}
              {business.website && (
                <a
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm:flex-none inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-6 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-xs sm:text-sm"
                >
                  <Globe size={14} className="sm:hidden" />
                  <Globe size={16} className="hidden sm:block" />
                  Visit Website
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl mb-8">
          <div className="border-b border-gray-200 dark:border-gray-700">
            {/* A real tablist. These were plain buttons marked aria-current="page",
                which is the attribute for "this is the current page" in a nav —
                so a screen reader announced six unrelated buttons with no sense
                of a group, no selected state, and no arrow-key movement. */}
            <div role="tablist" aria-label="Business sections" className="flex space-x-2 px-6 overflow-x-auto">
              {tabs.map((tab, i) => (
                <button
                  key={tab.id}
                  id={`biz-tab-${tab.id}`}
                  role="tab"
                  type="button"
                  aria-selected={activeTab === tab.id}
                  aria-controls="biz-tabpanel"
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                    e.preventDefault();
                    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
                    setActiveTab(next.id);
                    document.getElementById(`biz-tab-${next.id}`)?.focus();
                  }}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-1.5 min-h-[44px] px-3 sm:gap-2 sm:px-6 text-xs sm:text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap flex-shrink-0
                    ${
                      activeTab === tab.id
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  {tab.icon}
                  {tab.label}
                  {typeof tab.count === 'number' && (
                    <span
                      className={`tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        tab.count === 0
                          ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                          : activeTab === tab.id
                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div id="biz-tabpanel" role="tabpanel" aria-labelledby={`biz-tab-${activeTab}`} className="p-4 sm:p-6 md:p-8">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">Business Overview</h2>

                <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 mb-6">
                  <BusinessTimeline business={business} config={clockConfig} />
                </div>

                {/* Why us, the story, credentials, team, FAQs, business
                    information and policies — each rendering only if it has
                    something in it, so a sparse profile stays short rather than
                    becoming a column of empty headings. */}
                <div className="mb-6">
                  <BusinessStory business={business as unknown as ProfileStory & { description?: string | null }} />
                </div>
                
                {/* Identity facts only.
                    Phone, email, website and the map used to be repeated here
                    verbatim from the Contact tab, and category/services were
                    split across two columns for no reason. Overview now answers
                    "who is this?" and hands off to Contact for "how do I reach
                    them?" — one fact, one home, so they cannot drift apart. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Business Information</h3>
                    <dl className="space-y-4">
                      <div className="flex items-start gap-3">
                        <ShoppingBag size={20} className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                        <div>
                          <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">Business Name</dt>
                          <dd className="text-sm text-gray-900 dark:text-white">{business.name}</dd>
                        </div>
                      </div>
                      {business.category && (
                        <div className="flex items-start gap-3">
                          <Grid size={20} className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                          <div>
                            <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">Category</dt>
                            <dd className="text-sm text-gray-900 dark:text-white">{business.category}</dd>
                          </div>
                        </div>
                      )}
                      {business.location && (
                        <div className="flex items-start gap-3">
                          <MapPin size={20} className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                          <div>
                            <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">Location</dt>
                            <dd className="text-sm text-gray-900 dark:text-white">{business.location}</dd>
                          </div>
                        </div>
                      )}
                      {business.services && (
                        <div className="flex items-start gap-3">
                          <Package size={20} className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                          <div>
                            <dt className="text-xs font-medium text-gray-600 dark:text-gray-400">Services</dt>
                            <dd className="text-sm text-gray-900 dark:text-white">{business.services}</dd>
                          </div>
                        </div>
                      )}
                    </dl>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('contact');
                        document.getElementById('biz-tab-contact')?.focus();
                      }}
                      className="mt-5 inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Phone size={16} />
                      Phone, email &amp; directions
                    </button>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Opening Hours</h3>
                    <OpeningHoursPanel hours={business.opening_hours || business.hours} timeZone={business.timezone} />
                  </div>
                </div>

                {/* Statistics Grid — counts reflect what the tabs actually show */}
                {(reviews.length + products.length + services.length + gallery.length) > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{reviews.length}</div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Reviews</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{products.length}</div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Products</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">{services.length}</div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Services</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">{gallery.length}</div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Photos</p>
                    </div>
                  </div>
                )}

                {/* The map lives on the Contact tab only.
                    The identical Google embed was rendered here as well, so
                    every profile mounted two third-party iframes for one
                    address — and this copy sat on the DEFAULT tab, meaning
                    every visitor paid for it whether or not they wanted
                    directions. Overview keeps the address as text and hands off
                    to Contact, which is where "how do I get there" belongs. */}
              </div>
            )}

            {/* Services Tab */}
            {activeTab === 'services' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
                  {isHotel ? 'Rooms & facilities' : isFitness ? 'Memberships & classes' : isBeauty ? 'Services & stylists' : isHealth ? 'Departments & doctors' : isEducation ? 'Programmes & admissions' : isPhoto ? 'Portfolio & packages' : isTransport ? 'Routes & schedules' : isEvents ? 'Vendors & bundles' : isLegal ? 'Legal services' : isServiceProvider ? 'Book a service' : isFinance ? 'Financial products' : isConstruction ? 'Projects & services' : isTravel ? 'Holiday packages' : isAutomotive ? 'Workshop services' : isChildcare ? 'Programmes & care' : isMusic ? 'Acts & performances' : isDesign ? 'Work & services' : isInsurance ? 'Policies & cover' : isAccounting ? 'Services & advisory' : isMarketing ? 'Services & results' : isMoney ? 'Agent services' : isSoftware ? 'Services & delivery' : isRepair ? 'Repairs & services' : `Our ${getTabLabel(business.category, 'services', 'Services')}`}
                </h2>

                {isRepair && bookingModule ? (
                  <RepairShop
                    repairs={services}
                    ctaLabel={bookingModule.ctaLabel}
                    capabilities={isSample ? REPAIR_CAPABILITIES : []}
                    showProcess={isSample}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isSoftware && bookingModule ? (
                  <SoftwareStudio
                    services={services}
                    ctaLabel={bookingModule.ctaLabel}
                    stats={isSample ? SOFTWARE_STATS : []}
                    stack={isSample ? SOFTWARE_STACK : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isMoney && bookingModule ? (
                  <MoneyAgent
                    services={services}
                    ctaLabel={bookingModule.ctaLabel}
                    providers={isSample ? MONEY_PROVIDERS : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isMarketing && bookingModule ? (
                  <MarketingAgency
                    services={services}
                    ctaLabel={bookingModule.ctaLabel}
                    results={isSample ? MARKETING_RESULTS : []}
                    channels={isSample ? MARKETING_CHANNELS : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isAccounting && bookingModule ? (
                  <AccountingFirm
                    services={services}
                    ctaLabel={bookingModule.ctaLabel}
                    capabilities={isSample ? ACCOUNTING_CAPABILITIES : []}
                    showCompliance={isSample}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isInsurance && bookingModule ? (
                  <InsuranceCenter
                    policies={services}
                    ctaLabel={bookingModule.ctaLabel}
                    capabilities={isSample ? INSURANCE_CAPABILITIES : []}
                    hasPhone={!!business.phone}
                    phoneHref={business.phone ? telHref(business.phone) : null}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isDesign && bookingModule ? (
                  <DesignStudio
                    services={services}
                    ctaLabel={bookingModule.ctaLabel}
                    gallery={isSample ? WORK_GALLERY : []}
                    tools={isSample ? DESIGN_TOOLS : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isMusic && bookingModule ? (
                  <MusicEntertainment
                    acts={services}
                    ctaLabel={bookingModule.ctaLabel}
                    gallery={isSample ? SHOW_GALLERY : []}
                    genres={isSample ? MUSIC_GENRES : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isChildcare && bookingModule ? (
                  <ChildcareCenter
                    programs={services}
                    ctaLabel={bookingModule.ctaLabel}
                    capabilities={isSample ? CARE_CAPABILITIES : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isAutomotive && bookingModule ? (
                  <AutoServiceCenter
                    services={services}
                    ctaLabel={bookingModule.ctaLabel}
                    capabilities={isSample ? AUTO_CAPABILITIES : []}
                    hasPhone={!!business.phone}
                    phoneHref={business.phone ? telHref(business.phone) : null}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isTravel && bookingModule ? (
                  <TravelAgency
                    packages={services}
                    ctaLabel={bookingModule.ctaLabel}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isConstruction && bookingModule ? (
                  <ConstructionFirm
                    services={services}
                    ctaLabel={bookingModule.ctaLabel}
                    projects={isSample ? CONSTRUCTION_PROJECTS : []}
                    capabilities={isSample ? CONSTRUCTION_CAPABILITIES : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isFinance && bookingModule ? (
                  <FinanceCenter
                    products={services}
                    ctaLabel={bookingModule.ctaLabel}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isLegal && bookingModule ? (
                  <LegalPractice
                    services={services}
                    ctaLabel={bookingModule.ctaLabel}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isServiceProvider && bookingModule ? (
                  <ServiceProviders
                    jobs={services}
                    ctaLabel={bookingModule.ctaLabel}
                    hasPhone={!!business.phone}
                    phone={business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isEvents && bookingModule ? (
                  <EventVendors
                    vendors={services}
                    ctaLabel={bookingModule.ctaLabel}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isTransport && bookingModule ? (
                  <TransportHub
                    routes={services}
                    ctaLabel={bookingModule.ctaLabel}
                    fleet={isSample ? TRANSPORT_FLEET : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isPhoto && bookingModule ? (
                  <PhotographyStudio
                    packages={services}
                    ctaLabel={bookingModule.ctaLabel}
                    portfolio={isSample ? PHOTO_PORTFOLIO : []}
                    equipment={isSample ? PHOTO_EQUIPMENT : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isEducation && bookingModule ? (
                  <EducationCenter
                    courses={services}
                    ctaLabel={bookingModule.ctaLabel}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isHealth && bookingModule ? (
                  <HealthCenter
                    doctors={services}
                    ctaLabel={bookingModule.ctaLabel}
                    hasPhone={!!business.phone}
                    phone={business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isBeauty && bookingModule ? (
                  <BeautySalon
                    treatments={services}
                    ctaLabel={bookingModule.ctaLabel}
                    stylists={isSample ? SALON_STYLISTS : []}
                    looks={isSample ? SALON_LOOKS : []}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isFitness && bookingModule ? (
                  <FitnessCenter
                    items={services}
                    ctaLabel={bookingModule.ctaLabel}
                    hasPhone={!!business.phone}
                    onBook={(sid) => setBooking({ moduleKey: bookingModule.key, itemId: sid })}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isHotel && bookingModule ? (
                  <HotelRooms
                    rooms={services}
                    bookLabel={bookingModule.ctaLabel}
                    facilities={isSample ? HOTEL_FACILITIES : []}
                    hasPhone={!!business.phone}
                    onBookRoom={(rid) => setBooking({ moduleKey: bookingModule.key, itemId: rid })}
                    onWhatsApp={(room) => handleWhatsAppOrder(room)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : services.length > 0 ? (
                  <div className="space-y-4">
                    {services.map((service) => (
                      <div key={service.id} className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Tag size={20} className="text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-medium text-gray-900 dark:text-white">{service.name}</h4>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {service.price && (
                                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{service.price}</span>
                              )}
                              {bookingModule && (
                                <button
                                  onClick={() => setBooking({ moduleKey: bookingModule.key, itemId: String(service.id) })}
                                  className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 transition"
                                >
                                  {bookingModule.ctaLabel}
                                </button>
                              )}
                            </div>
                          </div>
                          {service.description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">{service.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <ShoppingBag size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      This business hasn't listed its services yet.
                    </p>
                    <button
                      onClick={() => setEnquiry({ context: 'your services' })}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm"
                    >
                      <Mail size={16} />
                      Ask About Services
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Products Tab */}
            {activeTab === 'products' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
                  {isRealEstate ? 'Available properties' : isMenu ? 'Menu' : isCarDealer ? 'Vehicles in stock' : isPharmacy ? 'Pharmacy' : isFashion ? 'Shop the collection' : isAgriculture ? 'Farm produce' : isRetail ? 'Shop' : isManufacturing ? 'Products & wholesale' : `Our ${getTabLabel(business.category, 'products', 'Products')}`}
                </h2>

                {isManufacturing ? (
                  <ManufacturingHub
                    items={products}
                    certifications={isSample ? MANUFACTURING_CERTS : []}
                    hasPhone={!!business.phone}
                    onAddToCart={(item, q) => addToCart(item, q)}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isAgriculture ? (
                  <AgricultureMarket
                    items={products}
                    hasPhone={!!business.phone}
                    onAddToCart={(item, q) => addToCart(item, q)}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isRetail ? (
                  <RetailStorefront
                    items={products}
                    hasPhone={!!business.phone}
                    onAddToCart={(item, q) => addToCart(item, q)}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isFashion ? (
                  <FashionBoutique
                    items={products}
                    hasPhone={!!business.phone}
                    onAddToCart={(item, q) => addToCart(item, q)}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isPharmacy ? (
                  <PharmacyStorefront
                    items={products}
                    hasPhone={!!business.phone}
                    onAddToCart={(item, q) => addToCart(item, q)}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isCarDealer && productBookingModule ? (
                  <CarDealerInventory
                    vehicles={products}
                    ctaLabel={productBookingModule.ctaLabel}
                    dealerName={business.name}
                    verifiedDealer={!!business.verified}
                    hasPhone={!!business.phone}
                    onBookTestDrive={(vid) => setBooking({ moduleKey: productBookingModule.key, itemId: vid })}
                    onWhatsApp={(v) => handleWhatsAppOrder(v)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isMenu ? (
                  <RestaurantMenu
                    items={products}
                    reserveLabel={reservationModule?.ctaLabel ?? 'Reserve a Table'}
                    hasPhone={!!business.phone}
                    onReserve={() => reservationModule && setBooking({ moduleKey: reservationModule.key })}
                    onAddToCart={(item, q) => addToCart(item, q)}
                    onWhatsApp={(item) => handleWhatsAppOrder(item)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : isRealEstate && productBookingModule ? (
                  <RealEstatePortal
                    properties={products}
                    ctaLabel={productBookingModule.ctaLabel}
                    agentName={business.name}
                    agentLocation={business.location}
                    verifiedAgent={!!business.verified}
                    hasPhone={!!business.phone}
                    onBookViewing={(pid) => setBooking({ moduleKey: productBookingModule.key, itemId: pid })}
                    onWhatsApp={(prop) => handleWhatsAppOrder(prop)}
                    onEnquire={(ctx) => setEnquiry({ context: ctx })}
                  />
                ) : products.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                    {products.map((product) => (
                      <div key={product.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                        {product.image ? (
                          <img loading="lazy" decoding="async"
                            src={product.image}
                            alt={product.name}
                            className="w-full h-24 sm:h-32 md:h-48 object-cover"
                          />
                        ) : (
                          <div className="w-full h-24 sm:h-32 md:h-48 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                            <Package size={40} className="text-blue-400 dark:text-gray-400" />
                          </div>
                        )}
                        <div className="p-2.5 sm:p-4">
                          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-1 sm:mb-2 line-clamp-1">{product.name}</h3>
                          {product.description && (
                            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 sm:mb-3 line-clamp-2">{product.description}</p>
                          )}
                          {product.stock != null && (
                            <p className={`text-[10px] font-medium mb-1.5 ${product.stock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                              {product.stock > 0 ? `In stock (${product.stock})` : 'Out of stock'}
                            </p>
                          )}
                          {cartModule && (
                            <div className="flex items-center gap-1.5 mb-2">
                              <button
                                type="button"
                                onClick={() => setProductQtyFor(product.id, getProductQty(product.id) - 1)}
                                aria-label={`Decrease quantity of ${product.name}`}
                                className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 flex-shrink-0"
                              >
                                <Minus size={11} />
                              </button>
                              <span className="w-5 text-center text-xs text-gray-700 dark:text-gray-300">{getProductQty(product.id)}</span>
                              <button
                                type="button"
                                onClick={() => setProductQtyFor(product.id, getProductQty(product.id) + 1)}
                                aria-label={`Increase quantity of ${product.name}`}
                                className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 flex-shrink-0"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-sm sm:text-lg font-bold text-blue-600 dark:text-blue-400 truncate">{product.price}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {business.phone && (
                                <button
                                  onClick={() => handleWhatsAppOrder(product)}
                                  aria-label={`Order ${product.name} via WhatsApp`}
                                  className="p-1.5 sm:p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                                >
                                  <MessageCircle size={14} />
                                </button>
                              )}
                              {cartModule ? (
                                <button
                                  onClick={() => addToCart(product, getProductQty(product.id))}
                                  disabled={product.stock === 0}
                                  className="inline-flex items-center gap-1 bg-purple-600 text-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50"
                                >
                                  <ShoppingCart size={13} />
                                  Add
                                </button>
                              ) : productBookingModule ? (
                                <button
                                  onClick={() => setBooking({ moduleKey: productBookingModule.key, itemId: String(product.id) })}
                                  className="inline-flex items-center gap-1 bg-purple-600 text-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-purple-700 transition"
                                >
                                  <CalendarCheck size={13} />
                                  {productBookingModule.ctaLabel}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setEnquiry({ context: product.name })}
                                  className="bg-blue-600 text-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition"
                                >
                                  Enquire
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Package size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      This business hasn't added any products yet.
                    </p>
                    <button
                      onClick={() => setEnquiry({ context: 'your products' })}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm"
                    >
                      <Mail size={16} />
                      Ask About Products
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Gallery Tab */}
            {activeTab === 'gallery' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">{getTabLabel(business.category, 'gallery', 'OpenReels')}</h2>

                {gallery.length > 0 ? (
                  <>
                    {/* Filter rail — scrolls sideways on a phone rather than
                        wrapping into rows and pushing the grid down. */}
                    {availableFilters.length > 1 && (
                      <div className="-mx-4 sm:mx-0 mb-4 overflow-x-auto no-scrollbar">
                        <div
                          role="tablist"
                          aria-label="Filter gallery"
                          className="flex items-center gap-2 px-4 sm:px-0 w-max"
                        >
                          {availableFilters.map((f) => {
                            const active = galleryFilter === f.key;
                            return (
                              <button
                                key={f.key}
                                role="tab"
                                aria-selected={active}
                                // Indices are into the filtered list, so a
                                // lightbox left open would point at the wrong
                                // item once the list changes.
                                onClick={() => { setGalleryFilter(f.key); setLightboxIndex(null); }}
                                className={`whitespace-nowrap inline-flex items-center min-h-[44px] px-3.5 rounded-full text-xs font-medium border transition ${
                                  active
                                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                              >
                                {f.label}
                                <span className={active ? 'ml-1.5 opacity-70' : 'ml-1.5 text-gray-400 dark:text-gray-500'}>
                                  {filterCounts[f.key]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {visibleGallery.map((item, index) => (
                      <div
                        key={item.url + index}
                        onClick={() => setLightboxIndex(index)}
                        className="bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden group cursor-pointer aspect-[9/16] relative"
                      >
                        {item.type === 'embed' ? (
                          // Tiles stay lightweight: a badge, not an iframe.
                          // Loading a dozen third-party players in a grid would
                          // cost more than the whole rest of the page. The real
                          // player opens in the lightbox.
                          <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                              <Play size={18} className="text-gray-900 ml-0.5" />
                            </div>
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-300">
                              {parseVideoEmbed(item.url)?.label}
                            </span>
                          </div>
                        ) : item.type === 'video' ? (
                          // Poster image where one exists, so a grid of reels
                          // doesn't download and decode every clip just to show
                          // a thumbnail.
                          <GalleryThumb
                            url={item.url}
                            alt={item.caption || `${business.name} reel ${index + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            onMeasured={(w, h) => noteGalleryDim(item.url, w, h)}
                          />
                        ) : (
                          <img loading="lazy" decoding="async"
                            src={item.url}
                            alt={item.caption || `${business.name} gallery ${index + 1}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            onLoad={(e) => {
                              const i = e.currentTarget;
                              noteGalleryDim(item.url, i.naturalWidth, i.naturalHeight);
                            }}
                          />
                        )}
                        {item.type === 'video' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                              <Play size={18} className="text-gray-900 ml-0.5" />
                            </div>
                          </div>
                        )}
                        {item.caption && (
                          <p className="absolute bottom-0 inset-x-0 px-2 py-1.5 text-[11px] text-white bg-gradient-to-t from-black/70 to-transparent truncate">
                            {item.caption}
                          </p>
                        )}
                      </div>
                    ))}
                    </div>

                    {visibleGallery.length === 0 && (
                      <div className="text-center py-12">
                        <Image size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-600 dark:text-gray-400">Nothing matches this filter.</p>
                        <button
                          onClick={() => setGalleryFilter('all')}
                          className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Show everything
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Image size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-600 dark:text-gray-400">
                      This business hasn't uploaded any OpenReels yet.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Live Tab — premium, verified-only */}
            {activeTab === 'live' && business.verified && (
              <LiveSection
                business={business}
                onBook={(moduleKey, itemId) => setBooking({ moduleKey, itemId })}
                onOpenCart={() => setCartOpen(true)}
              />
            )}

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
              <div className="animate-fadeIn">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">Customer Reviews</h2>
                  <div className="flex items-center gap-1">
                    <Star size={20} className="fill-yellow-400 text-yellow-400" />
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      {business.rating ? business.rating.toFixed(1) : '0.0'}
                    </span>
                  </div>
                </div>
                
                {reviews.length > 0 ? (
                  <div className="space-y-6">
                    {reviews.map((review) => (
                      <div key={review.id} className="border-b border-gray-200 dark:border-gray-700 pb-6">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                            <Users2 size={20} className="text-gray-600 dark:text-gray-400" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-gray-900 dark:text-white">{review.author}</h4>
                              <span className="text-sm text-gray-600 dark:text-gray-400">{review.date}</span>
                            </div>
                            <div className="flex items-center gap-1 mb-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  size={16}
                                  className={star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}
                                />
                              ))}
                            </div>
                            <p className="text-gray-700 dark:text-gray-300">{review.comment}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Star size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-600 dark:text-gray-400">
                      No reviews yet — be the first to review this business.
                    </p>
                  </div>
                )}

                {/* Leave a review (real businesses only) */}
                {!isSample && (
                  <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
                    {user ? (
                      <form onSubmit={handleSubmitReview} className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {myReview ? 'Update your review' : 'Write a review'}
                        </h3>
                        <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              role="radio"
                              aria-checked={reviewRating === star}
                              aria-label={`${star} star${star > 1 ? 's' : ''}`}
                              onClick={() => setReviewRating(star)}
                              className="p-1 transition hover:scale-110"
                            >
                              <Star
                                size={26}
                                className={star <= reviewRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}
                              />
                            </button>
                          ))}
                          {reviewRating > 0 && (
                            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">{reviewRating}/5</span>
                          )}
                        </div>
                        <textarea
                          rows={3}
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          maxLength={2000}
                          placeholder="Share your experience with this business (optional)"
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                        <button
                          type="submit"
                          disabled={submittingReview || reviewRating === 0}
                          className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                        >
                          {submittingReview ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                          {submittingReview ? 'Posting…' : myReview ? 'Update Review' : 'Post Review'}
                        </button>
                        {reviewRating === 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">Tap the stars to pick a rating first.</p>
                        )}
                      </form>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          Had an experience with {business.name}? Sign in to leave a review.
                        </p>
                        <Link
                          to="/login"
                          className="inline-block px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm"
                        >
                          Sign In to Review
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Contact Tab */}
            {activeTab === 'contact' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">Contact Information</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Get in Touch</h3>
                    {/* Every row is the action, not a printout of it.
                        These were four blocks of plain text: on a phone, the
                        number a visitor came for could not be dialled, only
                        copied by hand. Whole rows are the hit area so the target
                        clears 44px without inventing extra buttons. */}
                    <div className="space-y-2">
                      {business.location && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.location)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-3 -mx-2 px-2 py-2 min-h-[44px] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <MapPin size={20} className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Address</p>
                            <p className="text-sm text-gray-900 dark:text-white break-words">{business.location}</p>
                          </div>
                        </a>
                      )}
                      {business.phone && (
                        <a
                          href={telHref(String(business.phone))}
                          onClick={() => trackContact('phone')}
                          className="flex items-start gap-3 -mx-2 px-2 py-2 min-h-[44px] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <Phone size={20} className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Phone</p>
                            <p className="text-sm text-gray-900 dark:text-white break-words">{business.phone}</p>
                          </div>
                        </a>
                      )}
                      {business.email && (
                        <a
                          href={`mailto:${business.email}`}
                          onClick={() => trackContact('email')}
                          className="flex items-start gap-3 -mx-2 px-2 py-2 min-h-[44px] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <Mail size={20} className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Email</p>
                            <p className="text-sm text-gray-900 dark:text-white break-words">{business.email}</p>
                          </div>
                        </a>
                      )}
                      {business.website && (
                        <a
                          href={business.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => trackContact('website')}
                          className="flex items-start gap-3 -mx-2 px-2 py-2 min-h-[44px] rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          <Globe size={20} className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Website</p>
                            <p className="text-sm text-blue-600 dark:text-blue-400 break-all">{business.website}</p>
                          </div>
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Business Hours</h3>
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock size={16} className="text-gray-600 dark:text-gray-400" />
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Operating Hours</p>
                      </div>
                      {business.opening_hours || business.hours ? (
                        <p className="text-sm text-gray-900 dark:text-white">
                          {business.opening_hours || business.hours}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Hours not provided yet — contact the business to confirm availability.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Map */}
                {business.location && (
                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <MapPin size={20} className="text-blue-600 dark:text-blue-400" />
                        Find us
                      </h3>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1 min-h-[44px] px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        <Navigation size={16} />
                        Get Directions
                      </a>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 h-80">
                      <iframe
                        title={`Map of ${business.name}`}
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(business.location)}&z=14&output=embed`}
                        className="w-full h-full border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {enquiry && (
        <EnquiryModal
          businessId={String(business.id)}
          businessName={business.name}
          businessEmail={business.email}
          context={enquiry.context}
          onClose={() => setEnquiry(null)}
        />
      )}

      {booking && activeBookingModule && (
        <BookingModal
          businessId={String(business.id)}
          businessName={business.name}
          businessEmail={business.email}
          feature={activeBookingModule}
          items={bookingItems}
          initialItemId={booking.itemId}
          onClose={() => setBooking(null)}
        />
      )}

      {cartModule && cart.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 left-6 z-40 inline-flex items-center gap-2 px-4 py-3 bg-purple-600 text-white font-medium rounded-full shadow-lg hover:bg-purple-700 transition"
        >
          <ShoppingCart size={18} />
          Cart ({cart.reduce((sum, l) => sum + l.quantity, 0)})
        </button>
      )}

      {cartOpen && cartModule && (
        <CartModal
          businessId={String(business.id)}
          businessName={business.name}
          businessEmail={business.email}
          moduleKey={cartModule.key}
          lines={cart}
          onUpdateQuantity={updateCartQuantity}
          onRemove={removeFromCart}
          onClose={() => setCartOpen(false)}
          onSuccess={() => setCart([])}
        />
      )}

      {lightboxIndex !== null && visibleGallery[lightboxIndex] && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setLightboxIndex(null)}
            aria-label="Close"
            className="absolute top-4 right-4 text-white/80 hover:text-white transition z-10"
          >
            <X size={28} />
          </button>
          {visibleGallery[lightboxIndex].id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const item = visibleGallery[lightboxIndex];
                shareReelItem(item.id!, item.url, item.type === 'video', item.caption);
              }}
              aria-label="Share this reel"
              className="absolute top-4 left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-medium backdrop-blur transition z-10"
            >
              <Share2 size={16} /> Share
            </button>
          )}
          {visibleGallery.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => ((i! - 1 + visibleGallery.length) % visibleGallery.length)); }}
              aria-label="Previous"
              className="absolute left-2 sm:left-4 text-white/80 hover:text-white transition p-2 z-10"
            >
              <ChevronLeft size={32} />
            </button>
          )}
          {visibleGallery[lightboxIndex].type === 'embed' ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-full overflow-auto"
            >
              <VideoEmbedFrame
                url={visibleGallery[lightboxIndex].url}
                title={visibleGallery[lightboxIndex].caption || `${business.name} video`}
              />
            </div>
          ) : visibleGallery[lightboxIndex].type === 'video' ? (
            <video
              key={visibleGallery[lightboxIndex].url}
              src={visibleGallery[lightboxIndex].url}
              controls
              autoPlay
              playsInline
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          ) : (
            <img loading="lazy" decoding="async"
              src={visibleGallery[lightboxIndex].url}
              alt={visibleGallery[lightboxIndex].caption || `${business.name} gallery ${lightboxIndex + 1}`}
              onClick={(e) => e.stopPropagation()}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          )}
          {visibleGallery.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => ((i! + 1) % visibleGallery.length)); }}
              aria-label="Next"
              className="absolute right-2 sm:right-4 text-white/80 hover:text-white transition p-2 z-10"
            >
              <ChevronRight size={32} />
            </button>
          )}
          {visibleGallery[lightboxIndex].caption && (
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-sm bg-black/60 px-3 py-1.5 rounded-full max-w-[90%] truncate">
              {visibleGallery[lightboxIndex].caption}
            </p>
          )}
        </div>
      )}

      {/*
        Sticky action bar, phones only.
        
        The primary job of this page is "get in touch with this business", and
        the Call button sat 598px down the page — gone the moment a visitor
        scrolled to the menu they came to read. Deciding to call happens AFTER
        reading, which is exactly when the button had disappeared.

        Hidden on sm: and up, where the header CTAs stay within reach, and only
        rendered when there is a number to call. pb-[env(safe-area-inset-bottom)]
        keeps it clear of the iPhone home indicator.
      */}
      {business?.phone && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="flex gap-2">
            <a
              href={telHref(String(business.phone))}
              onClick={() => trackContact('phone')}
              className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-blue-600 text-white text-sm font-semibold"
            >
              <Phone size={16} /> Call
            </a>
            {whatsappHref(String(business.phone), business.location, `Hi ${business.name}, I found you on NowOpen Africa and I'd like to make an enquiry.`) && (
              <a
                href={whatsappHref(String(business.phone), business.location, `Hi ${business.name}, I found you on NowOpen Africa and I'd like to make an enquiry.`)!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackContact('whatsapp')}
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-green-600 text-white text-sm font-semibold"
              >
                <MessageCircle size={16} /> WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {/* Clears the fixed bar so the last of the page is never trapped behind it. */}
      {business?.phone && <div aria-hidden="true" className="sm:hidden h-20" />}
    </div>
  );
}
