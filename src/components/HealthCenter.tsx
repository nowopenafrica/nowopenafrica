import { useMemo, useState } from 'react';
import {
  Stethoscope, Video, Clock, CalendarCheck, MessageCircle, Ambulance, Building2,
} from 'lucide-react';

export interface Doctor {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  service_category?: string | null;   // department
  duration_min?: number | null;
  is_telemedicine?: boolean | null;
}

interface Props {
  doctors: Doctor[];
  ctaLabel: string;
  hasPhone?: boolean;
  phone?: string;
  onBook: (id: string) => void;
  onWhatsApp: (item: Doctor) => void;
  onEnquire: (context: string) => void;
}

export default function HealthCenter({ doctors, ctaLabel, hasPhone, phone, onBook, onWhatsApp, onEnquire }: Props) {
  const [dept, setDept] = useState('All');

  const departments = useMemo(() => {
    const set = new Set<string>();
    doctors.forEach((d) => { if (d.service_category) set.add(d.service_category); });
    return ['All', ...[...set].sort()];
  }, [doctors]);

  const filtered = dept === 'All' ? doctors : doctors.filter((d) => d.service_category === dept);

  if (doctors.length === 0) {
    return (
      <div className="text-center py-12">
        <Stethoscope size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Departments and doctors aren’t listed yet.</p>
        <button onClick={() => onEnquire('an appointment')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about care
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Care actions */}
      <div className="flex flex-wrap items-center gap-2">
        {hasPhone && (
          <a href={`tel:${phone}`} className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-red-700 transition">
            <Ambulance size={18} /> 24/7 Emergency
          </a>
        )}
        <button onClick={() => onEnquire('a video consultation (telemedicine)')} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">
          <Video size={18} /> Video consultation
        </button>
        <button onClick={() => onEnquire('lab tests & results')} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition">
          Laboratory & results
        </button>
      </div>

      {/* Department filter */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Building2 size={16} className="text-blue-600 dark:text-blue-400" /> Departments
        </div>
        <div className="flex flex-wrap gap-2">
          {departments.map((d) => (
            <button
              key={d}
              onClick={() => setDept(d)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                dept === d
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Doctors */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Our doctors</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <div key={d.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                {d.image ? (
                  <img loading="lazy" decoding="async" src={d.image} alt={d.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Stethoscope size={22} className="text-blue-500 dark:text-blue-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{d.name}</h4>
                  {d.service_category && <div className="text-xs font-medium text-blue-600 dark:text-blue-400">{d.service_category}</div>}
                </div>
              </div>
              {d.description && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{d.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {d.is_telemedicine && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded px-1.5 py-0.5">
                    <Video size={11} /> Video available
                  </span>
                )}
                {d.duration_min != null && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400"><Clock size={11} /> {d.duration_min} min</span>
                )}
              </div>
              <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{d.price}</span>
                <div className="flex items-center gap-1.5">
                  {hasPhone && (
                    <button onClick={() => onWhatsApp(d)} aria-label={`Message about ${d.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                  )}
                  <button onClick={() => onBook(String(d.id))} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
                    <CalendarCheck size={13} /> {ctaLabel}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
