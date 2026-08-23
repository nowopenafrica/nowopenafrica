import { useMemo, useState } from 'react';
import {
  Scissors, Clock, Home, CalendarCheck, MessageCircle, Sparkles, X,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

export interface Treatment {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  service_category?: string | null;
  duration_min?: number | null;
  home_service?: boolean | null;
}

export interface Stylist {
  name: string;
  specialty: string;
  image?: string;
}

interface Props {
  treatments: Treatment[];
  ctaLabel: string;
  stylists?: Stylist[];
  looks?: string[];
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: Treatment) => void;
  onEnquire: (context: string) => void;
}

const CATEGORY_ORDER = ['Hair', 'Nails', 'Makeup', 'Spa', 'Barber'];

export default function BeautySalon({
  treatments, ctaLabel, stylists = [], looks = [], hasPhone, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [lightbox, setLightbox] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, Treatment[]>();
    treatments.forEach((t) => {
      const cat = t.service_category?.trim() || 'Treatments';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    });
    return [...map.entries()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]); const ib = CATEGORY_ORDER.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1; if (ib === -1) return -1; return ia - ib;
    });
  }, [treatments]);

  if (treatments.length === 0 && stylists.length === 0) {
    return (
      <div className="text-center py-12">
        <Scissors size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">The service menu isn’t published yet.</p>
        <button onClick={() => onEnquire('your services')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about services
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-8">
      {/* Looks gallery */}
      {looks.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={18} className="text-pink-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent looks</h3>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {looks.map((src, i) => (
              <button key={i} onClick={() => setLightbox(i)} className="aspect-square rounded-xl overflow-hidden group">
                <img loading="lazy" decoding="async" src={src} alt={`Look ${i + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Stylists */}
      {stylists.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Our stylists</h3>
          <div className="flex flex-wrap gap-4">
            {stylists.map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                {s.image ? (
                  <img loading="lazy" decoding="async" src={s.image} alt={s.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-pink-600 dark:text-pink-300 font-bold">{s.name.charAt(0)}</div>
                )}
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white text-sm">{s.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{s.specialty}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Treatment price list */}
      {grouped.map(([category, list]) => (
        <section key={category}>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">{category}</h3>
          <ul className="space-y-3">
            {list.map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                {t.image ? (
                  <img loading="lazy" decoding="async" src={t.image} alt={t.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-pink-100 to-rose-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center flex-shrink-0">
                    <Scissors size={20} className="text-pink-400 dark:text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="font-semibold text-gray-900 dark:text-white truncate">{t.name}</h4>
                  {t.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{t.description}</p>}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{t.price}</span>
                    {t.duration_min != null && <span className="flex items-center gap-1"><Clock size={12} /> {t.duration_min} min</span>}
                    {t.home_service && <span className="flex items-center gap-1 text-green-600 dark:text-green-400"><Home size={12} /> Home service</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {hasPhone && (
                    <button onClick={() => onWhatsApp(t)} aria-label={`Enquire about ${t.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                  )}
                  <button onClick={() => onBook(String(t.id))} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
                    <CalendarCheck size={13} /> {ctaLabel}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Looks lightbox */}
      {lightbox !== null && looks[lightbox] && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="absolute inset-0 bg-black/80" />
          <button onClick={() => setLightbox(null)} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><X size={22} /></button>
          <button onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! - 1 + looks.length) % looks.length); }} aria-label="Previous" className="absolute left-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft size={24} /></button>
          <img loading="lazy" decoding="async" src={looks[lightbox]} alt="Look" className="relative max-h-[85vh] max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! + 1) % looks.length); }} aria-label="Next" className="absolute right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight size={24} /></button>
        </div>
      )}
    </div>
  );
}
