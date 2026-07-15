import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Advertisement } from '../../types';
import { Edit2, Trash2 } from 'lucide-react';

interface AdvertListProps {
  onEdit: (id: string) => void;
}

export default function AdvertList({ onEdit }: AdvertListProps) {
  const { user } = useAuth();
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdverts();
  }, []);

  const fetchAdverts = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('advertisements')
      .select('*')
      .eq('user_id', user.id);

    setAdverts(data || []);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure?')) return;
    const { error } = await supabase.from('advertisements').delete().eq('id', id);
    if (error) {
      alert(`Could not delete: ${error.message}`);
      return;
    }
    setAdverts(adverts.filter(a => a.id !== id));
  };

  if (loading) {
    return <p className="text-gray-600">Loading...</p>;
  }

  if (adverts.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-600">No campaigns yet. Create one to get started!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Title</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Budget</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Status</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Created</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Actions</th>
          </tr>
        </thead>
        <tbody>
          {adverts.map(advert => (
            <tr key={advert.id} className="border-b border-gray-200 hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-900">{advert.title}</td>
              <td className="px-4 py-3 text-sm text-gray-600">${advert.budget}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  advert.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : advert.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {advert.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {advert.created_at ? new Date(advert.created_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-sm">
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(advert.id)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(advert.id)}
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
