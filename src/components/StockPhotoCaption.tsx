import { ImageOff } from 'lucide-react';

import { STOCK_SITE_EXPLANATION, STOCK_SITE_NOTICE, isStockPlaceholder } from '../lib/stockImage';

/**
 * "Stock photo — not this site", said on the picture itself.
 *
 * The same treatment a business profile gives its placeholder cover
 * ("Stock photo — not this business", BusinessDetail): a dark strip across
 * the bottom of the image, small white type, the ImageOff mark. Renders
 * nothing for a real photograph. The parent must be `relative`.
 *
 * `compact` is for thumbnails too small to hold the words: the mark alone,
 * with the notice as its accessible name and tooltip.
 */
export default function StockPhotoCaption({
  url, notice = STOCK_SITE_NOTICE, explanation = STOCK_SITE_EXPLANATION, compact = false,
}: {
  url: string | null | undefined;
  notice?: string;
  explanation?: string;
  compact?: boolean;
}) {
  if (!isStockPlaceholder(url)) return null;
  if (compact) {
    return (
      <span
        data-testid="stock-photo-caption"
        title={`${notice}. ${explanation}`}
        className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white/90 backdrop-blur-[2px]"
      >
        <ImageOff size={11} aria-hidden="true" />
        <span className="sr-only">{notice}</span>
      </span>
    );
  }
  return (
    <div data-testid="stock-photo-caption" className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-1.5 backdrop-blur-[2px]">
      <p className="flex items-center gap-1.5 text-[11px] text-white/90 sm:text-xs" title={explanation}>
        <ImageOff size={12} aria-hidden="true" className="shrink-0" />
        {notice}
      </p>
    </div>
  );
}
