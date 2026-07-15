import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Star, DollarSign, Eye, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateAdverts } from '../data/populateData';
import { Advertisement } from '../types';

export default function Adverts() {
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Re-run the query whenever a filter changes so search actually works
  useEffect(() => {
    fetchAdverts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, locationFilter, categoryFilter]);

  const fetchAdverts = async () => {
    try {
      // Don't flip `loading` on refetch — the full-page loader would unmount
      // the search inputs on every keystroke. It starts true and is cleared
      // after the first fetch.
      setError(null);

      console.log('Fetching adverts from Supabase...');
      console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);

      let query = supabase
        .from('advertisements')
        .select('*')
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      if (locationFilter) {
        query = query.ilike('location', `%${locationFilter}%`);
      }

      if (categoryFilter) {
        query = query.eq('category', categoryFilter);
      }

      const { data, error: supabaseError } = await query;

      if (supabaseError) {
        console.error('Supabase error details:', supabaseError);
        throw new Error(supabaseError.message || 'Database query failed');
      }

      // Fall back to sample data while the database is empty (only when the
      // user isn't actively filtering — an empty filtered result is real).
      const noFiltersActive = !searchQuery && !locationFilter && !categoryFilter;
      if ((!data || data.length === 0) && noFiltersActive) {
        setAdverts(generateAdverts() as Advertisement[]);
      } else {
        setAdverts(data || []);
      }
    } catch (err: any) {
      console.error('Error fetching adverts:', err);
      // If the database is unreachable and no filters are active, fall back
      // to sample data instead of an error page.
      if (!searchQuery && !locationFilter && !categoryFilter) {
        setAdverts(generateAdverts() as Advertisement[]);
      } else {
        setError(err.message || 'Failed to load advertising placements');
      }
    } finally {
      setLoading(false);
    }
  };

  const categories = ['Billboard', 'Digital Screen', 'Transit', 'Mall Media', 'Airport', 'Street Furniture', 'Stadium', 'Radio'];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading advertising placements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
          Advertising Placements
        </h1>

        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search placements by name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <div className="relative">
              <MapPin className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Filter by location..."
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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

        {error ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <X size={32} className="text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load advertising placements</h3>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={fetchAdverts}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
            >
              Try Again
            </button>
          </div>
        ) : adverts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No placements found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
            {adverts.map((advert) => (
              <Link
                key={advert.id}
                to={`/adverts/${advert.id}`}
                className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition"
              >
                <div className="h-24 overflow-hidden">
                  {advert.image_url ? (
                    <img
                      src={advert.image_url}
                      alt={advert.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs text-blue-600 font-medium mb-1">
                    {advert.category || 'Advertisement'}
                  </p>
                  <h3 className="font-bold text-gray-900 mb-1 line-clamp-2 text-sm">
                    {advert.title}
                  </h3>
                  <p className="text-xs text-gray-600 line-clamp-2 mb-3">
                    {advert.description}
                  </p>

                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-2 rounded-full ${
                      advert.status === 'active' ? 'bg-green-500' : 
                      advert.status === 'pending' ? 'bg-yellow-500' : 'bg-gray-400'
                    }`} />
                    <span className={`text-xs font-medium ${
                      advert.status === 'active' ? 'text-green-600' : 
                      advert.status === 'pending' ? 'text-yellow-600' : 'text-gray-600'
                    }`}>
                      {advert.status === 'active' ? 'Active' : 
                       advert.status === 'pending' ? 'Pending' : 'Closed'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-gray-600">
                    {advert.location && (
                      <div className="flex items-center gap-1.5">
                        <MapPin size={14} className="text-gray-500" />
                        <span className="line-clamp-1">{advert.location}</span>
                      </div>
                    )}
                    {advert.pricing && (
                      <div className="flex items-center gap-1.5">
                        <DollarSign size={14} className="text-green-600" />
                        <span className="font-medium text-gray-900">${advert.pricing.toLocaleString()}/day</span>
                      </div>
                    )}
                    {advert.dimensions && (
                      <div className="flex items-center gap-1.5">
                        <Eye size={14} className="text-gray-500" />
                        <span>{advert.dimensions}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Star size={14} className="fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-medium text-gray-900">
                        {advert.traffic_density || 'N/A'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {advert.category}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
