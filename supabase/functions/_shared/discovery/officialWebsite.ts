/**
 * The official-website adapter's page parser (pure — no network; the worker
 * fetches, this module decides what the page said and how we know).
 *
 * A campaign names `official_website` after a scope source (wikidata or
 * openstreetmap) has already produced candidate records, and the adapter
 * "completes" those candidates by reading each business's own site. The value
 * it adds is PRIMARY evidence: a phone number typed on the business's own
 * homepage is a stronger fact than the same number repeated in a directory,
 * and it arrives with method + confidence recorded at extraction, exactly like
 * every other adapter in the engine.
 *
 * Extraction hierarchy per field, from most to least trustworthy:
 *   structured_data  — JSON-LD (LocalBusiness blocks)
 *   dom_extraction   — meta tags, <title>, mailto:/tel: and social anchors
 *   regex            — a naked international phone or email in the text
 *
 * Everything a source cannot see is left null rather than guessed. If the page
 * adds nothing beyond a name (which the directory already had), the field set
 * contains no signal and the module says so — a completion pass that stages
 * nothing is honest; one that stages a bare name would be noise.
 */

import { normalizePhone } from './normalize.ts';
import type { DiscoveryCandidate, EvidencePoint } from './types.ts';

/** The token we send as `User-agent` — robots.txt groups match against it. */
export const WEBSITE_USER_AGENT = 'NowOpenDiscovery/1.0';

export const WEBSITE_FETCH_TIMEOUT_MS = 12_000;
export const WEBSITE_ROBOTS_TIMEOUT_MS = 6_000;
export const WEBSITE_MAX_BYTES = 2_000_000;
/** One run never visits more domains than this, whatever the share limit says. */
export const WEBSITE_MAX_PAGES_PER_RUN = 25;

export interface WebsiteParseResult {
  candidate: DiscoveryCandidate | null;
  /** Honest list of what was pulled out of the page. */
  extracted: string[];
  /** Why there is no candidate, when there is none. */
  note: string | null;
  /** Everything beyond the `radar_candidates` columns — see WebsiteDetails. */
  details: WebsiteDetails;
}

/**
 * The rest of what a business publishes about itself.
 *
 * SPLIT IN TWO ON PURPOSE, AND THE SPLIT IS LEGAL RATHER THAN TIDY.
 *
 * `facts` are facts: a phone number, an address, coordinates, the hours the
 * doors are open, the handle a business posts under. Facts are not
 * copyrightable anywhere, and a directory recording them is the ordinary
 * business of directories.
 *
 * `owned` is authored work and marks: the description a copywriter wrote, the
 * "our vision" paragraph, the photograph, the logo. Reading those is fine.
 * Republishing them on NowOpen is a decision for the person who owns them, and
 * it is not ours to make by default. So they are extracted, shown to the
 * operator, and carried no further without a separate confirmation.
 *
 * The practical consequence: an operator can SEE that a business has a logo and
 * an About paragraph — useful for deciding whether the listing is worth
 * pursuing, and for telling the owner what will appear when they claim it —
 * without NowOpen silently copying either.
 */
export interface WebsiteDetails {
  facts: {
    openingHours: string | null;
    latitude: number | null;
    longitude: number | null;
    /** Every number the page published, E.164, best first. */
    phones: string[];
    whatsapp: string | null;
    /** Network -> profile URL. */
    socials: Record<string, string>;
  };
  owned: {
    /** Names only, never the marketing copy attached to them. */
    services: string[];
    products: string[];
    about: string | null;
    slogan: string | null;
    logoUrl: string | null;
    coverImageUrl: string | null;
    /**
     * Further pictures the business published OF ITSELF, cover excluded.
     *
     * Empty is the normal answer. Most sites declare one image, and one image
     * is a cover, not a gallery.
     */
    galleryUrls: string[];
  };
}

/** An empty set, so a caller never has to null-check its way through. */
export const EMPTY_DETAILS: WebsiteDetails = {
  facts: { openingHours: null, latitude: null, longitude: null, phones: [], whatsapp: null, socials: {} },
  owned: { services: [], products: [], about: null, slogan: null, logoUrl: null, coverImageUrl: null, galleryUrls: [] },
};

/**
 * Types that are never the business: the page's own furniture.
 *
 * A BreadcrumbList is not a hotel. Neither is the site's search box.
 */
