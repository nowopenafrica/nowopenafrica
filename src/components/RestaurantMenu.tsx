import { useMemo, useState } from 'react';
import {
  UtensilsCrossed, CalendarCheck, Flame, Star, Plus, Minus, ShoppingCart,
  MessageCircle, Clock, Users,
} from 'lucide-react';

export interface MenuItem {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  menu_category?: string | null;
  is_special?: boolean | null;
  is_recommended?: boolean | null;
}

interface Props {
  items: MenuItem[];
  reserveLabel: string;
  hasPhone?: boolean;
  onReserve: () => void;
  onAddToCart: (item: MenuItem, qty: number) => void;
  onWhatsApp: (item: MenuItem) => void;
  onEnquire: (context: string) => void;
}

// Preferred display order; unknown categories fall to the end alphabetically.
const CATEGORY_ORDER = ['Specials', 'Starters', 'Mains', 'Sides', 'Drinks', 'Desserts'];

export default function RestaurantMenu({
  items, reserveLabel, hasPhone, onReserve, onAddToCart, onWhatsApp, onEnquire,
}: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const getQty = (id: string | number) => qty[String(id)] ?? 1;
  const setItemQty = (id: string | number, v: number) => setQty((q) => ({ ...q, [String(id)]: Math.max(1, v) }));

  const specials = items.filter((i) => i.is_special);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    items.forEach((i) => {
      const cat = i.menu_category?.trim() || 'Menu';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(i);
    });
    return [...map.entries()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <UtensilsCrossed size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-gray-600 dark:text-gray-400 mb-4">The menu isn’t published yet.</p>
        <button onClick={() => onEnquire('the menu')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
          Ask about the menu
        </button>
      </div>
    );
  }

  const Adder = ({ item }: { item: MenuItem }) => (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setItemQty(item.id, getQty(item.id) - 1)} aria-label="Decrease" className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
          <Minus size={11} />
        </button>
        <span className="w-5 text-center text-xs text-gray-700 dark:text-gray-300">{getQty(item.id)}</span>
        <button type="button" onClick={() => setItemQty(item.id, getQty(item.id) + 1)} aria-label="Increase" className="p-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
          <Plus size={11} />
        </button>
      </div>
      {hasPhone && (
        <button onClick={() => onWhatsApp(item)} aria-label={`Order ${item.name} on WhatsApp`} className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          <MessageCircle size={14} />
        </button>
      )}
      <button onClick={() => onAddToCart(item, getQty(item.id))} className="inline-flex items-center gap-1 bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 transition">
        <ShoppingCart size={13} /> Add
      </button>
    </div>
  );

  return (
    <div className="animate-fadeIn space-y-8">
      {/* Reserve + status bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onReserve} className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition">
          <CalendarCheck size={18} /> {reserveLabel}
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1.5 text-xs font-semibold">
          <Clock size={14} /> Avg. wait ~15 min
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 text-xs font-semibold">
          <Users size={14} /> Dine-in · Pickup · Delivery
        </span>
      </div>

      {/* Daily specials */}
      {specials.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Flame size={18} className="text-orange-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Today’s specials</h3>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {specials.map((item) => (
              <div key={item.id} className="relative rounded-2xl overflow-hidden border border-orange-200 dark:border-orange-900/40 bg-white dark:bg-gray-800">
                {item.image && <img src={item.image} alt={item.name} className="w-full h-32 object-cover" />}
                <span className="absolute top-2 left-2 bg-orange-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md inline-flex items-center gap-1"><Flame size={11} /> Special</span>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold text-gray-900 dark:text-white line-clamp-1">{item.name}</h4>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">{item.price}</span>
                  </div>
                  {item.description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.description}</p>}
                  <div className="mt-3 flex justify-end"><Adder item={item} /></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Categorised menu */}
      {grouped.map(([category, list]) => (
        <section key={category}>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">{category}</h3>
          <ul className="space-y-3">
            {list.map((item) => (
              <li key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-orange-100 to-amber-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center flex-shrink-0">
                    <UtensilsCrossed size={22} className="text-orange-400 dark:text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</h4>
                    {item.is_recommended && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 flex-shrink-0"><Star size={11} className="fill-current" /> Popular</span>
                    )}
                  </div>
                  {item.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{item.description}</p>}
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{item.price}</span>
                </div>
                <Adder item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
