import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Trophy, CheckCircle2, Circle, ArrowRight, Sparkles, Star } from 'lucide-react';
import { Business } from '../../types';
import { GrowthPlanModule, weeklyPlan, planStorageKey } from '../../lib/growth';
import { publishedThisWeek } from '../../lib/planner';
import { loadPromos, promoCounts } from '../../lib/promotions';
import { loadReviews } from '../../lib/reviews';
import { CHALLENGES, tasksFor, challengeProgress, loadClaimed, saveClaimed, totalPoints } from '../../lib/challenges';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
}

function rankFor(points: number): string {
  if (points >= 500) return 'Growth Champion';
  if (points >= 300) return 'Rising Star';
  if (points >= 100) return 'Starter';
  return 'Newcomer';
}

export default function GrowthChallenges({ business, onNavigate }: Props) {
  const [claimed, setClaimed] = useState<string[]>(() => loadClaimed(business.id));
  const [tab, setTab] = useState<'open' | 'done'>('open');

  const stats = useMemo(() => {
    let planDone = 0;
    try {
      const raw = localStorage.getItem(planStorageKey(business.id));
      planDone = raw ? (JSON.parse(raw) as string[]).length : 0;
    } catch { /* ignore */ }
    const planTotal = weeklyPlan(business).length;
    const promos = loadPromos(business.id);
    const counts = promoCounts(promos);
    const reviews = loadReviews(business.id);
    return {
      business,
      planDone: Math.min(planDone, planTotal),
      planTotal,
      plannerPublished: publishedThisWeek(business.id),
      promosTotal: counts.total,
      livePromos: counts.live,
      promosShared: counts.shared,
      reviewsCount: reviews.length,
      respondedCount: reviews.filter((r) => r.replied).length,
    };
  }, [business]);

  const cards = useMemo(() => CHALLENGES.map((c) => {
    const tasks = tasksFor(c, stats);
    const { done, total } = challengeProgress(tasks);
    return { challenge: c, tasks, done, total, complete: total > 0 && done === total };
  }), [stats]);

  const points = totalPoints(business.id, CHALLENGES);
  const visible = cards.filter((c) => (tab === 'open' ? !c.complete : c.complete));

  const claim = (id: string) => {
    const next = [...claimed, id];
    setClaimed(next);
    saveClaimed(business.id, next);
    const c = CHALLENGES.find((x) => x.id === id);
    toast.success(`${c?.points} points claimed! Keep going.`);
  };

  return (
    <div className="space-y-6">
      {/* Header + score */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Trophy size={26} />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold">{rankFor(points)}</h3>
            <p className="text-sm opacity-90">Complete challenges to earn growth points and level up your business. Every task links straight into the Studio tool that finishes it.</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black">{points}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">Growth points</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('open')}
          className={`inline-flex items-center px-3.5 .5 rounded-lg text-sm font-medium transition ${tab === 'open' ? 'bg-purple-600 text-white' : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'} min-h-[44px]`}>
          Open ({cards.filter((c) => !c.complete).length})
        </button>
        <button onClick={() => setTab('done')}
          className={`inline-flex items-center px-3.5 .5 rounded-lg text-sm font-medium transition ${tab === 'done' ? 'bg-green-600 text-white' : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'} min-h-[44px]`}>
          Completed ({cards.filter((c) => c.complete).length})
        </button>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <Sparkles size={24} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{tab === 'open' ? 'All challenges complete — you are on fire!' : 'No completed challenges yet. Finish one to see it here.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map(({ challenge: c, tasks, done, total, complete }) => {
            const isClaimed = claimed.includes(c.id);
            return (
              <div key={c.id} className={`rounded-2xl border p-5 bg-white dark:bg-gray-800 ${complete ? 'border-green-300 dark:border-green-700' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${complete ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'}`}>
                      <Trophy size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">{c.title}</h3>
                      <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">{c.points} points</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{done}/{total}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">{c.desc}</p>

                <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${complete ? 'bg-green-500' : 'bg-amber-500'}`}
                    style={{ width: `${(done / total) * 100}%` }} />
                </div>

                <div className="mt-3 space-y-1.5">
                  {tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-xs">
                      {t.done
                        ? <CheckCircle2 size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                        : <Circle size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />}
                      <span className={`${t.done ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>{t.label}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  {complete && !isClaimed ? (
                    <button onClick={() => claim(c.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-bold bg-amber-500 text-amber-950 hover:bg-amber-400 transition min-h-[44px]">
                      <Star size={14} /> Claim {c.points} pts
                    </button>
                  ) : complete && isClaimed ? (
                    <span className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400">
                      <CheckCircle2 size={14} /> Claimed
                    </span>
                  ) : (
                    <button onClick={() => onNavigate(c.module)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                      Start in Studio <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
