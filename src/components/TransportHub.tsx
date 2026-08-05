import { useMemo, useState } from 'react';
import {
  Bus, MapPin, Clock, Users, CalendarCheck, MessageCircle, Package, Navigation, Truck,
} from 'lucide-react';

export interface Route {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  service_category?: string | null;   // route type
  class_schedule?: string | null;     // departures
  capacity?: number | null;           // seats
  duration_min?: number | null;
}

interface Props {
  routes: Route[];
  ctaLabel: string;
  fleet?: string[];
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: Route) => void;
  onEnquire: (context: string) => void;
}

function tripTime(min?: number | null): string | null {
  if (min == null) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

export default function TransportHub({ routes, ctaLabel, fleet = [], hasPhone, onBook, onWhatsApp, onEnquire }: Props) {
  const [type, setType] = useState('All');

  const types = useMemo(() => {
    const set = new Set<string>();
    routes.forEach((r) => { if (r.service_category) set.add(r.service_category); });
    return ['All', ...[...set].sort()];
  }, [routes]);

  const filtered = type === 'All' ? routes : routes.filter((r) => r.service_category === type);

  if (routes.length === 0) {
    return (
      <div className="text-center py-12">
        <Bus size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Routes aren’t listed yet.</p>
        <button onClick={() => onEnquire('a trip')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about trips
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions + fleet */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a cargo / parcel delivery')} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">
          <Package size={18} /> Send a package
        </button>
        <button onClick={() => onEnquire('vehicle hire / charter')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-blue-300 transition">
          <Truck size={18} /> Hire a vehicle
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-2 text-xs font-semibold">
          <Navigation size={14} /> Live GPS tracking
        </span>
      </div>

      {fleet.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fleet.map((f) => (
            <span key={f} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 text-xs font-medium">
              <Bus size={13} className="text-blue-600 dark:text-blue-400" /> {f}
            </span>
          ))}
        </div>
      )}

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${
              type === t
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Routes */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Routes &amp; schedules</h3>
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{r.name}</h4>
                  {r.service_category && <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{r.service_category}</span>}
                </div>
                {r.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-1 sm:pl-6">{r.description}</p>}
                <div className="mt-1.5 sm:pl-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  {r.class_schedule && <span className="flex items-center gap-1"><Clock size={12} /> {r.class_schedule}</span>}
                  {tripTime(r.duration_min) && <span>· {tripTime(r.duration_min)} trip</span>}
                  {r.capacity != null && r.capacity > 0 && <span className="flex items-center gap-1"><Users size={12} /> {r.capacity} seats</span>}
                </div>
              </div>
              <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 sm:pl-3 flex-shrink-0">
                <span className="text-base font-bold text-blue-600 dark:text-blue-400">{r.price}</span>
                <div className="flex items-center gap-1.5">
                  {hasPhone && (
                    <button onClick={() => onWhatsApp(r)} aria-label={`Ask about ${r.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                  )}
                  <button onClick={() => onBook(String(r.id))} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
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
