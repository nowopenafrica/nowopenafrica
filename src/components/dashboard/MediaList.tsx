import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { MediaService } from '../../types';
import { Edit2, Trash2, Star } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';

interface MediaListProps {
  onEdit: (id: string) => void;
}

export default function MediaList({ onEdit }: MediaListProps) {
  const { user } = useAuth();
  const [services, setServices] = useState<MediaService[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestTarget, setRequestTarget] = useState<MediaService | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  // Depend on `user`: it can be null on the first render while the session
  // restores — without the dep this list would stay on "Loading..." forever.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const fetchServices = async () => {
      const { data } = await supabase
        .from('media_services')
        .select('*')
        .eq('user_id', user.id);
      setServices(data || []);

      const { data: reqs } = await supabase
        .from('deletion_requests')
        .select('entity_id')
        .eq('requester_id', user.id)
        .eq('entity_type', 'media')
        .eq('status', 'pending');
      if (reqs) setRequestedIds(new Set(reqs.map((r: any) => String(r.entity_id))));

      setLoading(false);
    };
    fetchServices();
  }, [user]);

  // Owners file a deletion request an admin approves (no direct delete).
  const submitRequest = async () => {
    if (!user || !requestTarget) return;
    setRequesting(true);
    const { error } = await supabase.from('deletion_requests').insert({
      requester_id: user.id,
      entity_type: 'media',
      entity_id: requestTarget.id,
      entity_label: requestTarget.title,
    });
    setRequesting(false);
    const target = requestTarget;
    setRequestTarget(null);
    if (error) {
      if (error.code === '23505') {
        toast.success('A deletion request is already pending for this service.');
        setRequestedIds(prev => new Set(prev).add(String(target.id)));
        return;
      }
      toast.error(`Could not send request: ${error.message}`);
      return;
    }
    setRequestedIds(prev => new Set(prev).add(String(target.id)));
    toast.success('Deletion request sent — an admin will review it.');
  };

  if (loading) {
    return <p className="text-gray-600 dark:text-gray-400">Loading...</p>;
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-gray-600 dark:text-gray-400">No services yet. Create one to get started!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Title</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Type</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Price</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Rating</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
          </tr>
        </thead>
        <tbody>
          {services.map(service => (
            <tr key={service.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{service.title}</td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{service.service_type}</td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${service.pricing}</td>
              <td className="px-4 py-3 text-sm">
                <div className="flex items-center gap-1">
                  <Star size={14} className="fill-yellow-400 text-yellow-400" />
                  <span className="text-gray-900 dark:text-white">{(service.rating ?? 0).toFixed(1)}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-sm">
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(service.id)}
                    aria-label={`Edit ${service.title}`}
                    className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition"
                  >
                    <Edit2 size={16} />
                  </button>
                  {requestedIds.has(String(service.id)) ? (
                    <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" title="Deletion awaiting admin approval">
                      Deletion requested
                    </span>
                  ) : (
                    <button
                      onClick={() => setRequestTarget(service)}
                      aria-label={`Request deletion of ${service.title}`}
                      title="Request deletion (an admin will review)"
                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmDialog
        open={!!requestTarget}
        title="Request deletion"
        message={
          <>
            Ask an admin to delete <span className="font-semibold text-gray-900 dark:text-white">{requestTarget?.title}</span>?
            This sends a request for review — it doesn't delete immediately.
          </>
        }
        confirmLabel={requesting ? 'Sending…' : 'Send request'}
        busy={requesting}
        tone="danger"
        onConfirm={submitRequest}
        onCancel={() => setRequestTarget(null)}
      />
    </div>
  );
}
