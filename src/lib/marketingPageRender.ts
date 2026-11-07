/**
 * Server-rendered HTML for the static marketing pages.
 *
 * Measured on production 2026-09-06, with a Googlebot user agent:
 *
 *   /            6460 bytes, no <h1>, "needs JavaScript enabled to run"
 *   /about       6460 bytes, identical
 *   /platform    6460 bytes, identical
 *   /waitlist    6460 bytes, identical
 *   /discover    6460 bytes, identical
 *
 * Byte-for-byte the same shell on every route. Meanwhile /yemzoarts and
 * /businesses/in/lagos rendered properly — so the crawler pipeline in
 * middleware.ts works, it had simply never been pointed at these paths.
 *
 * THE RULE THAT MATTERS: what a crawler is told must be what a person sees.
 * Serving search engines text the page does not contain is cloaking, and it is
 * also how a site ends up ranking for a promise it never makes. So every string
 * below is copied from the page it describes, and marketingPageRender.test.ts
 * reads the .tsx files and fails if they drift apart.
 *
 * This is not a rendering engine for the app. It is a plain, honest summary of
 * each page — heading, the copy under it, and the links onward — enough for a
 * crawler to understand and traverse the site. People still get the SPA.
 */

export interface MarketingLink {
  href: string;
  label: string;
}

export interface MarketingPage {
  path: string;
  /**
   * The URL this page should be indexed as, when it is not `path` itself.
   *
   * Some routes are aliases: /join/business is the short campaign link for
   * /add-business and serves byte-identical content. Without this, each alias
   * declares ITSELF canonical, and Google is handed two URLs for one page both
   * claiming to be the original — the textbook duplicate-content signal, caused
   * by the site rather than by a crawler guessing.
   */
  canonicalPath?: string;
  title: string;
  description: string;
  h1: string;
  /** Real paragraphs from the page, in the order they appear. */
  paragraphs: string[];
  /** Where a crawler should go next. Real routes only. */
  links: MarketingLink[];
}

const EXPLORE: MarketingLink[] = [
  { href: '/businesses', label: 'Browse businesses' },
  { href: '/discover', label: 'Discover' },
  { href: '/open-now', label: 'Open now' },
  { href: '/offers', label: 'Offers' },
  { href: '/adverts', label: 'Ad placements' },
  { href: '/platform', label: 'Industry operating systems' },
  { href: '/about', label: 'About NowOpen Africa' },
  { href: '/waitlist', label: 'Add your business' },
];

