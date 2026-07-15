import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, DollarSign, Calendar, Eye, Star, ChevronLeft, Phone, Share2, Heart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateAdverts, isSampleId } from '../data/populateData';
import { Advertisement } from '../types';

export default function AdvertDetail() {
  const { id } = useParams<{ id: string }>();
  const [advert, setAdvert] = useState<Advertisement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchAdvert();
    }
  }, [id]);

  const fetchAdvert = async () => {
    try {
      setLoading(true);
      setError(null);

      // Sample ids (e.g. "advert_5") come from the fallback data on the
      // homepage — resolve them locally instead of querying the database.
      if (isSampleId(id!)) {
        const sample = generateAdverts().find(a => a.id === id);
        if (!sample) throw new Error('Advert not found');
        setAdvert(sample as Advertisement);
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
    } catch (err: any) {
      console.error('Error fetching advert:', err);
      setError(err.message || 'Failed to load advert details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading advert details...</p>
        </div>
      </div>
    );
  }

  if (error || !advert) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <Eye size={32} className="text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Advert Not Found</h2>
          <p className="text-gray-600 mb-6">{error || 'The advert you are looking for does not exist.'}</p>
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm text-gray-600">
            <Link to="/adverts" className="hover:text-blue-600 flex items-center gap-1">
              <ChevronLeft size={16} />
              Adverts
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-medium line-clamp-1">{advert.title}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {advert.image_url ? (
                <img
                  src={advert.image_url}
                  alt={advert.title}
                  className="w-full h-96 object-cover"
                />
              ) : (
                <div className="w-full h-96 bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center">
                  <Eye size={64} className="text-white/50" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  {advert.category && (
                    <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full mb-2">
                      {advert.category}
                    </span>
                  )}
                  <h1 className="text-2xl font-bold text-gray-900">{advert.title}</h1>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                    <Share2 size={18} className="text-gray-600" />
                  </button>
                  <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                    <Heart size={18} className="text-gray-600" />
                  </button>
                </div>
              </div>

              <p className="text-gray-600 mb-6">{advert.description}</p>

              <div className="grid grid-cols-2 gap-4">
                {advert.location && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <MapPin size={20} className="text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Location</p>
                      <p className="font-medium text-gray-900">{advert.location}</p>
                    </div>
                  </div>
                )}
                {advert.pricing && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <DollarSign size={20} className="text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Price per day</p>
                      <p className="font-medium text-gray-900">${advert.pricing.toLocaleString()}</p>
                    </div>
                  </div>
                )}
                {advert.dimensions && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Eye size={20} className="text-purple-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Dimensions</p>
                      <p className="font-medium text-gray-900">{advert.dimensions}</p>
                    </div>
                  </div>
                )}
                {advert.traffic_density && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Star size={20} className="text-yellow-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Traffic Density</p>
                      <p className="font-medium text-gray-900 capitalize">{advert.traffic_density}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Additional Info */}
            {(advert.duration || advert.available_until) && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Availability</h2>
                <div className="space-y-3">
                  {advert.duration && (
                    <div className="flex items-center gap-3">
                      <Calendar size={18} className="text-gray-400" />
                      <span className="text-gray-600">Duration: <span className="font-medium text-gray-900">{advert.duration} days</span></span>
                    </div>
                  )}
                  {advert.available_until && (
                    <div className="flex items-center gap-3">
                      <Calendar size={18} className="text-gray-400" />
                      <span className="text-gray-600">Available until: <span className="font-medium text-gray-900">{new Date(advert.available_until).toLocaleDateString()}</span></span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="text-center mb-6">
                <span className={`inline-block px-4 py-2 rounded-full text-sm font-medium ${
                  advert.status === 'active' ? 'bg-green-100 text-green-700' :
                  advert.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {(advert.status || 'active').charAt(0).toUpperCase() + (advert.status || 'active').slice(1)}
                </span>
              </div>

              {advert.pricing && (
                <div className="text-center mb-6 pb-6 border-b border-gray-100">
                  <p className="text-3xl font-bold text-gray-900 mb-1">
                    ${advert.pricing.toLocaleString()}
                  </p>
                  <p className="text-gray-600">per day</p>
                  <p className="text-xs text-gray-500 mt-2">
                    ≈ ${(Number(advert.pricing) * 30).toLocaleString()} for a 30-day campaign
                  </p>
                </div>
              )}

              <Link
                to="/waitlist"
                className="block text-center w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition mb-3"
              >
                Book This Placement
              </Link>
              <a
                href={`mailto:hello@nowopen.africa?subject=${encodeURIComponent(`Placement enquiry: ${advert.title}`)}`}
                className="block text-center w-full px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
              >
                Contact Owner
              </a>
              <p className="text-xs text-gray-500 text-center mt-3">
                Bookings open at launch — join the waitlist to reserve this placement first.
              </p>
            </div>

            {/* Trust signals */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Why book with NowOpen</h3>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start gap-3">
                  <Star size={18} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span>Every placement is verified on-site before it's listed</span>
                </div>
                <div className="flex items-start gap-3">
                  <DollarSign size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Payments held securely until your campaign goes live</span>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <span>Free cancellation up to 7 days before your start date</span>
                </div>
                <div className="flex items-start gap-3">
                  <Phone size={18} className="text-purple-600 mt-0.5 flex-shrink-0" />
                  <span>Local support team in your market, on WhatsApp</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