const SCAFFOLD_TYPES = new Set([
  // Page furniture.
  'WebSite', 'WebPage', 'SearchAction', 'BreadcrumbList', 'ImageObject',
  'AboutPage', 'ContactPage', 'FAQPage', 'CollectionPage', 'ProfilePage',
  'SiteNavigationElement', 'WPHeader', 'WPFooter', 'WPSideBar',
  'Person', 'Product', 'Thing',
  /*
   * CONTENT, which is not the business that published it.
   *
   * MEASURED 2026-09-15 on a page shaped like techcabal.com — a NewsArticle
   * node followed by the publisher's Organization node:
   *
   *   name     "A story about shops"     <- the article headline
   *   category "News Article"
   *
   * businessNode() returns the first node whose type is not listed here, and
   * NewsArticle was not, so the ARTICLE was taken for the business and the real
   * Organization two lines below it ignored. Any business site with a blog —
   * which is most of them — could file its latest post as a business.
   *
   * It had been wrong about the name for as long as the parser existed. It
   * started to matter more the day `category` began reaching the database,
   * which is when it was found.
   */
  'NewsArticle', 'Article', 'BlogPosting', 'TechArticle', 'Report', 'LiveBlogPosting',
  'Review', 'Recipe', 'HowTo', 'Question', 'Answer', 'Comment', 'JobPosting',
  'Event', 'VideoObject', 'AudioObject', 'MediaObject', 'Book', 'Movie',
  /*
   * Sub-objects that describe a business without being one. These hang off the
   * real node — a PostalAddress inside a Hotel — and flattenNodes() lifts them
   * to the same level, where they would otherwise look like candidates.
   */
  'PostalAddress', 'ContactPoint', 'GeoCoordinates', 'OpeningHoursSpecification',
  'Offer', 'OfferCatalog', 'AggregateRating', 'Rating', 'ItemList', 'ListItem',
  'EntryPoint', 'PropertyValueSpecification', 'ReadAction', 'InteractionCounter',
]);

/**
 * Business types too vague to use as a directory CATEGORY, but still the
 * business.
 *
 * THE BUG THIS SPLIT FIXES, found 2026-09-15: there was one list, GENERIC_TYPES,
 * holding both groups, and businessNode() returned the first node whose type was
 * absent from it. `LocalBusiness` was in that list — so a page marked up as a
 * plain LocalBusiness matched nothing, businessNode returned null, and the
 * parser read no name, no phone, no address, no hours and no logo from it.
 *
 * `LocalBusiness` is schema.org's canonical type for a shop with a front door.
 * It is what a small business's website almost always uses, which made the
 * extractor blindest to exactly the businesses this directory exists for.
 *
 * They stay listed because `businessType()` must not offer "Local Business" or
 * "Organization" as a category — those say nothing a directory can file under.
 * Being a poor category and being the wrong node are different questions, and
 * one list could only answer them the same way.
 */
const VAGUE_BUSINESS_TYPES = new Set([
  'LocalBusiness', 'Organization', 'Corporation', 'Place',
]);

/** Kept for the category check: neither specific enough nor the business. */
const GENERIC_TYPES = new Set([...SCAFFOLD_TYPES, ...VAGUE_BUSINESS_TYPES]);

/* eslint-disable @typescript-eslint/no-explicit-any */
type JsonLdNode = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Anchor {
  href: string;
}

/** JSON-LD <script> blocks, parsed; unparsable blocks contribute nothing. */
export function extractJsonLd(html: string): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      // A malformed block is the site's problem; we record nothing from it.
    }
  }
  return out;
}

/** Flatten @graph children into the node list. */
function flattenNodes(nodes: JsonLdNode[]): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  const walk = (node: JsonLdNode) => {
    if (Array.isArray(node['@graph'])) node['@graph'].forEach(walk);
    out.push(node);
  };
  nodes.forEach(walk);
  return out;
}

/** The first node that describes a business rather than scaffolding. */
export function businessNode(nodes: JsonLdNode[]): JsonLdNode | null {
  const flat = flattenNodes(nodes);
  const typesOf = (node: JsonLdNode): string[] => {
    const t = node?.['@type'];
    return (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
  };

  // First choice: a specific type, because it also gives a usable category.
  for (const node of flat) {
    if (typesOf(node).some((t) => !GENERIC_TYPES.has(t))) return node;
  }
  // Fallback: a vague business type. Still the business, just unfiled — and
  // far better than reading nothing from the page at all.
  for (const node of flat) {
    if (typesOf(node).some((t) => VAGUE_BUSINESS_TYPES.has(t))) return node;
  }
  return null;
}

/** `fooBar` → `Foo Bar`, for a JSON-LD type used as a directory category. */
function prettifyType(t: string): string {
  const spaced = t
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : '';
}

function businessType(node: JsonLdNode | null): string {
  if (!node) return '';
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  const chosen = types.map(String).find((t) => !GENERIC_TYPES.has(t));
  return chosen ? prettifyType(chosen) : '';
}

/** All <a href> anchors with a sane, absolute href. */
export function anchorsOf(html: string, base: string): Anchor[] {
  const out: Anchor[] = [];
  const re = /<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[2].trim();
    if (!raw) continue;
    try {
      const abs = new URL(raw.startsWith('//') ? `https:${raw}` : raw, base).toString();
      out.push({ href: abs });
    } catch {
      // a malformed href contributes nothing
    }
  }
  return out;
}

