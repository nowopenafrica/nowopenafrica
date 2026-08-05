import { useMemo, useState } from 'react';
import {
  Baby, ShieldCheck, CalendarCheck, MessageCircle, MapPin, ClipboardList, Heart,
} from 'lucide-react';

export interface CareProgram {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // age group
}

interface Props {
  programs: CareProgram[];
  ctaLabel: string;
  capabilities?: string[];
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: CareProgram) => void;
  onEnquire: (context: string) => void;
}

export default function ChildcareCenter({
  programs, ctaLabel, capabilities = [], hasPhone, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [group, setGroup] = useState('All');

  const groups = useMemo(() => {
    const set = new Set<string>();
    programs.forEach((p) => { if (p.service_category) set.add(p.service_category); });
    return ['All', ...[...set]];
  }, [programs]);

  const filtered = group === 'All' ? programs : programs.filter((p) => p.service_category === group);

  if (programs.length === 0) {
    return (
      <div className="text-center py-12">
        <Baby size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Programmes aren’t listed yet.</p>
        <button onClick={() => onEnquire('a place for my child')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-pink-600 text-white font-medium rounded-lg hover:bg-pink-700 transition text-sm">
          Enquire about enrolment
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a tour of the centre')} className="inline-flex items-center gap-2 bg-pink-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-pink-700 transition">
          <MapPin size={18} /> Book a tour
        </button>
        <button onClick={() => onEnquire('enrolment / a place for my child')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-pink-400 transition">
          <ClipboardList size={18} /> Enrol now
        </button>
      </div>

      {/* Safety & care badges */}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {capabilities.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 px-3 py-1.5 text-xs font-semibold">
              <ShieldCheck size={14} /> {c}
            </span>
          ))}
        </div>
      )}

      {/* Age-group filter */}
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <button key={g} onClick={() => setGroup(g)} className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${group === g ? 'bg-pink-600 border-pink-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-pink-300'}`}>
            {g !== 'All' && <Baby size={13} />} {g}
          </button>
        ))}
      </div>

      {/* Programmes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map((p) => (
          <div key={p.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="w-10 h-10 rounded-xl bg-pink-50 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0">
              <Heart size={18} className="text-pink-600 dark:text-pink-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-gray-900 dark:text-white">{p.name}</h4>
                {p.service_category && <span className="text-[10px] font-semibold text-pink-700 dark:text-pink-400 bg-pink-50 dark:bg-pink-900/30 rounded px-1.5 py-0.5">{p.service_category}</span>}
              </div>
              {p.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{p.description}</p>}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-pink-600 dark:text-pink-400">{p.price}</span>
                <div className="flex items-center gap-1.5">
                  {hasPhone && (
                    <button onClick={() => onWhatsApp(p)} aria-label={`Ask about ${p.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                  )}
                  <button onClick={() => onBook(String(p.id))} className="inline-flex items-center gap-1 bg-pink-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-pink-700 transition">
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
