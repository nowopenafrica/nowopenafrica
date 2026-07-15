import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generateMediaServices } from '../data/populateData';
import { MediaService } from '../types';
import { Star, DollarSign, Search, ShoppingBag, Video, Camera, Music } from 'lucide-react';

export default function Media() {
  const [services, setServices] = useState<MediaService[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const { data, error } = await supabase
          .from('media_services')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Fall back to sample data while the database is empty
        setServices(data && data.length > 0 ? data : generateMediaServices(30));
      } catch (err) {
        console.error('Error fetching media services, showing sample data:', err);
        setServices(generateMediaServices(30));
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  }, []);

  const serviceTypes = [...new Set(services.map(s => s.service_type))];
  let filteredServices = filter
    ? services.filter(s => s.service_type === filter)
    : services;

  if (location.trim()) {
    filteredServices = filteredServices.filter(s =>
      s.title.toLowerCase().includes(location.toLowerCase()) ||
      s.description.toLowerCase().includes(location.toLowerCase())
    );
  }

  if (search.trim()) {
    const searchLower = search.toLowerCase();
    filteredServices = filteredServices.filter(s =>
      s.title.toLowerCase().includes(searchLower) ||
      s.description.toLowerCase().includes(searchLower)
    );
  }

  const getServiceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'video':
      case 'film':
        return <Video size={20} className="text-pink-600" />;
      case 'photography':
      case 'photo':
        return <Camera size={20} className="text-pink-600" />;
      case 'audio':
      case 'music':
        return <Music size={20} className="text-pink-600" />;
      default:
        return <ShoppingBag size={20} className="text-pink-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
          Media Marketplace & Services
        </h1>

        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search services by title or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              />
            </div>

            <div className="relative">
              <ShoppingBag className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Filter by business name..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              />
            </div>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
            >
              <option value="">All Categories</option>
              {serviceTypes.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading services...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            {filteredServices.map(service => (
              <Link
                key={service.id}
                to={`/media/${service.id}`}
                className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-pink-300 transition"
              >
                <div className="h-24 overflow-hidden">
                  {service.thumbnail_url || service.image_url ? (
                    <img
                      src={service.thumbnail_url || service.image_url}
                      alt={service.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center">
                      {getServiceIcon(service.service_type)}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs text-pink-600 font-medium mb-1 flex items-center gap-1">
                    {getServiceIcon(service.service_type)}
                    <span>{service.service_type}</span>
                  </p>
                  <h3 className="font-bold text-gray-900 mb-1 line-clamp-2 text-sm">
                    {service.title}
                  </h3>
                  <p className="text-xs text-gray-600 line-clamp-2 mb-3">
                    {service.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Star size={14} className="fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-medium text-gray-900">
                        {(service.rating || 0).toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-pink-600 font-bold">
                      <DollarSign size={14} />
                      <span className="text-sm">${service.pricing || 0}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loading && filteredServices.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No services found</p>
          </div>
        )}
      </div>
    </div>
  );
}
