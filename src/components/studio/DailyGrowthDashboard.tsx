import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowRight, ArrowUp, Bell, Minus, Power, Sparkles } from 'lucide-react';
import { Business } from '../../types';
import { buildDailyBrief } from '../../lib/dailyBrief';
import { toggleBusinessStatus, loadClockConfig, resolveBusinessStatus, getStatusMeta } from '../../lib/businessStatus';
import { marketingHealth } from '../../lib/marketingHealth';
import { buildMorningBrief } from '../../lib/morningBrief';
import { GrowthPlanModule } from '../../lib/growth';
import TodayMission from './TodayMission';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
  onGo: (dept: string) => void;
}

const DEPT_ACTIONS: { dept: string; label: string; emoji: string }[] = [
  { dept: 'radar', label: 'Trend Radar', emoji: '📡' },
  { dept: 'factory', label: 'Content Factory', emoji: '🏭' },
  { dept: 'planner', label: 'Monthly Planner', emoji: '🗓️' },
  { dept: 'marketplace', label: 'Campaign Marketplace', emoji: '🛍️' },
  { dept: 'score', label: 'Growth Score', emoji: '📈' },
  { dept: 'director', label: 'Ask the Director', emoji: '🤖' },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

export default function DailyGrowthDashboard({ business, onGo }: Props) {
  const [now, setNow] = useState(new Date());
  const brief = buildDailyBrief(business, now);
  const health = marketingHealth(business);
  const morning = buildMorningBrief(business, now);
  const status = resolveBusinessStatus(business, loadClockConfig(business), now);

  const toggle = () => {
    const next = toggleBusinessStatus(business, now);
    const nextStatus = getStatusMeta(resolveBusinessStatus(business, next, now), business.category);
    toast.success(`Status updated — ${nextStatus.label}`);
    setNow(new Date());
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      {/* Left: greeting + status + mission */}
      <div className="xl:col-span-2 space-y-5">
        <div className="rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold">{brief.greeting}, {business.name}.</h3>
              <p className="text-sm text-purple-100 mt-1">Your daily growth dashboard — {brief.date}.</p>
            </div>
            <button onClick={toggle}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${status === 'closed'
                ? 'bg-white text-purple-700 hover:bg-purple-50'
                : 'bg-white/15 hover:bg-white/25'}`}>
              <Power size={14} /> {brief.statusEmoji} {brief.statusLabel} · tap to {status === 'closed' ? 'open' : 'close'}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
            <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
              <Bell size={12} /> {morning.weather.emoji} {morning.weather.condition}, {morning.weather.tempC}°C
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
              {brief.followers.toLocaleString()} followers
            </span>
            <span className="inline-flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
              {health.weakest.emoji} Focus: {health.weakest.label}
            </span>
          </div>
        </div>

        <TodayMission business={business} onCompleted={() => setNow(new Date())} />

        {/* Metrics */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-gray-900 dark:text-white">Today's numbers</h4>
            <span className="text-[11px] text-gray-400">Seeded estimates · refresh daily</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {brief.metrics.map((m) => (
              <div key={m.key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
                <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span>{m.emoji} {m.label}</span>
                  <span className={`inline-flex items-center gap-0.5 font-semibold ${m.trend === 'up' ? 'text-green-600 dark:text-green-400' : m.trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
                    {m.trend === 'up' ? <ArrowUp size={11} /> : m.trend === 'down' ? <ArrowDown size={11} /> : <Minus size={11} />}
                    {m.delta > 0 ? '+' : ''}{m.delta}%
                  </span>
                </div>
                <p className="mt-1.5 text-lg font-bold text-gray-900 dark:text-white">{fmt(m.value)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Coach */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1.5">
            <Sparkles size={15} className="text-purple-500" /> Director's note
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{brief.coach}</p>
          <button onClick={() => onGo('director')}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline">
            Talk to your AI Marketing Director <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* Right: score + quick actions */}
      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Business Growth Score</p>
          <div className="flex items-center gap-4 mt-2">
            <div className="relative w-24 h-24">
              <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-gray-200 dark:stroke-gray-700" />
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" stroke="url(#scoreGrad)" strokeLinecap="round"
                  strokeDasharray={`${health.score}, 100`} />
                <defs>
                  <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#d946ef" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900 dark:text-white">{health.score}</span>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{health.label}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{health.weakest.emoji} Weakest: {health.weakest.label}</p>
              <button onClick={() => onGo('score')}
                className="mt-2 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline">
                Open 11-dimension panel →
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-purple-950/40 dark:to-fuchsia-950/40 p-5 space-y-2.5">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles size={15} className="text-purple-500" /> Jump into a department
          </h4>
          {DEPT_ACTIONS.map((a) => (
            <button key={a.dept} onClick={() => onGo(a.dept)}
              className="w-full flex items-center justify-between text-left rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2.5 hover:border-purple-300 dark:hover:border-purple-600 transition">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <span>{a.emoji}</span> {a.label}
              </span>
              <ArrowRight size={14} className="text-purple-500" />
            </button>
          ))}
        </div>

        {/* Notices preview */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
            <Bell size={15} className="text-purple-500" /> Notifications
          </h4>
          <ul className="space-y-2.5">
            {morning.notifications.slice(0, 4).map((n) => (
              <li key={n.id} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                <span className="mt-0.5">{n.emoji}</span>
                <span>
                  <span className="font-semibold text-gray-900 dark:text-white">{n.title}</span> — {n.body}
                </span>
              </li>
            ))}
          </ul>
          <button onClick={() => onGo('notifications')}
            className="mt-3 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline">
            See all notifications →
          </button>
        </div>
      </div>
    </div>
  );
}