/** property= OR name= meta values, keyed by their value. */
/** The named entities that actually turn up in page titles and meta tags. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', middot: '\u00b7',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  laquo: '\u00ab', raquo: '\u00bb', deg: '\u00b0', eacute: '\u00e9',
  reg: '\u00ae', copy: '\u00a9', trade: '\u2122', bull: '\u2022',
};

/**
 * Turn HTML entities back into the characters a person typed.
 *
 * MEASURED IN PRODUCTION, 2026-09-15. Two rows filed by the manual extractor,
 * straight from real Nigerian business sites:
 *
 *   name         "Indomie &#8211; Instant Noodles"
 *   description  "Branding &amp; Web Design Agency that specializes in..."
 *
 * `<title>` and `<meta content="...">` are HTML, so an ampersand or a dash
 * arrives encoded. Nothing decoded them, and these fields become the business
 * NAME and DESCRIPTION on a published profile — so a real company would have
 * appeared in the directory, and in the sitemap, called
 * "Indomie &#8211; Instant Noodles".
 *
 * JSON-LD needs none of this: it is JSON, and JSON.parse has already done it.
 * The bug lived on the fallback path, which is the one that runs for the many
 * sites carrying no structured data at all.
 */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
    // Named last, so a literal "&amp;#8211;" resolves to "&#8211;" rather than
    // being decoded twice into a dash the page never wrote.
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[String(name).toLowerCase()] ?? whole);
}

