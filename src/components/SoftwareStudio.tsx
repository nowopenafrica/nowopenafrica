import { useMemo, useState } from 'react';
import {
  Code2, Cpu, Cloud, ShieldCheck, LifeBuoy, Database, Smartphone,
  CalendarCheck, MessageCircle, FileText, Rocket,
} from 'lucide-react';

export interface SoftwareService {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // practice
}

export interface CaseStat { value: string; label: string; }

interface Props {
  services: SoftwareService[];
  ctaLabel: string;
  stats?: CaseStat[];
  stack?: string[];
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: SoftwareService) => void;
  onEnquire: (context: string) => void;
}

const iconFor = (cat?: string | null) => {
  switch ((cat || '').toLowerCase()) {
    case 'web': return Code2;
    case 'mobile': return Smartphone;
    case 'cloud': return Cloud;
    case 'security': return ShieldCheck;
    case 'support': return LifeBuoy;
    case 'data & ai': return Database;
    default: return Cpu;
  }
};

export default function SoftwareStudio({
  services, ctaLabel, stats = [], stack = [], hasPhone, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [type, setType] = useState('All');

  const types = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => { if (s.service_category) set.add(s.service_category); });
    return ['All', ...[...set].sort()];
  }, [services]);

  const filtered = type === 'All' ? services : services.filter((s) => s.service_category === type);

  if (services.length === 0) {
    return (
      <div className="text-center py-12">
        <Code2 size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Services aren’t listed yet.</p>
        <button onClick={() => onEnquire('a software project')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 text-white font-medium rounded-lg hover:bg-cyan-700 transition text-sm">
          Book a discovery call
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a discovery call')} className="inline-flex items-center gap-2 bg-cyan-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-cyan-700 transition">
          <Rocket size={18} /> Book a discovery call
        </button>
        <button onClick={() => onEnquire('a project scope & quote')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-cyan-400 transition">
          <FileText size={18} /> Request a quote
        </button>
      </div>

      {/* Delivery proof */}
      {stats.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/60 dark:bg-cyan-900/20 px-3 py-4 text-center">
              <div className="text-xl sm:text-2xl font-extrabold text-cyan-600 dark:text-cyan-400">{s.value}</div>
              <div className="mt-1 text-[11px] sm:text-xs font-medium text-gray-600 dark:text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tech stack */}
      {stack.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stack.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 px-3 py-1.5 text-xs font-semibold">
              <Code2 size={14} /> {t}
            </span>
          ))}
        </div>
      )}

      {/* Practice filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-cyan-300'}`}>{t}</button>
        ))}
      </div>

      {/* Services */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((s) => {
          const Icon = iconFor(s.service_category);
          return (
            <div key={s.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{s.name}</h4>
                  {s.service_category && <span className="text-[10px] font-semibold text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{s.service_category}</span>}
                </div>
                {s.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.description}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400">{s.price}</span>
                  <div className="flex items-center gap-1.5">
                    {hasPhone && (
                      <button onClick={() => onWhatsApp(s)} aria-label={`Ask about ${s.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                    )}
                    <button onClick={() => onBook(String(s.id))} className="inline-flex items-center gap-1 bg-cyan-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-cyan-700 transition">
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
