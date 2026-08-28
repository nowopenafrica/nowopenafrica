import { useEffect, useState } from 'react';
import { MapPin, Phone, Navigation, Building2 } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { Business } from '../types';
import {
  sortLocations, locationOpenState, locationAddress, locationPhone, locationsSummary,
  type BusinessLocation,
} from '../lib/locations';
import { telHref } from '../lib/phone';

/**
 * The branches of one business, on its public profile.
 *
 * Renders nothing at all when a business has no branches — the overwhelming
 * majority — so a single-site business never sees an empty "Locations" heading
 * asking it a question it has no answer to.
 *
 * Each branch shows its OWN open state, because that is the entire reason
 * someone opens this list: not to admire the footprint, but to find one they
 * can actually get to right now.
 */
interface Props {
  business: Business;
  /** Injected in tests. */
  now?: Date;
}

const CHIP: Record<string, string> = {
  open: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  'closing-soon': 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  closed: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  unknown: 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

export default function BusinessLocations({ business, now }: Props) {
  const [locations, setLocations] = useState<BusinessLocation[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('business_locations')
      .select('id,name,address,phone,opening_hours,timezone,open_status,latitude,longitude,is_primary')
      .eq('business_id', business.id)
      .then(({ data }) => { if (!cancelled) setLocations((data as BusinessLocation[]) || []); });
    return () => { cancelled = true; };
  }, [business.id]);

  if (locations.length === 0) return null;

  const at = now ?? new Date();
  const ordered = sortLocations(locations, business, at);

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Building2 size={18} /> Locations
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">{locationsSummary(locations, business, at)}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ordered.map((loc) => {
          const state = locationOpenState(loc, business, at);
          const address = locationAddress(loc, business);
          const phone = locationPhone(loc, business);
          return (
            <div key={loc.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {loc.name}
                  {loc.is_primary && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">Main</span>
                  )}
                </p>
                <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${CHIP[state.kind]}`}>
                  {state.label}
                </span>
              </div>

              {state.detail && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">{state.detail}</p>
              )}

              {address && (
                <p className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5 mb-2">
                  <MapPin size={13} className="flex-shrink-0 mt-0.5" /> {address}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {phone && (
                  <a href={telHref(phone)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition">
                    <Phone size={13} /> Call
                  </a>
                )}
                {address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    <Navigation size={13} /> Directions
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