function metaMap(html: string): Record<string, string> {
  const map: Record<string, string> = {};
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const key = /(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1];
    const content = /\bcontent=(["'])(.*?)\1/i.exec(tag)?.[2];
    if (key && content) map[key.toLowerCase()] = decodeEntities(content).trim();
  }
  return map;
}

/** `<title>`, cleaned of the brand scaffolding after a separator. */
export function titleOf(html: string): string | null {
  const raw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (!raw) return null;
  // Decoded BEFORE the separator split, so a title joined by "&#8211;" is cut
  // at the dash like any other — otherwise the encoded form survives as part
  // of the name.
  let t = decodeEntities(raw).trim();
  const cut = t.split(/\s*(?:[|\u2013—]|-)\s+/)[0].trim();
  if (cut) t = cut;
  if (!/[\w\s]{2,}/.test(t)) return null;
  return t.slice(0, 120);
}

/**
 * An address object from JSON-LD, joined into one readable line.
 *
 * TAKES NULL, because its only caller passes a nullable node: a page with no
 * JSON-LD business node yields `node = null`, and every other read of it is
 * already written `node?.description`, `node?.address`. This one was not, so
 * `addressFrom(null)` threw "Cannot read properties of null" and took the
 * whole parse down — meaning the website reader crashed on exactly the pages
 * it exists to handle, the ones with no structured data to begin with.
 */
function addressFrom(ld: JsonLdNode | null | undefined): string | null {
  if (!ld) return null;
  const addr = ld.address ?? ld.location?.address;
  if (!addr) return null;
  if (typeof addr === 'string') return addr.trim() || null;
  const street = addr.streetAddress;
  const locality = addr.addressLocality;
  const region = addr.addressRegion;
  const postal = addr.postalCode;
  const parts = [street, locality, region, postal].filter((p): p is string =>
    typeof p === 'string' && p.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

const EMAIL_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;

/**
 * Endings that look like a TLD and are not one.
 *
 * MEASURED ON PRODUCTION, 2026-09-15: reading bellanaija.com through the manual
 * extractor reported the business's email address as
 *
 *     logo-word-black@2x.png
 *
 * `@2x` is the retina-image naming convention, and `.png` satisfies the regex's
 * "dot followed by two or more letters". The bare-HTML scan is a last-resort
 * fallback that runs only when a page publishes no mailto: and no structured
 * email, so it was reaching for anything with an @ in it and finding a
 * filename.
 *
 * A wrong phone number or address wastes somebody's trip. A wrong EMAIL is
 * worse in one specific way: it is the field an operator is least likely to
 * sanity-check, and a profile that publishes a filename as a business's contact
 * address is visibly fabricated. Nothing here may invent a contact detail.
 */
const NOT_A_TLD = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp',
  'css', 'js', 'json', 'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp4', 'webm', 'mp3', 'pdf', 'zip', 'map',
]);

/**
 * An email, or null if the match is really a filename or a placeholder.
 *
 * Deliberately conservative: when this is unsure it returns nothing, and the
 * candidate simply carries no email. An absent field is honest; a wrong one is
 * not.
 */
export function plausibleEmail(raw: string | null | undefined): string | null {
  /*
   * Scans EVERY match, not just the first.
   *
   * The first version stopped at the first thing matching the pattern and
   * rejected it, which meant one `logo@2x.png` earlier in the document
   * suppressed a real `hello@shop.example` further down. Caught by its own
   * test: rejecting a bad match is only half the job if a good one is then
   * never reached.
   */
  const all = String(raw ?? '').matchAll(new RegExp(EMAIL_RE.source, 'gi'));
  for (const hit of all) {
    const email = hit[1].toLowerCase();
    const [local, domain] = email.split('@');
    if (!local || !domain) continue;

    const parts = domain.split('.');
    const tld = parts[parts.length - 1] ?? '';
    if (NOT_A_TLD.has(tld)) continue;
    // A TLD is letters only. `.png` is caught above; this takes the rest of
    // the asset-filename family.
    if (!/^[a-z]{2,}$/.test(tld)) continue;
    // Sprite and asset names routinely look like `icons@2x.something`.
    if (/^\d+x$/.test(parts[0])) continue;

    return email;
  }
  return null;
}

/** The first telephone that normalises to E.164, by decreasing trust. */
/**
 * Every telephone the structured data carries, in descending trust.
 *
 * THE GAP THIS CLOSES: the parser read `node.telephone` and nothing else.
 * schema.org's usual home for a business number on an `Organization` is
 * `contactPoint`, not `telephone` — jumia.com.ng's markup is exactly that
 * shape — so a page could publish its switchboard, its sales line and its
 * support line in machine-readable form and the extractor would report no
 * phone at all.
 *
 * Also walks `location` (a LocalBusiness nested inside an Organization) and
 * every node in the graph, because a site with several branches puts each
 * one's number on its own node.
 */
function telephonesFromLd(node: JsonLdNode | null | undefined, all: JsonLdNode[]): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  };

  const fromNode = (n: JsonLdNode) => {
    if (!n || typeof n !== 'object') return;
    push(n.telephone);
    push(n.phone);
    const cps = n.contactPoint ?? n.contactPoints;
    for (const cp of Array.isArray(cps) ? cps : cps ? [cps] : []) push(cp?.telephone);
    if (n.location) fromNode(n.location);
  };

  fromNode(node);
  // The rest of the graph, after the chosen node, so the business's own number
  // stays first when there is one.
  for (const n of all) if (n !== node) fromNode(n);
  return out;
}

function firstPhone(
  ldPhones: string[],
  telLinks: string[],
  waLinks: string[],
  text: string,
): { phone: string; method: EvidencePoint['method']; confidence: number } | null {
  const candidates: Array<{ raw: string; method: EvidencePoint['method']; confidence: number }> = [];
  for (const p of ldPhones) candidates.push({ raw: p, method: 'structured_data', confidence: 90 });
  for (const t of telLinks) candidates.push({ raw: t, method: 'dom_extraction', confidence: 84 });
  for (const w of waLinks) candidates.push({ raw: w, method: 'dom_extraction', confidence: 82 });
  const bare = /(\+\d[\d\s()-]{6,19}\d)/.exec(text)?.[1];
  if (bare) candidates.push({ raw: bare, method: 'regex', confidence: 45 });

  for (const c of candidates) {
    const clean = String(c.raw).replace(/[^\d+]/g, '');
    const e164 = normalizePhone(clean);
    if (e164) return { phone: e164, method: c.method, confidence: c.confidence };
  }
  return null;
}

/**
 * Every distinct number on the page that normalises to E.164.
 *
 * The candidate row holds one phone, because `businesses.phone` is one column.
 * A business that publishes a switchboard, a sales line and a WhatsApp number
 * has published three facts, though, and showing the operator all of them beats
 * silently keeping the first and discarding the rest.
 */
