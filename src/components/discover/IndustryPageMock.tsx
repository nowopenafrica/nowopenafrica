import { Image, MapPin, Share2, Star } from 'lucide-react';

import type { IndustryExample } from '../../lib/industryExamples';

/**
 * A mock of the industry's profile page.
 *
 * ── WHY A MOCK AND NOT THE REAL PROFILE ───────────────────────────────────
 *
 * The real profile renderer reads a business row. Handing it a synthetic one
 * would produce a page indistinguishable from a listing — the exact failure
 * this whole feature is built to avoid — and would put an invented business
 * one screenshot away from looking real.
 *
 * So this is a wireframe: the LAYOUT of a profile, with every label read from
 * config the product ships and every value an obvious placeholder. It answers
 * "what does it look like" without answering "whose is it", because there is
 * no whose.
 *
 * ── EVERYTHING IS INERT ───────────────────────────────────────────────────
 *
 * The buttons are `disabled`. A preview whose Book button opens a booking form
 * is not a preview. The one live control leaves the preview.
 */
export default function IndustryPageMock({
  example,
  /** Rendered under the mock. Absent on the full page, which has its own. */
  footer,
}: {
  example: IndustryExample;
  footer?: React.ReactNode;
}) {
  const Icon = example.icon;
  const tabs = example.modules.map((m) => m.tabLabel);

  return (
    <div className="p-4 sm:p-5">
      <p className="mb-3 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5">
        Placeholder content. Nothing below is a real business, and none of the buttons work — this
        is the shape of the page a {example.name.toLowerCase()} gets.
      </p>

      {/* The page, at rest. */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Cover */}
        <div className={`relative h-24 bg-gradient-to-br ${example.accent} flex items-center justify-center`}>
          <Image size={22} className="text-white/60" />
          <span className="absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-black/30 text-white">
            Your cover
          </span>
        </div>

        <div className="px-4 pb-4">
          {/* Identity */}
          <div className="-mt-6 flex items-end gap-3">
            <span className="w-12 h-12 shrink-0 rounded-xl border-2 border-white dark:border-gray-800 bg-white dark:bg-gray-700 flex items-center justify-center">
              <Icon size={20} className="text-gray-400" />
            </span>
            <div className="pb-1">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Your business name</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <MapPin size={10} /> Your city · {example.category ?? example.name}
              </p>
            </div>
          </div>

          {/* The badges a real page can earn. Shown as empty states, because an
              example has earned none of them. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['Claimed by the owner', 'Verified', 'Open now'].map((b) => (
              <span key={b} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-400">
                {b}
              </span>
            ))}
          </div>

          {/* The module CTAs — the real reason an industry page differs. */}
          {example.modules.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {example.modules.map((m) => (
                <button
                  key={m.key}
                  disabled
                  className="inline-flex items-center min-h-[34px] px-3 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-bold opacity-60 cursor-default"
                >
                  {m.ctaLabel}
                </button>
              ))}
              <button disabled className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-500 cursor-default">
                <Share2 size={12} /> Share
              </button>
            </div>
          )}

          {/* Tabs, from the modules' own labels. */}
          <div className="mt-4 flex gap-4 border-b border-gray-200 dark:border-gray-700">
            {['About', ...tabs, 'Photos'].slice(0, 4).map((t, i) => (
              <span
                key={t}
                className={`pb-2 text-xs font-semibold ${i === 0 ? 'text-gray-900 dark:text-white border-b-2 border-pink-500' : 'text-gray-400'}`}
              >
                {t}
              </span>
            ))}
          </div>

          {/* The sections the industry declares, as labelled placeholders. */}
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            {example.highlights.map((f) => (
              <div key={f} className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-2.5">
                <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{f}</p>
                <div className="mt-1.5 space-y-1">
                  <span className="block h-1.5 w-full rounded bg-gray-100 dark:bg-gray-700" />
                  <span className="block h-1.5 w-2/3 rounded bg-gray-100 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>

          {/* Where reviews go. Deliberately empty — inventing one here would be
              the single most damaging thing this preview could do. */}
          <div className="mt-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-3 text-center">
            <Star size={14} className="mx-auto text-gray-300" />
            <p className="mt-1 text-[11px] text-gray-400">
              Reviews appear here once real customers leave them.
            </p>
          </div>
        </div>
      </div>

      {footer}
    </div>
  );
}
