import { useEffect, useState } from 'react';
import { Pin, X } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { pinTable, formatPinPrice, pinCtaLabel, type PinPayload, type ResolvedPin } from '../../lib/livePin';

/**
 * The item the owner is holding up, on the viewer's screen.
 *
 * The pin arrives as an id; the name, price and picture are read here, from
 * that business's own rows. That is the security boundary — see the note at the
 * top of src/lib/livePin.ts. The `business_id` filter is the part that matters:
 * a forged pin naming another business's product resolves to nothing and the
 * card simply does not appear.
 */
interface LivePinCardProps {
  pin: PinPayload;
  businessId: string;
  ctaLabel?: string | null;
  /** Cart modules check out many items; everything else books one. */
  isCart?: boolean;
  onBook: (moduleKey: string, itemId?: string) => void;
  onOpenCart: () => void;
}

export default function LivePinCard({ pin, businessId, ctaLabel, isCart, onBook, onOpenCart }: LivePinCardProps) {
  const [item, setItem] = useState<ResolvedPin | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!pin.itemId) { setItem(null); return; }
    let cancelled = false;
    // A new pin is a new thing to look at, so a card dismissed earlier should
    // not hide the one the owner just put up.
    setDismissed(false);

    // business_services has no image column; only products carry one.
    const columns = pin.source === 'product' ? 'id,name,price,image_url' : 'id,name,price';
    supabase
      .from(pinTable(pin.source))
      .select(columns)
      .eq('id', pin.itemId)
      .eq('business_id', businessId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const row = data as unknown as { id: string; name: string; price?: string | null; image_url?: string | null } | null;
        setItem(row ? {
          id: row.id,
          name: row.name,
          price: row.price,
          imageUrl: row.image_url ?? null,
          source: pin.source,
          moduleKey: pin.moduleKey,
        } : null);
      });

    return () => { cancelled = true; };
  }, [pin.itemId, pin.source, pin.moduleKey, businessId]);

  if (!item || dismissed) return null;

  const price = formatPinPrice(item.price);

  return (
    // Clear of the caption bar beneath it (bottom-16/20 plus its own height) —
    // the two overlap at bottom-20, and a translated caption sliding under a
    // price is how a viewer ends up reading neither.
    <div className="absolute bottom-28 sm:bottom-32 left-3 right-3 sm:left-4 sm:right-auto sm:max-w-sm animate-fadeIn">
      <div className="flex items-center gap-3 rounded-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur p-2.5 shadow-2xl ring-1 ring-black/10">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
          />
        ) : (
          <span className="w-14 h-14 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Pin size={18} className="text-blue-600 dark:text-blue-400" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">On screen now</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.name}</p>
          {/* Prices are free text in this schema, so they are shown as the
              business wrote them. A blank one stays blank rather than becoming
              a number nobody quoted. */}
          {price && <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{price}</p>}
        </div>

        <button
          onClick={() => (isCart ? onOpenCart() : onBook(item.moduleKey, item.id))}
          className="flex-shrink-0 inline-flex items-center justify-center min-h-[44px] px-3.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
        >
          {pinCtaLabel(ctaLabel, item.source)}
        </button>

        <button
          onClick={() => setDismissed(true)}
          aria-label="Hide this item"
          className="flex-shrink-0 inline-flex items-center justify-center w-[28px] h-[44px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
