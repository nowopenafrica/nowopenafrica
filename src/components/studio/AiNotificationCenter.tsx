import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight, Bell, Power } from 'lucide-react';
import { Business } from '../../types';
import { buildMorningBrief } from '../../lib/morningBrief';
import { toggleBusinessStatus, loadClockConfig, resolveBusinessStatus, getStatusMeta } from '../../lib/businessStatus';
import { GrowthPlanModule } from '../../lib/growth';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
}

const toneColors: Record<string, string> = {
  good: 'text-green-600 dark:text-green-400',
  warn: 'text-amber-600 dark:text-amber-400',
  info: 'text-purple-600 dark:text-purple-400',
  tip: 'text-blue-600 dark:text-blue-400',
};

export default function AiNotificationCenter({ business, onNavigate }: Props) {
  const [now, setNow] = useState(new Date());
  const brief = buildMorningBrief(business, now);
  const status = resolveBusinessStatus(business, loadClockConfig(business), now);

  const toggle = () => {
    const next = toggleBusinessStatus(business, now);
    toast.success(`Status updated — ${getStatusMeta(resolveBusinessStatus(business, next, now), business.category).label}`);
    setNow(new Date());
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center">
          <Bell size={18} />
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">AI Notifications</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{brief.greeting}, {business.name} — {brief.date}.</p>
        </div>
      </div>

      {/* Status + weather */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`rounded-2xl border p-5 ${status === 'closed' ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800' : 'border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-950/30'}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Live status</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{brief.statusEmoji} {brief.statusLabel}</p>
          <button onClick={toggle}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 transition">
            <Power size={12} /> Tap to {status === 'closed' ? 'open' : 'close'}
          </button>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Weather</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{brief.weather.emoji} {brief.weather.condition}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{brief.weather.tempC}°C · {brief.weather.rainPct}% rain · {brief.season} season</p>
        </div>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Day highlight</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white leading-snug">{brief.highlight}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{brief.weekend ? 'Weekend — offers convert best now.' : 'Weekday — build momentum for the weekend.'}</p>
        </div>
      </div>

      {/* Notification list */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Today's notices ({brief.notifications.length})</h4>
        </div>
        <ul className="space-y-2.5">
          {brief.notifications.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 p-3.5">
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none mt-0.5">{n.emoji}</span>
                <div>
                  <p className={`text-sm font-semibold ${toneColors[n.tone]}`}>{n.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{n.body}</p>
                </div>
              </div>
              <button onClick={() => onNavigate(n.module)}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline">
                Fix <ArrowRight size={11} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
