import { useMemo, useState } from 'react';
import { ShieldCheck, Check, Minus, ChevronDown, Star, Package, Wrench, CalendarDays } from 'lucide-react';
import { publicTrustSummary } from '../lib/trust';
import type { Business } from '../types';

// Business Trust Panel — the "can I trust this business?" answer, near the top
// of every profile.
//
// Two rules keep it worth believing:
//
// 1. Unverified signals are SHOWN, not hidden. A panel of nothing but green
//    ticks is marketing. A visitor learns more from "business registration —
//    not yet verified" than from its absence, and seeing the gaps is what makes
//    the confirmed items credible.
//
// 2. Every number here is real. The score comes from lib/trust.ts with its
//    contribution breakdown; the counts are row counts. The brief also asked for
//    business views, response time, repeat-customer rate and customers-served —
//    none of those have a data source yet (there's no analytics layer), so they
//    are absent rather than invented. One fabricated statistic would put every
//    honest one on this panel in doubt.

function ScoreRing({ score, ringClass }: { score: number; ringClass: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-[68px] h-[68px] flex-shrink-0">
      <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="6" fill="none" />
        <circle
          cx="32" cy="32" r={r}
          className={`${ringClass} transition-[stroke-dashoffset] duration-500`}
          strokeWidth="6" fill="none" strokeLinecap="round" stroke="currentColor"
          strokeDasharray={c} strokeDashoffset={c - (Math.max(0, Math.min(100, score)) / 100) * c}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-extrabold text-gray-900 dark:text-white tabular-nums leading-none">{score}</span>
        <span className="text-[9px] font-semibold text-gray-400">/ 100</span>
      </span>
    </div>
  );
}

export default function BusinessTrustPanel({
  business,
  reviewCount,
  productCount,
  serviceCount,
}: {
  business: Business;
  reviewCount?: number;
  productCount?: number;
  serviceCount?: number;
}) {
  const [open, setOpen] = useState(false);
  // Date.now() is impure, so it can't sit inside the memo — React Compiler
  // flags it, and a memo that re-runs unpredictably would recompute against a
  // different clock. Tenure only needs a stable per-mount reading.
  const [now] = useState(() => Date.now());
  const summary = useMemo(() => publicTrustSummary(business, now), [business, now]);
  // Has the team confirmed anything at all? Drives how much room the panel takes.
  const hasEvidence = summary.confirmedCount > 0;

  const established = business.created_at
    ? new Date(business.created_at).getFullYear()
    : null;

  // Only stats with a real source. No views, no response time, no repeat rate.
  const stats: { icon: typeof Star; label: string; value: string }[] = [];
  if (typeof business.rating === 'number' && business.rating > 0) {
    stats.push({ icon: Star, label: reviewCount ? `${reviewCount} review${reviewCount === 1 ? '' : 's'}` : 'Rating', value: business.rating.toFixed(1) });
  }
  if (productCount) stats.push({ icon: Package, label: productCount === 1 ? 'Product' : 'Products', value: String(productCount) });
  if (serviceCount) stats.push({ icon: Wrench, label: serviceCount === 1 ? 'Service' : 'Services', value: String(serviceCount) });
  if (established) stats.push({ icon: CalendarDays, label: 'On NowOpen since', value: String(established) });

  return (
    <section
      aria-label="Business trust and verification"
      className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
    >
      <div className="flex items-start gap-4 p-4">
        {/* The ring is earned, not given.
            With nothing confirmed the panel still rendered a 68px dial reading
            e.g. "22" beside "0 of 7 checks confirmed" — two denominators
            competing for the same glance, and a big number that reads as a
            verdict on the business when it only measures profile completeness.
            Nothing is hidden either way: the score, the tier and all seven
            checks stay on the panel; only the visual weight follows the
            evidence. */}
        {hasEvidence && <ScoreRing score={summary.score} ringClass={summary.tier.ring} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white">
              <ShieldCheck size={15} className="text-emerald-600 dark:text-emerald-400" />
              Business Trust Score
            </h2>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${summary.tier.badge}`}>
              {summary.tier.label}
            </span>
            {!hasEvidence && (
              <span className="text-[11px] font-bold tabular-nums text-gray-500 dark:text-gray-400">
                {summary.score}/100
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            {summary.tier.blurb} {summary.confirmedCount} of {summary.totalCount} checks confirmed by our team.
          </p>

          {stats.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {stats.map((s) => (
                <span key={s.label} className="inline-flex items-baseline gap-1.5">
                  <s.icon size={12} className="text-gray-400 self-center" />
                  <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{s.value}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 min-h-[44px] px-4 border-t border-gray-100 dark:border-gray-700 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        <span>What we verified</span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700">
          <ul className="pt-3 space-y-1.5">
            {summary.items.map((i) => (
              <li key={i.label} className="flex items-start gap-2">
                {i.confirmed
                  ? <Check size={13} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                  : <Minus size={13} className="text-gray-300 dark:text-gray-600 mt-0.5 flex-shrink-0" />}
                <span className="min-w-0">
                  <span className={`text-[12px] font-semibold ${i.confirmed ? 'text-gray-800 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                    {i.label}
                  </span>
                  <span className={`block text-[10px] ${i.confirmed ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {i.confirmed ? i.detail : 'Not yet verified'}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {/* The score's own arithmetic, so it isn't just asserted. */}
          <details className="rounded-lg bg-gray-50 dark:bg-gray-900 p-2.5">
            <summary className="text-[11px] font-bold text-gray-600 dark:text-gray-300 cursor-pointer">
              How the score is calculated
            </summary>
            <ul className="mt-2 space-y-1">
              {summary.breakdown.map((b) => (
                <li key={b.label} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="text-gray-500 dark:text-gray-400">{b.label}</span>
                  <span className="tabular-nums font-semibold text-gray-700 dark:text-gray-200">{b.earned} / {b.max}</span>
                </li>
              ))}
            </ul>
          </details>

          <p className="text-[10px] text-gray-400">
            Verification is carried out by the NowOpen team — a business cannot verify itself.
          </p>
        </div>
      )}
    </section>
  );
}