function allPhones(ldPhones: string[], telLinks: string[], waLinks: string[]): string[] {
  const out: string[] = [];
  for (const raw of [...ldPhones, ...telLinks, ...waLinks]) {
    const e164 = normalizePhone(String(raw).replace(/[^\d+]/g, ''));
    if (e164 && !out.includes(e164)) out.push(e164);
  }
  return out.slice(0, 6);
}

/** Social profile URLs found on the page, keyed by network (first hit wins). */
function socialsOf(anchors: Anchor[]): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  const SKIP = new Set(['share', 'sharer', 'intent', 'home', 'hashtag', 'explore', 'p', 'reel', 'stories', 'search', 'notifications', 'settings', 'login']);
  for (const a of anchors) {
    let u: URL;
    try {
      u = new URL(a.href);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
    let network: string | null = null;
    if (host === 'facebook.com' || host === 'fb.me') network = 'facebook';
    else if (host === 'instagram.com' || host === 'instagr.am') network = 'instagram';
    else if (host === 'x.com' || host === 'twitter.com') network = 'twitter';
    // The five that were missing. A business that lists a LinkedIn page and a
    // YouTube channel and has neither recorded is a business we know less about
    // than the page plainly said.
    else if (host === 'linkedin.com' || host === 'lnkd.in') network = 'linkedin';
    else if (host === 'youtube.com' || host === 'youtu.be') network = 'youtube';
    else if (host === 'tiktok.com') network = 'tiktok';
    else if (host === 'pinterest.com') network = 'pinterest';
    else if (host === 'threads.net') network = 'threads';
    if (!network || out[network] || seen.has(u.href)) continue;
    const seg = u.pathname.split('/').filter(Boolean).find((p) => !SKIP.has(p.toLowerCase()));
    if (!seg) continue;
    u.search = ''; u.hash = '';
    out[network] = u.toString();
    seen.add(u.href);
  }
  return out;
}

/** First usable string from a JSON-LD value that may be a string, object or array. */
function firstString(value: unknown, key = 'url'): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const hit = firstString(v, key);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const inner = rec[key] ?? rec.contentUrl ?? rec.url;
    return typeof inner === 'string' ? inner.trim() || null : null;
  }
  return null;
}

/**
 * Every image URL in a schema.org `image` value, not just the first.
 *
 * `image` is routinely an ARRAY — a hotel lists six pictures of itself — and
 * firstString() discards five of them, because it was written to answer "what
 * is the cover". The rest are the only honest source of gallery imagery this
 * system has: pictures the business published OF ITSELF, in the field whose
 * defined meaning is "an image of this thing".
 *
 * That restriction is the point. This does not read <img> tags. A page's <img>
 * elements include its stock banners, its clients' logos, its staff's
 * photographs and whatever its theme shipped with — scraping those and calling
 * the result a gallery is exactly the misleading-gallery failure this platform
 * has ruled out. `image` on the business node, og:image and twitter:image are
 * the three places a site says "this pictures us".
 */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    const t = value.trim();
    if (t) out.push(t);
  } else if (Array.isArray(value)) {
    for (const v of value) allStrings(v, out);
  } else if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    const inner = rec.contentUrl ?? rec.url;
    if (typeof inner === 'string' && inner.trim()) out.push(inner.trim());
  }
  return out;
}

/**
 * Furniture that is technically an image and is nobody's photograph.
 *
 * The `share|og-?image|default|preview|card` half was added after the first
 * live batch put "share-image-default.jpg" and "/ogImage" into two galleries.
 * Those got in through og:image, which no longer feeds the gallery at all —
 * this stays as the second line, because a site is free to put its share card
 * into schema.org `image` as well, and several do.
 */
const NOT_GALLERY =
  /(sprite|favicon|logo|icon|pixel|spacer|placeholder|1x1|blank|avatar|share[-_]?image|og[-_]?image|social[-_]?card|default[-_]?image|preview[-_]?card)/i;

/** Absolute http(s) URL, or null. Relative paths resolve against the page. */
function absoluteUrl(raw: string | null, base: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw, base);
    return /^https?:$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Opening hours as one readable line.
 *
 * WHY THIS MATTERS MORE THAN ANYTHING ELSE HERE: measured 2026-09-15, 3 of
 * 3,118 businesses on NowOpen have any opening hours at all. The product is
 * named after the question those hours answer, and schema.org
 * openingHoursSpecification is the single most common place a business has
 * already published them in machine-readable form.
 *
 * Emits the same "Mon-Fri: 9AM-5PM" shape src/lib/openingHours.ts already
 * parses, so a value taken from here round-trips through the app's own reader
 * rather than needing a second format.
 */
