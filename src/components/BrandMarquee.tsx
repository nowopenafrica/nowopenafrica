import { Link } from 'react-router-dom';
import { Store } from 'lucide-react';

export interface Brand {
  name: string;
  logo?: string | null;
  href?: string;
}

interface BrandMarqueeProps {
  brands: Brand[];
}

/**
 * Continuously scrolling partners/clients logo strip. The list is rendered
 * twice back-to-back and shifted by -50%, so the loop is seamless at any
 * width. Pauses on hover; respects prefers-reduced-motion.
 */
export default function BrandMarquee({ brands }: BrandMarqueeProps) {
  if (brands.length === 0) return null;

  // Two identical halves are required for the seamless -50% loop; repeat
  // small brand lists so each half is comfortably wider than the viewport.
  const perHalf = Math.max(1, Math.ceil(10 / brands.length));
  const half = Array.from({ length: perHalf }).flatMap(() => brands);
  const loop = [...half, ...half];

  const item = (brand: Brand, i: number) => {
    const inner = (
      <>
        {brand.logo ? (
          <img
            src={brand.logo}
            alt={`${brand.name} logo`}
            className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <span className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Store size={18} className="text-blue-600 dark:text-blue-400" />
          </span>
        )}
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap">
          {brand.name}
        </span>
      </>
    );
    const cls =
      'flex items-center gap-2.5 flex-shrink-0 min-h-[44px] px-1 rounded-lg grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
    return brand.href ? (
      <Link key={i} to={brand.href} className={cls}>
        {inner}
      </Link>
    ) : (
      <div key={i} className={cls}>
        {inner}
      </div>
    );
  };

  return (
    <div className="overflow-hidden group relative">
      {/* Edge fades so logos glide in and out */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 z-10 bg-gradient-to-r from-gray-50 dark:from-gray-900 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 z-10 bg-gradient-to-l from-gray-50 dark:from-gray-900 to-transparent" />
      <div className="flex items-center gap-12 w-max animate-[marquee_40s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        {loop.map(item)}
      </div>
    </div>
  );
}