export const MARKETING_PAGES: MarketingPage[] = [
  {
    path: '/',
    title: 'NowOpen Africa — The Operating System for Business Growth in Africa',
    description:
      'Find businesses across Africa — what is open now, what is near you, and what they offer. Every listing is claimed by the person who runs it.',
    h1: 'What are you looking for? Africa is NowOpen.',
    paragraphs: [
      'Discover customers. Find businesses. Advertise everywhere. Create anything. Grow with AI.',
      'The directory is being built. Real businesses, added one at a time, and every one of them claimed by the person who runs it. No invented profiles and no bought lists — if a name is on NowOpen, you can reach it.',
      'Each industry gets a purpose-built profile — property portals, restaurant menus, repair queues, booking engines — rather than one generic template.',
    ],
    links: EXPLORE,
  },
  {
    path: '/about',
    title: 'About NowOpen Africa — The Operating System for African Business',
    description:
      'NowOpen Africa helps African businesses get discovered, advertise effectively and hire creative talent — all in one place, built for African markets.',
    h1: 'The operating system for business growth in Africa',
    paragraphs: [
      'NowOpen Africa helps businesses get discovered, advertise effectively, and hire the creative talent they need — all in one place, built for African markets.',
      'Millions of African businesses are open for business but hard to find, hard to reach, and hard to trust online. Customers waste time; good businesses lose out. NowOpen Africa closes that gap — a single platform where a business can build a real presence, take bookings and orders, run advertising, go live, and earn verified trust, priced for the realities of the markets it serves.',
      'Local currencies and mobile-money-friendly checkout, per-industry tools instead of one generic template, and a trust layer designed for how business really gets done across the continent.',
    ],
    links: [
      { href: '/platform', label: 'Industry operating systems' },
      { href: '/founder', label: 'Meet the founder' },
      { href: '/contact', label: 'Contact us' },
      { href: '/waitlist', label: 'Add your business' },
      { href: '/businesses', label: 'Browse businesses' },
    ],
  },
  {
    path: '/platform',
    title: 'Industry Operating Systems — NowOpen Africa',
    description:
      'NowOpen Africa isn’t a generic directory. Every industry gets a purpose-built operating system — real estate portals, restaurant ordering, hotel booking, creative studios and more — on one platform for African business.',
    h1: 'An operating system for every industry',
    paragraphs: [
      'Every category gets a purpose-built profile — property portals, restaurant menus, repair queues, booking engines and more — so a business feels designed specifically for its industry.',
    ],
    links: EXPLORE,
  },
  {
    path: '/discover',
    title: 'Discover businesses — NowOpen Africa',
    description: 'Find what is open now, what is new, and the places worth knowing about near you.',
    h1: 'Discover',
    /*
     * MEASURED 2026-09-14: this renders 1,524 bytes for Googlebot, the thinnest
     * page on the site, while the sitemap submits it at priority 0.9 — the joint
     * highest. That is a real problem and it is NOT fixed by adding prose here:
     * this renderer's copy must be the copy on the page, and the page is a live
     * directory whose content is the listings themselves.
     *
     * The fix is to render those listings the way /businesses/in/lagos does.
     * Tracked with the discovery-page work.
     */
    paragraphs: [
      'What is open, what is new, and what is worth knowing about.',
    ],
    links: [
      { href: '/businesses', label: 'Browse businesses' },
      { href: '/open-now', label: 'Open now' },
      { href: '/nearby', label: 'Near me' },
      { href: '/offers', label: 'Offers' },
      { href: '/waitlist', label: 'Add your business' },
    ],
  },
  {
    /*
     * The shareable acquisition link, and the same reasoning as the entry
     * below: it exists to be pasted into WhatsApp, an Instagram bio and a QR
     * code, so the link PREVIEW is the first thing most people see of it.
     * Without an entry here a crawler gets the SPA shell and the generic site
     * title -- the same preview every other NowOpen link produces.
     */
    path: '/add-business',
    title: 'Add your business — free NowOpen Africa profile',
    description:
      'Put your business on the map. Create a free NowOpen profile so customers across Africa can find your services, products and opening hours.',
    h1: 'Put Your Business on the Map',
    paragraphs: [
      'Your business deserves to be found. Create your free NowOpen profile and help customers discover your business, services, products and offers across Africa.',
      'Free to get started. You can update your business information anytime.',
      'Already listed? You can claim an existing profile rather than creating a second one.',
    ],
    links: [
      { href: '/businesses', label: 'Browse businesses' },
      { href: '/send-business', label: 'Send your business name instead' },
      { href: '/nominate', label: 'Recommend a business' },
      { href: '/about', label: 'About NowOpen Africa' },
    ],
  },
  {
    /*
     * The shorter campaign alias for the same page. It needs its own entry
     * because this map is keyed on the exact path: without it, the link
     * offered as the SHORT one to print and say out loud is the one whose
     * preview falls back to the generic site title.
     */
    path: '/join/business',
    canonicalPath: '/add-business',
    title: 'Add your business — free NowOpen Africa profile',
    description:
      'Put your business on the map. Create a free NowOpen profile so customers across Africa can find your services, products and opening hours.',
    h1: 'Put Your Business on the Map',
    paragraphs: [
      'Your business deserves to be found. Create your free NowOpen profile and help customers discover your business, services, products and offers across Africa.',
      'Free to get started. You can update your business information anytime.',
      'Already listed? You can claim an existing profile rather than creating a second one.',
    ],
    links: [
      { href: '/businesses', label: 'Browse businesses' },
      { href: '/add-business', label: 'Add your business' },
      { href: '/nominate', label: 'Recommend a business' },
      { href: '/about', label: 'About NowOpen Africa' },
    ],
  },
  {
    // The campaign destination. This one matters more than the rest: it is
    // mostly shared on WhatsApp, and a WhatsApp link preview is built from
    // server-rendered meta by a crawler that runs no JavaScript. Without this
    // entry the most-shared link on the site previews as a blank shell.
    path: '/send-business',
    title: 'Send us your business name — we set up your NowOpen profile',
    description:
      'Own a business in Africa? Do not register. Send your business name and NowOpen sets up your profile. You check it, then you claim it. No account, no forms.',
    h1: 'Your business deserves to be found.',
    paragraphs: [
      'Send us your business name. We will set up your NowOpen profile.',
      'No account. No forms. No complicated setup. We build it. You check it. Then it is yours.',
      'Nothing goes live until you have seen it and said yes.',
    ],
    links: [
      { href: '/nominate', label: 'Nominate a business' },
      { href: '/businesses', label: 'Browse businesses' },
      { href: '/discover', label: 'Discover' },
      { href: '/about', label: 'About NowOpen Africa' },
    ],
  },
  {
    path: '/nominate',
    title: 'Nominate a business for NowOpen Africa',
    description:
      'Know a business that should be on NowOpen? Send us the name and where it is. We prepare the page and the owner claims it — no account needed.',
    h1: 'Know a business that should be on NowOpen?',
    paragraphs: [
      'Send us the name. We prepare the page, and the owner claims it when they are ready.',
      'We check every nomination before anything appears.',
    ],
    links: [
      { href: '/send-business', label: 'Send your own business' },
      { href: '/businesses', label: 'Browse businesses' },
      { href: '/discover', label: 'Discover' },
    ],
  },
  {
    path: '/waitlist',
    title: 'Join the Waitlist — NowOpen Africa',
    description:
      'Get early access to NowOpen Africa in your market. Founding members lock in launch pricing, a free verified badge and early invites.',
    h1: 'Be first when Africa’s business growth ecosystem goes live',
    paragraphs: [
      'NowOpen Africa connects businesses, advertising placements and creative services in one place.',
      'Founding members are invited first, market by market.',
    ],
    links: [
      { href: '/about', label: 'About NowOpen Africa' },
      { href: '/platform', label: 'Industry operating systems' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/businesses', label: 'Browse businesses' },
    ],
  },
  /*
   * The eight pages that were in the sitemap and served the crawler the HOME
   * PAGE's title.
   *
   * Measured before this: fetched as Googlebot, /businesses, /media, /pricing,
   * /adverts, /contact, /founder, /terms and /privacy each returned
   * "NowOpen Africa — The Operating System for Business Growth in Africa"
   * with a canonical pointing at `/` — the shell's baked-in tags. Eight of the
   * fourteen URLs the site asks to be indexed were declaring themselves
   * duplicates of the front page. The canonical half of that is fixed (the
   * shell no longer asserts one), and this fixes the other half: each page now
   * says what it actually is.
   *
   * Every string here is copied verbatim from the page's own applySeo() call
   * and <h1>. That is not a coincidence — the test reads the .tsx and fails if
   * they drift, because serving a crawler text the page does not contain is
   * cloaking.
   */
  {
    /*
     * /open-now was in the sitemap and had no entry here, so it was the one
     * submitted route that still answered Googlebot with the 7,495-byte
     * JavaScript shell — no <h1>, and the home page's title.
     *
     * The live page answers "what can I walk into right now", which depends on
     * the clock and on each business's hours, and this renderer reads nothing.
     * So the rendered version does not pretend to list anything: it explains
     * what the page does and links to the surfaces that are renderable. That is
     * honest, and it is what a crawler needs in order to understand the URL.
     */
    path: '/open-now',
    /*
     * Title, description and heading are taken verbatim from OpenNow.tsx —
     * its applySeo call and its <h1> — not written for this file. Anything
     * else is cloaking, and marketingPageRender.test.ts checks every entry
     * against the React page it claims to describe.
     */
    title: 'Open right now — NowOpen Africa',
    description: 'Businesses with their doors open at this moment.',
    h1: 'Open right now',
    paragraphs: [
      'Doors open as of this minute. Places closing soon are included and marked.',
    ],
    links: [
      { href: '/businesses', label: 'Browse all businesses' },
      { href: '/discover', label: 'Discover' },
      { href: '/nearby', label: 'Near me' },
      { href: '/add-business', label: 'Add your business' },
    ],
  },
  {
    path: '/businesses',
    title: 'Businesses Directory — Find Businesses Across Africa',
    description:
      'Search and discover businesses across Africa by category, location and opening status. See what is open now and contact a business directly.',
    h1: 'Find and connect with businesses across Africa',
    paragraphs: [
      'Search and discover businesses across Africa by category, location and opening status.',
    ],
    links: EXPLORE,
  },
  {
    path: '/media',
    title: 'NowOpen Create — Design, Print & Promote for African Business',
    description:
      'Business cards, flyers, menus, social posts and signs — made from your brand, free to download.',
    h1: 'What do you need?',
    paragraphs: [
      'Business cards, flyers, menus, social posts and signs — made from your brand, free to download.',
    ],
    links: EXPLORE,
  },
  {
    path: '/media/services',
    title: 'Creative Services — NowOpen Create',
    description:
      'Have it made for you — design and print services you can request a price for, business packs and Create credits, plus creators as they join.',
    h1: 'Creative services',
    paragraphs: [
      'Have it made for you — design and print services you can request a price for, business packs and Create credits, plus creators as they join.',
    ],
    links: EXPLORE,
  },
  {
    path: '/pricing',
    title: 'Pricing — NowOpen Africa Plans for Businesses & Creatives',
    description:
      'Simple, honest pricing for African businesses and creatives — free listings, growth plans and enterprise options with founding-member discounts.',
    h1: 'Pricing built for every African business',
    paragraphs: [
      'Simple, honest pricing for African businesses and creatives — free listings, growth plans and enterprise options with founding-member discounts.',
    ],
    links: EXPLORE,
  },
  {
    path: '/adverts',
    title: 'Advertise across Africa — goals, placements and plans',
    description:
      'Pick a goal and get a plan from real advertising placements across 20+ African markets — billboards, transit, digital screens and broadcast — plus free ways to be found by people already searching on NowOpen.',
    // The Promote hub opens on the question, like Create; the old headline
    // is now the line under it. promoteHub.test.tsx renders the page and
    // checks this is its h1.
    h1: 'What do you want to achieve?',
    paragraphs: [
      'Be seen where people are. Then see who came.',
      'Pick a goal and get a plan from real advertising placements across 20+ African markets — billboards, transit, digital screens and broadcast.',
    ],
    links: EXPLORE,
  },
  {
    path: '/contact',
    title: 'Contact NowOpen Africa',
    description:
      'Questions, partnerships or press — reach the NowOpen Africa team by email, phone or WhatsApp. We respond within 1\u20132 business days.',
    h1: 'Get in touch',
    paragraphs: [
      'Questions, partnerships or press — reach the NowOpen Africa team by email, phone or WhatsApp.',
    ],
    links: EXPLORE,
  },
  {
    path: '/founder',
    title: 'Adeyemi Odunaike — Founder & Brand Designer of NowOpen Africa',
    description:
      'Adeyemi Odunaike is the Founder & Brand Designer of NowOpen Africa, the operating system for African business growth.',
    h1: 'Adeyemi Odunaike',
    paragraphs: [
      'Adeyemi Odunaike is the Founder & Brand Designer of NowOpen Africa.',
    ],
    links: EXPLORE,
  },
  {
    path: '/terms',
    title: 'Terms of Service — NowOpen Africa',
    description:
      'The plain-language terms governing your use of NowOpen Africa — accounts, listings, bookings, payments, verification and acceptable use.',
    h1: 'Terms of Service',
    paragraphs: [
      'The plain-language terms governing your use of NowOpen Africa — accounts, listings, bookings, payments, verification and acceptable use.',
    ],
    links: EXPLORE,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — NowOpen Africa',
    description:
      'How NowOpen Africa collects, uses and protects your personal data, and the rights you have over it.',
    h1: 'Privacy Policy',
    paragraphs: [
      'How NowOpen Africa collects, uses and protects your personal data, and the rights you have over it.',
    ],
    links: EXPLORE,
  },
];

const BY_PATH = new Map(MARKETING_PAGES.map((p) => [p.path, p]));

/**
 * Which marketing page a request is for, if any.
 *
 * A trailing slash is the same page; anything else is not ours, and returning
 * null is what sends the request on to the normal app.
 */
export function marketingPageFor(pathname: string): MarketingPage | undefined {
  if (!pathname) return undefined;
  const clean = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  return BY_PATH.get(clean.toLowerCase());
}

/**
 * JSON-LD that cannot break out of its own script tag.
 *
 * JSON.stringify does not escape "<", so a value containing "</script>"
 * ends the block early and everything after it is parsed as HTML. Emitting
 * the angle brackets as the two escape SEQUENCES below keeps the JSON
 * identical to any parser and inert to the HTML tokeniser.
 */
const safeJsonLd = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * The page a crawler receives.
 *
 * Deliberately plain: no scripts, no styles, no images. A crawler needs the
 * words and the links, and every byte of chrome is a byte it has to parse to
 * find them.
 */
export function renderMarketingPage(page: MarketingPage, siteUrl: string): string {
  // An alias points at its primary; everything else points at itself.
  const indexedPath = page.canonicalPath ?? page.path;
  const canonical = `${siteUrl.replace(/\/$/, '')}${indexedPath === '/' ? '' : indexedPath}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': page.path === '/' ? 'WebSite' : 'WebPage',
    name: page.title,
    description: page.description,
    url: canonical,
    ...(page.path === '/' ? { publisher: { '@type': 'Organization', name: 'NowOpen Africa', url: siteUrl } } : {}),
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(page.title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:site_name" content="NowOpen Africa">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${safeJsonLd(jsonLd)}</script>
</head>
<body>
<h1>${escapeHtml(page.h1)}</h1>
${page.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')}
<nav>
<ul>
${page.links.map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`).join('\n')}
</ul>
</nav>
</body>
</html>`;
}
