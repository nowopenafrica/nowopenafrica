import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Business } from '../../types';
import { Edit2, Trash2, LayoutGrid, Radio, ShieldCheck, Users } from 'lucide-react';
import TrustBadge from '../TrustBadge';
import ConfirmDialog from '../ConfirmDialog';
import { roleLabel } from '../../data/roles';

interface BusinessListProps {
  onEdit: (id: string) => void;
  /** Open the services/products/gallery manager for a business */
  onManageContent?: (business: Business) => void;
  /** Open the Go Live modal — only offered to verified businesses (premium feature) */
  onGoLive?: (business: Business) => void;
  /** Open the Trust & Verification panel for a business */
  onManageTrust?: (business: Business) => void;
  /** Open the Team (members) manager for a business */
  onManageTeam?: (business: Business) => void;
}

export default function BusinessList({ onEdit, onManageContent, onGoLive, onManageTrust, onManageTeam }: BusinessListProps) {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [shared, setShared] = useState<{ business: Business; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestTarget, setRequestTarget] = useState<Business | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  // Depend on `user`: it can be null on the first render while the session
  // restores — without the dep this list would stay on "Loading..." forever.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const fetchBusinesses = async () => {
      const { data } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', user.id);
      setBusinesses(data || []);

      // Which of these already have a pending deletion request?
      const { data: reqs } = await supabase
        .from('deletion_requests')
        .select('entity_id')
        .eq('requester_id', user.id)
        .eq('entity_type', 'business')
        .eq('status', 'pending');
      if (reqs) setRequestedIds(new Set(reqs.map((r: any) => String(r.entity_id))));

      // Businesses shared with me as a team member (RBAC). Fail soft if the
      // business_members table isn't there yet.
      const { data: memberships } = await supabase
        .from('business_members')
        .select('business_id, role, businesses(*)')
        .eq('user_id', user.id)
        .eq('status', 'active');
      if (memberships) {
        setShared(
          memberships
            .filter((m: any) => m.businesses)
            .map((m: any) => ({ business: m.businesses as Business, role: m.role })),
        );
      }

      setLoading(false);
    };
    fetchBusinesses();
  }, [user]);

  // Owners can't hard-delete their own listing — they file a request an admin
  // approves. This opens the confirm dialog; submitRequest files it.
  const submitRequest = async () => {
    if (!user || !requestTarget) return;
    setRequesting(true);
    const { error } = await supabase.from('deletion_requests').insert({
      requester_id: user.id,
      entity_type: 'business',
      entity_id: requestTarget.id,
      entity_label: requestTarget.name,
    });
    setRequesting(false);
    const target = requestTarget;
    setRequestTarget(null);
    if (error) {
      if (error.code === '23505') {
        toast.success('A deletion request is already pending for this listing.');
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

  // Businesses shared with me (I'm a team member, not the owner). Members get
  // the content manager; owner-only actions (edit/delete/team/verify) stay hidden.
  const sharedSection = shared.length > 0 && (
    <div className="mt-8">
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Shared with you</h3>
      <div className="space-y-2">
        {shared.map(({ business, role }) => (
          <div key={business.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{business.name}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{business.category} · Your role: {roleLabel(role)}</p>
            </div>
            {onManageContent && (
              <button
                onClick={() => onManageContent(business)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <LayoutGrid size={13} /> Manage content
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  if (businesses.length === 0) {
    return (
      <div>
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">No businesses yet. Create one to get started!</p>
        </div>
        {sharedSection}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Name</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Category</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Location</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
          </tr>
        </thead>
        <tbody>
          {businesses.map(business => (
            <tr key={business.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    business.status === 'open' ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span className="font-medium">{business.name}</span>
                  <TrustBadge tier={(business as any).verification_tier} score={(business as any).trust_score} />
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{business.category}</td>
              <td className="px-4 py-3 text-sm">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  business.status === 'open'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'
                }`}>
                  {business.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{business.location}</td>
              <td className="px-4 py-3 text-sm">
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(business.id)}
                    aria-label={`Edit ${business.name}`}
                    className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition"
                  >
                    <Edit2 size={16} />
                  </button>
                  {onManageContent && (
                    <button
                      onClick={() => onManageContent(business)}
                      aria-label={`Manage content for ${business.name}`}
                      title="Services, products, gallery & reviews"
                      className="p-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded transition"
                    >
                      <LayoutGrid size={16} />
                    </button>
                  )}
                  {onManageTrust && (
                    <button
                      onClick={() => onManageTrust(business)}
                      aria-label={`Trust & verification for ${business.name}`}
                      title="Trust & verification"
                      className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition"
                    >
                      <ShieldCheck size={16} />
                    </button>
                  )}
                  {onManageTeam && (
                    <button
                      onClick={() => onManageTeam(business)}
                      aria-label={`Manage team for ${business.name}`}
                      title="Team & roles"
                      className="p-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition"
                    >
                      <Users size={16} />
                    </button>
                  )}
                  {onGoLive && business.verified && (
                    <button
                      onClick={() => onGoLive(business)}
                      aria-label={`Go live for ${business.name}`}
                      title="NowOpen Live — go live or schedule a stream"
                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                    >
                      <Radio size={16} />
                    </button>
                  )}
                  {requestedIds.has(String(business.id)) ? (
                    <span className="inline-flex items-center px-2 py-1 rounded text-[11px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" title="Deletion awaiting admin approval">
                      Deletion requested
                    </span>
                  ) : (
                    <button
                      onClick={() => setRequestTarget(business)}
                      aria-label={`Request deletion of ${business.name}`}
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

      {sharedSection}

      <ConfirmDialog
        open={!!requestTarget}
        title="Request deletion"
        message={
          <>
            Ask an admin to delete <span className="font-semibold text-gray-900 dark:text-white">{requestTarget?.name}</span>?
            Listings are removed by an administrator after review — this sends a request, it doesn't delete immediately.
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
