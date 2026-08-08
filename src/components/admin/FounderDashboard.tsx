import { useMemo, useEffect, useCallback, useState } from 'react';
import {
  Sparkles, TrendingUp, Activity, Banknote, BadgeCheck, ShoppingBag, Users,
  Megaphone, ArrowRight, Loader2, ShieldCheck, Rocket, BookOpen, Bot,
  ClipboardCheck, Kanban, UsersRound, Building2,
} from 'lucide-react';
import { aiRecommendations } from '../../lib/adminCreator';
import { useCommandData } from '../../hooks/useCommandData';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { NOWOPEN_ORG_ID, seedMembers, type WorkforceMember } from '../../lib/workforce';
import { WORK_SEED, mapSeedToMembers, type WorkItem } from '../../lib/work';
import { APPROVALS_SEED, mapSeedToApprovals, type ApprovalRequest } from '../../lib/approvals';
import { KNOWLEDGE_SEED, type KnowledgeDoc } from '../../lib/knowledge';
import { LAUNCHES_SEED, mapLaunchRow } from '../../lib/launches';
import { PARTNERS_SEED, mapPartnerRow } from '../../lib/partners';
import {
  summarizeOsExtended, osExtendedBriefingLines, osHealthScore,
  type OsExtendedBriefing,
} from '../../lib/commandOs';

// The Founder Dashboard (#20) — the private executive view. Same real numbers
// as the Command Center, framed as company health: a health score, growth
// velocity, revenue, the approval queue and the strategic read-out. Since OS-8
// it also reads all six os_* ledgers and folds the operating system — team,
// work, approvals, knowledge, launches and partners — into the health score,
// the briefing and an "Operating system" strip, with the same honest fallback
// as the rest of the OS.

const fmtMoney = (n: number): string => n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : `₦${n.toLocaleString()}`;

interface Props {
  onOpenSection?: (id: string) => void;
}

