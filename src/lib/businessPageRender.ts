// The crawlable business profile.
//
// THE PROBLEM THIS SOLVES
//
// nowopenafrica.com is a client-rendered SPA, so every business profile served
// exactly one sentence to anything that does not run JavaScript:
//
//   "NowOpen Africa needs JavaScript enabled to run."
//
// The LocalBusiness JSON-LD in BusinessDetail.tsx is real, but applySeo writes
// it at runtime. Googlebot may eventually render and see it; the crawlers that
// build link previews — WhatsApp, Facebook, X, LinkedIn, Telegram — never will,
// and Google's render queue is slow and not guaranteed. Meanwhile the sitemap
// dutifully lists every one of those URLs.
//
// For a directory, that is not a missing nice-to-have. Discovery IS the
// product, and a discovery platform search engines cannot read does not do the
// one thing it exists to do.
//
// So this module renders the same profile as real HTML: readable text a crawler
// can index, plus the structured data that makes a listing eligible for a rich
// result. Everything here is pure, so it is unit-testable without a network,
// and api/business/[slug].ts is the thin part that fetches and serves it.

import { escapeHtml } from './shareRender.js';
import {
  parseOpeningHours, isOpenAtInZone, nextChangeInZone, formatClock,
  DEFAULT_BUSINESS_TIMEZONE, WEEKDAY_FULL,
  type OpeningHours,
} from './openingHours.js';

export interface ProfileBusiness {
  id: string;
  username?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  image_url?: string | null;
  logo_url?: string | null;
  rating?: number | null;
  verified?: boolean | null;
  opening_hours?: string | null;
  hours?: string | null;
  timezone?: string | null;
  open_status?: 'open' | 'closed' | null;
}

export interface ProfileProduct {
  id: string;
  name: string;
  description?: string | null;
  price?: string | null;
  image_url?: string | null;
}

export interface ProfileService {
  id: string;
  name: string;
  description?: string | null;
  price?: string | null;
}

export interface ProfileReview {
  id: string;
  author_name?: string | null;
  rating?: number | null;
  comment?: string | null;
  created_at?: string | null;
}

export interface ProfilePage {
  business: ProfileBusiness;
  products: ProfileProduct[];
  services: ProfileService[];
  reviews: ProfileReview[];
  reviewCount: number;
  siteUrl: string;
  /** Injected so the rendered status is testable at a fixed moment. */
  now?: Date;
}

/** Where this profile lives. The username form is the one people share. */
export const profilePath = (b: Pick<ProfileBusiness, 'id' | 'username'>): string =>
  b.username ? `/${b.username}` : `/businesses/${b.id}`;

// --- Open / closed ------------------------------------------------------------

export interface OpenState {
  /** 'open' | 'closing-soon' | 'closed' | 'unknown' */
  kind: 'open' | 'closing-soon' | 'closed' | 'unknown';
  label: string;
  /** The second line: "Open until 8:00 PM", "Opens Monday 9:00 AM". */
  detail: string;
}

/** Under this many minutes to closing counts as closing soon. */
export const CLOSING_SOON_MINUTES = 60;

/**
 * The state to print, in the business's OWN timezone.
 *
 * "Closing soon" is a distinct state rather than a shade of open because it is
 * the one that changes a customer's behaviour — it is the difference between
 * setting off now and going tomorrow.
 *
 * An owner's manual override wins over the schedule, since a business that has
 * shut early knows something the timetable does not. But it cannot invent a
 * time, so the detail line falls back to the schedule's wording.
 */
export function openState(b: ProfileBusiness, now: Date = new Date()): OpenState {
  const text = b.opening_hours || b.hours || '';
  const hours: OpeningHours | null = parseOpeningHours(text);
  const zone = b.timezone || DEFAULT_BUSINESS_TIMEZONE;

  if (b.open_status === 'closed') {
    return { kind: 'closed', label: 'Closed', detail: nextOpenDetail(hours, zone, now) };
  }

  if (!hours) {
    if (b.open_status === 'open') return { kind: 'open', label: 'Open now', detail: '' };
    return { kind: 'unknown', label: 'Hours not confirmed', detail: '' };
  }

  if (hours.alwaysOpen) return { kind: 'open', label: 'Open now', detail: 'Open 24 hours' };

  const open = b.open_status === 'open' || isOpenAtInZone(hours, now, zone);
  if (!open) return { kind: 'closed', label: 'Closed', detail: nextOpenDetail(hours, zone, now) };

  const change = nextChangeInZone(hours, now, zone);
  if (change?.kind === 'closes' && change.dayOffset === 0) {
    const mins = minutesUntil(change.minutes, now, zone);
    if (mins !== null && mins <= CLOSING_SOON_MINUTES) {
      return {
        kind: 'closing-soon',
        label: 'Closing soon',
        detail: `Closes in ${mins} minute${mins === 1 ? '' : 's'}`,
      };
    }
    return { kind: 'open', label: 'Open now', detail: `Open until ${formatClock(change.minutes)}` };
  }
  return { kind: 'open', label: 'Open now', detail: '' };
}

