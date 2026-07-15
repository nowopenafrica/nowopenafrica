import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generateMediaServices, isSampleId } from '../data/populateData';
import { MediaService } from '../types';
import { ArrowLeft, Star, DollarSign, ShoppingBag, Clock, Users, Tag, Camera, Video, Music, Tv, Radio, Image as ImageIcon, CheckCircle, Phone, Mail, ExternalLink } from 'lucide-react';

export default function MediaDetail() {
  const { id } = useParams<{ id: string }>();
  const [service, setService] = useState<MediaService | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchService();
  }, [id]);

  const fetchService = async () => {
    try {
      // Sample ids (e.g. "media_service_7") come from the fallback data and
      // aren't valid uuids — skip the database lookup for them.
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
        // Fallback to mock data if not found in Supabase
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
      // Fallback to mock data on exception
      try {
        const mockServices = generateMediaServices(30);
        const mockService = mockServices.find(s => s.id === id);
        if (mockService) {
          setService(mockService);
        } else {
          setError('Failed to load media service');
        }
      } catch (fallbackErr) {
        setError('Failed to load media service');
      }
    } finally {
      setLoading(false);
    }
  };

  const getServiceIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'video':
      case 'film':
      case 'streaming':
        return <Video size={24} className="text-pink-600" />;
      case 'audio':
      case 'music':
      case 'podcast':
        return <Music size={24} className="text-pink-600" />;
      case 'photography':
      case 'photo':
        return <Camera size={24} className="text-pink-600" />;
      case 'broadcast':
      case 'radio':
        return <Radio size={24} className="text-pink-600" />;
      case 'tv':
      case 'television':
        return <Tv size={24} className="text-pink-600" />;
      default:
        return <ImageIcon size={24} className="text-pink-600" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading media service...</p>
        </div>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">{error || 'Media service not found'}</p>
          <Link
            to="/media"
            className="inline-flex items-center gap-2 text-pink-600 hover:text-pink-700 font-medium text-sm"
          >
            <ArrowLeft size={18} />
            Back to Media Services
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/media"
          className="inline-flex items-center gap-2 text-pink-600 hover:text-pink-700 font-medium text-sm mb-8"
        >
          <ArrowLeft size={18} />
          Back to Media Services
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - 2/3 width */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl overflow-hidden shadow-lg">
              {/* Hero Image/Video Preview */}
              <div className="relative h-96 bg-gray-200 overflow-hidden">
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
                <div className="absolute top-4 left-4">
                  <span className="bg-white/90 backdrop-blur-sm text-pink-600 px-4 py-2 rounded-lg font-medium text-sm shadow-lg">
                    {service.service_type}
                  </span>
                </div>
              </div>

              <div className="p-8">
                {/* Title and Rating */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                      {service.title}
                    </h1>
                    <div className="flex items-center gap-2 bg-yellow-50 px-4 py-2 rounded-lg">
                      <Star size={20} className="fill-yellow-400 text-yellow-400" />
                      <span className="font-bold text-gray-900">
                        {(service.rating || 0).toFixed(1)}
                      </span>
                      <span className="text-sm text-gray-600">
                        ({service.review_count || 0} reviews)
                      </span>
                    </div>
                  </div>
                  <p className="text-base text-gray-600 leading-relaxed">
                    {service.description}
                  </p>
                </div>

                {/* Service Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Service Information</h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <Tag size={20} className="text-pink-600 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-600">Service Type</p>
                          <p className="text-sm text-gray-900 capitalize">
                            {service.service_type}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <DollarSign size={20} className="text-pink-600 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-600">Pricing</p>
                          <p className="text-lg font-bold text-gray-900">
                            ${service.pricing?.toLocaleString() || '0'}
                          </p>
                          <p className="text-xs text-gray-600">
                            {service.pricing_model || 'per project'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Clock size={20} className="text-pink-600 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-600">Delivery Time</p>
                          <p className="text-sm text-gray-900">
                            {service.delivery_time || 'Not specified'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Users size={20} className="text-pink-600 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-600">Clients Served</p>
                          <p className="text-sm text-gray-900">
                            {service.clients_served || 0}
                          </p>
                        </div>
                      </div>

                      {service.equipment && (
                        <div className="flex items-start gap-3">
                          <ShoppingBag size={20} className="text-pink-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600">Equipment</p>
                            <p className="text-sm text-gray-900">{service.equipment}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Provider Information</h3>
                    <div className="bg-pink-50 rounded-lg p-4 border border-pink-200 mb-6">
                      <p className="text-sm text-gray-700 mb-3">
                        This media service is provided by a verified professional.
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-pink-200 rounded-full flex items-center justify-center">
                          <Users size={20} className="text-pink-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">Service Provider</p>
                          <p className="text-xs text-gray-600">Verified Professional</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Portfolio</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {service.portfolio_images && service.portfolio_images.length > 0 ? (
                          service.portfolio_images.slice(0, 4).map((img, idx) => (
                            <div key={idx} className="aspect-video bg-gray-200 rounded-lg overflow-hidden">
                              <img src={img} alt={`Portfolio ${idx + 1}`} className="w-full h-full object-cover" />
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 text-center py-8 text-gray-500 text-sm">
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
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Additional Information</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-700">{service.additional_info}</p>
                    </div>
                  </div>
                )}

                {/* Call to Action */}
                <div className="mt-8 pt-8 border-t border-gray-200">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link
                      to="/waitlist"
                      className="flex-1 px-6 py-3 bg-pink-600 text-white font-medium rounded-lg hover:bg-pink-700 transition text-sm flex items-center justify-center gap-2"
                    >
                      <ShoppingBag size={18} />
                      Book This Service
                    </Link>
                    <a
                      href={`mailto:hello@nowopen.africa?subject=${encodeURIComponent(`Service enquiry: ${service.title}`)}`}
                      className="flex-1 px-6 py-3 border-2 border-pink-600 text-pink-600 font-medium rounded-lg hover:bg-pink-50 transition text-sm flex items-center justify-center gap-2"
                    >
                      <Users size={18} />
                      Contact Provider
                    </a>
                  </div>
                  <p className="text-xs text-gray-500 mt-3 text-center sm:text-left">
                    Bookings open at launch — join the waitlist to hire this provider first.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar - 1/3 width */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl overflow-hidden shadow-lg sticky top-4">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Service Overview</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Price Range</span>
                    <span className="font-bold text-pink-600">
                      ${service.pricing?.toLocaleString() || '0'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Rating</span>
                    <div className="flex items-center gap-1">
                      <Star size={14} className="fill-yellow-400 text-yellow-400" />
                      <span className="font-bold text-gray-900">
                        {(service.rating || 0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Delivery</span>
                    <span className="text-sm text-gray-900">
                      {service.delivery_time || 'Varies'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Revisions</span>
                    <span className="text-sm text-gray-900">
                      {service.revisions || 'Unlimited'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Service Includes</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                    <span>High quality delivery</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                    <span>Fast turnaround</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                    <span>Unlimited revisions</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                    <span>24/7 support</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Contact Provider</h3>
                <div className="space-y-3">
                  <a
                    href={`mailto:hello@nowopen.africa?subject=${encodeURIComponent(`Service enquiry: ${service.title}`)}`}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition text-sm"
                  >
                    <Mail size={16} className="text-pink-600" />
                    <span className="text-gray-700">Send Message</span>
                  </a>
                  <Link
                    to="/waitlist"
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition text-sm"
                  >
                    <Phone size={16} className="text-pink-600" />
                    <span className="text-gray-700">Request a Quote</span>
                  </Link>
                  <Link
                    to="/media"
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition text-sm"
                  >
                    <ExternalLink size={16} className="text-pink-600" />
                    <span className="text-gray-700">Browse More Services</span>
                  </Link>
                </div>
              </div>

              <div className="border-t border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-pink-100 text-pink-700 text-xs rounded-full">Professional</span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">High Quality</span>
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded-full">Fast Delivery</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
