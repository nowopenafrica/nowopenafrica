import { useMemo, useState } from 'react';
import {
  Factory, FileText, MapPin, BadgeCheck, Plus, Minus, ShoppingCart, MessageCircle,
} from 'lucide-react';

export interface ManufacturedItem {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  stock?: number | null;
  product_category?: string | null;   // product line
  unit?: string | null;               // wholesale unit / MOQ
  is_featured?: boolean | null;
}

interface Props {
  items: ManufacturedItem[];
  certifications?: string[];
  hasPhone?: boolean;
  onAddToCart: (item: ManufacturedItem, qty: number) => void;
  onWhatsApp: (item: ManufacturedItem) => void;
  onEnquire: (context: string) => void;
}

export default function ManufacturingHub({ items, certifications = [], hasPhone, onAddToCart, onWhatsApp, onEnquire }: Props) {
  const [line, setLine] = useState('All');
  const [qty, setQty] = useState<Record<string, number>>({});
  const getQty = (id: string | number) => qty[String(id)] ?? 1;
  const setItemQty = (id: string | number, v: number) => setQty((q) => ({ ...q, [String(id)]: Math.max(1, v) }));

  const lines = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.product_category) set.add(i.product_category); });
    return ['All', ...[...set].sort()];
  }, [items]);

  const filtered = line === 'All' ? items : items.filter((i) => i.product_category === line);

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Factory size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">No products are listed yet.</p>
        <button onClick={() => onEnquire('your product range')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Request a catalogue
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-5">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a wholesale / bulk quote')} className="inline-flex items-center gap-2 bg-blue-700 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-800 transition">
          <FileText size={18} /> Request a quote
        </button>
        <button onClick={() => onEnquire('a factory tour')} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-blue-300 transition">
          <MapPin size={18} /> Book a factory tour
        </button>
      </div>

      {/* Certifications */}
      {certifications.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {certifications.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 text-xs font-semibold">
              <BadgeCheck size={14} /> {c}
            </span>
          ))}
        </div>
      )}

      {/* Product line filter */}
      <div className="flex flex-wrap gap-2">
        {lines.map((l) => (
          <button key={l} onClick={() => setLine(l)} className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${line === l ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'}`}>{l}</button>
        ))}
      </div>

      {/* Products */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map((p) => (
          <div key={p.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="relative">
              {p.image ? (
                <img loading="lazy" decoding="async" src={p.image} alt={p.name} className="w-full h-28 sm:h-32 object-cover" />
              ) : (
                <div className="w-full h-28 sm:h-32 bg-gradient-to-br from-slate-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                  <Factory size={26} className="text-slate-400 dark:text-gray-400" />
                </div>
              )}
              {p.is_featured && (
                <span className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">Bestseller</span>
              )}
            </div>
            <div className="p-2.5 flex flex-col flex-1">
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2">{p.name}</h4>
              <div className="mt-0.5">
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{p.price}</span>
              </div>
              {p.unit && <span className="text-[11px] text-gray-500 dark:text-gray-400">{p.unit}</span>}
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
                  <button onClick={() => onAddToCart(p, getQty(p.id))} className="inline-flex items-center gap-1 bg-purple-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 transition"><ShoppingCart size={12} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
