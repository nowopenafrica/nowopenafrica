import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { MediaService } from '../../types';
import { Edit2, Trash2, Star } from 'lucide-react';

interface MediaListProps {
  onEdit: (id: string) => void;
}

export default function MediaList({ onEdit }: MediaListProps) {
  const { user } = useAuth();
  const [services, setServices] = useState<MediaService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('media_services')
      .select('*')
      .eq('user_id', user.id);

    setServices(data || []);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure?')) return;
    const { error } = await supabase.from('media_services').delete().eq('id', id);
    if (error) {
      alert(`Could not delete: ${error.message}`);
      return;
    }
    setServices(services.filter(s => s.id !== id));
  };

  if (loading) {
    return <p className="text-gray-600">Loading...</p>;
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-600">No services yet. Create one to get started!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Title</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Type</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Price</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Rating</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Actions</th>
          </tr>
        </thead>
        <tbody>
          {services.map(service => (
            <tr key={service.id} className="border-b border-gray-200 hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-900">{service.title}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{service.service_type}</td>
              <td className="px-4 py-3 text-sm text-gray-600">${service.pricing}</td>
              <td className="px-4 py-3 text-sm">
                <div className="flex items-center gap-1">
                  <Star size={14} className="fill-yellow-400 text-yellow-400" />
                  <span className="text-gray-900">{(service.rating ?? 0).toFixed(1)}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm">
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(service.id)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(service.id)}
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