function hoursOf(node: JsonLdNode | null | undefined): string | null {
  if (!node) return null;

  // The plain string form: "Mo-Fr 09:00-17:00" or an array of them.
  const plain = node.openingHours;
  if (typeof plain === 'string' && plain.trim()) return plain.trim().slice(0, 300);
  if (Array.isArray(plain) && plain.length) {
    const joined = plain.filter((x: unknown) => typeof x === 'string').join('; ').trim();
    if (joined) return joined.slice(0, 300);
  }

  const spec = node.openingHoursSpecification;
  const rows = Array.isArray(spec) ? spec : spec ? [spec] : [];
  const parts: string[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const daysRaw = (r as Record<string, unknown>).dayOfWeek;
    const days = (Array.isArray(daysRaw) ? daysRaw : [daysRaw])
      .map((d) => (typeof d === 'string' ? d.split('/').pop() ?? '' : ''))
      .filter(Boolean)
      .map((d) => d.slice(0, 3));
    const opens = (r as Record<string, unknown>).opens;
    const closes = (r as Record<string, unknown>).closes;
    if (!days.length) continue;
    // A spec with opens === closes === 00:00 is schema.org's "open all day".
    if (opens === '00:00' && closes === '23:59') {
      parts.push(`${days.join(',')}: 24 hours`);
      continue;
    }
    if (typeof opens !== 'string' || typeof closes !== 'string') continue;
    parts.push(`${days.join(',')}: ${opens}-${closes}`);
  }
  return parts.length ? parts.join('; ').slice(0, 300) : null;
}

/** Coordinates, when the page published them. */
function geoOf(node: JsonLdNode | null | undefined): { lat: number | null; lng: number | null } {
  const geo = node?.geo ?? node?.location?.geo;
  const lat = Number(geo?.latitude);
  const lng = Number(geo?.longitude);
  // Number(undefined) is NaN and Number(null) is 0 — so check finiteness AND
  // that something was actually there, or a missing geo becomes (0, 0), which
  // is a real place in the Gulf of Guinea.
  const ok = geo && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  return ok ? { lat, lng } : { lat: null, lng: null };
}

/**
 * Service and product NAMES a page lists in structured data.
 *
 * Names only, and never the description attached to them. "Airport transfer"
 * is a fact about what a hotel does; the paragraph selling it is somebody's
 * copy. Capped, because a catalogue page can carry hundreds and this is a lead,
 * not an import of someone's inventory.
 */
function offeringsOf(nodes: JsonLdNode[]): { services: string[]; products: string[] } {
  const services = new Set<string>();
  const products = new Set<string>();

  const take = (n: JsonLdNode, into: Set<string>) => {
    const name = typeof n?.name === 'string' ? n.name.trim() : '';
    if (name && name.length <= 120 && into.size < 40) into.add(name);
  };

  const walkCatalog = (cat: JsonLdNode) => {
    const items = cat?.itemListElement;
    for (const item of Array.isArray(items) ? items : items ? [items] : []) {
      const offered = item?.itemOffered ?? item;
      const t = String(offered?.['@type'] ?? '').toLowerCase();
      take(offered, t.includes('product') ? products : services);
    }
  };

  for (const n of nodes) {
    const type = String(n?.['@type'] ?? '').toLowerCase();
    if (type.includes('service')) take(n, services);
    if (type.includes('product')) take(n, products);

    const cat = n?.hasOfferCatalog;
    for (const c of Array.isArray(cat) ? cat : cat ? [cat] : []) walkCatalog(c);

    const offers = n?.makesOffer ?? n?.offers;
    for (const o of Array.isArray(offers) ? offers : offers ? [offers] : []) {
      const offered = o?.itemOffered;
      if (!offered) continue;
      const t = String(offered?.['@type'] ?? '').toLowerCase();
      take(offered, t.includes('product') ? products : services);
    }
  }

  return { services: [...services], products: [...products] };
}

/**
 * Turn a fetched page into a completed candidate.
 *
 * `finalUrl` is the URL we actually read (after redirects) — the evidence
 * anchor for every field and the record id (the same site re-mined in another
 * run updates rather than duplicates, through the source_record_id index).
 */
