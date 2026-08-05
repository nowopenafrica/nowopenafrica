import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { X, Users, UserPlus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ASSIGNABLE_ROLES, roleLabel } from '../../data/roles';

interface TeamManagerProps {
  businessId: string;
  businessName: string;
  onClose: () => void;
}

export default function TeamManager({ businessId, businessName, onClose }: TeamManagerProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(ASSIGNABLE_ROLES[0].key);
  const [inviting, setInviting] = useState(false);

  const fetchMembers = useCallback(async () => {
    const { data } = await supabase
      .from('business_members')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: true });
    setMembers(data || []);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.rpc('invite_business_member', {
        biz: businessId, member_email: email.trim(), member_role: role,
      });
      if (error) throw error;
      const result = data as string;
      if (result === 'added') { toast.success('Teammate added'); setEmail(''); fetchMembers(); }
      else if (result === 'no_user') toast.error('No NowOpen account found for that email — ask them to sign up first.');
      else if (result === 'is_owner') toast.error('That person already owns this business.');
      else if (result === 'forbidden') toast.error('Only the business owner can manage the team.');
      else toast.error('Could not add teammate.');
    } catch (err: any) {
      toast.error(`Could not add teammate: ${err.message || 'unknown error'}. If this mentions a missing function, run scripts/sql/apply_all_migrations.sql.`);
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (id: string, newRole: string) => {
    const { error } = await supabase.from('business_members').update({ role: newRole }).eq('id', id);
    if (error) { toast.error(`Could not update role: ${error.message}`); return; }
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role: newRole } : m)));
    toast.success('Role updated');
  };

  const remove = async (id: string) => {
    const { data, error } = await supabase.from('business_members').delete().eq('id', id).select();
    if (error) { toast.error(`Could not remove: ${error.message}`); return; }
    if (!data || data.length === 0) { toast.error('Nothing was removed — you may need to be the owner.'); return; }
    setMembers((prev) => prev.filter((m) => m.id !== id));
    toast.success('Teammate removed');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Team — {businessName}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-6">
          {/* Invite */}
          <form onSubmit={invite} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200 mb-2">Add a teammate</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="their@email.com"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg text-sm"
              />
              <select value={role} onChange={(e) => setRole(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg text-sm">
                {ASSIGNABLE_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
              <button type="submit" disabled={inviting}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {inviting ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Add
              </button>
            </div>
            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              They must already have a NowOpen account. {ASSIGNABLE_ROLES.find((r) => r.key === role)?.description}.
            </p>
          </form>

          {/* Members */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Team members</h3>
            {loading ? (
              <div className="py-6 text-center text-gray-500"><Loader2 className="animate-spin mx-auto" /></div>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No teammates yet. You (the owner) have full access; add people above to delegate.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.invited_email || 'Team member'}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 capitalize">{m.status}{m.status !== 'active' ? '' : ` · ${roleLabel(m.role)}`}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded text-xs">
                        {ASSIGNABLE_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                      <button onClick={() => remove(m.id)} aria-label="Remove teammate"
                        className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
