import { useMemo, useState } from 'react';
import {
  PartyPopper, CalendarCheck, MessageCircle, Check, Plus, Package, Sparkles,
} from 'lucide-react';

export interface Vendor {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  service_category?: string | null;   // vendor type
}

interface Props {
  vendors: Vendor[];
  ctaLabel: string;
  hasPhone?: boolean;
  onBook: (id: string) => void;
  onWhatsApp: (item: Vendor) => void;
  onEnquire: (context: string) => void;
}

function parseAmount(price?: string): number {
  if (!price) return 0;
  const m = price.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

export default function EventVendors({ vendors, ctaLabel, hasPhone, onBook, onWhatsApp, onEnquire }: Props) {
  const [type, setType] = useState('All');
  const [bundle, setBundle] = useState<Set<string>>(new Set());

  const types = useMemo(() => {
    const set = new Set<string>();
    vendors.forEach((v) => { if (v.service_category) set.add(v.service_category); });
    return ['All', ...[...set].sort()];
  }, [vendors]);

  const filtered = type === 'All' ? vendors : vendors.filter((v) => v.service_category === type);

  const toggle = (id: string) => setBundle((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selected = vendors.filter((v) => bundle.has(String(v.id)));
  const total = selected.reduce((sum, v) => sum + parseAmount(v.price), 0);

  const requestBundle = () => {
    const list = selected.map((v) => `${v.name} (${v.price})`).join(', ');
    onEnquire(`an event bundle: ${list} — approx. ₦${total.toLocaleString()}`);
  };

  if (vendors.length === 0) {
    return (
      <div className="text-center py-12">
        <PartyPopper size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">Vendors aren’t listed yet.</p>
        <button onClick={() => onEnquire('your event services')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about your event
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6 pb-4">
      {/* Intro */}
      <div className="rounded-2xl bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white p-5 flex items-center gap-3">
        <Sparkles size={22} className="flex-shrink-0" />
        <div>
          <div className="font-bold">Build your event bundle</div>
          <p className="text-sm text-white/85">Tick the vendors you need and request them together in one go.</p>
        </div>
      </div>

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

      {/* Vendor cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((v) => {
          const inBundle = bundle.has(String(v.id));
          return (
            <div key={v.id} className={`flex flex-col bg-white dark:bg-gray-800 border rounded-2xl overflow-hidden transition ${inBundle ? 'border-fuchsia-500 ring-1 ring-fuchsia-500' : 'border-gray-200 dark:border-gray-700'}`}>
              {v.image ? (
                <img loading="lazy" decoding="async" src={v.image} alt={v.name} className="w-full h-36 object-cover" />
              ) : (
                <div className="w-full h-36 bg-gradient-to-br from-fuchsia-100 to-purple-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                  <PartyPopper size={30} className="text-fuchsia-400 dark:text-gray-400" />
                </div>
              )}
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 dark:text-white truncate">{v.name}</h4>
                  {v.service_category && <span className="text-[10px] font-semibold text-fuchsia-600 dark:text-fuchsia-400 bg-fuchsia-50 dark:bg-fuchsia-900/30 rounded px-1.5 py-0.5 flex-shrink-0">{v.service_category}</span>}
                </div>
                {v.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{v.description}</p>}
                <div className="mt-auto pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{v.price}</span>
                    <div className="flex items-center gap-1.5">
                      {hasPhone && (
                        <button onClick={() => onWhatsApp(v)} aria-label={`Ask about ${v.name}`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                      )}
                      <button onClick={() => onBook(String(v.id))} className="inline-flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
                        <CalendarCheck size={13} /> {ctaLabel}
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => toggle(String(v.id))}
                    className={`mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      inBundle
                        ? 'bg-fuchsia-600 text-white hover:bg-fuchsia-700'
                        : 'bg-fuchsia-50 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300 hover:bg-fuchsia-100'
                    }`}
                  >
                    {inBundle ? <><Check size={14} /> In bundle</> : <><Plus size={14} /> Add to bundle</>}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bundle summary */}
      {selected.length > 0 && (
        <div className="sticky bottom-4 z-10 rounded-2xl bg-gray-900 text-white shadow-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Package size={20} className="text-fuchsia-400" />
            <div>
              <div className="font-bold">{selected.length} vendor{selected.length === 1 ? '' : 's'} in your bundle</div>
              <div className="text-sm text-white/70">Approx. ₦{total.toLocaleString()}</div>
            </div>
          </div>
          <button onClick={requestBundle} className="inline-flex items-center justify-center gap-2 bg-fuchsia-600 px-5 py-2.5 rounded-lg font-semibold hover:bg-fuchsia-700 transition">
            <PartyPopper size={17} /> Request this bundle
          </button>
        </div>
      )}
    </div>
  );
}
