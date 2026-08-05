import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Advertisement } from '../../types';
import { Edit2, Trash2 } from 'lucide-react';
import ConfirmDialog from '../ConfirmDialog';

interface AdvertListProps {
  onEdit: (id: string) => void;
}

export default function AdvertList({ onEdit }: AdvertListProps) {
  const { user } = useAuth();
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestTarget, setRequestTarget] = useState<Advertisement | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  // Depend on `user`: it can be null on the first render while the session
  // restores — without the dep this list would stay on "Loading..." forever.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const fetchAdverts = async () => {
      const { data } = await supabase
        .from('advertisements')
        .select('*')
        .eq('user_id', user.id);
      setAdverts(data || []);

      const { data: reqs } = await supabase
        .from('deletion_requests')
        .select('entity_id')
        .eq('requester_id', user.id)
        .eq('entity_type', 'advert')
        .eq('status', 'pending');
      if (reqs) setRequestedIds(new Set(reqs.map((r: any) => String(r.entity_id))));

      setLoading(false);
    };
    fetchAdverts();
  }, [user]);

  // Owners file a deletion request an admin approves (no direct delete).
  const submitRequest = async () => {
    if (!user || !requestTarget) return;
    setRequesting(true);
    const { error } = await supabase.from('deletion_requests').insert({
      requester_id: user.id,
      entity_type: 'advert',
      entity_id: requestTarget.id,
      entity_label: requestTarget.title,
    });
    setRequesting(false);
    const target = requestTarget;
    setRequestTarget(null);
    if (error) {
      if (error.code === '23505') {
        toast.success('A deletion request is already pending for this campaign.');
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

  if (adverts.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-gray-600 dark:text-gray-400">No campaigns yet. Create one to get started!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Title</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Budget</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Created</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
          </tr>
        </thead>
        <tbody>
          {adverts.map(advert => (
            <tr key={advert.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{advert.title}</td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${advert.budget}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  advert.status === 'active'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : advert.status === 'pending'
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                }`}>
                  {advert.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                {advert.created_at ? new Date(advert.created_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-sm">
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(advert.id)}
                    aria-label={`Edit ${advert.title}`}
                    className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition"
                  >
                    <Edit2 size={16} />
                  </button>
                  {requestedIds.has(String(advert.id)) ? (
                    <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" title="Deletion awaiting admin approval">
                      Deletion requested
                    </span>
                  ) : (
                    <button
                      onClick={() => setRequestTarget(advert)}
                      aria-label={`Request deletion of ${advert.title}`}
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
