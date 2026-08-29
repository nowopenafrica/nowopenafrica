import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, Star, BadgeCheck, ArrowRight, SearchX } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { applySeo, SITE_URL } from '../lib/seo';
import { Business } from '../types';
import {
  MIN_LISTINGS_PER_PAGE,
  discoveryTitle,
  matchesPage,
  placeOf,
  slugify,
} from '../lib/discoveryPages';

// The long-tail landing pages: /businesses/in/lagos, /businesses/restaurant/in/lagos.
//
// "restaurants in Lagos" is what somebody actually types, and until now the
// site had no page that answered it — a directory without these has no organic
// front door at all. Each one is a real page with a real list, listed in the
// live sitemap the moment enough businesses stand behind it.
//
// A page that no longer has the density to justify itself renders honestly and
// asks not to be indexed rather than sitting in the index as a near-empty
// result, which is what drags a whole domain down.

export default function DiscoveryPage() {
  const { place: placeSlug = '', category: categorySlug } = useParams();
  const [businesses, setBusinesses] = useState<Business[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .order('verified', { ascending: false })
        .order('rating', { ascending: false, nullsFirst: false });
      if (cancelled) return;
      setBusinesses(error ? [] : (data ?? []));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(
    () => (businesses ?? []).filter((b) => matchesPage(b, placeSlug, categorySlug)),
    [businesses, placeSlug, categorySlug],
  );

  // Display names come from the data, not the slug, so "salon-barber" reads as
  // "Salon / Barber" exactly as the listing spells it.
  const placeName = matches[0] ? placeOf(matches[0].location) : unslug(placeSlug);
  const categoryName = categorySlug
    ? (matches[0]?.category ?? unslug(categorySlug))
    : undefined;

  const heading = discoveryTitle({
    kind: categorySlug ? 'category-in-place' : 'place',
    place: placeName,
    category: categoryName,
  });

  const thin = businesses !== null && matches.length < MIN_LISTINGS_PER_PAGE;

  useEffect(() => {
    if (businesses === null) return; // wait for the real count before deciding
    const path = categorySlug
      ? `/businesses/${categorySlug}/in/${placeSlug}`
      : `/businesses/in/${placeSlug}`;

    return applySeo({
      title: `${heading} — NowOpen Africa`,
      description: categoryName
        ? `${matches.length} verified ${categoryName.toLowerCase()} businesses in ${placeName}. Opening hours, contact details and reviews on NowOpen Africa.`
        : `${matches.length} verified businesses in ${placeName}. Browse by category, see who is open now, and get in touch directly.`,
      path,
      // Below the density floor this is a thin page. Asking to be left out of
      // the index protects the pages that ARE worth ranking.
      robots: thin ? 'noindex, follow' : undefined,
      jsonLd: thin
        ? undefined
        : {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: heading,
            numberOfItems: matches.length,
            itemListElement: matches.slice(0, 25).map((b, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}${b.username ? `/${b.username}` : `/businesses/${b.id}`}`,
              name: b.name,
            })),
          },
    });
  }, [businesses, matches, heading, placeName, categoryName, placeSlug, categorySlug, thin]);

  // Categories present here, so a visitor can narrow without leaving the page's
  // topic — and each link is another indexable page once it has the density.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of matches) {
      const c = (b.category ?? '').trim();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= MIN_LISTINGS_PER_PAGE)
      .sort((a, b) => b[1] - a[1]);
  }, [matches]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="site-container py-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          <Link to="/businesses" className="hover:text-blue-600 dark:hover:text-blue-400">
            Businesses
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 dark:text-white">{heading}</span>
        </nav>

        <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white text-balance">
          {heading}
        </h1>
        <p className="mt-2 max-w-2xl text-sm sm:text-base text-gray-600 dark:text-gray-400">
          {businesses === null
            ? 'Loading listings…'
            : matches.length === 0
              ? `We have not listed anything in ${placeName} yet.`
              : `${matches.length} ${matches.length === 1 ? 'business' : 'businesses'} on NowOpen Africa${categoryName ? ` under ${categoryName}` : ''}.`}
        </p>

        {categorySlug ? (
          <Link
            to={`/businesses/in/${placeSlug}`}
            className="mt-3 inline-flex items-center gap-1 min-h-[44px] text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            See everything in {placeName} <ArrowRight size={14} />
          </Link>
        ) : categories.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {categories.map(([name, n]) => (
              <Link
                key={name}
                to={`/businesses/${slugify(name)}/in/${placeSlug}`}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {name}
                <span className="text-xs text-gray-400 tabular-nums">{n}</span>
              </Link>
            ))}
          </div>
        ) : null}

        {businesses !== null && matches.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-10 text-center">
            <SearchX className="mx-auto mb-3 text-gray-400" size={28} />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Nothing here yet. Businesses are added every week.
            </p>
            <Link
              to="/businesses"
              className="mt-4 inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              Browse every business <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches.map((b) => (
              <Link
                key={b.id}
                to={b.username ? `/${b.username}` : `/businesses/${b.id}`}
                className="group rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {b.name}
                  </h2>
                  {b.verified ? (
                    <BadgeCheck size={16} className="mt-0.5 shrink-0 text-blue-500" aria-label="Verified" />
                  ) : null}
                </div>
                {b.category ? (
                  <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    {b.category}
                  </p>
                ) : null}
                {b.description ? (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{b.description}</p>
                ) : null}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  {b.location ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} /> {b.location}
                    </span>
                  ) : null}
                  {typeof b.rating === 'number' && b.rating > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Star size={12} className="text-amber-500" /> {b.rating.toFixed(1)}
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Fallback display name when no listing is available to read the real spelling from. */
function unslug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
