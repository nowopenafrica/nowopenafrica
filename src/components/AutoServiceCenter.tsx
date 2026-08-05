import { useMemo, useState } from 'react';
import {
  Wrench, Gauge, ShieldCheck, PhoneCall, FileText, MessageCircle, CalendarCheck, Car,
} from 'lucide-react';

export interface AutoService {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // job type
}

interface Props {
  services: AutoService[];
  ctaLabel: string;
  capabilities?: string[];
  hasPhone?: boolean;
  phoneHref?: string | null;
  onBook: (id: string) => void;
  onWhatsApp: (item: AutoService) => void;
  onEnquire: (context: string) => void;
}

export default function AutoServiceCenter({
  services, ctaLabel, capabilities = [], hasPhone, phoneHref, onBook, onWhatsApp, onEnquire,
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
        <Wrench size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Services aren’t listed yet.</p>
        <button onClick={() => onEnquire('a repair or service')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Request a quote
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a repair quote')} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">
          <FileText size={18} /> Get a quote
        </button>
        <button onClick={() => onEnquire('a computer diagnostic')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-blue-400 transition">
          <Gauge size={18} /> Book a diagnostic
        </button>
        {hasPhone && phoneHref && (
          <a href={phoneHref} className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-red-700 transition">
            <PhoneCall size={18} /> Roadside help
          </a>
        )}
      </div>

      {/* Capabilities */}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {capabilities.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 text-xs font-semibold">
              <ShieldCheck size={14} /> {c}
            </span>
          ))}
        </div>
      )}

      {/* Job-type filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'}`}>
            {t !== 'All' && <Car size={13} />} {t}
          </button>
        ))}
      </div>

      {/* Services */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((s) => (
          <div key={s.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Wrench size={18} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-gray-900 dark:text-white truncate">{s.name}</h4>
                {s.service_category && <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{s.service_category}</span>}
              </div>
              {s.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.description}</p>}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{s.price}</span>
                <div className="flex items-center gap-1.5">
                  {hasPhone && (
                    <button onClick={() => onWhatsApp(s)} aria-label={`Ask about ${s.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                  )}
                  <button onClick={() => onBook(String(s.id))} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
                    <CalendarCheck size={13} /> {ctaLabel}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
