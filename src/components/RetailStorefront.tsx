import { useMemo, useState } from 'react';
import {
  ShoppingBag, Search, Truck, Plus, Minus, ShoppingCart, MessageCircle, Zap,
} from 'lucide-react';

export interface RetailItem {
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
  items: RetailItem[];
  hasPhone?: boolean;
  onAddToCart: (item: RetailItem, qty: number) => void;
  onWhatsApp: (item: RetailItem) => void;
  onEnquire: (context: string) => void;
}

export default function RetailStorefront({ items, hasPhone, onAddToCart, onWhatsApp, onEnquire }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [qty, setQty] = useState<Record<string, number>>({});
  const getQty = (id: string | number) => qty[String(id)] ?? 1;
  const setItemQty = (id: string | number, v: number) => setQty((q) => ({ ...q, [String(id)]: Math.max(1, v) }));

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.product_category) set.add(i.product_category); });
    return ['All', ...[...set].sort()];
  }, [items]);

  const filtered = items.filter((i) => {
    const inCat = category === 'All' || i.product_category === category;
    const inQuery = !query.trim() || `${i.name} ${i.description ?? ''}`.toLowerCase().includes(query.toLowerCase());
    return inCat && inQuery;
  });

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <ShoppingBag size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">No products are listed yet.</p>
        <button onClick={() => onEnquire('what’s in stock')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask what’s in stock
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Trust bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1.5 text-xs font-semibold">
          <Truck size={14} /> Same-day delivery
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 text-xs font-semibold">
          Cut / packed to order
        </span>
      </div>

      {/* Search + category */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${category === c ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'}`}>{c}</button>
          ))}
        </div>
      </div>

      {/* Products */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="relative">
                {p.image ? (
                  <img loading="lazy" decoding="async" src={p.image} alt={p.name} className="w-full h-28 sm:h-36 object-cover" />
                ) : (
                  <div className="w-full h-28 sm:h-36 bg-gradient-to-br from-amber-100 to-orange-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                    <ShoppingBag size={28} className="text-amber-400 dark:text-gray-400" />
                  </div>
                )}
                {p.is_featured && (
                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 bg-red-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded"><Zap size={10} /> Fresh</span>
                )}
              </div>
              <div className="p-2.5 flex flex-col flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2">{p.name}</h4>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{p.price}</span>
                  {p.unit && <span className="text-[11px] text-gray-500 dark:text-gray-400">{p.unit}</span>}
                </div>
                {p.stock != null && (
                  <span className={`text-[10px] font-medium ${p.stock > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>{p.stock > 0 ? `In stock` : 'Out of stock'}</span>
                )}
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
                    <button onClick={() => onAddToCart(p, getQty(p.id))} disabled={p.stock === 0} className="inline-flex items-center gap-1 bg-purple-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 transition disabled:opacity-50"><ShoppingCart size={12} /></button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-500 dark:text-gray-400 py-10">No products match your search.</p>
      )}
    </div>
  );
}
