import { Palette, Type, Box, MousePointerClick, BadgeCheck, Square, Component } from 'lucide-react';

// The Design System (#17) — the single source of truth for the NowOpen UI:
// colour, type, spacing, buttons, badges, form fields and elevation. Rendered
// live from the same tokens the app uses so it cannot drift from the product.

const COLORS = [
  { name: 'Purple 600', value: '#9333ea', cls: 'bg-purple-600', text: 'text-white' },
  { name: 'Blue 600', value: '#2563eb', cls: 'bg-blue-600', text: 'text-white' },
  { name: 'Gradient', value: '#9333ea → #2563eb', cls: 'bg-gradient-to-br from-purple-600 to-blue-600', text: 'text-white' },
  { name: 'Emerald 600', value: '#059669', cls: 'bg-emerald-600', text: 'text-white' },
  { name: 'Amber 500', value: '#f59e0b', cls: 'bg-amber-500', text: 'text-white' },
  { name: 'Rose 600', value: '#e11d48', cls: 'bg-rose-600', text: 'text-white' },
  { name: 'Slate 900', value: '#0f172a', cls: 'bg-slate-900', text: 'text-white' },
  { name: 'Gray 50', value: '#f9fafb', cls: 'bg-gray-50', text: 'text-gray-800' },
];

const TYPE_SCALE = [
  { size: 'Display', cls: 'text-3xl font-black', note: 'Page titles' },
  { size: 'Heading', cls: 'text-xl font-bold', note: 'Section headings' },
  { size: 'Title', cls: 'text-base font-bold', note: 'Cards & panels' },
  { size: 'Body', cls: 'text-sm', note: 'Default reading text' },
  { size: 'Caption', cls: 'text-xs font-medium', note: 'Meta & labels' },
  { size: 'Overline', cls: 'text-[10px] font-bold uppercase tracking-wider', note: 'Eyebrows & chips' },
];

const SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

export default function DesignSystem() {
  return (
    <div className="space-y-5">
      {/* Color */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><Palette size={16} className="text-purple-600 dark:text-purple-400" /> Colour</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Brand + semantic palette. Gradient is the NowOpen signature — purple to blue, used for the mark and primary CTAs.</p>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {COLORS.map((c) => (
            <div key={c.name} className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className={`h-16 ${c.cls} ${c.text} flex items-end p-2 text-[10px] font-bold`}>{c.name}</div>
              <div className="px-2 py-1.5 text-[10px] font-mono text-gray-500 dark:text-gray-400">{c.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Type */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><Type size={16} className="text-purple-600 dark:text-purple-400" /> Typography</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Inter, the system font stack. Scale is fluid — these are the semantic steps.</p>
        <div className="mt-4 space-y-3">
          {TYPE_SCALE.map((t) => (
            <div key={t.size} className="flex items-baseline justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0">
              <span className={`text-gray-900 dark:text-white ${t.cls}`}>NowOpen Africa</span>
              <span className="text-[10px] text-gray-400 shrink-0">{t.size} · {t.note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Spacing */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><Box size={16} className="text-purple-600 dark:text-purple-400" /> Spacing</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">4px base. Prefer these steps over ad-hoc margins.</p>
        <div className="mt-4 flex items-end gap-2">
          {SPACING.map((s) => (
            <div key={s} className="flex flex-col items-center gap-1">
              <div className="bg-gradient-to-t from-purple-500 to-blue-500 rounded-sm" style={{ width: 24, height: s }} />
              <span className="text-[9px] font-mono text-gray-400">{s}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Buttons + badges */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><MousePointerClick size={16} className="text-purple-600 dark:text-purple-400" /> Buttons</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="inline-flex items-center px-4 rounded-lg text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">Primary</button>
          <button className="inline-flex items-center px-4 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition min-h-[44px]">Secondary</button>
          <button className="inline-flex items-center px-4 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">Ghost</button>
          <button className="inline-flex items-center px-4 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition min-h-[44px]">Success</button>
          <button className="inline-flex items-center px-4 rounded-lg text-sm font-semibold text-gray-400 cursor-not-allowed min-h-[44px]">Disabled</button>
        </div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mt-6"><BadgeCheck size={16} className="text-purple-600 dark:text-purple-400" /> Badges</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Live', 'Soon', 'Verified', 'Pro', 'Pending', 'Paid'].map((b) => (
            <span key={b} className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">{b}</span>
          ))}
        </div>
      </section>

      {/* Form fields */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><Square size={16} className="text-purple-600 dark:text-purple-400" /> Form fields</h3>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input placeholder="Text input" className="inline-flex items-center px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
          <select className="inline-flex items-center px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]">
            <option>Select</option><option>Option one</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" className="accent-purple-600 w-4 h-4" /> Checkbox
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="radio" name="ds-radio" className="accent-purple-600 w-4 h-4" /> Radio
          </label>
        </div>
      </section>

      {/* Elevation */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><Component size={16} className="text-purple-600 dark:text-purple-400" /> Elevation</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cards: 1px border + 0 shadow. Modals & popovers: the two real shadows below.</p>
        <div className="mt-4 flex flex-wrap gap-6">
          <div className="w-40 h-24 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center text-[10px] text-gray-400">Card · 1px border</div>
          <div className="w-40 h-24 rounded-xl shadow-sm flex items-center justify-center text-[10px] text-gray-400">shadow-sm</div>
          <div className="w-40 h-24 rounded-xl shadow-lg flex items-center justify-center text-[10px] text-gray-400">shadow-lg</div>
        </div>
      </section>
    </div>
  );
}