function nextOpenDetail(hours: OpeningHours | null, zone: string, now: Date): string {
  if (!hours) return '';
  const change = nextChangeInZone(hours, now, zone);
  if (!change || change.kind !== 'opens') return '';
  if (change.dayOffset === 0) return `Opens at ${formatClock(change.minutes)}`;
  if (change.dayOffset === 1) return `Opens tomorrow at ${formatClock(change.minutes)}`;
  const day = WEEKDAY_FULL[(nowDayInZone(now, zone) + change.dayOffset) % 7];
  return `Opens ${day} at ${formatClock(change.minutes)}`;
}

function nowDayInZone(now: Date, zone: string): number {
  try {
    const label = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zone }).format(now);
    const i = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
    return i >= 0 ? i : now.getDay();
  } catch {
    return now.getDay();
  }
}

/** Minutes from now until a time-of-day, in the business's zone. */
function minutesUntil(targetMinutes: number, now: Date, zone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const diff = targetMinutes - (h * 60 + m);
    return diff >= 0 ? diff : null;
  } catch {
    return null;
  }
}

// --- Structured data ----------------------------------------------------------

const SCHEMA_DAYS = [
  'https://schema.org/Sunday', 'https://schema.org/Monday', 'https://schema.org/Tuesday',
  'https://schema.org/Wednesday', 'https://schema.org/Thursday', 'https://schema.org/Friday',
  'https://schema.org/Saturday',
];

const pad = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/**
 * openingHoursSpecification, the part that earns the "Open now" line in a
 * Google result. Days with no hours are omitted rather than emitted as
 * 00:00–00:00, which would claim the business is open at midnight.
 */
export function openingHoursSpecification(text: string | null | undefined): unknown[] {
  const hours = parseOpeningHours(text);
  if (!hours) return [];
  if (hours.alwaysOpen) {
    return [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: SCHEMA_DAYS,
      opens: '00:00',
      closes: '23:59',
    }];
  }
  return hours.days
    .map((d, i) => (d.open === null || d.close === null ? null : {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: SCHEMA_DAYS[i],
      opens: pad(d.open),
      closes: pad(d.close),
    }))
    .filter(Boolean) as unknown[];
}

/**
 * The structured data graph.
 *
 * A rating is only claimed when there are reviews to support it. Emitting
 * aggregateRating with reviewCount 0 is invalid structured data, and Google
 * penalises a page for it rather than ignoring it.
 */
export function profileJsonLd(p: ProfilePage): unknown {
  const b = p.business;
  const url = `${p.siteUrl}${profilePath(b)}`;
  const image = b.image_url || b.logo_url;
  const hasRating = typeof b.rating === 'number' && b.rating > 0 && p.reviewCount > 0;

  const business: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': url,
    name: b.name,
    url,
    ...(b.description ? { description: b.description } : {}),
    ...(image ? { image: [image] } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.email ? { email: b.email } : {}),
    ...(b.website ? { sameAs: [b.website] } : {}),
    ...(b.location ? { address: { '@type': 'PostalAddress', addressLocality: b.location } } : {}),
    ...(hasRating ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: b.rating,
        reviewCount: p.reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    } : {}),
  };

  const spec = openingHoursSpecification(b.opening_hours || b.hours);
  if (spec.length) business.openingHoursSpecification = spec;

  // Products as offers, so a listing can surface with prices. The price is free
  // text in this schema ("From ₦200/day", "Contact us"), so it goes in
  // `description` rather than `price` — a malformed price is worse than none.
  if (p.products.length) {
    business.makesOffer = p.products.slice(0, 30).map((prod) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Product',
        name: prod.name,
        ...(prod.description ? { description: prod.description } : {}),
        ...(prod.image_url ? { image: prod.image_url } : {}),
      },
      ...(prod.price ? { description: prod.price } : {}),
    }));
  }

  return business;
}

/**
 * Serialise structured data for embedding in a <script> tag.
 *
 * JSON.stringify does NOT escape `<`, so a business named
 * `</script><script>…` closes the JSON-LD block and runs whatever follows —
 * stored XSS, on our own domain, from a field any owner can edit. Escaping the
 * angle brackets and ampersand keeps the JSON valid and inert. U+2028 and
 * U+2029 go too: they are legal JSON but illegal inside a JS string literal,
 * and would break the parse.
 *
 * Found by the test that gives a business a name containing a script tag.
 * Keep that test.
 */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function breadcrumbJsonLd(p: ProfilePage): unknown {
  const b = p.business;
  const items: { name: string; item: string }[] = [
    { name: 'Businesses', item: `${p.siteUrl}/businesses` },
  ];
  if (b.category) items.push({ name: b.category, item: `${p.siteUrl}/businesses?category=${encodeURIComponent(b.category)}` });
  items.push({ name: b.name, item: `${p.siteUrl}${profilePath(b)}` });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
}