export function parseWebsitePage(html: string, finalUrl: string): WebsiteParseResult {
  const extracted: string[] = [];
  const nodes = extractJsonLd(html);
  const node = businessNode(nodes);
  const anchors = anchorsOf(html, finalUrl);
  const meta = metaMap(html);
  const base = { sourceUrl: finalUrl, sourceRecordId: finalUrl } as const;

  const evidence: Record<string, EvidencePoint> = {};
  const set = (field: string, method: EvidencePoint['method'], confidence: number) => {
    evidence[field] = { method, sourceUrl: finalUrl, confidence };
  };

  /*
   * Everything beyond the radar_candidates columns, gathered before the early
   * returns below so a page that yields no importable candidate still tells the
   * operator what it published. "This site has hours and a logo but no contact
   * details" is useful; a blank panel is not.
   */
  const allNodes = flattenNodes(nodes);
  const geo = geoOf(node);
  const offerings = offeringsOf(allNodes);
  const socialsAll = socialsOf(anchors);

  // Resolved once, because the gallery is defined by what it EXCLUDES: the
  // cover and the logo. Recomputing them inline would compare two different
  // strings and let both back in as duplicates.
  const logoUrl = absoluteUrl(firstString(node?.logo), finalUrl);
  const coverUrl = absoluteUrl(
    firstString(node?.image) ?? meta['og:image'] ?? meta['twitter:image'] ?? null,
    finalUrl,
  );

  const details: WebsiteDetails = {
    facts: {
      openingHours: hoursOf(node),
      latitude: geo.lat,
      longitude: geo.lng,
      phones: [], // filled once the anchors are read, below
      whatsapp: null, // likewise
      socials: socialsAll,
    },
    owned: {
      services: offerings.services,
      products: offerings.products,
      about: typeof node?.about === 'string' ? node.about.slice(0, 600) : null,
      slogan: typeof node?.slogan === 'string' ? node.slogan.slice(0, 200) : null,
      logoUrl: logoUrl,
      coverImageUrl: coverUrl,
      /*
       * Everything the business declared as a picture of itself, minus the one
       * already used as the cover and minus its logo. Capped at 8: past that
       * it stops being a profile and starts being a mirror of their website.
       */
      /*
       * SCHEMA.ORG `image` ONLY — og:image and twitter:image are deliberately
       * excluded, and the first version of this included them.
       *
       * MEASURED on the first live batch, 2026-09-17. The two gallery rows it
       * produced were:
       *
       *   Momentum   https://retail.momentum.co.za/images/share-image-default.jpg
       *   Jobberman  https://www.jobberman.com/ogImage
       *
       * Neither is a picture of anything. They are social-share cards — a logo
       * on a coloured background, generated once for link previews — and
       * "share-image-DEFAULT" says so in the filename. As a COVER that is
       * fine: one representative image, which is exactly what og:image is for.
       * In a gallery it is a fabricated photograph of premises, which is the
       * failure this whole path was written to avoid.
       *
       * schema.org `image` on the business node means "an image of this
       * thing". A business that lists six of them has published a gallery. A
       * business that publishes one share card has not, and now gets an empty
       * gallery, which is the truthful answer.
       */
      galleryUrls: allStrings(node?.image)
        .map((raw) => absoluteUrl(raw || null, finalUrl))
        .filter((u): u is string => !!u && !NOT_GALLERY.test(u))
        .filter((u) => u !== coverUrl && u !== logoUrl)
        .filter((u, i, all) => all.indexOf(u) === i)
        .slice(0, 8),
    },
  };
  if (details.facts.openingHours) { set('opening_hours', 'structured_data', 90); extracted.push('opening_hours'); }
  if (geo.lat !== null) { set('coordinates', 'structured_data', 92); extracted.push('coordinates'); }
  if (details.owned.logoUrl) extracted.push('logo');
  if (details.owned.coverImageUrl) extracted.push('cover_image');
  if (details.owned.services.length) extracted.push('services');
  if (details.owned.products.length) extracted.push('products');
  if (details.owned.about) extracted.push('about');
  for (const k of Object.keys(socialsAll)) if (!extracted.includes(k)) extracted.push(k);

  let name: string | null = null;
  if (node?.name && typeof node.name === 'string') {
    name = node.name.slice(0, 120);
    set('name', 'structured_data', 90);
    extracted.push('name');
  } else {
    const n = meta['og:site_name'] ?? meta['og:title'] ?? titleOf(html);
    if (n) {
      name = n.slice(0, 120);
      set('name', 'dom_extraction', 70);
      extracted.push('name');
    }
  }
  if (!name) name = null;

  let description: string | null = null;
  if (node?.description && typeof node.description === 'string') {
    description = node.description.slice(0, 300);
    set('description', 'structured_data', 90);
    extracted.push('description');
  } else if (meta['og:description'] ?? meta['description']) {
    description = (meta['og:description'] ?? meta['description']).slice(0, 300);
    set('description', 'dom_extraction', 78);
    extracted.push('description');
  }

  const address = addressFrom(node);
  if (address) {
    set('address', 'structured_data', 90);
    extracted.push('address');
  }

  const city = node?.address?.addressLocality ?? null;

  const telLinks: string[] = [];
  const waLinks: string[] = [];
  const mailtos: string[] = [];
  for (const a of anchors) {
    const low = a.href.toLowerCase();
    if (low.startsWith('tel:')) telLinks.push(a.href.slice(4));
    if (/(wa\.me\/|api\.whatsapp\.com\/send\?phone=)/.test(low)) {
      const digits = a.href.replace(/^.*?(?:wa\.me\/)|(?:send\?phone=)/, '').replace(/[^\d]/g, '');
      if (digits) waLinks.push(digits);
    }
    if (low.startsWith('mailto:')) {
      const m = plausibleEmail(a.href);
      if (m) mailtos.push(m);
    }
  }
  if (telLinks.length) extracted.push('phone');
  // A wa.me link is a dialable number the business published for messaging —
  // the channel most of this audience actually answers on.
  if (waLinks.length) {
    details.facts.whatsapp = `+${waLinks[0]}`;
    set('whatsapp', 'dom_extraction', 85);
    extracted.push('whatsapp');
  }

  const ldPhones = telephonesFromLd(node, allNodes);
  const phoneHit = firstPhone(ldPhones, telLinks, waLinks, html);
  /*
   * The chosen number goes FIRST, then every other number the page published.
   *
   * allPhones() reads structured data, tel: links and wa.me links. firstPhone()
   * also has a last-resort scan of the page text, so a site that prints its
   * number as plain prose yields a candidate phone that allPhones never sees —
   * and the operator was shown a phone on the row above while the facts panel
   * claimed the page published none. One number, two answers.
   */
  details.facts.phones = [
    ...(phoneHit ? [phoneHit.phone] : []),
    ...allPhones(ldPhones, telLinks, waLinks).filter((p) => p !== phoneHit?.phone),
  ].slice(0, 6);

  let phone: string | null = null;
  if (phoneHit) {
    phone = phoneHit.phone;
    set('phone', phoneHit.method, phoneHit.confidence);
    extracted.push('phone');
  }

  let email: string | null = null;
  const ldEmail = typeof node?.email === 'string' ? plausibleEmail(node.email) : null;
  if (ldEmail) {
    email = ldEmail;
    set('email', 'structured_data', 95);
    extracted.push('email');
  } else if (mailtos.length) {
    email = mailtos[0].toLowerCase();
    set('email', 'dom_extraction', 88);
    extracted.push('email');
  } else {
    const bare = plausibleEmail(html);
    if (bare) {
      email = bare;
      set('email', 'regex', 70);
      extracted.push('email');
    }
  }

  const socials = socialsAll;
  if (socials.facebook) { set('facebook', 'dom_extraction', 80); extracted.push('facebook'); }
  if (socials.instagram) { set('instagram', 'dom_extraction', 80); extracted.push('instagram'); }
  if (socials.twitter) { set('twitter', 'dom_extraction', 80); extracted.push('twitter'); }

  const socialKeys = Object.keys(socials);
  const hasSignal = Boolean(phone || email || address || description || socialKeys.length);
  if (!name && !hasSignal) {
    return { candidate: null, extracted, note: 'page carried neither a name nor any contact signal', details };
  }
  if (!hasSignal) {
    return { candidate: null, extracted, note: 'page carried a name the directory already had, but no new contact signal', details };
  }
  if (!name) return { candidate: null, extracted, note: 'no usable page title to identify the business', details };

  const canonical = /rel=["']canonical["'][^>]*\bhref=(["'])(.*?)\1/i.exec(html)?.[2] ?? null;
  const website = canonical && /^https?:/i.test(canonical) ? canonical : finalUrl;

  const category = businessType(node);

  return {
    candidate: {
      ...base,
      name,
      category,
      city: city && typeof city === 'string' ? city : null,
      address,
      phone,
      email,
      website,
      description,
      // Was hardcoded null. schema.org `geo` is where a business most often
      // publishes its own coordinates, and a directory that drops them makes
      // every "near me" query worse than it needs to be.
      latitude: geo.lat,
      longitude: geo.lng,
      profile: socialKeys.reduce<Record<string, string>>((acc, k) => {
        acc[k] = socials[k];
        return acc;
      }, {}),
      evidence,
    },
    extracted,
    note: null,
    details,
  };
}