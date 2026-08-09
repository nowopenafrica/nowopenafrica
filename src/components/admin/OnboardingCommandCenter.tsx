import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, UsersRound, FileSignature, Package, CheckCircle2, UserPlus,
  Circle, ChevronDown, ArrowRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { NOWOPEN_ORG_ID } from '../../lib/workforce';
import {
  mapOnboardingRow, onboardingProgress, onboardingStatus, docPackFor,
  summarizeOnboarding, ONBOARDING_SEED, ONBOARDING_STATUSES,
  ONBOARDING_STATUS_LABELS, type OnboardingProfile, type OnboardingRow,
  type OnboardingStatus,
} from '../../lib/onboardingProfiles';
import {
  RELATIONSHIP_LABELS, RELATIONSHIP_OPTIONS, journeyFor, stepsAwaitingSignature,
} from '../../lib/relationships';

// Onboarding Command Center — the People OS front door. Every person or
// company with a NowOpen relationship (employee, partner, volunteer, creative,
// investor, ...) gets a profile row, and the status shown is always derived
// from what is genuinely done on their journey — never stored. Profiles load
// from os_onboarding and fall back to ONBOARDING_SEED (clearly labelled) until
// the migration is applied.

const STATUS_BADGE: Record<OnboardingStatus, string> = {
  invited: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  in_progress: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  awaiting_signature: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  blocked: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  completed: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
};

const RELATIONSHIP_EMOJI: Record<string, string> = Object.fromEntries(
  RELATIONSHIP_OPTIONS.map((o) => [o.id, o.emoji]),
);

export default function OnboardingCommandCenter() {
  const { user } = useAuth();
  // Stable identity so a fresh context object every render (common in tests
  // and hot reload) doesn't restart the fetch loop.
  const currentUser = useMemo(
    () => (user?.id ? { id: user.id, email: user.email } : undefined),
    [user?.id, user?.email],
  );
  const [profiles, setProfiles] = useState<OnboardingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_onboarding')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as OnboardingRow[];
      if (error || rows.length === 0) throw new Error('os_onboarding unavailable');
      setProfiles(rows.map(mapOnboardingRow));
      setUsingFallback(false);
    } catch {
      setProfiles(ONBOARDING_SEED);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeOnboarding(profiles), [profiles]);

  const visible = useMemo(
    () => (statusFilter === 'all' ? profiles : profiles.filter((p) => onboardingStatus(p) === statusFilter)),
    [profiles, statusFilter],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin mr-2" /> Reading the relationship profiles…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {usingFallback && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Showing the dev roster — apply the os_onboarding migration to persist real relationship profiles.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <UsersRound size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Onboarding Command Center</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {summary.total} relationships · {summary.completed} onboarded ({summary.completionRate}%) · {summary.awaitingSignature} awaiting signature · {summary.blocked} blocked
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${statusFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              All · {summary.total}
            </button>
            {ONBOARDING_STATUSES.map((s) => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${statusFilter === s ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                {ONBOARDING_STATUS_LABELS[s]} · {summary.byStatus[s]}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
          Status is derived from each relationship's journey — a profile shows "awaiting signature" only when a signing step is genuinely outstanding.
        </p>
      </div>

      {visible.length === 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No profiles in this state yet.
        </div>
      )}

      <div className="space-y-2.5">
        {visible.map((p) => {
          const status = onboardingStatus(p);
          const progress = onboardingProgress(p);
          const journey = journeyFor(p.relationship);
          const pendingSignatures = stepsAwaitingSignature(p.relationship, p.steps_completed);
          const expanded = expandedId === p.id;
          return (
            <div key={p.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
              <button type="button"
                onClick={() => setExpandedId(expanded ? null : p.id)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                <div className="w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-xs font-bold text-purple-600 dark:text-purple-400 shrink-0">
                  {p.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{p.full_name}</p>
                    <span className="text-[10px] text-gray-400">{RELATIONSHIP_EMOJI[p.relationship]} {RELATIONSHIP_LABELS[p.relationship] ?? p.relationship}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[status]}`}>
                      {ONBOARDING_STATUS_LABELS[status]}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {p.email}{p.role ? ` · ${p.role}` : ''}{p.department ? ` · ${p.department}` : ''}
                  </p>
                  {p.source_reference && (
                    <span className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/20 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                      <UserPlus size={10} /> from application {p.source_reference}
                    </span>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 max-w-[180px] rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div className="h-full rounded-full bg-purple-500" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">{progress}%</span>
                    {pendingSignatures.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                        <FileSignature size={10} /> {pendingSignatures.length} to sign
                      </span>
                    )}
                  </div>
                </div>
                <ChevronDown size={14} className={`shrink-0 text-gray-400 transition ${expanded ? 'rotate-180' : ''}`} />
              </button>

              {expanded && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-3">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Onboarding journey</p>
                      <ol className="space-y-1.5">
                        {journey.map((step) => {
                          const done = p.steps_completed.includes(step.id);
                          return (
                            <li key={step.id} className="flex items-center gap-2 text-[11px]">
                              {done ? (
                                <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                              ) : (
                                <Circle size={12} className={`shrink-0 ${step.requiresSignature ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />
                              )}
                              <span className={done ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}>{step.label}</span>
                              {step.requiresSignature && !done && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                  <FileSignature size={9} /> signature
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                          <Package size={11} /> Document packet ({docPackFor(p.relationship).length} documents)
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {docPackFor(p.relationship).map((doc) => (
                            <span key={doc} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                              {doc}
                            </span>
                          ))}
                        </div>
                      </div>
                      {p.signed_agreements.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Signed</p>
                          <div className="flex flex-wrap gap-1">
                            {p.signed_agreements.map((doc) => (
                              <span key={doc} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 size={9} /> {doc}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {p.access_grants.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Access granted</p>
                          <div className="flex flex-wrap gap-1">
                            {p.access_grants.map((a) => (
                              <span key={a} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                                <ArrowRight size={9} /> {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {pendingSignatures.length > 0 && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Needs: {pendingSignatures.map((s) => s.label).join(', ')}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
