import { useMemo, useState } from 'react';
import {
  Shirt, Ruler, Scissors, ShoppingCart, MessageCircle, Plus, Minus, X, Sparkles,
} from 'lucide-react';

export interface FashionItem {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  stock?: number | null;
  fashion_category?: string | null;
  sizes?: string | null;
  fabric?: string | null;
  is_featured?: boolean | null;
}

interface Props {
  items: FashionItem[];
  hasPhone?: boolean;
  onAddToCart: (item: FashionItem, qty: number) => void;
  onWhatsApp: (item: FashionItem) => void;
  onEnquire: (context: string) => void;
}

const SIZE_GUIDE: [string, string, string, string][] = [
  // Size, Bust (in), Waist (in), Hips (in)
  ['S', '34–35', '27–28', '37–38'],
  ['M', '36–37', '29–30', '39–40'],
  ['L', '38–40', '31–33', '41–43'],
  ['XL', '41–43', '34–36', '44–46'],
  ['XXL', '44–46', '37–39', '47–49'],
];

export default function FashionBoutique({ items, hasPhone, onAddToCart, onWhatsApp, onEnquire }: Props) {
  const [category, setCategory] = useState('All');
  const [showGuide, setShowGuide] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const getQty = (id: string | number) => qty[String(id)] ?? 1;
  const setItemQty = (id: string | number, v: number) => setQty((q) => ({ ...q, [String(id)]: Math.max(1, v) }));

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.fashion_category) set.add(i.fashion_category); });
    return ['All', ...[...set].sort()];
  }, [items]);

  const filtered = category === 'All' ? items : items.filter((i) => i.fashion_category === category);

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Shirt size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">The collection isn’t published yet.</p>
        <button onClick={() => onEnquire('the collection')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about the collection
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onEnquire('a fitting for a bespoke / made-to-measure piece')} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">
          <Scissors size={18} /> Book a fitting
        </button>
        <button onClick={() => setShowGuide(true)} className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-lg font-semibold hover:border-blue-300 transition">
          <Ruler size={18} /> Size guide
        </button>
        <button onClick={() => onEnquire('custom measurements')} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition">
          Custom measurement
        </button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition border ${
              category === c
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-300'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Catalogue */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {filtered.map((item) => {
          const sizes = (item.sizes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          return (
            <div key={item.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="relative">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-full h-40 sm:h-56 object-cover" />
                ) : (
                  <div className="w-full h-40 sm:h-56 bg-gradient-to-br from-fuchsia-100 to-purple-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                    <Shirt size={36} className="text-fuchsia-400 dark:text-gray-400" />
                  </div>
                )}
                {item.is_featured && (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-fuchsia-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md"><Sparkles size={10} /> New</span>
                )}
              </div>
              <div className="p-3 flex flex-col flex-1">
                <h4 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-1">{item.name}</h4>
                {item.fabric && <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">{item.fabric}</p>}
                {sizes.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {sizes.slice(0, 6).map((s) => (
                      <span key={s} className="text-[10px] text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5">{s}</span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-1">
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{item.price}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setItemQty(item.id, getQty(item.id) - 1)} aria-label="Decrease" className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"><Minus size={11} /></button>
                    <span className="w-5 text-center text-xs text-gray-700 dark:text-gray-300">{getQty(item.id)}</span>
                    <button type="button" onClick={() => setItemQty(item.id, getQty(item.id) + 1)} aria-label="Increase" className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"><Plus size={11} /></button>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasPhone && (
                      <button onClick={() => onWhatsApp(item)} aria-label={`Order ${item.name} on WhatsApp`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"><MessageCircle size={13} /></button>
                    )}
                    <button onClick={() => onAddToCart(item, getQty(item.id))} disabled={item.stock === 0} className="inline-flex items-center gap-1 bg-purple-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 transition disabled:opacity-50">
                      <ShoppingCart size={12} /> Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Size guide modal */}
      {showGuide && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowGuide(false)} />
          <div className="relative bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Ruler size={18} className="text-blue-600 dark:text-blue-400" /> Size guide</h3>
              <button onClick={() => setShowGuide(false)} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 pr-2 font-medium">Size</th>
                    <th className="py-2 px-2 font-medium">Bust</th>
                    <th className="py-2 px-2 font-medium">Waist</th>
                    <th className="py-2 pl-2 font-medium">Hips</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_GUIDE.map(([s, bust, waist, hips]) => (
                    <tr key={s} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-2 font-semibold text-gray-900 dark:text-white">{s}</td>
                      <td className="py-2 px-2 text-gray-600 dark:text-gray-300">{bust}"</td>
                      <td className="py-2 px-2 text-gray-600 dark:text-gray-300">{waist}"</td>
                      <td className="py-2 pl-2 text-gray-600 dark:text-gray-300">{hips}"</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">Measurements are a guide. For a perfect fit, book a fitting or send custom measurements.</p>
          </div>
        </div>
      )}
    </div>
  );
}
