import { useMemo, useEffect, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ShoppingBag, BadgeCheck, Users, Banknote, Inbox, Megaphone, CalendarClock, Rocket, Video, TrendingUp, MessageSquare, Activity, ArrowRight, Loader2, Bot, ClipboardCheck, BookOpen, Kanban, Building2, Newspaper } from 'lucide-react';
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
import { PRESS_SEED, mapPressRow } from '../../lib/press';
import { CAMPAIGNS_SEED, mapCampaignRow } from '../../lib/osCampaigns';
import { summarizeOsExtended, osExtendedBriefingLines, type OsExtendedBriefing } from '../../lib/commandOs';
import { osAttentionItems } from '../../lib/founderBrief';

// The Growth Command Center — "what's happening today". Pulls the real
// Supabase tables the admin console uses (published posts now come from the
// social_publish_log; the per-business Studio pipeline still lives in
// localStorage because there is no backend table for it yet). Only falls back
// to clearly-labelled sample data when the backend itself is unreachable so
// the dashboard is always alive in dev. The fetch lives in useCommandData so
// the Founder Dashboard reads the same numbers. Since OS-5 it reads the os_*
// tables; OS-12 folds all eight ledgers (team, work, approvals, knowledge,
// launches, partners, press and campaigns) into the briefing and the
// "OS at a glance" strip.

const fmtMoney = (n: number): string => n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : `₦${n.toLocaleString()}`;

