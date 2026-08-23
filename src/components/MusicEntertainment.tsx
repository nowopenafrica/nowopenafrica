import { useMemo, useState } from 'react';
import {
  Music, Music2, CalendarCheck, MessageCircle, FileText, Disc3,
  X, ChevronLeft, ChevronRight,
} from 'lucide-react';

export interface MusicAct {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // act type
}

export interface ShowShot { src: string; label: string; }

interface Props {
  acts: MusicAct[];
  ctaLabel: string;
  gallery?: ShowShot[];
  genres?: string[];
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: MusicAct) => void;
  onEnquire: (context: string) => void;
}

export default function MusicEntertainment({
  acts, ctaLabel, gallery = [], genres = [], hasPhone, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [type, setType] = useState('All');
  const [lightbox, setLightbox] = useState<number | null>(null);

  const types = useMemo(() => {
    const set = new Set<string>();
    acts.forEach((a) => { if (a.service_category) set.add(a.service_category); });
    return ['All', ...[...set].sort()];
  }, [acts]);

  const filtered = type === 'All' ? acts : acts.filter((a) => a.service_category === type);

  if (acts.length === 0 && gallery.length === 0) {
    return (
      <div className="text-center py-12">
        <Music size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Acts aren’t listed yet.</p>
        <button onClick={() => onEnquire('an event booking')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition text-sm">
          Check availability
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('availability for my event date')} className="inline-flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-purple-700 transition">
          <CalendarCheck size={18} /> Check availability
        </button>
        <button onClick={() => onEnquire('a performance quote')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-purple-400 transition">
          <FileText size={18} /> Request a quote
        </button>
      </div>

      {/* Genres / vibes */}
      {genres.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => (
            <span key={g} className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-3 py-1.5 text-xs font-semibold">
              <Disc3 size={14} /> {g}
            </span>
          ))}
        </div>
      )}

      {/* Showreel — past performances */}
      {gallery.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Music2 size={18} className="text-purple-600 dark:text-purple-400" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Past performances</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {gallery.map((p, i) => (
              <button key={i} onClick={() => setLightbox(i)} className="relative rounded-xl overflow-hidden group aspect-[4/3]">
                <img loading="lazy" decoding="async" src={p.src} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <span className="absolute bottom-1.5 left-2 right-2 text-white text-[11px] font-medium truncate">{p.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Acts */}
      {acts.length > 0 && (
        <section>
          <div className="flex flex-wrap gap-2 mb-3">
            {types.map((t) => (
              <button key={t} onClick={() => setType(t)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-purple-300'}`}>{t}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((a) => (
              <div key={a.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                  <Music size={18} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate">{a.name}</h4>
                    {a.service_category && <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{a.service_category}</span>}
                  </div>
                  {a.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{a.description}</p>}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{a.price}</span>
                    <div className="flex items-center gap-1.5">
                      {hasPhone && (
                        <button onClick={() => onWhatsApp(a)} aria-label={`Ask about ${a.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                      )}
                      <button onClick={() => onBook(String(a.id))} className="inline-flex items-center gap-1 bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 transition">
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

      {/* Lightbox */}
      {lightbox !== null && gallery[lightbox] && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="absolute inset-0 bg-black/80" />
          <button onClick={() => setLightbox(null)} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><X size={22} /></button>
          <button onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! - 1 + gallery.length) % gallery.length); }} aria-label="Previous" className="absolute left-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft size={24} /></button>
          <figure className="relative max-w-full" onClick={(e) => e.stopPropagation()}>
            <img loading="lazy" decoding="async" src={gallery[lightbox].src} alt={gallery[lightbox].label} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
            <figcaption className="mt-2 text-center text-sm text-white/80">{gallery[lightbox].label}</figcaption>
          </figure>
          <button onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! + 1) % gallery.length); }} aria-label="Next" className="absolute right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight size={24} /></button>
        </div>
      )}
    </div>
  );
}
