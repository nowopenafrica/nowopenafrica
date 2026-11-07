import { Link } from 'react-router-dom';
import { Star, MapPin, Navigation, Phone, Globe } from 'lucide-react';

import OpenStateBadge from '../OpenStateBadge';
import VerifiedBadge from '../VerifiedBadge';
import KeepButton from '../KeepButton';
import {
  businessHref, directionsHref, secondaryCategories,
  type DiscoverBusiness,
} from '../../lib/discover';
import SmartImg from '../SmartImg';
import { focalToCss } from '../../lib/coverPosition';
import { coverAltText } from '../../lib/stockImage';
import { businessWebsiteLink } from '../../lib/webLink';
import { SITE_URL } from '../../lib/seo';

/**
 * A business as a person sees it.
 *
 * Carries the same details as the directory card — category, the other
 * categories it trades under, the verified mark, the description, location,
 * phone, website, rating — and adds the two things a discovery card needs that
 * a directory row did not: whether it is open, and a way to start a
 * relationship without visiting the profile first.
 *
 * Keep and Directions are deliberately small, and share the rating's row so
 * they cost the card one line rather than a block of its height. They are the
 * actions, but they are not what the card is FOR: someone is reading to decide
 * whether this place is worth their evening, and buttons that dominate the card
 * crowd out the details that answer that question. 36px, not smaller — below
 * that they stop being comfortably tappable on a phone.
 *
 * There is no distance in kilometres. `businesses` has no coordinates, so an
 * invented "1.2km" would be worse than an honest place name.
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
  const imageFallback = business.image_url && business.logo_url ? business.logo_url : null;
  const directions = directionsHref(business);
  const alsoIn = secondaryCategories(business);
  const site = businessWebsiteLink(business, SITE_URL)?.label ?? null;

  return (
    <div className="group rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-500/50 transition flex flex-col">
      {/*
        * Hidden from assistive tech, and out of the tab order with it.
        *
        * Two things were wrong. A card for a business with no image rendered
        * this as a link wrapping a bare gradient <div> — a link with no
        * accessible name at all, which a screen reader announces as "link"
        * and nothing else (31 of them on the mobile homepage). And where
        * there IS an image it duplicates the very next link, so a
        * screen-reader user heard every business twice.
        *
        * The text link below carries the name and the same destination, so
        * this one is decorative. `aria-hidden` alone would leave a focusable
        * element hidden from the accessibility tree, which is its own
        * violation — hence tabIndex -1 as well.
        */}
      <Link
        to={href}
        className="block h-24 overflow-hidden shrink-0"
        aria-hidden="true"
        tabIndex={-1}
      >
        {image ? (
          <SmartImg
            src={image}
            fallback={imageFallback}
            /*
             * Not `business.name`: 1,176 listings carry a licensed stock
             * placeholder, and naming the business asserts the photograph
             * shows it. See lib/stockImage.ts.
             */
            alt={coverAltText(business.name, image)}
            className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
            /*
             * The card crops the same picture to a different shape again, so
             * it has to honour the owner's focal point too — otherwise a
             * cover positioned correctly on the profile is wrong here.
             */
            style={{ objectPosition: focalToCss(
              (business as { cover_focal_x?: number | null }).cover_focal_x,
              (business as { cover_focal_y?: number | null }).cover_focal_y,
            ) }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
        )}
      </Link>

      <div className="p-3 flex flex-col flex-1 min-w-0">
        <Link to={href} className="block min-w-0">
          <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium truncate">
            {business.category || 'Business'}
          </p>
          {alsoIn.length > 0 && (
            <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
              + {alsoIn.join(' · ')}
            </p>
          )}
          <h3 className="font-bold text-gray-900 dark:text-white text-[13px] uppercase truncate mt-0.5">
            {business.name}
            {business.verified && (
              <VerifiedBadge compact size={13} className="inline-block align-text-bottom ml-1" />
            )}
          </h3>
          {business.description && (
            <p className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2 mt-1">
              {business.description}
            </p>
          )}
        </Link>

        <div className="mt-2">
          <OpenStateBadge business={business} now={now} compact />
        </div>

        <div className="mt-2 space-y-1 text-[11px] text-gray-600 dark:text-gray-400 min-w-0">
          {business.location && (
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin size={12} className="shrink-0 text-gray-500 dark:text-gray-400" />
              <span className="line-clamp-1">{business.location}</span>
            </div>
          )}
          {business.phone && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Phone size={12} className="shrink-0 text-gray-500 dark:text-gray-400" />
              <span className="truncate">{business.phone}</span>
            </div>
          )}
          {site && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Globe size={12} className="shrink-0 text-gray-500 dark:text-gray-400" />
              <span className="truncate">{site}</span>
            </div>
          )}
        </div>

        {/* Rating and the two actions share one row, so the buttons cost the
            card a single line rather than a block of its height. */}
        <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/60 flex items-center gap-2">
          {/* A business with no reviews has no rating — it does not have a
              rating of nought. Printing "0.0" next to a filled star tells a
              visitor this place was rated and rated badly, which is a worse
              lie than saying nothing, and it is the owner's listing that
              carries the damage. */}
          <span className="flex items-center gap-1 shrink-0">
            {rating > 0 ? (
              <>
                <Star size={13} className="fill-yellow-400 text-yellow-400" />
                <span className="text-[11px] font-medium text-gray-900 dark:text-white">
                  {rating.toFixed(1)}
                </span>
                {reviews > 0 && (
                  <span className="text-[10px] text-gray-400">({reviews})</span>
                )}
              </>
            ) : (
              <span className="text-[10px] text-gray-400">No reviews yet</span>
            )}
          </span>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <KeepButton
              businessId={business.id}
              businessName={business.name}
              compact
              size="sm"
            />
            {directions && (
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Directions to ${business.name}`}
                title="Directions"
                className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Navigation size={13} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
