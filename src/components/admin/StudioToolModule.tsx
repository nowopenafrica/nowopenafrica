import { useState, type ReactNode } from 'react';
import { Sparkles, type LucideIcon } from 'lucide-react';
import type { Business } from '../../types';
import AdminBusinessPicker, { type BusinessPickerMeta } from './AdminBusinessPicker';

// The standard internal-module frame: a live stat strip, the shared business
// picker, and the selected business's real Studio tool below. Every module
// that reuses a per-business tool renders through this so the picker, the
// strip styling and the layout stay consistent across departments.

export interface ModuleProps {
  /** Navigate the shell to another department (e.g. "design this" → Creative). */
  onOpenSection?: (id: string) => void;
}

export interface StatItem {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone: string;
}

interface Props extends ModuleProps {
  idPrefix: string;
  title: (business: Business) => string;
  stats: (meta: BusinessPickerMeta) => StatItem[];
  render: (business: Business, openSection: (id: string) => void) => ReactNode;
  empty?: string;
}

export default function StudioToolModule({ idPrefix, title, stats, render, empty, onOpenSection }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openSection = (id: string) => onOpenSection?.(id);

  return (
    <AdminBusinessPicker selectedId={selectedId} onSelect={setSelectedId}
      strip={(m) => (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats(m).map((w) => (
            <div key={w.label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${w.tone}`}>
                <w.icon size={17} />
              </div>
              <div className="text-2xl font-black text-gray-900 dark:text-white">{w.value}</div>
              <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{w.label}</div>
            </div>
          ))}
        </div>
      )}
      tool={(selected) => selected ? (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-purple-500" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title(selected)}</h3>
          </div>
          <div key={`${idPrefix}-${selected.id}`}>{render(selected, openSection)}</div>
        </div>
      ) : (
        <p className="text-sm text-gray-400">{empty ?? 'Select a business above to open its tool.'}</p>
      )}
    />
  );
}
