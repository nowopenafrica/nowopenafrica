import { useEffect, useState } from 'react';
import { Pin, PinOff, Loader2 } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { getCategoryFeatures } from '../../data/categoryFeatures';
import { formatPinPrice, type PinPayload, type PinSource } from '../../lib/livePin';

/**
 * What the owner taps to put an item on every viewer's screen.
 *
 * Sits under the broadcast preview, because the decision is made mid-sentence —
 * "this one, twelve thousand" — and anything that takes the owner out of the
 * stream to find it will not get used.
 *
 * Only items this business already has. There is no "make up an offer" field on
 * purpose: a price invented live is a price that exists nowhere else, so nothing
 * downstream — the booking, the payment, the receipt — could honour it.
 */
interface Row {
  id: string;
  name: string;
  price?: string | null;
  image_url?: string | null;
  source: PinSource;
  moduleKey: string;
}

interface LivePinPickerProps {
  businessId: string;
  category?: string | null;
  pinned: PinPayload | null;
  onPin: (payload: PinPayload | null) => void;
}

export default function LivePinPicker({ businessId, category, pinned, onPin }: LivePinPickerProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const features = getCategoryFeatures(category || '');
    // Which module a pinned item should open. A category with no product module
    // has no way to act on a pinned product, so those are not offered at all.
    const serviceModule = features.find((f) => f.itemSource === 'service');
    const productModule = features.find((f) => f.itemSource === 'product');

    Promise.all([
      serviceModule
        ? supabase.from('business_services').select('id,name,price').eq('business_id', businessId).order('created_at')
        : Promise.resolve({ data: [] as unknown[] }),
      productModule
        ? supabase.from('business_products').select('id,name,price,image_url').eq('business_id', businessId).order('created_at')
        : Promise.resolve({ data: [] as unknown[] }),
    ]).then(([services, products]) => {
      if (cancelled) return;
      const s = ((services.data || []) as Row[]).map((r) => ({ ...r, source: 'service' as const, moduleKey: serviceModule!.key }));
      const p = ((products.data || []) as Row[]).map((r) => ({ ...r, source: 'product' as const, moduleKey: productModule!.key }));
      setRows([...p, ...s]);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [businessId, category]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 text-xs text-gray-500 dark:text-gray-400">
        <Loader2 size={13} className="animate-spin" /> Loading what you can show…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="px-1 text-xs text-gray-500 dark:text-gray-400">
        Add products or services to your listing and you&apos;ll be able to put them on screen mid-stream,
        with a buy button, while viewers are watching.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Show an item on screen</h3>
        {pinned?.itemId && (
          <button
            onClick={() => onPin(null)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
          >
            <PinOff size={12} /> Clear
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {rows.map((row) => {
          const active = pinned?.itemId === row.id;
          const price = formatPinPrice(row.price);
          return (
            <button
              key={`${row.source}-${row.id}`}
              onClick={() => onPin(active ? null : { itemId: row.id, source: row.source, moduleKey: row.moduleKey })}
              aria-pressed={active}
              className={`flex-shrink-0 w-36 text-left rounded-xl border p-2 min-h-[44px] transition ${
                active
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Pin size={11} className={active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'} />
                <span className={`text-[10px] font-bold uppercase tracking-wide ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`}>
                  {active ? 'On screen' : row.source === 'product' ? 'Product' : 'Service'}
                </span>
              </div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{row.name}</p>
              {price && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{price}</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
