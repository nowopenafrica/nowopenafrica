import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import PaymentModal from '../components/PaymentModal';
import PlatformEnquiryModal from '../components/PlatformEnquiryModal';
import { generateMediaServices, isSampleId } from '../data/populateData';
import { MediaService } from '../types';
import { applySeo } from '../lib/seo';
import {
  ArrowLeft, Star, DollarSign, ShoppingBag, Clock, Users, Tag, Camera, Video, Music, Tv, Radio,
  Image as ImageIcon, CheckCircle, Mail, ExternalLink, X, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';

interface MediaReview {
  id: string;
  author_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
  user_id: string;
}

export default function MediaDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { format, formatUsd, currency } = useCurrency();
  const [service, setService] = useState<MediaService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState<'contact' | 'quote' | null>(null);
  const [reviews, setReviews] = useState<MediaReview[]>([]);
  const [similar, setSimilar] = useState<MediaService[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const isSample = id ? isSampleId(id) : false;

  useEffect(() => {
    if (!service) return undefined;
    if (isSample) {
      return applySeo({
        title: 'Creative Services in Africa — NowOpen Africa',
        description: 'Hire vetted photographers, videographers, designers and creative studios across Africa.',
        path: window.location.pathname,
        robots: 'noindex, nofollow',
      });
    }
    const title = `${service.title} — Creative Services in Africa | NowOpen Africa`;
    return applySeo({
      title,
      description:
        (service.description ?? '').trim().slice(0, 300) ||
        `${service.title} — a ${service.service_type ?? 'creative service'} offered on NowOpen Africa.`,
      path: `/media/${service.id}`,
      image: service.thumbnail_url || service.image_url || '/og-image.png',
      type: 'profile',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: service.title,
        description: (service.description ?? '').trim().slice(0, 300) || title,
        serviceType: service.service_type ?? 'Creative Service',
        provider: { '@type': 'Organization', name: 'NowOpen Africa' },
      },
    });
  }, [service, isSample]);

  const fetchService = useCallback(async () => {
    try {
      let data = null;
      if (!isSampleId(id!)) {
        const { data: dbData, error: supabaseError } = await supabase
          .from('media_services')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (supabaseError) {
          console.warn('Supabase fetch failed, falling back to mock data:', supabaseError.message);
        }
        data = dbData;
      }

      if (data) {
        setService(data);
      } else {
        const mockServices = generateMediaServices(30);
        const mockService = mockServices.find(s => s.id === id);
        if (mockService) {
          setService(mockService);
        } else {
          setError('Media service not found');
        }
      }
    } catch (err) {
      console.error('Error fetching media service:', err);
      try {
        const mockServices = generateMediaServices(30);
        const mockService = mockServices.find(s => s.id === id);
        if (mockService) {
          setService(mockService);
        } else {
          setError('Failed to load media service');
        }
      } catch {
        setError('Failed to load media service');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchReviews = useCallback(async (serviceId: string) => {
    const { data } = await supabase
      .from('media_reviews')
      .select('*')
      .eq('media_service_id', serviceId)
      .order('created_at', { ascending: false });
    setReviews(data || []);
  }, []);

  useEffect(() => {
    if (id) fetchService();
    // Reset review-form state when navigating to a different service (e.g.
    // via a Similar Services link) — React Router reuses this component
    // instance across param changes, so without this the previous
    // service's in-progress rating/comment would bleed into the new one.
    setReviewRating(0);
    setReviewComment('');
    setReviews([]);
  }, [id, fetchService]);

  useEffect(() => {
    if (service && !isSampleId(String(service.id))) {
      fetchReviews(String(service.id));
    }
  }, [service, fetchReviews]);

  useEffect(() => {
    if (!service) return;
    if (isSampleId(String(service.id))) {
      const pool = generateMediaServices(30).filter(s => s.id !== service.id && s.service_type === service.service_type);
      setSimilar(pool.slice(0, 4));
      return;
    }
    supabase
      .from('media_services')
      .select('*')
      .eq('service_type', service.service_type)
      .neq('id', service.id)
      .limit(4)
      .then(({ data }) => setSimilar(data || []));
  }, [service]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxIndex(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIndex]);

  const myReview = reviews.find(r => r.user_id === user?.id);

  // Prefill the form once an existing review is found, so editing doesn't
  // start from a blank slate — but only ever runs once per review (not on
  // every keystroke), otherwise it'd fight the user's own edits.
  useEffect(() => {
    if (myReview) {
      setReviewRating(myReview.rating);
      setReviewComment(myReview.comment || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myReview?.id]);

  const handleSubmitReview = async () => {
    if (!user || !service) return;
    if (reviewRating < 1) { toast.error('Pick a star rating first'); return; }
    setSubmittingReview(true);
    try {
      const { error: upsertError } = await supabase.from('media_reviews').upsert(
        [{
          media_service_id: service.id,
          user_id: user.id,
          author_name: (user.email || 'NowOpen user').split('@')[0],
          rating: reviewRating,
          comment: reviewComment.trim() || null,
        }],
        { onConflict: 'media_service_id,user_id' }
      );
      if (upsertError) throw upsertError;
      toast.success(myReview ? 'Review updated' : 'Review posted — thank you!');
      setReviewRating(0);
      setReviewComment('');
      await fetchReviews(String(service.id));
      const { data: fresh } = await supabase.from('media_services').select('rating, review_count').eq('id', service.id).maybeSingle();
      if (fresh) setService(prev => prev ? { ...prev, rating: fresh.rating, review_count: fresh.review_count } : prev);
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

  const getServiceIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'video':
      case 'film':
      case 'streaming':
        return <Video size={24} className="text-pink-600 dark:text-pink-400" />;
      case 'audio':
      case 'music':
      case 'podcast':
        return <Music size={24} className="text-pink-600 dark:text-pink-400" />;
      case 'photography':
      case 'photo':
        return <Camera size={24} className="text-pink-600 dark:text-pink-400" />;
      case 'broadcast':
      case 'radio':
        return <Radio size={24} className="text-pink-600 dark:text-pink-400" />;
      case 'tv':
      case 'television':
        return <Tv size={24} className="text-pink-600 dark:text-pink-400" />;
      default:
        return <ImageIcon size={24} className="text-pink-600 dark:text-pink-400" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading media service...</p>
        </div>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error || 'Media service not found'}</p>
          <Link
            to="/media"
            className="inline-flex items-center gap-2 text-pink-600 dark:text-pink-400 hover:text-pink-700 font-medium text-sm"
          >
            <ArrowLeft size={18} />
            Back to Media Services
          </Link>
        </div>
      </div>
    );
  }

  const portfolio = service.portfolio_images || [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/media"
          className="inline-flex items-center gap-2 text-pink-600 dark:text-pink-400 hover:text-pink-700 font-medium text-sm mb-8"
        >
          <ArrowLeft size={18} />
          Back to Media Services
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - 2/3 width */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-lg">
              {/* Hero Image/Video Preview */}
              <div className="relative h-48 sm:h-72 md:h-96 bg-gray-200 dark:bg-gray-700 overflow-hidden">
                {service.thumbnail_url || service.image_url ? (
                  <img
                    src={service.thumbnail_url || service.image_url}
                    alt={service.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center">
                    {getServiceIcon(service.service_type)}
                  </div>
                )}

                {/* Service Type Badge */}
                <div className="absolute top-2 left-2 sm:top-4 sm:left-4">
                  <span className="bg-white/90 backdrop-blur-sm text-pink-600 dark:text-pink-400 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg font-medium text-xs sm:text-sm shadow-lg">
                    {service.service_type}
                  </span>
                </div>
              </div>

              <div className="p-4 sm:p-6 md:p-8">
                {/* Title and Rating */}
                <div className="mb-8">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
                      {service.title}
                    </h1>
                    <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/30 px-4 py-2 rounded-lg flex-shrink-0">
                      <Star size={20} className="fill-yellow-400 text-yellow-400" />
                      <span className="font-bold text-gray-900 dark:text-white">
                        {(service.rating || 0).toFixed(1)}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        ({service.review_count || 0} reviews)
                      </span>
                    </div>
                  </div>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
                    {service.description}
                  </p>
                </div>

                {/* Highlights strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-8">
                  {[
                    { icon: Star, label: 'Rating', value: `${(service.rating || 0).toFixed(1)}` },
                    { icon: Clock, label: 'Delivery', value: service.delivery_time || 'Varies' },
                    { icon: Users, label: 'Clients served', value: String(service.clients_served || 0) },
                    { icon: CheckCircle, label: 'Revisions', value: String(service.revisions ?? 'Flexible') },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="rounded-xl border border-pink-100 dark:border-pink-900/40 bg-pink-50/50 dark:bg-pink-900/15 p-3 text-center">
                      <Icon size={18} className="mx-auto text-pink-600 dark:text-pink-400" />
                      <p className="mt-1.5 text-sm font-bold text-gray-900 dark:text-white truncate">{value}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Service Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-8">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Service Information</h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <Tag size={20} className="text-pink-600 dark:text-pink-400 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Service Type</p>
                          <p className="text-sm text-gray-900 dark:text-white capitalize">
                            {service.service_type}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <DollarSign size={20} className="text-pink-600 dark:text-pink-400 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Pricing</p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {format(service.pricing || 0)}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {service.pricing_model || 'per project'}
                            {currency !== 'USD' && ` · ${formatUsd(service.pricing || 0)} USD`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Clock size={20} className="text-pink-600 dark:text-pink-400 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Delivery Time</p>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {service.delivery_time || 'Not specified'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Users size={20} className="text-pink-600 dark:text-pink-400 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Clients Served</p>
                          <p className="text-sm text-gray-900 dark:text-white">
                            {service.clients_served || 0}
                          </p>
                        </div>
                      </div>

                      {service.equipment && (
                        <div className="flex items-start gap-3">
                          <ShoppingBag size={20} className="text-pink-600 dark:text-pink-400 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Equipment</p>
                            <p className="text-sm text-gray-900 dark:text-white">{service.equipment}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Provider Information</h3>
                    <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-4 border border-pink-200 dark:border-pink-800 mb-6">
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                        Listed on NowOpen Africa — providers are vetted before bookings open.
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-pink-200 dark:bg-pink-800 rounded-full flex items-center justify-center">
                          <Users size={20} className="text-pink-600 dark:text-pink-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Service Provider</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">Creative professional on NowOpen</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Portfolio</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {portfolio.length > 0 ? (
                          portfolio.slice(0, 4).map((img, idx) => (
                            <button
                              key={idx}
                              onClick={() => setLightboxIndex(idx)}
                              className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden group"
                            >
                              <img src={img} alt={`Portfolio ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                            </button>
                          ))
                        ) : (
                          <div className="col-span-2 text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                            No portfolio images available
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Details */}
                {service.additional_info && (
                  <div className="mb-8">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Additional Information</h3>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                      <p className="text-sm text-gray-700 dark:text-gray-300">{service.additional_info}</p>
                    </div>
                  </div>
                )}

                {/* Call to Action */}
                <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <button
                      onClick={() => setCheckoutOpen(true)}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-pink-600 text-white font-medium rounded-lg hover:bg-pink-700 transition text-sm flex items-center justify-center gap-2"
                    >
                      <ShoppingBag size={18} />
                      Book This Service
                    </button>
                    <button
                      onClick={() => setEnquiryOpen('contact')}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border-2 border-pink-600 text-pink-600 dark:text-pink-400 font-medium rounded-lg hover:bg-pink-50 dark:hover:bg-pink-900/20 transition text-sm flex items-center justify-center gap-2"
                    >
                      <Users size={18} />
                      Contact Provider
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center sm:text-left">
                    Reserve this provider now — you approve before any payment is taken.
                  </p>
                </div>

                {/* Reviews */}
                <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-4">
                    Reviews {reviews.length > 0 && `(${reviews.length})`}
                  </h2>

                  {user && !isSample && (
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                        {myReview ? 'Update your review' : 'Leave a review'}
                      </p>
                      <div className="flex items-center gap-1 mb-3">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button key={star} type="button" onClick={() => setReviewRating(star)}>
                            <Star
                              size={22}
                              className={star <= reviewRating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}
                            />
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={2}
                        maxLength={2000}
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        placeholder="Share your experience with this provider (optional)"
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent mb-3"
                      />
                      <button
                        onClick={handleSubmitReview}
                        disabled={submittingReview}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 transition disabled:opacity-50"
                      >
                        {submittingReview && <Loader2 size={14} className="animate-spin" />}
                        {myReview ? 'Update Review' : 'Post Review'}
                      </button>
                    </div>
                  )}

                  {reviews.length > 0 ? (
                    <div className="space-y-4">
                      {reviews.map((r) => (
                        <div key={r.id} className="border-b border-gray-100 dark:border-gray-800 pb-4 last:border-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{r.author_name}</p>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-0.5 mb-1.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star key={star} size={13} className={star <= r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'} />
                            ))}
                          </div>
                          {r.comment && <p className="text-sm text-gray-700 dark:text-gray-300">{r.comment}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No reviews yet — be the first to share your experience.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Similar Services */}
            {similar.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 mt-6">
                <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-4">Similar Services</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {similar.map((s) => (
                    <Link
                      key={s.id}
                      to={`/media/${s.id}`}
                      className="flex gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-700 transition"
                    >
                      <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0 overflow-hidden">
                        {(s.thumbnail_url || s.image_url) && <img src={s.thumbnail_url || s.image_url} alt={s.title} className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate capitalize">{s.service_type}</p>
                        {s.pricing != null && <p className="text-xs font-semibold text-pink-600 dark:text-pink-400 mt-0.5">{format(s.pricing)}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - 1/3 width */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-lg sticky top-4">
              <div className="p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Service Overview</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Price</span>
                    <span className="font-bold text-pink-600 dark:text-pink-400">
                      {format(service.pricing || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Rating</span>
                    <div className="flex items-center gap-1">
                      <Star size={14} className="fill-yellow-400 text-yellow-400" />
                      <span className="font-bold text-gray-900 dark:text-white">
                        {(service.rating || 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Delivery</span>
                    <span className="text-sm text-gray-900 dark:text-white">
                      {service.delivery_time || 'Varies'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Revisions</span>
                    <span className="text-sm text-gray-900 dark:text-white">
                      {service.revisions || 'Not specified'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Booking Includes</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <CheckCircle size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span>Secure payment through NowOpen</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <CheckCircle size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span>Direct messaging with the provider</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <CheckCircle size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span>Dispute support from our team</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Contact Provider</h3>
                <div className="space-y-3">
                  <button
                    onClick={() => setEnquiryOpen('contact')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
                  >
                    <Mail size={16} className="text-pink-600 dark:text-pink-400" />
                    <span className="text-gray-700 dark:text-gray-300">Send Message</span>
                  </button>
                  <button
                    onClick={() => setEnquiryOpen('quote')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
                  >
                    <DollarSign size={16} className="text-pink-600 dark:text-pink-400" />
                    <span className="text-gray-700 dark:text-gray-300">Request a Quote</span>
                  </button>
                  <Link
                    to="/media"
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition text-sm"
                  >
                    <ExternalLink size={16} className="text-pink-600 dark:text-pink-400" />
                    <span className="text-gray-700 dark:text-gray-300">Browse More Services</span>
                  </Link>
                </div>
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-3 sm:mb-4">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 text-xs rounded-full capitalize">{service.service_type}</span>
                  {service.category && (
                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs rounded-full">{service.category}</span>
                  )}
                  {service.pricing_model && (
                    <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full capitalize">{service.pricing_model}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {checkoutOpen && (
        <PaymentModal
          item={{
            kind: 'service_booking',
            itemId: String(service.id),
            title: service.title,
            amountUsd: service.pricing || 0,
            amountNote: service.pricing_model || 'per project',
          }}
          onClose={() => setCheckoutOpen(false)}
        />
      )}

      {enquiryOpen && (
        <PlatformEnquiryModal
          kind="media_service"
          itemId={String(service.id)}
          itemTitle={service.title}
          subjectPrefix={enquiryOpen === 'quote' ? 'Quote request' : 'Service enquiry'}
          onClose={() => setEnquiryOpen(null)}
        />
      )}

      {lightboxIndex !== null && portfolio[lightboxIndex] && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setLightboxIndex(null)}
            aria-label="Close"
            className="absolute top-4 right-4 text-white/80 hover:text-white transition"
          >
            <X size={28} />
          </button>
          {portfolio.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => ((i! - 1 + portfolio.length) % portfolio.length)); }}
              aria-label="Previous image"
              className="absolute left-2 sm:left-4 text-white/80 hover:text-white transition p-2"
            >
              <ChevronLeft size={32} />
            </button>
          )}
          <img
            src={portfolio[lightboxIndex]}
            alt={`Portfolio ${lightboxIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          {portfolio.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(i => ((i! + 1) % portfolio.length)); }}
              aria-label="Next image"
              className="absolute right-2 sm:right-4 text-white/80 hover:text-white transition p-2"
            >
              <ChevronRight size={32} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
