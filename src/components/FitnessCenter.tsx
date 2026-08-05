import {
  Dumbbell, CalendarClock, Clock, User, Check, CalendarCheck, MessageCircle, Award,
} from 'lucide-react';

export interface FitnessItem {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  amenities?: string | null;
  session_kind?: string | null;
  class_level?: string | null;
  class_schedule?: string | null;
  instructor?: string | null;
  duration_min?: number | null;
}

interface Props {
  items: FitnessItem[];
  ctaLabel: string;
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: FitnessItem) => void;
  onEnquire: (context: string) => void;
}

const LEVEL_CLS: Record<string, string> = {
  Beginner: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  Intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'All levels': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

export default function FitnessCenter({ items, ctaLabel, hasPhone, onBook, onWhatsApp, onEnquire }: Props) {
  const memberships = items.filter((i) => i.session_kind === 'membership');
  const classes = items.filter((i) => i.session_kind !== 'membership');

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Dumbbell size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Memberships and classes aren’t listed yet.</p>
        <button onClick={() => onEnquire('membership options')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about joining
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-8">
      {/* Memberships */}
      {memberships.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Award size={18} className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Membership plans</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {memberships.map((m) => {
              const perks = (m.amenities ?? '').split(',').map((p) => p.trim()).filter(Boolean);
              return (
                <div key={m.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                  <h4 className="font-bold text-gray-900 dark:text-white">{m.name}</h4>
                  <div className="mt-1 text-xl font-extrabold text-blue-600 dark:text-blue-400">{m.price}</div>
                  {m.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{m.description}</p>}
                  {perks.length > 0 && (
                    <ul className="mt-3 space-y-1.5 flex-1">
                      {perks.map((p) => (
                        <li key={p} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <Check size={14} className="text-green-500 flex-shrink-0" /> {p}
                        </li>
                      ))}
                    </ul>
                  )}
                  <button onClick={() => onBook(String(m.id))} className="mt-4 inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">
                    <CalendarCheck size={16} /> Get membership
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Class schedule */}
      {classes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock size={18} className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Class schedule</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {classes.map((c) => (
              <div key={c.id} className="flex bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                {c.image ? (
                  <img src={c.image} alt={c.name} className="w-28 object-cover flex-shrink-0" />
                ) : (
                  <div className="w-28 bg-gradient-to-br from-orange-100 to-amber-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center flex-shrink-0">
                    <Dumbbell size={26} className="text-orange-400 dark:text-gray-400" />
                  </div>
                )}
                <div className="p-4 flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate">{c.name}</h4>
                    {c.class_level && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${LEVEL_CLS[c.class_level] ?? 'bg-gray-100 text-gray-600'}`}>{c.class_level}</span>}
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {c.class_schedule && <div className="flex items-center gap-1.5"><CalendarClock size={12} /> {c.class_schedule}</div>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {c.instructor && <span className="flex items-center gap-1"><User size={12} /> {c.instructor}</span>}
                      {c.duration_min != null && <span className="flex items-center gap-1"><Clock size={12} /> {c.duration_min} min</span>}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{c.price}</span>
                    <div className="flex items-center gap-1.5">
                      {hasPhone && (
                        <button onClick={() => onWhatsApp(c)} aria-label={`Enquire about ${c.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
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
        </section>
      )}
    </div>
  );
}
