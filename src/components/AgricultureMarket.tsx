import { useMemo, useState } from 'react';
import {
  Sprout, Package, Ship, MapPin, Plus, Minus, ShoppingCart, MessageCircle, Leaf,
} from 'lucide-react';

export interface Produce {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  stock?: number | null;
  product_category?: string | null;
  unit?: string | null;
  is_featured?: boolean | null;
}

interface Props {
  items: Produce[];
  hasPhone?: boolean;
  onAddToCart: (item: Produce, qty: number) => void;
  onWhatsApp: (item: Produce) => void;
  onEnquire: (context: string) => void;
}

export default function AgricultureMarket({ items, hasPhone, onAddToCart, onWhatsApp, onEnquire }: Props) {
  const [category, setCategory] = useState('All');
  const [qty, setQty] = useState<Record<string, number>>({});
  const getQty = (id: string | number) => qty[String(id)] ?? 1;
  const setItemQty = (id: string | number, v: number) => setQty((q) => ({ ...q, [String(id)]: Math.max(1, v) }));

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.product_category) set.add(i.product_category); });
    return ['All', ...[...set].sort()];
  }, [items]);

  const filtered = category === 'All' ? items : items.filter((i) => i.product_category === category);

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Sprout size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">No produce is listed yet.</p>
        <button onClick={() => onEnquire('available produce')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about produce
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a wholesale / bulk order')} className="inline-flex items-center gap-2 bg-green-700 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-green-800 transition">
          <Package size={18} /> Wholesale order
        </button>
        <button onClick={() => onEnquire('export enquiry')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-green-400 transition">
          <Ship size={18} /> Export enquiry
        </button>
        <button onClick={() => onEnquire('a farm tour visit')} className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-2 text-xs font-semibold hover:bg-green-100 transition">
          <MapPin size={14} /> Book a farm tour
        </button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${category === c ? 'bg-green-700 border-green-700 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-green-400'}`}>{c}</button>
        ))}
      </div>

      {/* Produce */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((p) => (
          <div key={p.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="relative">
              {p.image ? (
                <img loading="lazy" decoding="async" src={p.image} alt={p.name} className="w-full h-28 sm:h-36 object-cover" />
              ) : (
                <div className="w-full h-28 sm:h-36 bg-gradient-to-br from-green-100 to-lime-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                  <Sprout size={28} className="text-green-400 dark:text-gray-400" />
                </div>
              )}
              {p.is_featured && (
                <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 bg-green-700 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded"><Leaf size={10} /> In season</span>
              )}
            </div>
            <div className="p-2.5 flex flex-col flex-1">
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2">{p.name}</h4>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-sm font-bold text-green-700 dark:text-green-400">{p.price}</span>
                {p.unit && <span className="text-[11px] text-gray-500 dark:text-gray-400">{p.unit}</span>}
              </div>
              {p.stock != null && p.stock > 0 && <span className="text-[10px] font-medium text-green-600 dark:text-green-400">Available</span>}
              <div className="mt-auto pt-2 flex items-center justify-between gap-1">
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => setItemQty(p.id, getQty(p.id) - 1)} aria-label="Decrease" className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"><Minus size={10} /></button>
                  <span className="w-4 text-center text-xs text-gray-700 dark:text-gray-300">{getQty(p.id)}</span>
                  <button type="button" onClick={() => setItemQty(p.id, getQty(p.id) + 1)} aria-label="Increase" className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"><Plus size={10} /></button>
                </div>
                <div className="flex items-center gap-1">
                  {hasPhone && (
                    <button onClick={() => onWhatsApp(p)} aria-label={`Order ${p.name} on WhatsApp`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={13} /></button>
                  )}
                  <button onClick={() => onAddToCart(p, getQty(p.id))} className="inline-flex items-center gap-1 bg-green-700 text-white px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-green-800 transition"><ShoppingCart size={12} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
