import { Gauge, ChevronDown, CheckCircle2, AlertTriangle, BadgeCheck, Palette, MonitorSmartphone } from 'lucide-react';
import { DesignCoachReport, ChannelScore } from '../../lib/designCoach';

const GRADE_COLOR: Record<DesignCoachReport['grade'], string> = {
  A: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-50 dark:bg-emerald-900/30',
  B: 'text-blue-600 dark:text-blue-400 border-blue-500/40 bg-blue-50 dark:bg-blue-900/30',
  C: 'text-amber-600 dark:text-amber-400 border-amber-500/40 bg-amber-50 dark:bg-amber-900/30',
  D: 'text-orange-600 dark:text-orange-400 border-orange-500/40 bg-orange-50 dark:bg-orange-900/30',
  E: 'text-red-600 dark:text-red-400 border-red-500/40 bg-red-50 dark:bg-red-900/30',
};

function barColor(score: number) {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 45) return 'bg-amber-500';
  return 'bg-red-500';
}

// Live, rule-based "AI Design Coach": scores the current design the moment any
// input changes and lists what to fix. Collapsible so it never crowds the
// editing controls.
export default function DesignCoachPanel({
  report,
  channels,
  onApplyBrandAccent,
  open,
  onToggle,
}: {
  report: DesignCoachReport;
  /** Per-surface readiness. Omit to hide the section. */
  channels?: ChannelScore[];
  onApplyBrandAccent: () => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
        <span className="inline-flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-100">
          <Gauge size={16} className="text-purple-600" /> AI Design Coach
        </span>
        <span className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold border ${GRADE_COLOR[report.grade]}`}>
            {report.grade} · {report.overall}/100
          </span>
          <ChevronDown size={15} className={`text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700">
          <div className="pt-3 space-y-2">
            {report.metrics.map((m) => (
              <div key={m.key}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{m.label}</span>
                  <span className="font-bold text-gray-700 dark:text-gray-200">{m.score}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className={`h-full rounded-full ${barColor(m.score)}`} style={{ width: `${m.score}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 pt-1">
            {report.tips.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                {t.level === 'good'
                  ? <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                  : t.level === 'warn'
                    ? <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                    : <AlertTriangle size={13} className="text-red-500 mt-0.5 shrink-0" />}
                <span className={t.level === 'good' ? 'text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-300'}>{t.text}</span>
              </div>
            ))}
          </div>

          {channels && channels.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-700 dark:text-gray-200 mb-2">
                <MonitorSmartphone size={12} className="text-purple-600 dark:text-purple-400" />
                Where this design works
              </p>
              <div className="space-y-2">
                {channels.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="font-semibold text-gray-600 dark:text-gray-300">{c.label}</span>
                      <span className="font-bold text-gray-700 dark:text-gray-200 tabular-nums">{c.score}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor(c.score)}`} style={{ width: `${c.score}%` }} />
                    </div>
                    <p className="mt-0.5 text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                      {c.note} <span className="text-gray-400 dark:text-gray-500">({c.basis})</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.canApplyBrand && (
            <button
              onClick={onApplyBrandAccent}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition"
            >
              <Palette size={13} /> Apply my saved brand colour
            </button>
          )}
          <p className="text-[10px] text-gray-400 flex items-center gap-1 pt-0.5">
            <BadgeCheck size={11} /> Scores update live as you edit — a rule-based preview, not a guarantee.
          </p>
        </div>
      )}
    </div>
  );
}
