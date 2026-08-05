import { useMemo, useState } from 'react';
import {
  Scale, ShieldCheck, Lock, FileText, CalendarCheck, MessageCircle,
} from 'lucide-react';

export interface LegalService {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // practice area
}

interface Props {
  services: LegalService[];
  ctaLabel: string;
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: LegalService) => void;
  onEnquire: (context: string) => void;
}

export default function LegalPractice({ services, ctaLabel, hasPhone, onBook, onWhatsApp, onEnquire }: Props) {
  const [area, setArea] = useState('All');

  const areas = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => { if (s.service_category) set.add(s.service_category); });
    return ['All', ...[...set].sort()];
  }, [services]);

  const filtered = area === 'All' ? services : services.filter((s) => s.service_category === area);

  if (services.length === 0) {
    return (
      <div className="text-center py-12">
        <Scale size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Practice areas aren’t listed yet.</p>
        <button onClick={() => onEnquire('a legal matter')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about a matter
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Trust + secure docs */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a confidential consultation')} className="inline-flex items-center gap-2 bg-slate-800 dark:bg-slate-700 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-slate-900 transition">
          <FileText size={18} /> Book a consultation
        </button>
        <button onClick={() => onEnquire('secure document sharing for my matter')} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-2 text-xs font-semibold hover:bg-blue-100 transition">
          <Lock size={14} /> Share documents securely
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-2 text-xs font-semibold">
          <ShieldCheck size={14} /> Strictly confidential
        </span>
      </div>

      {/* Practice area filter */}
      <div className="flex flex-wrap gap-2">
        {areas.map((a) => (
          <button key={a} onClick={() => setArea(a)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${area === a ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'}`}>{a}</button>
        ))}
      </div>

      {/* Services */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Practice areas &amp; services</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((s) => (
            <div key={s.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Scale size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{s.name}</h4>
                  {s.service_category && <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{s.service_category}</span>}
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
    </div>
  );
}