export default function CommandCenter({ onOpenModule }: { onOpenModule?: (id: string) => void }) {
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
      const [wf, wk, ap, kb, ln, pt, pr, ca] = await Promise.all([
        supabase.from('os_workforce').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_work_items').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_approvals').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_knowledge').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_launches').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_partners').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_press').select('*').eq('org_id', NOWOPEN_ORG_ID),
        supabase.from('os_campaigns').select('*').eq('org_id', NOWOPEN_ORG_ID),
      ]);
      const members = (wf.data ?? []) as WorkforceMember[];
      const items = (wk.data ?? []) as WorkItem[];
      const approvals = (ap.data ?? []) as ApprovalRequest[];
      const docs = (kb.data ?? []) as KnowledgeDoc[];
      const launches = ((ln.data ?? []) as Parameters<typeof mapLaunchRow>[0][]).map(mapLaunchRow);
      const partners = ((pt.data ?? []) as Parameters<typeof mapPartnerRow>[0][]).map(mapPartnerRow);
      const press = ((pr.data ?? []) as Parameters<typeof mapPressRow>[0][]).map(mapPressRow);
      const campaigns = ((ca.data ?? []) as Parameters<typeof mapCampaignRow>[0][]).map(mapCampaignRow);
      if (wf.error || wk.error || ap.error || kb.error || ln.error || pt.error || pr.error || ca.error || members.length === 0 || items.length === 0) {
        throw new Error('os tables unavailable');
      }
      setOsBriefing(summarizeOsExtended({ members, items, approvals, docs, launches, partners, press, campaigns }));
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
        press: PRESS_SEED,
        campaigns: CAMPAIGNS_SEED,
      }));
      setOsUsingFallback(true);
    }
  }, [currentUser]);

  useEffect(() => { void loadOs(); }, [loadOs]);

  const briefing = useMemo(() => {
    const lines = stats ? aiRecommendations(stats) : [];
    if (osBriefing) lines.push(...osExtendedBriefingLines(osBriefing));
    return lines;
  }, [stats, osBriefing]);

  const attention = useMemo(() => (osBriefing ? osAttentionItems(osBriefing) : []), [osBriefing]);

  if (loading || !stats) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;
  }

  const widgets = [
    { label: 'Businesses onboarded', value: stats.totalBusinesses, sub: `+${stats.businessesToday} today`, icon: ShoppingBag, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
    { label: 'Businesses verified', value: stats.verifiedBusinesses, sub: `of ${stats.totalBusinesses} total`, icon: BadgeCheck, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
    { label: 'New users', value: stats.usersToday, sub: `of ${stats.totalUsers} total`, icon: Users, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
    { label: 'Revenue today', value: fmtMoney(stats.revenueToday), sub: `${stats.paidPayments} paid orders`, icon: Banknote, tone: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-300' },
    { label: 'Pending approvals', value: stats.pendingApprovals, sub: 'docs · registrations · waitlist', icon: Inbox, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
    { label: 'Posts published', value: stats.publishedPosts, sub: 'across all businesses', icon: Megaphone, tone: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300' },
    { label: 'Scheduled content', value: stats.scheduledPosts, sub: 'posts in the queue', icon: CalendarClock, tone: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300' },
    { label: 'Campaigns running', value: stats.campaigns, sub: 'platform-wide', icon: Rocket, tone: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300' },
    { label: 'Video production queue', value: stats.videoQueue, sub: 'drafts & renders', icon: Video, tone: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-300' },
    { label: 'Posts in pipeline', value: stats.publishedPosts + stats.scheduledPosts, sub: 'published + scheduled', icon: TrendingUp, tone: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300' },
    { label: 'Open support tickets', value: stats.openSupport, sub: 'enquiries', icon: MessageSquare, tone: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
    // Only a tile when something monitors it. Every other figure on this grid
    // is a live query; a hardcoded 99.9 sitting among them borrowed their
    // credibility for a number nobody had measured.
    ...(stats.uptime !== null
      ? [{ label: 'Platform uptime', value: `${stats.uptime}%`, sub: 'last 30 days', icon: Activity, tone: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-300' }]
      : [{ label: 'Platform uptime', value: '—', sub: 'no monitor connected', icon: Activity, tone: 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500' }]),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {sample && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Sample data — backend offline
          </span>
        )}
        <button onClick={() => void reload()} className="ml-auto inline-flex items-center gap-1.5 min-h-[44px] px-2 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
          <ArrowRight size={12} className="rotate-180" /> Refresh
        </button>
      </div>

      {/* AI briefing */}
      <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
        <div className="flex items-start gap-3">
          <Sparkles size={20} className="mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">Today's briefing</h3>
            <p className="text-sm mt-1.5 leading-relaxed opacity-95 max-w-3xl">
              {briefing.join(' ')}
            </p>
            {stats.pendingApprovals > 0 && (
              <Link to="/admin" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium bg-white text-purple-700 px-3.5 .5 rounded-lg hover:bg-purple-50 min-h-[44px]">
                Clear approvals <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* OS attention inbox — the front door: what the OS is waiting on today */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 inline-flex items-center gap-1.5">
            <Inbox size={13} /> Needs your attention
          </h3>
          {osUsingFallback && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">demo OS</span>
          )}
        </div>

        {osBriefing ? (
          attention.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
              {attention.map((a) => (
                <button
                  key={a.label}
                  onClick={() => onOpenModule?.(a.module)}
                  disabled={!onOpenModule}
                  className="inline-flex items-center rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 .5 text-left hover:bg-amber-100 dark:hover:bg-amber-900/40 transition disabled:opacity-100 min-h-[44px]"
                >
                  <div className="text-lg font-black text-amber-700 dark:text-amber-300">{a.value}</div>
                  <div className="text-[11px] font-medium text-amber-800 dark:text-amber-200">{a.label}</div>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Nothing needs your attention right now — every ledger is moving.</p>
          )
        ) : (
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Reading the OS ledgers…
          </div>
        )}
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {widgets.map((w) => (
          <div key={w.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${w.tone}`}>
              <w.icon size={17} />
            </div>
            <div className="text-2xl font-black text-gray-900 dark:text-white">{w.value}</div>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-300">{w.label}</div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{w.sub}</div>
          </div>
        ))}
      </div>

      {/* OS at a glance */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">OS at a glance</h3>
          <button onClick={() => void loadOs()} className="inline-flex items-center min-h-[44px] px-2 rounded-lg text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500">
            <ArrowRight size={12} className="rotate-180 inline mr-0.5" /> Refresh
          </button>
        </div>

        {osUsingFallback && (
          <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
            Demo OS — the os_* migrations aren't applied in this project yet. You're seeing the planned team and work;
            once they run, this strip reads the real ledgers.
          </div>
        )}

        {osBriefing ? (
          <>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              {[
                { label: 'Sign-offs waiting', value: osBriefing.pendingSignOffs, icon: ClipboardCheck, tone: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-300' },
                { label: 'Blocked work', value: osBriefing.blockedItems, icon: Kanban, tone: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-300' },
                { label: 'Open items', value: osBriefing.openItems, icon: TrendingUp, tone: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300' },
                { label: 'Agents working', value: `${osBriefing.agentsWorking}/${osBriefing.agents}`, icon: Bot, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
                { label: 'Knowledge docs', value: osBriefing.kbDocs, icon: BookOpen, tone: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
                { label: 'Decisions saved', value: osBriefing.kbDecisions, icon: Users, tone: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300' },
                { label: 'Launches ready', value: osBriefing.launchesReady, icon: Rocket, tone: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300' },
                { label: 'Partners active', value: osBriefing.partnersActive, icon: Building2, tone: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300' },
                { label: 'Press published', value: osBriefing.pressPublished, icon: Newspaper, tone: 'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-300' },
                { label: 'Campaigns live', value: osBriefing.campaignsLive, icon: Megaphone, tone: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300' },
              ].map((w) => (
                <div key={w.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${w.tone}`}><w.icon size={14} /></div>
                  <div className="text-lg font-black text-gray-900 dark:text-white">{w.value}</div>
                  <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{w.label}</div>
                </div>
              ))}
            </div>
            {onOpenModule && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => onOpenModule('workforce')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition min-h-[44px]">
                  Workforce Directory <ArrowRight size={12} />
                </button>
                <button onClick={() => onOpenModule('work-board')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition min-h-[44px]">
                  Work Board <ArrowRight size={12} />
                </button>
                <button onClick={() => onOpenModule('approvals')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                  Approvals Hub <ArrowRight size={12} />
                </button>
                <button onClick={() => onOpenModule('knowledge')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition min-h-[44px]">
                  Knowledge Base <ArrowRight size={12} />
                </button>
                <button onClick={() => onOpenModule('launch')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition min-h-[44px]">
                  Launch Control <ArrowRight size={12} />
                </button>
                <button onClick={() => onOpenModule('press-room')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition min-h-[44px]">
                  Press Room <ArrowRight size={12} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
            <Loader2 size={14} className="animate-spin" /> Reading the OS ledgers…
          </div>
        )}
      </div>

      {/* Quick routes */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Jump in</h3>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin" className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition min-h-[44px]">
            Admin console <ArrowRight size={12} />
          </Link>
          {onOpenModule && (
            <>
              <button onClick={() => onOpenModule('social')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                Social Media Department <ArrowRight size={12} />
              </button>
              <button onClick={() => onOpenModule('campaign-factory')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                Campaign Factory <ArrowRight size={12} />
              </button>
              <button onClick={() => onOpenModule('video-templates')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                Video Template Library <ArrowRight size={12} />
              </button>
              <button onClick={() => onOpenModule('founder')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                Founder Dashboard <ArrowRight size={12} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
