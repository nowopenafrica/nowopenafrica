import { useState, useEffect } from 'react';
    import { Link } from 'react-router-dom';
    import { supabase } from '../lib/supabase';
    import { generateBusinesses } from '../data/populateData';
    import { Search, MapPin, Star, Phone, Globe } from 'lucide-react';
import VerifiedBadge from '../components/VerifiedBadge';

    export default function Businesses() {
      const [businesses, setBusinesses] = useState<any[]>([]);
      const [loading, setLoading] = useState(true);
      const [filter, setFilter] = useState('');
      const [search, setSearch] = useState('');
      const [location, setLocation] = useState('');

      useEffect(() => {
        const fetchBusinesses = async () => {
          try {
            const { data, error } = await supabase
              .from('businesses')
              .select('*')
              .order('created_at', { ascending: false });

            if (error) throw error;

            // Fall back to sample data while the database is empty
            setBusinesses(data && data.length > 0 ? data : generateBusinesses(30));
          } catch (err) {
            console.error('Error fetching businesses, showing sample data:', err);
            setBusinesses(generateBusinesses(30));
          } finally {
            setLoading(false);
          }
        };
        fetchBusinesses();
      }, []);

      const categories = [...new Set(businesses.map(b => b.category))];
      let filteredBusinesses = filter
        ? businesses.filter(b => b.category === filter)
        : businesses;

      if (location.trim()) {
        filteredBusinesses = filteredBusinesses.filter(b =>
          b.location.toLowerCase().includes(location.toLowerCase())
        );
      }

      if (search.trim()) {
        const searchLower = search.toLowerCase();
        filteredBusinesses = filteredBusinesses.filter(b =>
          b.name.toLowerCase().includes(searchLower) ||
          b.description.toLowerCase().includes(searchLower)
        );
      }

      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
              Discover African Businesses
            </h1>

            <div className="mb-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Search businesses by name or description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Filter by location..."
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">All Categories</option>
                  {categories.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-600">Loading businesses...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {filteredBusinesses.map(business => (
                  <Link
                    key={business.id}
                    to={business.username ? `/${business.username}` : `/businesses/${business.id}`}
                    className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition"
                  >
                    <div className="h-24 overflow-hidden">
                      {business.image_url ? (
                        <img
                          src={business.image_url}
                          alt={business.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
                      )}
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-blue-600 font-medium mb-1">
                        {business.category}
                      </p>
                      <h3 className="font-bold text-gray-900 mb-1 line-clamp-2 text-sm">
                        {business.name}
                        {business.verified && (
                          <VerifiedBadge compact size={14} className="inline-block align-text-bottom ml-1" />
                        )}
                      </h3>
                      <p className="text-xs text-gray-600 line-clamp-2 mb-3">
                        {business.description}
                      </p>

                      {/* Business Status Indicator */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-2 h-2 rounded-full ${
                          business.status === 'open' ? 'bg-green-500' : 'bg-gray-400'
                        }`} />
                        <span className={`text-xs font-medium ${
                          business.status === 'open' ? 'text-green-600' : 'text-gray-600'
                        }`}>
                          {business.status === 'open' ? 'Open' : 'Closed'}
                        </span>
                      </div>

                      {/* Contact Information */}
                      <div className="space-y-1.5 text-xs text-gray-600">
                        {business.location && (
                          <div className="flex items-center gap-1.5">
                            <MapPin size={14} className="text-gray-500" />
                            <span className="line-clamp-1">{business.location}</span>
                          </div>
                        )}
                        {business.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone size={14} className="text-gray-500" />
                            <span>{business.phone}</span>
                          </div>
                        )}
                        {business.website && (
                          <div className="flex items-center gap-1.5">
                            <Globe size={14} className="text-gray-500" />
                            <span className="line-clamp-1">{business.website}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Star size={14} className="fill-yellow-400 text-yellow-400" />
                          <span className="text-xs font-medium text-gray-900">
                            {business.rating ? business.rating.toFixed(1) : '0.0'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {business.location}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {!loading && filteredBusinesses.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600">No businesses found</p>
              </div>
            )}
          </div>
        </div>
      );
    }
