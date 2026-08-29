import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, Gauge } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { profileCompleteness } from '../../lib/businessProfile';
import type { Business } from '../../types';

/**
 * How finished a business page is, and the next three things to do about it.
 *
 * Three, not twelve. A list of every gap reads as a chore nobody starts; the
 * heaviest three read as a task somebody finishes. The weights are what makes
 * that ordering honest — a missing logo costs more than a missing Vision,
 * because a page without a logo looks abandoned and a page without a Vision
 * mostly looks like a shop.
 *
 * Counts come from the content tables rather than being guessed, because "add
 * a product" shown to a business with forty products is the fastest way to
 * teach an owner that this panel is noise.
 */
export default function ProfileCompleteness({ business }: { business: Business }) {
  const [counts, setCounts] = useState({ products: 0, services: 0, gallery: 0 });

  useEffect(() => {
    let cancelled = false;
    const id = String(business.id);
    (async () => {
      const [p, s, g] = await Promise.all([
        supabase.from('business_products').select('id', { count: 'exact', head: true }).eq('business_id', id),
        supabase.from('business_services').select('id', { count: 'exact', head: true }).eq('business_id', id),
        supabase.from('business_gallery').select('id', { count: 'exact', head: true }).eq('business_id', id),
      ]);
      if (cancelled) return;
      setCounts({ products: p.count ?? 0, services: s.count ?? 0, gallery: g.count ?? 0 });
    })().catch(() => { /* a count we cannot read just reads as zero */ });
    return () => { cancelled = true; };
  }, [business.id]);

  const result = useMemo(() => profileCompleteness({
    ...(business as unknown as Record<string, unknown>),
    productCount: counts.products,
    serviceCount: counts.services,
    galleryCount: counts.gallery,
  }, new Date()), [business, counts]);

  const done = result.percent >= 100;
  const bar = done ? 'bg-emerald-500' : result.percent >= 60 ? 'bg-blue-600' : 'bg-amber-500';

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Gauge size={17} className="text-blue-600 dark:text-blue-400" />
            Your page: {result.percent}% complete
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{business.name}</p>
        </div>
        <Link
          to="/dashboard?tab=businesses"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          Complete your page <ArrowRight size={14} />
        </Link>
      </div>

      <div
        className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={result.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completeness"
      >
        <div className={`h-full ${bar} transition-all duration-500`} style={{ width: `${result.percent}%` }} />
      </div>

      {done ? (
        <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <Check size={15} /> Everything a customer looks for is filled in.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {result.next.map((f) => (
            <li key={f.key} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>
                <span className="font-medium text-gray-900 dark:text-white">{f.label}</span>
                <span className="text-gray-500 dark:text-gray-400"> — {f.hint}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* The count is the reassurance that the three above are a short tail,
          not the tip of a long one. */}
      {!done && result.missing.length > result.next.length && (
        <p className="mt-2 text-[11px] text-gray-400">
          {result.missing.length - result.next.length} more after these.
        </p>
      )}
    </div>
  );
}
