import { useMemo, useState } from 'react';
import {
  Plane, Globe, BedDouble, FileCheck, MapPin, MessageCircle, CalendarCheck, Compass,
} from 'lucide-react';

export interface TravelPackage {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string | null;
  service_category?: string | null;   // package type
}

interface Props {
  packages: TravelPackage[];
  ctaLabel: string;
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: TravelPackage) => void;
  onEnquire: (context: string) => void;
}

export default function TravelAgency({
  packages, ctaLabel, hasPhone, onBook, onWhatsApp, onEnquire,
}: Props) {
  const [type, setType] = useState('All');

  const types = useMemo(() => {
    const set = new Set<string>();
    packages.forEach((p) => { if (p.service_category) set.add(p.service_category); });
    return ['All', ...[...set].sort()];
  }, [packages]);

  const filtered = type === 'All' ? packages : packages.filter((p) => p.service_category === type);

  const services = [
    { icon: Plane, label: 'Flight booking', ctx: 'flight booking' },
    { icon: FileCheck, label: 'Visa assistance', ctx: 'visa assistance' },
    { icon: BedDouble, label: 'Hotel booking', ctx: 'a hotel booking' },
    { icon: Compass, label: 'Custom trip', ctx: 'a custom trip plan' },
  ];

  if (packages.length === 0) {
    return (
      <div className="text-center py-12">
        <Plane size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Packages aren’t listed yet.</p>
        <button onClick={() => onEnquire('a trip')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 transition text-sm">
          Plan a trip
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Travel desk services */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {services.map((s) => (
          <button
            key={s.label}
            onClick={() => onEnquire(s.ctx)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-4 hover:border-sky-400 hover:bg-sky-50/50 dark:hover:bg-sky-900/20 transition"
          >
            <span className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
              <s.icon size={18} className="text-sky-600 dark:text-sky-400" />
            </span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 text-center">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Package-type filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setType(t)} className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${type === t ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-sky-300'}`}>
            {t !== 'All' && <Globe size={13} />} {t}
          </button>
        ))}
      </div>

      {/* Packages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filtered.map((p) => (
          <div key={p.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
            {p.image && (
              <div className="relative aspect-[16/10]">
                <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                {p.service_category && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 text-white px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
                    <MapPin size={12} /> {p.service_category}
                  </span>
                )}
              </div>
            )}
            <div className="p-4 flex flex-col flex-1">
              <h4 className="font-bold text-gray-900 dark:text-white">{p.name}</h4>
              {p.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 flex-1">{p.description}</p>}
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-sky-600 dark:text-sky-400">{p.price}</span>
                <div className="flex items-center gap-1.5">
                  {hasPhone && (
                    <button onClick={() => onWhatsApp(p)} aria-label={`Ask about ${p.name}`} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={15} /></button>
                  )}
                  <button onClick={() => onBook(String(p.id))} className="inline-flex items-center gap-1.5 bg-sky-600 text-white px-3.5 py-2 rounded-lg text-sm font-semibold hover:bg-sky-700 transition">
                    <CalendarCheck size={15} /> {ctaLabel}
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
