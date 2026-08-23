import { useMemo, useState } from 'react';
import {
  GraduationCap, User, CalendarClock, Clock, Wifi, CalendarCheck, MessageCircle, FileText,
} from 'lucide-react';

export interface Course {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  service_category?: string | null;   // programme / level
  instructor?: string | null;         // teacher
  class_schedule?: string | null;
  duration_min?: number | null;
  is_online?: boolean | null;
}

interface Props {
  courses: Course[];
  ctaLabel: string;
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: Course) => void;
  onEnquire: (context: string) => void;
}

export default function EducationCenter({ courses, ctaLabel, hasPhone, onBook, onWhatsApp, onEnquire }: Props) {
  const [programme, setProgramme] = useState('All');

  const programmes = useMemo(() => {
    const set = new Set<string>();
    courses.forEach((c) => { if (c.service_category) set.add(c.service_category); });
    return ['All', ...[...set].sort()];
  }, [courses]);

  const filtered = programme === 'All' ? courses : courses.filter((c) => c.service_category === programme);

  if (courses.length === 0) {
    return (
      <div className="text-center py-12">
        <GraduationCap size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Programmes aren’t listed yet.</p>
        <button onClick={() => onEnquire('admissions')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about admissions
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Admissions banner */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="font-bold text-lg">Admissions are open</div>
          <p className="text-sm text-white/85">Apply for the new session or request a prospectus.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEnquire('admission — I’d like to apply')} className="inline-flex items-center gap-2 bg-white text-gray-900 px-4 py-2.5 rounded-lg font-semibold hover:bg-gray-100 transition">
            <FileText size={17} /> Apply now
          </button>
          <button onClick={() => onEnquire('a prospectus')} className="inline-flex items-center gap-2 bg-white/10 border border-white/25 px-4 py-2.5 rounded-lg font-semibold hover:bg-white/20 transition">
            Prospectus
          </button>
        </div>
      </div>

      {/* Programme filter */}
      <div className="flex flex-wrap gap-2">
        {programmes.map((p) => (
          <button
            key={p}
            onClick={() => setProgramme(p)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${
              programme === p
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Courses / programmes */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Programmes &amp; courses</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
              {c.image ? (
                <img loading="lazy" decoding="async" src={c.image} alt={c.name} className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-36 bg-gradient-to-br from-indigo-100 to-blue-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                  <GraduationCap size={32} className="text-indigo-400 dark:text-gray-400" />
                </div>
              )}
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{c.name}</h4>
                  {c.is_online && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded px-1.5 py-0.5 flex-shrink-0"><Wifi size={10} /> Online</span>
                  )}
                </div>
                {c.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{c.description}</p>}
                <div className="mt-2 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {c.instructor && <div className="flex items-center gap-1.5"><User size={12} /> {c.instructor}</div>}
                  {c.class_schedule && <div className="flex items-center gap-1.5"><CalendarClock size={12} /> {c.class_schedule}</div>}
                  {c.duration_min != null && <div className="flex items-center gap-1.5"><Clock size={12} /> {c.duration_min} min</div>}
                </div>
                <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{c.price}</span>
                  <div className="flex items-center gap-1.5">
                    {hasPhone && (
                      <button onClick={() => onWhatsApp(c)} aria-label={`Ask about ${c.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                    )}
                    <button onClick={() => onBook(String(c.id))} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
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
