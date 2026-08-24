import { useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Sparkles } from 'lucide-react';
import { Business } from '../../types';
import { buildMonthPlan, saveMonthToPlanner, WEEK_THEMES } from '../../lib/contentLadder';
import ContentPlanner from './ContentPlanner';

interface Props {
  business: Business;
}

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function MonthlyPlanner({ business }: Props) {
  const base = new Date();
  const [month, setMonth] = useState(base.getMonth());
  const [year, setYear] = useState(base.getFullYear());

  const plan = buildMonthPlan(business, { year, month });

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const generate = () => {
    const added = saveMonthToPlanner(business.id, plan);
    toast.success(added > 0 ? `Added ${added} days to your calendar` : 'Month already in your calendar');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center">
            <CalendarDays size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">AI Monthly Planner</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Generates the whole month — every day has a theme, caption and platform.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} className="w-[44px] h-[44px] rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
            <ChevronLeft size={16} />
          </button>
          <span className="px-3 py-2 text-sm font-bold text-gray-900 dark:text-white rounded-lg border border-gray-200 dark:border-gray-700">
            {MONTH_LABELS[month]} {year}
          </span>
          <button onClick={() => shift(1)} className="w-[44px] h-[44px] rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
            <ChevronRight size={16} />
          </button>
          <button onClick={generate}
            className="inline-flex items-center gap-1.5 px-4 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition min-h-[44px]">
            <Download size={13} /> Add {plan.length} days to calendar
          </button>
        </div>
      </div>

      {/* Theme legend */}
      <div className="flex flex-wrap gap-2">
        {WEEK_THEMES.map((t) => (
          <span key={t.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
            {t.emoji} {t.label}
          </span>
        ))}
      </div>

      {/* Generated days */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={15} className="text-blue-500" />
          <h4 className="text-sm font-bold text-gray-900 dark:text-white">{plan.length} days generated for {MONTH_LABELS[month]} {year}</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {plan.map((day) => (
            <div key={day.date} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span className="font-semibold">{day.dayName} {day.date.slice(8)}</span>
                <span>{day.emoji} {day.theme.label}</span>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white leading-snug">{day.title}</p>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{day.platform} · {day.format}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Existing calendar */}
      <div>
        <ContentPlanner key={`${business.id}-monthly-planner`} business={business} />
      </div>
    </div>
  );
}
