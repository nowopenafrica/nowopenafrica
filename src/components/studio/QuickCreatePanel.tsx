import { Sparkles, Rocket, BadgeCheck } from 'lucide-react';
import { QUICK_CREATE_ITEMS, QuickCreateItem } from '../../data/quickCreate';

// The founder's #1 request: a "Quick Create" entry point above the editor that
// turns a business goal into a finished design in one tap. Each card selects
// the right occasion template + default format inside DesignStudio.
export default function QuickCreatePanel({
  onPick,
  disabled,
}: {
  onPick: (item: QuickCreateItem) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800">
      <div className="flex items-center gap-3 px-5 pt-4 pb-1">
        <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-purple-700 dark:text-purple-300">
          <Sparkles size={15} /> Quick Create
        </span>
        <span className="text-[11px] text-gray-400">A 60-second design from any business goal</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 p-4">
        {QUICK_CREATE_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onPick(item)}
            disabled={disabled}
            className="group text-left px-3.5 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-lg hover:-translate-y-0.5 transition disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              <span className="text-xl leading-none">{item.emoji}</span>
              {item.fullCampaign && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-1.5 py-0.5 rounded">
                  <Rocket size={10} /> AI
                </span>
              )}
            </span>
            <span className="block mt-1.5 text-sm font-bold text-gray-800 dark:text-gray-100">{item.label}</span>
            <span className="block mt-0.5 text-[11px] text-gray-400">{item.desc}</span>
          </button>
        ))}
        <div className="col-span-2 sm:col-span-3 lg:col-span-1 flex flex-col justify-center text-left px-3.5 py-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-[11px] text-gray-400">
          <BadgeCheck size={14} className="mb-1 text-purple-400" />
          Pick any template below to see every size & style
        </div>
      </div>
    </div>
  );
}