// --- Copy ---------------------------------------------------------------------

export function profileTitle(p: ProfilePage): string {
  const b = p.business;
  const where = b.location ? ` in ${b.location}` : '';
  const what = b.category ? ` — ${b.category}` : '';
  return `${b.name}${what}${where} | NowOpen Africa`;
}

/**
 * The description a search result shows.
 *
 * Leads with the business's own words where it has any, and only falls back to
 * a generated sentence otherwise — a page full of template text is what makes a
 * directory look automated.
 */
export function profileDescription(p: ProfilePage): string {
  const b = p.business;
  const own = (b.description || '').trim().replace(/\s+/g, ' ');
  if (own.length >= 60) return own.slice(0, 300);

  const bits = [b.category, b.location].filter(Boolean).join(' in ');
  const counts: string[] = [];
  if (p.products.length) counts.push(`${p.products.length} product${p.products.length === 1 ? '' : 's'}`);
  if (p.services.length) counts.push(`${p.services.length} service${p.services.length === 1 ? '' : 's'}`);
  const tail = counts.length ? ` See ${counts.join(' and ')}, opening hours and contact details.` : ' See opening hours and contact details.';
  return `${b.name}${bits ? ` — ${bits}` : ''}.${own ? ` ${own}` : ''}${tail}`.slice(0, 300);
}

// --- The page -----------------------------------------------------------------

const STATUS_COLOUR: Record<OpenState['kind'], string> = {
  open: '#16a34a',
  'closing-soon': '#d97706',
  closed: '#dc2626',
  unknown: '#64748b',
};

function hoursTable(text: string | null | undefined): string {
  const hours = parseOpeningHours(text);
  if (!hours) return '';
  if (hours.alwaysOpen) return '<p class="hours">Open 24 hours, every day.</p>';
  const rows = hours.days.map((d, i) => {
    const when = d.open === null || d.close === null
      ? 'Closed'
      : `${formatClock(d.open)} – ${formatClock(d.close)}`;
    return `<tr><th scope="row">${WEEKDAY_FULL[i]}</th><td>${when}</td></tr>`;
  }).join('');
  return `<table class="hours"><caption>Opening hours</caption><tbody>${rows}</tbody></table>`;
}

/**
 * Render the profile.
 *
 * The body is real, readable content — not a placeholder — because that is what
 * a crawler indexes and what a person who lands here without JavaScript reads.
 * Anyone with a working browser is carried on to the app by the link at the top
 * of the page rather than a redirect, so the same HTML serves both and there is
 * nothing being hidden from anybody.
 */
