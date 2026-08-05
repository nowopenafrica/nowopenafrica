import { useMemo, useState } from 'react';
import {
  Camera, Clock, CalendarCheck, MessageCircle, X, ChevronLeft, ChevronRight, Aperture,
} from 'lucide-react';

export interface ShootPackage {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  service_category?: string | null;   // genre
  duration_min?: number | null;
}

export interface PortfolioShot { src: string; genre: string; }

interface Props {
  packages: ShootPackage[];
  ctaLabel: string;
  portfolio?: PortfolioShot[];
  equipment?: string[];
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: ShootPackage) => void;
  onEnquire: (context: string) => void;
}

export default function PhotographyStudio({
  packages, ctaLabel, portfolio = [], equipment = [], hasPhone, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [genre, setGenre] = useState('All');
  const [lightbox, setLightbox] = useState<number | null>(null);

  const genres = useMemo(() => {
    const set = new Set<string>();
    packages.forEach((p) => { if (p.service_category) set.add(p.service_category); });
    portfolio.forEach((p) => set.add(p.genre));
    return ['All', ...[...set].sort()];
  }, [packages, portfolio]);

  const shownPortfolio = genre === 'All' ? portfolio : portfolio.filter((p) => p.genre === genre);
  const shownPackages = genre === 'All' ? packages : packages.filter((p) => p.service_category === genre);

  if (packages.length === 0 && portfolio.length === 0) {
    return (
      <div className="text-center py-12">
        <Camera size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Packages aren’t listed yet.</p>
        <button onClick={() => onEnquire('a shoot')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about a shoot
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions + equipment */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('availability for a shoot date')} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">
          <CalendarCheck size={18} /> Check availability
        </button>
        {equipment.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 text-xs font-semibold">
            <Aperture size={13} className="text-blue-600 dark:text-blue-400" /> {e}
          </span>
        ))}
      </div>

      {/* Genre filter */}
      <div className="flex flex-wrap gap-2">
        {genres.map((g) => (
          <button
            key={g}
            onClick={() => setGenre(g)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${
              genre === g
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Portfolio */}
      {shownPortfolio.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Portfolio</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {shownPortfolio.map((shot, i) => (
              <button key={i} onClick={() => setLightbox(i)} className="relative aspect-square rounded-xl overflow-hidden group">
                <img src={shot.src} alt={`${shot.genre} shot`} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">{shot.genre}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Packages */}
      {shownPackages.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Shoot packages</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shownPackages.map((p) => (
              <div key={p.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-gradient-to-br from-indigo-100 to-purple-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                    <Camera size={30} className="text-indigo-400 dark:text-gray-400" />
                  </div>
                )}
                <div className="p-4 flex flex-col flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-gray-900 dark:text-white truncate">{p.name}</h4>
                    {p.service_category && <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{p.service_category}</span>}
                  </div>
                  {p.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{p.description}</p>}
                  {p.duration_min != null && <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"><Clock size={12} /> {Math.round(p.duration_min / 60 * 10) / 10} hr</div>}
                  <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{p.price}</span>
                    <div className="flex items-center gap-1.5">
                      {hasPhone && (
                        <button onClick={() => onWhatsApp(p)} aria-label={`Ask about ${p.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                      )}
                      <button onClick={() => onBook(String(p.id))} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
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

      {/* Portfolio lightbox */}
      {lightbox !== null && shownPortfolio[lightbox] && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="absolute inset-0 bg-black/80" />
          <button onClick={() => setLightbox(null)} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><X size={22} /></button>
          <button onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! - 1 + shownPortfolio.length) % shownPortfolio.length); }} aria-label="Previous" className="absolute left-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft size={24} /></button>
          <img src={shownPortfolio[lightbox].src} alt="Portfolio" className="relative max-h-[85vh] max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i! + 1) % shownPortfolio.length); }} aria-label="Next" className="absolute right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight size={24} /></button>
        </div>
      )}
    </div>
  );
}
