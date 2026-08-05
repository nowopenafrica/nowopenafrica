import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Target, CheckCircle2, Circle, ArrowRight, TrendingUp, ListChecks, PenLine, WalletCards, QrCode, MessageCircle, CalendarDays, LayoutTemplate } from 'lucide-react';
import { Business } from '../../types';
import { growthScore, scoreLabel, weeklyPlan, planStorageKey, GrowthPlanModule } from '../../lib/growth';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
}

const QUICK_ACTIONS: { module: GrowthPlanModule; label: string; desc: string; icon: typeof Target }[] = [
  { module: 'social', label: 'Social Post', desc: 'Design this week’s post', icon: LayoutTemplate },
  { module: 'promotions', label: 'Promotion', desc: 'Build a weekend offer', icon: WalletCards },
  { module: 'copywriter', label: 'AI Copywriter', desc: 'Captions, ads & SMS', icon: PenLine },
  { module: 'assistant', label: 'Marketing Assistant', desc: 'Ask anything, get answers', icon: MessageCircle },
  { module: 'planner', label: 'Content Planner', desc: 'Schedule the week ahead', icon: CalendarDays },
  { module: 'qr', label: 'QR Studio', desc: 'Flyer-ready smart links', icon: QrCode },
];

export default function GrowthHome({ business, onNavigate }: Props) {
  const { score, items } = useMemo(() => growthScore(business), [business]);
  const plan = useMemo(() => weeklyPlan(business), [business]);
  const storageKey = useMemo(() => planStorageKey(business.id), [business.id]);

  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setDone(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setDone(new Set());
    }
  }, [storageKey]);

  const toggle = (id: string) => {
    const next = new Set(done);
    if (next.has(id)) next.delete(id); else next.add(id);
    setDone(next);
    localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
  };

  const quickCount = plan.filter((t) => t.effort === 'quick').length;
  const progress = plan.length ? Math.round((done.size / plan.length) * 100) : 0;
  const circumference = 2 * Math.PI * 54;

  return (
    <div className="space-y-6">
      {/* Hero: score + plan */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp size={16} className="text-purple-600 dark:text-purple-400" /> NowOpen Growth Score
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{scoreLabel(score)} — how discoverable your business is right now.</p>
            </div>
            <span className="text-3xl font-black text-purple-600 dark:text-purple-400">{score}</span>
          </div>

          <div className="flex items-center gap-4 mt-4">
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                <circle cx="64" cy="64" r="54" fill="none" strokeWidth="12" className="stroke-gray-100 dark:stroke-gray-700" />
                <circle cx="64" cy="64" r="54" fill="none" strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference - (score / 100) * circumference}
                  className="stroke-purple-500 transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-gray-900 dark:text-white">{score}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">/ 100</span>
              </div>
            </div>

            <div className="flex-1 space-y-2">
              {items.map((i) => (
                <div key={i.label}>
                  <div className="flex items-center justify-between text-[11px] font-medium text-gray-600 dark:text-gray-300">
                    <span>{i.label}</span>
                    <span className="text-gray-400">{i.earned}/{i.max}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-700"
                      style={{ width: `${(i.earned / i.max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => onNavigate('health')}
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:underline">
            See full Business Health dashboard <ArrowRight size={14} />
          </button>
        </div>

        {/* Weekly plan */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ListChecks size={16} className="text-purple-600 dark:text-purple-400" /> This Week’s Growth Plan
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {quickCount} quick wins, {plan.length - quickCount} bigger moves. Tick them off as you go.
              </p>
            </div>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400">{progress}%</span>
          </div>

          <div className="mt-4 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className="h-full rounded-full bg-purple-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
            {plan.map((t) => {
              const isDone = done.has(t.id);
              return (
                <button key={t.id} onClick={() => toggle(t.id)}
                  className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl border transition ${isDone ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  {isDone
                    ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                    : <Circle size={17} className="mt-0.5 shrink-0 text-gray-300 dark:text-gray-600" />}
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${isDone ? 'text-green-800 dark:text-green-300 line-through' : 'text-gray-800 dark:text-gray-200'}`}>{t.title}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{t.detail}</span>
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400"
                      onClick={(e) => { e.stopPropagation(); onNavigate(t.module); }}>
                      Open module <ArrowRight size={10} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.module} onClick={() => onNavigate(a.module)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-left transition hover:border-purple-300 dark:hover:border-purple-700 hover:shadow-sm">
            <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-2">
              <a.icon size={17} className="text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{a.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{a.desc}</p>
          </button>
        ))}
      </div>

      {/* Coach tip */}
      <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
        <div className="flex items-start gap-3">
          <Sparkles size={20} className="mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">Coach’s tip of the week</h3>
            <p className="text-sm mt-1 opacity-90 leading-relaxed max-w-2xl">
              {`Businesses that post once a week and run one promotion get far more profile views. Finish the plan above and watch your score climb.`}
            </p>
            <button onClick={() => onNavigate('assistant')}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium bg-white text-purple-700 px-3.5 py-1.5 rounded-lg hover:bg-purple-50">
              <Target size={14} /> Ask the Marketing Assistant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
