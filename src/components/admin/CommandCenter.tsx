import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ShoppingBag, BadgeCheck, Users, Banknote, Inbox, Megaphone, CalendarClock, Rocket, Video, TrendingUp, MessageSquare, Activity, ArrowRight, Loader2 } from 'lucide-react';
import { aiRecommendations } from '../../lib/adminCreator';
import { useCommandData } from '../../hooks/useCommandData';

// The Growth Command Center — "what's happening today". Pulls the real
// Supabase tables the admin console uses (published posts now come from the
// social_publish_log; the per-business Studio pipeline still lives in
// localStorage because there is no backend table for it yet). Only falls back
// to clearly-labelled sample data when the backend itself is unreachable so
// the dashboard is always alive in dev. The fetch lives in useCommandData so
// the Founder Dashboard reads the same numbers.

const fmtMoney = (n: number): string => n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : `₦${n.toLocaleString()}`;

export default function CommandCenter({ onOpenModule }: { onOpenModule?: (id: string) => void }) {
  const { stats, sample, loading, reload } = useCommandData();

  const briefing = useMemo(() => (stats ? aiRecommendations(stats) : []), [stats]);

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
    { label: 'Platform uptime', value: `${stats.uptime}%`, sub: 'last 30 days', icon: Activity, tone: 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-300' },
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
              <Link to="/admin" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium bg-white text-purple-700 px-3.5 py-1.5 rounded-lg hover:bg-purple-50">
                Clear approvals <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
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

      {/* Quick routes */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Jump in</h3>
        <div className="flex flex-wrap gap-2">
          <Link to="/admin" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition">
            Admin console <ArrowRight size={12} />
          </Link>
          {onOpenModule && (
            <>
              <button onClick={() => onOpenModule('social')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
                Social Media Department <ArrowRight size={12} />
              </button>
              <button onClick={() => onOpenModule('campaign-factory')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
                Campaign Factory <ArrowRight size={12} />
              </button>
              <button onClick={() => onOpenModule('video-templates')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
                Video Template Library <ArrowRight size={12} />
              </button>
              <button onClick={() => onOpenModule('founder')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
                Founder Dashboard <ArrowRight size={12} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
