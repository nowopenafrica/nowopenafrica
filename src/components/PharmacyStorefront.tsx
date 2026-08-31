import { useMemo, useState } from 'react';

import { type TrustClaim } from '../lib/trustClaims';
import {
  Pill, FileUp, BellRing, MessageCircle, Plus, Minus, ShoppingCart,
  BadgeCheck, Search, Stethoscope,
} from 'lucide-react';

export interface Medicine {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  stock?: number | null;
  med_category?: string | null;
  requires_prescription?: boolean | null;
  pack_size?: string | null;
}

interface Props {
  items: Medicine[];
  hasPhone?: boolean;
  onAddToCart: (item: Medicine, qty: number) => void;
  onWhatsApp: (item: Medicine) => void;
  onEnquire: (context: string) => void;
  /** Only claims the record actually backs; see lib/trustClaims. */
  claims?: TrustClaim[];
}

export default function PharmacyStorefront({ items, hasPhone, claims = [], onAddToCart, onWhatsApp, onEnquire }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [qty, setQty] = useState<Record<string, number>>({});
  const getQty = (id: string | number) => qty[String(id)] ?? 1;
  const setItemQty = (id: string | number, v: number) => setQty((q) => ({ ...q, [String(id)]: Math.max(1, v) }));

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.med_category) set.add(i.med_category); });
    return ['All', ...[...set].sort()];
  }, [items]);

  const filtered = items.filter((i) => {
    const inCat = category === 'All' || i.med_category === category;
    const inQuery = !query.trim() || `${i.name} ${i.description ?? ''}`.toLowerCase().includes(query.toLowerCase());
    return inCat && inQuery;
  });

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Pill size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">No medicines are listed yet.</p>
        <button onClick={() => onEnquire('a medicine')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask the pharmacy
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Service actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a prescription upload — I will attach my prescription')} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">
          <FileUp size={18} /> Upload prescription
        </button>
        {hasPhone && (
          <button onClick={() => onWhatsApp({ id: 'pharmacist', name: 'a pharmacist consultation' } as Medicine)} className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-green-700 transition">
            <Stethoscope size={18} /> Chat with a pharmacist
          </button>
        )}
        <button onClick={() => onEnquire('a refill reminder')} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition">
          <BellRing size={14} /> Set a refill reminder
        </button>
      </div>

      {/* Trust bar — only what a completed check actually proves. Empty when
          nothing has been verified, which is the honest output. */}
      {claims.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {claims.map((c) => (
            <span key={c.key} title={c.detail}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 text-xs font-semibold">
              <BadgeCheck size={14} /> {c.label}
            </span>
          ))}
        </div>
      )}

      {/* Search + category filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search medicines…"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                category === c
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Medicines */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((m) => {
            const rx = !!m.requires_prescription;
            return (
              <div key={m.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="flex gap-3 p-3">
                  {m.image ? (
                    <img loading="lazy" decoding="async" src={m.image} alt={m.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-green-100 to-emerald-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center flex-shrink-0">
                      <Pill size={22} className="text-green-500 dark:text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      <h4 className="font-semibold text-gray-900 dark:text-white leading-tight line-clamp-2">{m.name}</h4>
                    </div>
                    {m.pack_size && <p className="text-[11px] text-gray-500 dark:text-gray-400">{m.pack_size}</p>}
                    {rx && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-1.5 py-0.5">
                        Rx · prescription needed
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 px-3 pb-3">
                  <span className="text-base font-bold text-blue-600 dark:text-blue-400">{m.price}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setItemQty(m.id, getQty(m.id) - 1)} aria-label="Decrease" className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"><Minus size={11} /></button>
                      <span className="w-5 text-center text-xs text-gray-700 dark:text-gray-300">{getQty(m.id)}</span>
                      <button type="button" onClick={() => setItemQty(m.id, getQty(m.id) + 1)} aria-label="Increase" className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"><Plus size={11} /></button>
                    </div>
                    {hasPhone && (
                      <button onClick={() => onWhatsApp(m)} aria-label={`Order ${m.name} on WhatsApp`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={14} /></button>
                    )}
                    <button
                      onClick={() => (rx ? onEnquire(`${m.name} (prescription required)`) : onAddToCart(m, getQty(m.id)))}
                      className="inline-flex items-center gap-1 bg-purple-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 transition"
                    >
                      {rx ? <><FileUp size={13} /> Rx</> : <><ShoppingCart size={13} /> Add</>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-gray-500 dark:text-gray-400 py-10">No medicines match your search.</p>
      )}
    </div>
  );
}
