/**
 * Crawlable city and category discovery pages.
 *
 * The measured gap this closes: only business profiles were server-rendered, so
 * `/businesses/in/lagos` and `/businesses/restaurant/in/lagos` — the pages built
 * to rank for "restaurants in Lagos" — returned the app shell with the same
 * generic title as the home page. The sitemap submitted them anyway, which is
 * volunteering near-duplicate URLs on the exact pages meant to earn organic
 * discovery.
 *
 * THE THRESHOLD IS THE POINT. A city+category page listing two businesses,
 * neither of which publishes opening hours, is a thin result for the query it
 * would rank for. Below MIN_INDEXABLE the page still renders — a person who
 * follows a link should see something useful — but it is marked noindex, so the
 * platform never asks to be ranked for a question its inventory cannot answer.
 *
 * Pure and dependency-free so it is testable, and so the Vercel function that
 * imports it stays a thin data-fetching shell.
 */

/**
 * How many listable businesses a discovery page needs before it asks to be
 * indexed.
 *
 * Five, not one. One business is a profile page with extra steps; five is the
 * point at which the page answers "who does this in this city" better than the
 * profile alone. Configurable because the right number differs between a dense
 * Lagos category and a whole city.
 */
export const MIN_INDEXABLE = 5;

export interface DiscoveryListing {
  id: string;
  name: string;
  username: string | null;
  category: string | null;
  location: string | null;
  description: string | null;
  /** Already resolved by the caller — this file does no clock arithmetic. */
  openLabel: string | null;
  hasHours: boolean;
}

export interface DiscoveryPage {
  siteUrl: string;
  /** Canonical path, e.g. /businesses/restaurant/in/lagos */
  path: string;
  /** Display place, e.g. "Lagos". Null for a category-only page. */
  place: string | null;
  /** Display category, e.g. "Restaurant & Food". Null for a place-only page. */
  category: string | null;
  total: number;
  listings: DiscoveryListing[];
  /** Other categories present in this place, for internal linking. */
  relatedCategories: Array<{ label: string; path: string }>;
  /** Other places, for internal linking. */
  relatedPlaces: Array<{ label: string; path: string }>;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function esc(value: string | null | undefined): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** JSON safe to sit inside a <script> element. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

/**
 * Should this page ask to be indexed?
 *
 * Two conditions, and the second is the one that matters: enough businesses,
 * AND at least one that can answer whether it is open. A page of listings that
 * all say "hours not confirmed" is exactly the commodity content current search
 * guidance discounts — and on this platform it is also just unhelpful.
 */
export function isIndexable(p: DiscoveryPage, min: number = MIN_INDEXABLE): boolean {
  if (p.total < min) return false;
  return p.listings.some((l) => l.hasHours);
}

/**
 * The title, written the way people search.
 *
 * "Restaurants in Lagos" is the query. Leading with the query rather than the
 * brand is why these pages exist; the brand goes last where it still reads as
 * attribution.
 */
export function discoveryTitle(p: DiscoveryPage): string {
  if (p.category && p.place) return `${p.category} in ${p.place} — NowOpen Africa`;
  if (p.place) return `Businesses in ${p.place} — NowOpen Africa`;
  if (p.category) return `${p.category} across Africa — NowOpen Africa`;
  return 'Discover businesses — NowOpen Africa';
}

/**
 * The description, built from counted facts.
 *
 * It states how many businesses and how many are open — both real numbers. It
 * never says "the best" or "top rated", because nothing here measures that.
 */
export function discoveryDescription(p: DiscoveryPage): string {
  const where = p.place ? ` in ${p.place}` : '';
  const what = p.category ? p.category.toLowerCase() : 'businesses';
  const openCount = p.listings.filter((l) => l.openLabel).length;
  const parts = [`Discover ${p.total} ${what}${where} on NowOpen Africa.`];
  if (openCount > 0) parts.push(`${openCount} open right now.`);
  parts.push('See opening hours, contact details and offers.');
  return parts.join(' ');
}

/**
 * ItemList over the businesses actually shown.
 *
 * `numberOfItems` is the number of items in the list, not the total match count
 * — overstating it is invalid markup, and invalid structured data is treated
 * worse than none.
 */
export function discoveryJsonLd(p: DiscoveryPage): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: discoveryTitle(p).replace(' — NowOpen Africa', ''),
    url: `${p.siteUrl}${p.path}`,
    numberOfItems: p.listings.length,
    itemListElement: p.listings.map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'LocalBusiness',
        name: l.name,
        url: `${p.siteUrl}/${l.username ?? ''}`,
        ...(l.category ? { additionalType: l.category } : {}),
        ...(l.location ? { address: { '@type': 'PostalAddress', addressLocality: l.location } } : {}),
      },
    })),
  };
}

