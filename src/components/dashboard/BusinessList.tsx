import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Business } from '../../types';
import { Edit2, Trash2 } from 'lucide-react';

interface BusinessListProps {
  onEdit: (id: string) => void;
}

export default function BusinessList({ onEdit }: BusinessListProps) {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const fetchBusinesses = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id);

    setBusinesses(data || []);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure?')) return;
    const { error } = await supabase.from('businesses').delete().eq('id', id);
    if (error) {
      alert(`Could not delete: ${error.message}`);
      return;
    }
    setBusinesses(businesses.filter(b => b.id !== id));
  };

  if (loading) {
    return <p className="text-gray-600">Loading...</p>;
  }

  if (businesses.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-600">No businesses yet. Create one to get started!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Name</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Category</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Status</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Location</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Actions</th>
          </tr>
        </thead>
        <tbody>
          {businesses.map(business => (
            <tr key={business.id} className="border-b border-gray-200 hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-900">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    business.status === 'open' ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span className="font-medium">{business.name}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{business.category}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  business.status === 'open'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {business.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{business.location}</td>
              <td className="px-4 py-3 text-sm">
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(business.id)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(business.id)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
