import { CalendarClock, Wrench, type LucideIcon } from 'lucide-react';
import type { AdminSection } from '../../lib/adminCreator';
import { SECTION_ICONS } from './sectionIcons';

// A real "page" for the sections still on the roadmap, so every sidebar item
// opens something meaningful: the section's plan, what it builds on, and an
// honest status — instead of the generic module grid.

export default function SectionPlanned({ section }: { section: AdminSection }) {
  const Icon: LucideIcon = SECTION_ICONS[section.id] ?? CalendarClock;
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
          <Icon size={22} className="text-purple-600 dark:text-purple-400" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">Planned</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Section {section.num}</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-1">{section.label}</h3>
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 leading-relaxed">{section.blurb}</p>

      {section.reuses && section.reuses.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-400 mt-0.5">Builds on:</span>
          {section.reuses.map((r) => (
            <span key={r} className="px-2 py-0.5 rounded-full text-[10px] font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30">{r}</span>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <Wrench size={15} className="shrink-0" />
        This department is next on the roadmap — the existing business-facing tools it builds on already work in NowOpen Studio.
      </div>
    </div>
  );
}