export function renderBusinessPage(p: ProfilePage): string {
  const b = p.business;
  const now = p.now ?? new Date();
  const state = openState(b, now);
  const url = `${p.siteUrl}${profilePath(b)}`;
  const image = b.image_url || b.logo_url || `${p.siteUrl}/og-image.png`;

  const title = escapeHtml(profileTitle(p));
  const description = escapeHtml(profileDescription(p));
  const name = escapeHtml(b.name);
  const safeUrl = escapeHtml(url);
  const safeImage = escapeHtml(image);

  const contact = [
    b.phone ? `<a href="tel:${escapeHtml(b.phone)}">Call ${escapeHtml(b.phone)}</a>` : '',
    b.email ? `<a href="mailto:${escapeHtml(b.email)}">${escapeHtml(b.email)}</a>` : '',
    b.website ? `<a href="${escapeHtml(b.website)}" rel="nofollow noopener">Website</a>` : '',
    b.location ? `<a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(b.location)}" rel="nofollow noopener">Directions</a>` : '',
  ].filter(Boolean).join('');

  const productList = p.products.length ? `
  <section>
    <h2>Products</h2>
    <ul class="items">
      ${p.products.slice(0, 60).map((it) => `<li>
        <strong>${escapeHtml(it.name)}</strong>
        ${it.price ? `<span class="price">${escapeHtml(it.price)}</span>` : ''}
        ${it.description ? `<p>${escapeHtml(it.description)}</p>` : ''}
      </li>`).join('')}
    </ul>
  </section>` : '';

  const serviceList = p.services.length ? `
  <section>
    <h2>Services</h2>
    <ul class="items">
      ${p.services.slice(0, 60).map((it) => `<li>
        <strong>${escapeHtml(it.name)}</strong>
        ${it.price ? `<span class="price">${escapeHtml(it.price)}</span>` : ''}
        ${it.description ? `<p>${escapeHtml(it.description)}</p>` : ''}
      </li>`).join('')}
    </ul>
  </section>` : '';

  const reviewList = p.reviews.length ? `
  <section>
    <h2>Reviews</h2>
    ${p.reviews.slice(0, 10).map((r) => `<blockquote>
      ${typeof r.rating === 'number' ? `<p class="stars">${'★'.repeat(Math.round(r.rating))}${'☆'.repeat(Math.max(0, 5 - Math.round(r.rating)))}</p>` : ''}
      ${r.comment ? `<p>${escapeHtml(r.comment)}</p>` : ''}
      ${r.author_name ? `<cite>${escapeHtml(r.author_name)}</cite>` : ''}
    </blockquote>`).join('')}
  </section>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${safeUrl}">
<meta property="og:site_name" content="NowOpen Africa">
<meta property="og:type" content="business.business">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${safeUrl}">
<meta property="og:image" content="${safeImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${safeImage}">
<script type="application/ld+json">${embedJson(profileJsonLd(p))}</script>
<script type="application/ld+json">${embedJson(breadcrumbJsonLd(p))}</script>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:#f8fafc; color:#0f172a;
         font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  main { max-width:720px; margin:0 auto; padding:24px 16px 64px; }
  .cover { width:100%; aspect-ratio:16/6; object-fit:cover; border-radius:14px; background:#e2e8f0; }
  h1 { font-size:28px; margin:18px 0 4px; }
  .meta { color:#475569; margin:0 0 10px; }
  .status { display:inline-flex; align-items:center; gap:8px; font-weight:700; }
  .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
  .actions { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 8px; }
  .actions a { display:inline-block; padding:10px 14px; border-radius:10px;
               background:#fff; border:1px solid #cbd5e1; color:#0f172a;
               text-decoration:none; font-weight:600; font-size:14px; }
  .cta { display:inline-block; margin:12px 0 4px; padding:13px 18px; border-radius:12px;
         background:#4f46e5; color:#fff; text-decoration:none; font-weight:700; }
  section { margin-top:28px; }
  h2 { font-size:18px; margin:0 0 10px; }
  ul.items { list-style:none; margin:0; padding:0; }
  ul.items li { background:#fff; border:1px solid #e2e8f0; border-radius:12px;
                padding:12px 14px; margin-bottom:8px; }
  ul.items p { margin:4px 0 0; color:#475569; font-size:14px; }
  .price { float:right; font-weight:700; color:#4f46e5; }
  table.hours { width:100%; background:#fff; border:1px solid #e2e8f0;
                border-radius:12px; border-collapse:separate; border-spacing:0; padding:6px 10px; }
  table.hours caption { text-align:left; font-weight:700; padding:6px 4px; }
  table.hours th { text-align:left; font-weight:500; color:#475569; padding:4px; }
  table.hours td { text-align:right; padding:4px; }
  blockquote { margin:0 0 10px; background:#fff; border:1px solid #e2e8f0;
               border-radius:12px; padding:12px 14px; }
  blockquote p { margin:0 0 4px; }
  .stars { color:#f59e0b; letter-spacing:2px; }
  cite { color:#64748b; font-size:13px; font-style:normal; }
  footer { margin-top:36px; color:#64748b; font-size:13px; }
  footer a { color:#4f46e5; }
</style>
</head>
<body>
<main>
  ${b.image_url ? `<img class="cover" src="${escapeHtml(b.image_url)}" alt="${name}">` : ''}
  <h1>${name}${b.verified ? ' <span title="Verified business" aria-label="Verified business">✅</span>' : ''}</h1>
  <p class="meta">${[b.category, b.location].filter(Boolean).map((x) => escapeHtml(String(x))).join(' · ')}</p>
  <p class="status"><span class="dot" style="background:${STATUS_COLOUR[state.kind]}"></span>
    ${escapeHtml(state.label)}${state.detail ? ` <span style="font-weight:400;color:#475569">· ${escapeHtml(state.detail)}</span>` : ''}</p>

  ${b.description ? `<p>${escapeHtml(b.description)}</p>` : ''}

  <div class="actions">${contact}</div>
  <a class="cta" href="${safeUrl}">Open ${name} on NowOpen Africa</a>

  ${hoursTable(b.opening_hours || b.hours)}
  ${productList}
  ${serviceList}
  ${reviewList}

  <footer>
    <p><a href="${escapeHtml(p.siteUrl)}/businesses">Browse more businesses on NowOpen Africa</a></p>
  </footer>
</main>
</body>
</html>`;
}
