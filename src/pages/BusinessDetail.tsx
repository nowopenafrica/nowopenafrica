import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generateBusinesses, isSampleId } from '../data/populateData';
import VerifiedBadge from '../components/VerifiedBadge';
import { ArrowLeft, ShoppingBag, Clock, MapPin, Phone, Mail, Globe, Star, Tag, Image, Grid, Package, Users2, Navigation } from 'lucide-react';

interface TabConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
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

export default function BusinessDetail() {
  // Reached via /businesses/:id (uuid or sample id) or /business/:username
  const { id, username } = useParams<{ id?: string; username?: string }>();
  const [business, setBusiness] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

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
        if (sample) {
          setBusiness({
            ...sample,
            services: 'Web Development, Mobile App Development, UI/UX Design',
            opening_hours: 'Mon-Fri: 9AM-6PM, Sat: 10AM-4PM',
            email: 'contact@business.com',
          });
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
          email: 'contact@business.com',
        });
      } else {
        console.error('Business not found:', id);
      }
    } catch (err) {
      console.error('Error fetching business:', err);
    } finally {
      setLoading(false);
    }
  };

  const tabs: TabConfig[] = [
    { id: 'overview', label: 'Overview', icon: <Grid size={18} /> },
    { id: 'services', label: 'Services', icon: <ShoppingBag size={18} /> },
    { id: 'products', label: 'Products', icon: <Package size={18} /> },
    { id: 'gallery', label: 'Gallery', icon: <Image size={18} /> },
    { id: 'reviews', label: 'Reviews', icon: <Star size={18} /> },
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Business not found</p>
          <a
            href="/businesses"
            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
          >
            Back to Businesses
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <a
            href="/businesses"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
          >
            <ArrowLeft size={18} />
            Back to Businesses
          </a>
        </div>

        {/* Business Header - Behance-inspired */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8">
          {/* Cover Image */}
          <div className="relative h-96 bg-gray-200 overflow-hidden">
            {business.image_url ? (
              <img
                src={business.image_url}
                alt={business.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
            )}

            {/* Business Logo */}
            <div className="absolute -bottom-16 left-8">
              <div className="relative">
                <div className="w-32 h-32 bg-gray-300 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                  {business.logo_url ? (
                    <img
                      src={business.logo_url}
                      alt={business.name}
                      className="w-28 h-28 rounded-full object-cover"
                    />
                  ) : (
                    <ShoppingBag size={40} className="text-blue-600" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Business Content */}
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                    {business.name}
                  </h1>
                  {business.verified && <VerifiedBadge size={18} />}
                </div>
                <p className="text-lg text-gray-600">{business.description}</p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 mb-1">
                  <Star size={18} className="fill-yellow-400 text-yellow-400" />
                  <span className="text-xl font-bold text-gray-900">
                    {business.rating ? business.rating.toFixed(1) : '0.0'}
                  </span>
                </div>
                <p className="text-sm text-gray-600">Rating</p>
              </div>
            </div>

            {/* Business Status & Quick Info */}
            <div className="flex items-center gap-6 text-sm flex-wrap">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  business.status === 'open' ? 'bg-green-500' : 'bg-gray-400'
                }`} />
                <span className={business.status === 'open' ? 'text-green-600 font-medium' : 'text-gray-600'}>
                  {business.status === 'open' ? 'Open' : 'Closed'}
                </span>
              </div>
              {business.category && (
                <div className="flex items-center gap-2">
                  <Tag size={16} className="text-gray-500" />
                  <span className="text-gray-700">{business.category}</span>
                </div>
              )}
              {business.location && (
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-gray-500" />
                  <span className="text-gray-700">{business.location}</span>
                </div>
              )}
            </div>

            {/* CTA row */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              {business.phone && (
                <a
                  href={`tel:${String(business.phone).replace(/\s/g, '')}`}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm"
                >
                  <Phone size={16} />
                  Call Business
                </a>
              )}
              <a
                href={`mailto:${business.email || 'hello@nowopen.africa'}?subject=${encodeURIComponent(`Enquiry via NowOpen Africa: ${business.name}`)}`}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition text-sm"
              >
                <Mail size={16} />
                Send Enquiry
              </a>
              {business.website && (
                <a
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition text-sm"
                >
                  <Globe size={16} />
                  Visit Website
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div className="bg-white rounded-2xl shadow-xl mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-2 px-6" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 py-4 px-6 text-sm font-medium rounded-t-lg transition-all duration-200
                    ${
                      activeTab === tab.id
                        ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                        : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                    }
                  `}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="animate-fadeIn">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Business Overview</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Information</h3>
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <ShoppingBag size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-gray-600">Business Name</p>
                          <p className="text-sm text-gray-900">{business.name}</p>
                        </div>
                      </div>
                      {business.location && (
                        <div className="flex items-start gap-3">
                          <MapPin size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600">Location</p>
                            <p className="text-sm text-gray-900">{business.location}</p>
                          </div>
                        </div>
                      )}
                      {business.phone && (
                        <div className="flex items-start gap-3">
                          <Phone size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600">Phone</p>
                            <p className="text-sm text-gray-900">{business.phone}</p>
                          </div>
                        </div>
                      )}
                      {business.email && (
                        <div className="flex items-start gap-3">
                          <Mail size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600">Email</p>
                            <p className="text-sm text-gray-900">{business.email}</p>
                          </div>
                        </div>
                      )}
                      {business.website && (
                        <div className="flex items-start gap-3">
                          <Globe size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600">Website</p>
                            <p className="text-sm text-gray-900">
                              <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
                                {business.website}
                              </a>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Details</h3>
                    <div className="space-y-3">
                      {business.category && (
                        <div>
                          <p className="text-xs font-medium text-gray-600">Category</p>
                          <p className="text-sm text-gray-900">{business.category}</p>
                        </div>
                      )}
                      {business.services && (
                        <div>
                          <p className="text-xs font-medium text-gray-600">Services</p>
                          <p className="text-sm text-gray-900">{business.services}</p>
                        </div>
                      )}
                      {business.opening_hours && (
                        <div>
                          <p className="text-xs font-medium text-gray-600">Opening Hours</p>
                          <p className="text-sm text-gray-900">{business.opening_hours}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Statistics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">{sampleReviews.length}</div>
                    <p className="text-xs text-gray-600">Reviews</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">{sampleProducts.length}</div>
                    <p className="text-xs text-gray-600">Products</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-pink-600">{sampleServices.length}</div>
                    <p className="text-xs text-gray-600">Services</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{sampleGallery.length}</div>
                    <p className="text-xs text-gray-600">Photos</p>
                  </div>
                </div>

                {/* Location map */}
                {business.location && (
                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <MapPin size={20} className="text-blue-600" />
                        Location
                      </h3>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                      >
                        <Navigation size={16} />
                        Get Directions
                      </a>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{business.location}</p>
                    <div className="rounded-xl overflow-hidden border border-gray-200 h-72">
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

            {/* Services Tab */}
            {activeTab === 'services' && (
              <div className="animate-fadeIn">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Services</h2>
                
                <div className="space-y-4">
                  {sampleServices.map((service) => (
                    <div key={service.id} className="flex items-center gap-3 bg-blue-50 p-4 rounded-lg">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Tag size={20} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium text-gray-900">{service.name}</h4>
                          <span className="text-sm font-medium text-blue-600">{service.price}</span>
                        </div>
                        <p className="text-sm text-gray-600">{service.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Products Tab */}
            {activeTab === 'products' && (
              <div className="animate-fadeIn">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Our Products</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sampleProducts.map((product) => (
                    <div key={product.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                      <img 
                        src={product.image} 
                        alt={product.name}
                        className="w-full h-48 object-cover"
                      />
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-2">{product.name}</h3>
                        <p className="text-sm text-gray-600 mb-3">{product.description}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold text-blue-600">{product.price}</span>
                          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                            Add to Cart
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gallery Tab */}
            {activeTab === 'gallery' && (
              <div className="animate-fadeIn">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Photo Gallery</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sampleGallery.map((image, index) => (
                    <div key={index} className="bg-gray-200 rounded-lg overflow-hidden group cursor-pointer">
                      <img 
                        src={image} 
                        alt={`Gallery ${index + 1}`} 
                        className="w-full h-48 object-cover group-hover:scale-105 transition duration-300"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
              <div className="animate-fadeIn">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">Customer Reviews</h2>
                  <div className="flex items-center gap-1">
                    <Star size={20} className="fill-yellow-400 text-yellow-400" />
                    <span className="text-lg font-bold text-gray-900">
                      {business.rating ? business.rating.toFixed(1) : '0.0'}
                    </span>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {sampleReviews.map((review) => (
                    <div key={review.id} className="border-b border-gray-200 pb-6">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                          <Users2 size={20} className="text-gray-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-gray-900">{review.author}</h4>
                            <span className="text-sm text-gray-600">{review.date}</span>
                          </div>
                          <div className="flex items-center gap-1 mb-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star 
                                key={star} 
                                size={16} 
                                className={star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} 
                              />
                            ))}
                          </div>
                          <p className="text-gray-700">{review.comment}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <button className="mt-6 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition">
                  Write a Review
                </button>
              </div>
            )}

            {/* Contact Tab */}
            {activeTab === 'contact' && (
              <div className="animate-fadeIn">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Contact Information</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Get in Touch</h3>
                    <div className="space-y-4">
                      {business.location && (
                        <div className="flex items-start gap-3">
                          <MapPin size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600">Address</p>
                            <p className="text-sm text-gray-900">{business.location}</p>
                          </div>
                        </div>
                      )}
                      {business.phone && (
                        <div className="flex items-start gap-3">
                          <Phone size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600">Phone</p>
                            <p className="text-sm text-gray-900">{business.phone}</p>
                          </div>
                        </div>
                      )}
                      {business.email && (
                        <div className="flex items-start gap-3">
                          <Mail size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600">Email</p>
                            <p className="text-sm text-gray-900">{business.email}</p>
                          </div>
                        </div>
                      )}
                      {business.website && (
                        <div className="flex items-start gap-3">
                          <Globe size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-gray-600">Website</p>
                            <p className="text-sm text-gray-900">
                              <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
                                {business.website}
                              </a>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Hours</h3>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock size={16} className="text-gray-600" />
                        <p className="text-xs font-medium text-gray-600">Operating Hours</p>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-700">Monday - Friday</span>
                          <span className="text-gray-900">9:00 AM - 6:00 PM</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-700">Saturday</span>
                          <span className="text-gray-900">10:00 AM - 4:00 PM</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-700">Sunday</span>
                          <span className="text-gray-900">Closed</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Map */}
                {business.location && (
                  <div className="mt-8">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <MapPin size={20} className="text-blue-600" />
                        Find us
                      </h3>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                      >
                        <Navigation size={16} />
                        Get Directions
                      </a>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-gray-200 h-80">
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
    </div>
  );
}
