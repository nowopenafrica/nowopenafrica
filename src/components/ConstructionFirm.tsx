import { useMemo, useState } from 'react';
import {
  HardHat, FileText, MapPin, BadgeCheck, CalendarCheck, MessageCircle, Building2,
  X, ChevronLeft, ChevronRight,
} from 'lucide-react';

export interface BuildService {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // service type
}

export interface ProjectShot { src: string; label: string; }

interface Props {
  services: BuildService[];
  ctaLabel: string;
  projects?: ProjectShot[];
  capabilities?: string[];
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: BuildService) => void;
  onEnquire: (context: string) => void;
}

export default function ConstructionFirm({
  services, ctaLabel, projects = [], capabilities = [], hasPhone, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [type, setType] = useState('All');
  const [lightbox, setLightbox] = useState<number | null>(null);

  const types = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => { if (s.service_category) set.add(s.service_category); });
    return ['All', ...[...set].sort()];
  }, [services]);

  const filtered = type === 'All' ? services : services.filter((s) => s.service_category === type);

  if (services.length === 0 && projects.length === 0) {
    return (
      <div className="text-center py-12">
        <HardHat size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Services aren’t listed yet.</p>
        <button onClick={() => onEnquire('a project')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Discuss a project
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a project quote')} className="inline-flex items-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-amber-700 transition">
          <FileText size={18} /> Request a quote
        </button>
        <button onClick={() => onEnquire('a site visit / consultation')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-amber-400 transition">
          <MapPin size={18} /> Book a site visit
        </button>
      </div>

      {/* Capabilities */}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {capabilities.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 text-xs font-semibold">
              <BadgeCheck size={14} /> {c}
            </span>
          ))}
        </div>
      )}

      {/* Completed projects */}
      {projects.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={18} className="text-amber-600 dark:text-amber-400" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Completed projects</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {projects.map((p, i) => (
              <button key={i} onClick={() => setLightbox(i)} className="relative rounded-xl overflow-hidden group aspect-[4/3]">
                <img src={p.src} alt={p.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <span className="absolute bottom-1.5 left-2 right-2 text-white text-[11px] font-medium truncate">{p.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Services */}
      {services.length > 0 && (
        <section>
          <div className="flex flex-wrap gap-2 mb-3">
            {types.map((t) => (
              <button key={t} onClick={() => setType(t)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'}`}>{t}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-start gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                  <HardHat size={18} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate">{s.name}</h4>
                    {s.service_category && <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{s.service_category}</span>}
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
        </section>
      )}

      {/* Lightbox */}
      {lightbox !== null && projects[lightbox] && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="absolute inset-0 bg-black/80" />
          <button onClick={() => setLightbox(null)} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><X size={22} /></button>
          <button onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! - 1 + projects.length) % projects.length); }} aria-label="Previous" className="absolute left-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft size={24} /></button>
          <figure className="relative max-w-full" onClick={(e) => e.stopPropagation()}>
            <img src={projects[lightbox].src} alt={projects[lightbox].label} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
            <figcaption className="mt-2 text-center text-sm text-white/80">{projects[lightbox].label}</figcaption>
          </figure>
          <button onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! + 1) % projects.length); }} aria-label="Next" className="absolute right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight size={24} /></button>
        </div>
      )}
    </div>
  );
}
