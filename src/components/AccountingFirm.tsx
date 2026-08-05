import { useMemo, useState } from 'react';
import {
  Calculator, BadgeCheck, CalendarCheck, MessageCircle, FileText, Landmark, CalendarClock,
} from 'lucide-react';

export interface AccountingService {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // service line
}

interface Props {
  services: AccountingService[];
  ctaLabel: string;
  capabilities?: string[];
  hasPhone?: boolean;
  showCompliance?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: AccountingService) => void;
  onEnquire: (context: string) => void;
}

export default function AccountingFirm({
  services, ctaLabel, capabilities = [], hasPhone, showCompliance, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [line, setLine] = useState('All');

  const lines = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => { if (s.service_category) set.add(s.service_category); });
    return ['All', ...[...set].sort()];
  }, [services]);

  const filtered = line === 'All' ? services : services.filter((s) => s.service_category === line);

  if (services.length === 0) {
    return (
      <div className="text-center py-12">
        <Calculator size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Services aren’t listed yet.</p>
        <button onClick={() => onEnquire('an accounting consultation')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition text-sm">
          Book a consultation
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a free first consultation')} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-emerald-700 transition">
          <CalendarCheck size={18} /> Book a consultation
        </button>
        <button onClick={() => onEnquire('a fixed-fee quote')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-emerald-400 transition">
          <FileText size={18} /> Request a quote
        </button>
      </div>

      {/* Credential badges */}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {capabilities.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 text-xs font-semibold">
              <BadgeCheck size={14} /> {c}
            </span>
          ))}
        </div>
      )}

      {/* Compliance nudge */}
      {showCompliance && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-900/20 p-4">
          <CalendarClock size={20} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Never miss a filing deadline</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">We track your VAT, PAYE and annual returns and file on time — ask about our compliance calendar.</p>
          </div>
        </div>
      )}

      {/* Service-line filter */}
      <div className="flex flex-wrap gap-2">
        {lines.map((l) => (
          <button key={l} onClick={() => setLine(l)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${line === l ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-emerald-300'}`}>{l}</button>
        ))}
      </div>

      {/* Services */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((s) => (
          <div key={s.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
              <Landmark size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-gray-900 dark:text-white truncate">{s.name}</h4>
                {s.service_category && <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{s.service_category}</span>}
              </div>
              {s.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{s.description}</p>}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{s.price}</span>
                <div className="flex items-center gap-1.5">
                  {hasPhone && (
                    <button onClick={() => onWhatsApp(s)} aria-label={`Ask about ${s.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                  )}
                  <button onClick={() => onBook(String(s.id))} className="inline-flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-700 transition">
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
