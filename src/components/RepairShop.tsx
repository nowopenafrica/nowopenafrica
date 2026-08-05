import { useMemo, useState } from 'react';
import {
  Wrench, Smartphone, Laptop, Camera, Gamepad2, CircuitBoard, HardDrive,
  ShieldCheck, CalendarCheck, MessageCircle, FileText, Search, ClipboardList, PackageCheck,
} from 'lucide-react';

export interface RepairService {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // device type
}

interface Props {
  repairs: RepairService[];
  ctaLabel: string;
  capabilities?: string[];
  showProcess?: boolean;
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: RepairService) => void;
  onEnquire: (context: string) => void;
}

// Quick "we fix" device tiles → enquiry.
const QUICK = [
  { icon: Smartphone, label: 'Phones', ctx: 'a phone repair' },
  { icon: Laptop, label: 'Laptops', ctx: 'a laptop repair' },
  { icon: Camera, label: 'Cameras', ctx: 'a camera repair' },
  { icon: Gamepad2, label: 'Consoles', ctx: 'a game-console repair' },
];

const iconFor = (cat?: string | null) => {
  switch ((cat || '').toLowerCase()) {
    case 'phones': return Smartphone;
    case 'laptops': return Laptop;
    case 'cameras': return Camera;
    case 'consoles': return Gamepad2;
    case 'board repair': return CircuitBoard;
    case 'data': return HardDrive;
    default: return Wrench;
  }
};

const STEPS = [
  { icon: Search, label: 'Free diagnosis' },
  { icon: FileText, label: 'Upfront quote' },
  { icon: Wrench, label: 'Expert repair' },
  { icon: PackageCheck, label: 'Warranty' },
];

export default function RepairShop({
  repairs, ctaLabel, capabilities = [], showProcess, hasPhone, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [type, setType] = useState('All');

  const types = useMemo(() => {
    const set = new Set<string>();
    repairs.forEach((r) => { if (r.service_category) set.add(r.service_category); });
    return ['All', ...[...set].sort()];
  }, [repairs]);

  const filtered = type === 'All' ? repairs : repairs.filter((r) => r.service_category === type);

  if (repairs.length === 0) {
    return (
      <div className="text-center py-12">
        <Wrench size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Repairs aren’t listed yet.</p>
        <button onClick={() => onEnquire('a device repair')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 transition text-sm">
          Get a repair quote
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* What we fix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {QUICK.map((q) => (
          <button
            key={q.label}
            onClick={() => onEnquire(q.ctx)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-4 hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-900/20 transition"
          >
            <span className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
              <q.icon size={18} className="text-violet-600 dark:text-violet-400" />
            </span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 text-center">{q.label}</span>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a repair quote (with my device details)')} className="inline-flex items-center gap-2 bg-violet-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-violet-700 transition">
          <FileText size={18} /> Get a quote
        </button>
        <button onClick={() => onEnquire('tracking my repair')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-violet-400 transition">
          <ClipboardList size={18} /> Track my repair
        </button>
      </div>

      {/* Trust badges */}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {capabilities.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-3 py-1.5 text-xs font-semibold">
              <ShieldCheck size={14} /> {c}
            </span>
          ))}
        </div>
      )}

      {/* How it works */}
      {showProcess && (
        <div className="grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-3 text-center">
              <div className="w-8 h-8 mx-auto rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-400">
                <s.icon size={16} />
              </div>
              <div className="mt-1.5 text-[10px] sm:text-xs font-semibold text-gray-600 dark:text-gray-300">{i + 1}. {s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Device filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-violet-300'}`}>{t}</button>
        ))}
      </div>

      {/* Repairs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((r) => {
          const Icon = iconFor(r.service_category);
          return (
            <div key={r.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{r.name}</h4>
                  {r.service_category && <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{r.service_category}</span>}
                </div>
                {r.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{r.description}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-violet-600 dark:text-violet-400">{r.price}</span>
                  <div className="flex items-center gap-1.5">
                    {hasPhone && (
                      <button onClick={() => onWhatsApp(r)} aria-label={`Ask about ${r.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                    )}
                    <button onClick={() => onBook(String(r.id))} className="inline-flex items-center gap-1 bg-violet-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-violet-700 transition">
                      <CalendarCheck size={13} /> {ctaLabel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
