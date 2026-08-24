import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Factory, UserPlus, UserCheck, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { NOWOPEN_ORG_ID, seedMembers, type WorkforceMember } from '../../lib/workforce';
import { PERMISSION_LABELS, jobDescriptionByAgentKey } from '../../lib/jobDescriptions';
import {
  openRoles, factorySummary, buildFactoryMember, buildFactoryBatch,
  type FactoryOpenRole,
} from '../../lib/workforceFactory';

// Workforce Factory — hire AI agents straight off their digital job
// descriptions. Only roles that are genuinely open are offered (a JD whose
// agent_key is already on the roster never appears twice), and each hire wires
// the reporting line from the real tree: a manager already on the roster
// becomes the reports_to, otherwise the row ships without one and the org
// chart says so honestly.

const reportsToLabel = (reportsTo: string): string =>
  reportsTo === 'founder' ? 'the founder' : jobDescriptionByAgentKey(reportsTo)?.role ?? reportsTo;

export default function WorkforceFactory({
  onOpenSection,
}: {
  onOpenSection?: (id: string) => void;
}) {
  const { user } = useAuth();
  // Stable identity so a fresh context object every render (common in tests
  // and hot reload) doesn't restart the fetch loop.
  const currentUser = useMemo(
    () => (user?.id ? { id: user.id, email: user.email } : undefined),
    [user?.id, user?.email],
  );
  const [members, setMembers] = useState<WorkforceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [hiringKey, setHiringKey] = useState<string | null>(null);
  const [hireName, setHireName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_workforce')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as WorkforceMember[];
      if (error || rows.length === 0) throw new Error('os_workforce unavailable');
      setMembers(rows);
      setUsingFallback(false);
    } catch {
      setMembers(seedMembers(currentUser));
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const roles = useMemo(() => openRoles(members), [members]);
  const summary = useMemo(() => factorySummary(members), [members]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, { hired: WorkforceMember[]; open: FactoryOpenRole[] }>();
    for (const m of members) {
      if (m.kind !== 'ai') continue;
      const entry = map.get(m.department) ?? { hired: [], open: [] };
      entry.hired.push(m);
      map.set(m.department, entry);
    }
    for (const r of roles) {
      const entry = map.get(r.department) ?? { hired: [], open: [] };
      entry.open.push(r);
      map.set(r.department, entry);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [members, roles]);

  const hire = async (agentKey: string) => {
    const role = roles.find((r) => r.agentKey === agentKey);
    if (!role) return;
    const member = buildFactoryMember({ agentKey, name: hireName, members, orgId: NOWOPEN_ORG_ID });
    const { id: _id, ...row } = member;
    setBusy(true);
    try {
      if (usingFallback) {
        setMembers((m) => [...m, member]);
        toast.success(`${member.name} joined the workforce for this session.`);
      } else {
        await supabase.from('os_workforce').insert(row);
        toast.success(`${member.name} hired — reporting line ${role.reportsTo === 'founder' ? 'to the founder' : 'wired from the tree'}.`);
        await load();
      }
    } catch {
      toast.error('Could not save the hire — admin permissions needed.');
    } finally {
      setBusy(false);
      setHiringKey(null);
      setHireName('');
    }
  };

  const fillAll = async () => {
    const batch = buildFactoryBatch({ members, orgId: NOWOPEN_ORG_ID });
    if (batch.length === 0) return;
    setBusy(true);
    try {
      if (usingFallback) {
        setMembers((m) => [...m, ...batch]);
        toast.success(`Hired all ${batch.length} open roles for this session.`);
      } else {
        await supabase.from('os_workforce').insert(batch.map(({ id: _id, ...row }) => row));
        toast.success(`Hired all ${batch.length} open roles.`);
        await load();
      }
    } catch {
      toast.error('Could not save the hires — admin permissions needed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin mr-2" /> Reading the roster…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {usingFallback && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Hires this session stay in memory only — apply the os_workforce migration to persist them.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Factory size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Factory floor</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {summary.hired} of {summary.total} roles hired · {summary.open} open · {summary.staffed} departments staffed ({summary.partial} partial, {summary.empty} empty)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenSection && (
              <button type="button" onClick={() => onOpenSection('workforce')}
                className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">
                <ArrowRight size={13} /> Directory
              </button>
            )}
            {summary.open > 0 && (
              <button type="button" onClick={() => void fillAll()} disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[44px]">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Fill all {summary.open} open roles
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
          Roles come only from the digital job descriptions — a JD already on the roster is never offered twice, and reporting lines come from the real tree.
        </p>
      </div>

      {byDepartment.length === 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No departments with roles yet — the factory floor starts with the roster.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {byDepartment.map(([department, { hired, open }]) => (
          <div key={department} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-gray-900 dark:text-white">{department}</p>
              <span className="text-[10px] font-semibold text-gray-400">
                {hired.length} hired · {open.length} open
              </span>
            </div>

            {hired.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hired.map((h) => (
                  <span key={h.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30">
                    <UserCheck size={10} /> {h.name}
                  </span>
                ))}
              </div>
            )}

            {open.length === 0 ? (
              <p className="mt-3 text-[11px] text-emerald-600 dark:text-emerald-400">Fully staffed.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {open.map((r) => (
                  <div key={r.agentKey} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-white">{r.role}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{r.purpose}</p>
                      </div>
                      <button type="button" onClick={() => { setHiringKey(hiringKey === r.agentKey ? null : r.agentKey); setHireName(''); }}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg text-[10px] font-bold text-white bg-purple-600 hover:bg-purple-700 transition min-h-[44px]">
                        <UserPlus size={11} /> Hire
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                      <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">L{r.permission} · {PERMISSION_LABELS[r.permission]}</span>
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">Reports to {reportsToLabel(r.reportsTo)}</span>
                    </div>
                    {r.kpis.length > 0 && (
                      <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400 truncate">KPIs: {r.kpis.join(' · ')}</p>
                    )}

                    {hiringKey === r.agentKey && (
                      <form
                        onSubmit={(e) => { e.preventDefault(); void hire(r.agentKey); }}
                        className="mt-3 flex items-center gap-2">
                        <input
                          value={hireName}
                          onChange={(e) => setHireName(e.target.value)}
                          placeholder={`Name (defaults to ${r.role})`}
                          aria-label={`Name for ${r.role}`}
                          className="flex-1 min-w-0 px-2.5 .5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px] items-center"
                        />
                        <button type="submit" disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition min-h-[44px]">
                          {busy ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Confirm
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