export default function FounderDashboard({ onOpenSection }: Props) {
  const { stats, sample, loading, reload } = useCommandData();
  const { user } = useAuth();
  const currentUser = useMemo(
    () => (user?.id ? { id: user.id, email: user.email } : undefined),
    [user?.id, user?.email],
  );

  const [osBriefing, setOsBriefing] = useState<OsExtendedBriefing | null>(null);
  const [osUsingFallback, setOsUsingFallback] = useState(false);

  const loadOs = useCallback(async () => {
    try {
      const [wf, wk, ap, kb, ln, pt] = await Promise.all([
        supabase.from('os_workforce').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_work_items').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_approvals').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_knowledge').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_launches').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_partners').select('*').eq('org_id', NOWOPEN_ORG_ID),
      ]);
      const members = (wf.data ?? []) as WorkforceMember[];
      const items = (wk.data ?? []) as WorkItem[];
      const approvals = (ap.data ?? []) as ApprovalRequest[];
      const docs = (kb.data ?? []) as KnowledgeDoc[];
      const launches = ((ln.data ?? []) as Parameters<typeof mapLaunchRow>[0][]).map(mapLaunchRow);
      const partners = ((pt.data ?? []) as Parameters<typeof mapPartnerRow>[0][]).map(mapPartnerRow);
      if (wf.error || wk.error || ap.error || kb.error || ln.error || pt.error || members.length === 0 || items.length === 0) {
        throw new Error('os tables unavailable');
      }
      setOsBriefing(summarizeOsExtended({ members, items, approvals, docs, launches, partners }));
      setOsUsingFallback(false);
    } catch {
      const fallbackMembers = seedMembers(currentUser);
      const fallbackItems = mapSeedToMembers(WORK_SEED, fallbackMembers);
      setOsBriefing(summarizeOsExtended({
        members: fallbackMembers,
        items: fallbackItems,
        approvals: mapSeedToApprovals(APPROVALS_SEED, fallbackItems),
        docs: KNOWLEDGE_SEED,
        launches: LAUNCHES_SEED,
        partners: PARTNERS_SEED,
      }));
      setOsUsingFallback(true);
    }
  }, [currentUser]);

  useEffect(() => { void loadOs(); }, [loadOs]);

  const health = useMemo(() => {
    if (!stats) return { score: 0, items: [] as { label: string; earned: number; max: number }[] };
    const verifiedRate = stats.totalBusinesses ? stats.verifiedBusinesses / stats.totalBusinesses : 0;
    const momentum = stats.businessesToday > 0 ? Math.min(1, stats.businessesToday / 3) : 0;
    const approvals = stats.pendingApprovals === 0 ? 1 : Math.max(0, 1 - stats.pendingApprovals / 8);
    const publishing = stats.publishedPosts > 0 ? Math.min(1, stats.publishedPosts / 20) : 0;
    const uptime = stats.uptime / 100;
    const items = [
      { label: 'Verification rate', earned: Math.round(verifiedRate * 25), max: 25 },
      { label: 'Publishing momentum', earned: Math.round(publishing * 25), max: 25 },
      { label: 'Approval queue', earned: Math.round(approvals * 20), max: 20 },
      { label: 'Onboarding velocity', earned: Math.round(momentum * 20), max: 20 },
      { label: 'Platform uptime', earned: Math.round(uptime * 10), max: 10 },
    ];
    return { score: items.reduce((s, i) => s + i.earned, 0), items };
  }, [stats]);

  const briefing = useMemo(() => {
    const lines = stats ? aiRecommendations(stats) : [];
    if (osBriefing) lines.push(...osExtendedBriefingLines(osBriefing));
    return lines;
  }, [stats, osBriefing]);

  if (loading || !stats) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;
  }

  const circumference = 2 * Math.PI * 54;
  const osHealth = osBriefing ? osHealthScore(osBriefing) : null;

  const departments = [
    { id: 'analytics-war-room', label: 'Analytics War Room', icon: TrendingUp, tone: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300' },
    { id: 'launch', label: 'Launch Control', icon: Rocket, tone: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300' },
    { id: 'press-room', label: 'Press Room', icon: BookOpen, tone: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-300' },
    { id: 'brand-director', label: 'AI Brand Director', icon: Bot, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
    { id: 'workforce', label: 'Workforce Directory', icon: UsersRound, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
    { id: 'work-board', label: 'Work Board', icon: Kanban, tone: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-300' },
    { id: 'approvals', label: 'Approvals Hub', icon: ClipboardCheck, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen, tone: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
    { id: 'partners', label: 'Partnership CRM', icon: Building2, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {sample && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Sample data — backend offline
          </span>
        )}
        <button onClick={() => void reload()} className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400">
          <ArrowRight size={12} className="rotate-180" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-5">
        {/* Company health score */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity size={16} className="text-purple-600 dark:text-purple-400" /> Company Health Score
          </h3>
          <div className="relative w-36 h-36 mx-auto mt-5">
            <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
              <circle cx="64" cy="64" r="54" fill="none" strokeWidth="11" className="stroke-gray-100 dark:stroke-gray-700" />
              <circle cx="64" cy="64" r="54" fill="none" strokeWidth="11" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (health.score / 100) * circumference}
                className="stroke-purple-500 transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-gray-900 dark:text-white">{health.score}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">/ 100</span>
            </div>
          </div>
          <div className="mt-5 space-y-2.5">
            {health.items.map((i) => (
              <div key={i.label}>
                <div className="flex items-center justify-between text-[11px] font-medium text-gray-600 dark:text-gray-300">
                  <span>{i.label}</span><span className="text-gray-400">{i.earned}/{i.max}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-700" style={{ width: `${(i.earned / i.max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          {osHealth !== null && (
            <>
              <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between text-[11px] font-medium text-gray-600 dark:text-gray-300">
                  <span className="inline-flex items-center gap-1"><Bot size={12} className="text-purple-600 dark:text-purple-400" /> Operating system health</span>
                  <span className="text-gray-400">{osHealth}/100</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-700" style={{ width: `${osHealth}%` }} />
                </div>
                {osBriefing && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-400">
                    <span>{osBriefing.agentsWorking}/{osBriefing.agents} agents working</span>
                    <span>{osBriefing.pendingSignOffs} sign-offs waiting</span>
                    <span>{osBriefing.launchesReady} launch{osBriefing.launchesReady === 1 ? '' : 'es'} ready</span>
                    <span>{osBriefing.partnersActive} active partner{osBriefing.partnersActive === 1 ? '' : 's'}</span>
                  </div>
                )}
              </div>
              {osUsingFallback && (
                <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[10px] text-amber-700 dark:text-amber-300">
                  Demo OS — the os_* migrations aren't applied here yet. Once they run, this reads the real ledgers.
                </div>
              )}
            </>
          )}
        </div>

        {/* Executive numbers + strategy */}
        <div className="space-y-5 min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Growth velocity today', value: `${stats.businessesToday} biz · ${stats.usersToday} users`, icon: TrendingUp, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
              { label: 'Revenue today', value: fmtMoney(stats.revenueToday), icon: Banknote, tone: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300' },
              { label: 'Verified businesses', value: stats.verifiedBusinesses, sub: `of ${stats.totalBusinesses}`, icon: BadgeCheck, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
              { label: 'Total businesses', value: stats.totalBusinesses, icon: ShoppingBag, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
              { label: 'Total users', value: stats.totalUsers, icon: Users, tone: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-300' },
              { label: 'Posts published', value: stats.publishedPosts, icon: Megaphone, tone: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300' },
            ].map((w) => (
              <div key={w.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${w.tone}`}><w.icon size={17} /></div>
                <div className="text-lg font-black text-gray-900 dark:text-white truncate">{w.value}</div>
                <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{w.label}</div>
                {w.sub && <div className="text-[10px] text-gray-400">{w.sub}</div>}
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-gradient-to-r from-gray-900 to-gray-800 p-6 text-white">
            <div className="flex items-start gap-3">
              <Sparkles size={20} className="mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-bold">Strategic read-out</h3>
                <p className="text-sm mt-1.5 leading-relaxed opacity-95">{briefing.join(' ')}</p>
              </div>
            </div>
          </div>

          {stats.pendingApprovals > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              <ShieldCheck size={16} className="shrink-0" />
              {stats.pendingApprovals} approvals waiting — clear them to keep onboarding fast.
            </div>
          )}
        </div>
      </div>

      {/* Operating system at a glance */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Operating system</h3>
          <button onClick={() => void loadOs()} className="text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400">
            <ArrowRight size={12} className="rotate-180 inline mr-0.5" /> Refresh
          </button>
        </div>

        {osBriefing ? (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Sign-offs waiting', value: osBriefing.pendingSignOffs, icon: ClipboardCheck, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
              { label: 'Blocked work', value: osBriefing.blockedItems, icon: Kanban, tone: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300' },
              { label: 'Open items', value: osBriefing.openItems, icon: TrendingUp, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
              { label: 'Agents working', value: `${osBriefing.agentsWorking}/${osBriefing.agents}`, icon: Bot, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
              { label: 'Knowledge docs', value: osBriefing.kbDocs, icon: BookOpen, tone: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
              { label: 'Decisions saved', value: osBriefing.kbDecisions, icon: Users, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
              { label: 'Launches ready', value: osBriefing.launchesReady, icon: Rocket, tone: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300' },
              { label: 'Partners active', value: osBriefing.partnersActive, icon: Building2, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
            ].map((w) => (
              <div key={w.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${w.tone}`}><w.icon size={14} /></div>
                <div className="text-lg font-black text-gray-900 dark:text-white">{w.value}</div>
                <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{w.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Reading the OS ledgers…
          </div>
        )}
      </div>

      {/* Executive shortcuts */}
      {onOpenSection && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Executive shortcuts</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {departments.map((d) => (
              <button key={d.id} onClick={() => onOpenSection(d.id)}
                className="text-left rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-gray-50 dark:hover:bg-gray-900/40 transition">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${d.tone}`}><d.icon size={15} /></div>
                <p className="text-xs font-bold text-gray-900 dark:text-white">{d.label}</p>
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-purple-600 dark:text-purple-400">Open <ArrowRight size={9} /></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
