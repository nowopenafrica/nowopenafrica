import { Link } from 'react-router-dom';
import { Star, MapPin, Navigation } from 'lucide-react';

import OpenStateBadge from '../OpenStateBadge';
import KeepButton from '../KeepButton';
import { businessHref, directionsHref, type DiscoverBusiness } from '../../lib/discover';

/**
 * A business as a person sees it.
 *
 * The card leads with whether the place is open, because that is the question
 * this product exists to answer. Keep sits on the card itself rather than only
 * on the profile, so a relationship can start at the moment of interest instead
 * of requiring a visit first.
 *
 * There is no distance in kilometres. `businesses` has no coordinates, and a
 * made-up "1.2km" on a card is worse than an honest place name.
 */
export default function BusinessCard({
  business,
  now,
}: {
  business: DiscoverBusiness;
  now?: Date;
}) {
  const href = businessHref(business);
  const rating = business.rating ?? 0;
  const reviews = business.review_count ?? 0;
  const image = business.image_url || business.logo_url;

  const directions = directionsHref(business);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden hover:border-gray-300 dark:hover:border-gray-600 transition flex flex-col">
      <Link to={href} className="block">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-32 object-cover"
          />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-blue-50 to-rose-50 dark:from-gray-700 dark:to-gray-700 flex items-center justify-center">
            <span className="text-2xl font-bold text-gray-400 dark:text-gray-500">
              {business.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </Link>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link to={href} className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{business.name}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
              {business.category || 'Business'}
            </p>
          </Link>
          {reviews > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200 shrink-0">
              <Star size={11} className="fill-amber-400 text-amber-400" />
              {rating.toFixed(1)}
              <span className="text-gray-400 font-normal">({reviews})</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <OpenStateBadge business={business} now={now} compact />
          {business.location && (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400 min-w-0">
              <MapPin size={10} className="shrink-0" />
              <span className="truncate">{business.location}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-auto pt-1">
          <KeepButton businessId={business.id} businessName={business.name} compact className="flex-1" />
          {directions && (
            <a
              href={directions}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Directions to ${business.name}`}
              className="inline-flex items-center justify-center gap-1 px-2.5 min-h-[36px] rounded-lg border border-gray-300 dark:border-gray-600 text-[11px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shrink-0"
            >
              <Navigation size={12} /> Directions
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