export function breadcrumbJsonLd(p: DiscoveryPage): unknown {
  const crumbs: Array<{ name: string; path: string }> = [
    { name: 'NowOpen Africa', path: '/' },
    { name: 'Businesses', path: '/businesses' },
  ];
  if (p.place) crumbs.push({ name: p.place, path: `/businesses/in/${slugify(p.place)}` });
  if (p.category && p.place) crumbs.push({ name: p.category, path: p.path });
  else if (p.category) crumbs.push({ name: p.category, path: p.path });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `${p.siteUrl}${c.path}`,
    })),
  };
}

export function slugify(value: string): string {
  return String(value).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Title-case a slug back into something readable: "port-harcourt" → "Port Harcourt". */
export function unslugify(value: string): string {
  return String(value).split('-').filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * The page.
 *
 * Real HTML with the listings in it, so a crawler and a person with JavaScript
 * disabled both get the content rather than a shell. Deliberately plain: this
 * is the same information the app shows, rendered ahead of time. If the app's
 * discovery page gains a section that matters to a reader, this should gain it
 * too — the two must not diverge, which is the rule that keeps dynamic
 * rendering legitimate rather than cloaking.
 */
export function renderDiscoveryPage(p: DiscoveryPage, min: number = MIN_INDEXABLE): string {
  const title = discoveryTitle(p);
  const description = discoveryDescription(p);
  const canonical = `${p.siteUrl}${p.path}`;
  const indexable = isIndexable(p, min);

  const heading = p.category && p.place
    ? `${p.category} in ${p.place}`
    : p.place ? `Businesses in ${p.place}`
    : p.category ? `${p.category} across Africa`
    : 'Discover businesses';

  const items = p.listings.map((l) => {
    const href = l.username ? `/${l.username}` : `/businesses/${l.id}`;
    const meta = [l.category, l.location].filter(Boolean).join(' · ');
    return `      <li class="card">
        <h2><a href="${esc(href)}">${esc(l.name)}</a></h2>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ''}
        ${l.openLabel ? `<p class="open">${esc(l.openLabel)}</p>` : '<p class="unknown">Hours not confirmed</p>'}
        ${l.description ? `<p class="desc">${esc(l.description.slice(0, 180))}</p>` : ''}
      </li>`;
  }).join('\n');

  const links = (label: string, list: Array<{ label: string; path: string }>) =>
    list.length === 0 ? '' : `    <nav class="related" aria-label="${esc(label)}">
      <h2>${esc(label)}</h2>
      <ul>
${list.map((x) => `        <li><a href="${esc(x.path)}">${esc(x.label)}</a></li>`).join('\n')}
      </ul>
    </nav>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="NowOpen Africa">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${embedJson(discoveryJsonLd(p))}</script>
<script type="application/ld+json">${embedJson(breadcrumbJsonLd(p))}</script>
<style>
body{font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;margin:0;padding:24px;color:#111;background:#fff;max-width:900px}
h1{font-size:1.9rem;line-height:1.2;margin:0 0 4px}
.count{color:#555;margin:0 0 24px}
ul{list-style:none;padding:0;display:grid;gap:12px}
.card{border:1px solid #e5e7eb;border-radius:10px;padding:14px}
.card h2{font-size:1.05rem;margin:0 0 2px}
a{color:#1d4ed8}
.meta{color:#666;font-size:.85rem;margin:0}
.open{color:#047857;font-weight:600;font-size:.85rem;margin:4px 0 0}
.unknown{color:#92400e;font-size:.85rem;margin:4px 0 0}
.desc{color:#374151;font-size:.9rem;margin:6px 0 0}
.related{margin-top:32px}
.related h2{font-size:1rem}
.related ul{display:flex;flex-wrap:wrap;gap:8px}
nav.crumbs{font-size:.85rem;color:#666;margin:0 0 12px}
</style>
</head>
<body>
  <nav class="crumbs" aria-label="Breadcrumb">
    <a href="/">NowOpen Africa</a> › <a href="/businesses">Businesses</a>${p.place ? ` › <a href="/businesses/in/${esc(slugify(p.place))}">${esc(p.place)}</a>` : ''}${p.category ? ` › ${esc(p.category)}` : ''}
  </nav>
  <main>
    <h1>${esc(heading)}</h1>
    <p class="count">${p.total} ${p.total === 1 ? 'business' : 'businesses'} on NowOpen Africa${p.listings.filter((l) => l.openLabel).length > 0 ? ` · ${p.listings.filter((l) => l.openLabel).length} open right now` : ''}</p>
    ${p.listings.length === 0
      ? `<p>No businesses listed here yet. <a href="/campaign/founding-1000">Be the first</a>.</p>`
      : `<ul>\n${items}\n    </ul>`}
${links('Other categories here', p.relatedCategories)}
${links('Other places', p.relatedPlaces)}
  </main>
</body>
</html>`;
}
