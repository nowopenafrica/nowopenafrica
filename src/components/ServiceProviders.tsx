import { useMemo, useState } from 'react';
import {
  Wrench, Siren, Navigation, CalendarCheck, MessageCircle, BadgeCheck,
} from 'lucide-react';

export interface Job {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // job type
}

interface Props {
  jobs: Job[];
  ctaLabel: string;
  hasPhone?: boolean;
  phone?: string;
  onBook: (id: string) => void;
  onWhatsApp: (item: Job) => void;
  onEnquire: (context: string) => void;
}

export default function ServiceProviders({ jobs, ctaLabel, hasPhone, phone, onBook, onWhatsApp, onEnquire }: Props) {
  const [type, setType] = useState('All');

  const types = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => { if (j.service_category) set.add(j.service_category); });
    return ['All', ...[...set].sort()];
  }, [jobs]);

  const filtered = type === 'All' ? jobs : jobs.filter((j) => j.service_category === type);

  if (jobs.length === 0) {
    return (
      <div className="text-center py-12">
        <Wrench size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Services aren’t listed yet.</p>
        <button onClick={() => onEnquire('a repair / service')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask for help
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {hasPhone && (
          <a href={`tel:${phone}`} className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-red-700 transition">
            <Siren size={18} /> Emergency call
          </a>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-2 text-xs font-semibold">
          <BadgeCheck size={14} /> Available now
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-2 text-xs font-semibold">
          <Navigation size={14} /> Live ETA on the way
        </span>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'}`}>{t}</button>
        ))}
      </div>

      {/* Jobs */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Services &amp; pricing</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((j) => (
            <div key={j.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <Wrench size={18} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{j.name}</h4>
                  {j.service_category && <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{j.service_category}</span>}
                </div>
                {j.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{j.description}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{j.price}</span>
                  <div className="flex items-center gap-1.5">
                    {hasPhone && (
                      <button onClick={() => onWhatsApp(j)} aria-label={`Ask about ${j.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                    )}
                    <button onClick={() => onBook(String(j.id))} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
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
