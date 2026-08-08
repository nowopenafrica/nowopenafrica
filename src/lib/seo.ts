// Lightweight, dependency-free SEO manager. The app has no react-helmet, so
// this imperatively syncs the document head for a given page: <title>, meta
// description, canonical + Open Graph tags, and one or more JSON-LD blocks.
//
// JSON-LD is the backbone of the founder "knowledge graph" strategy — it tells
// Google explicitly that *Adeyemi Odunaike is the Founder of NowOpen Africa*,
// the single most important machine-readable fact for building an entity.

export const SITE_URL = 'https://nowopenafrica.com';

interface SeoInput {
  title: string;
  description: string;
  path?: string; // canonical path, e.g. "/founder"
  image?: string; // absolute or root-relative
  type?: 'website' | 'profile' | 'article';
  robots?: string; // e.g. "noindex, nofollow" — overrides the index.html default
  jsonLd?: object | object[];
}

const MANAGED_ATTR = 'data-managed-seo';

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(MANAGED_ATTR, 'true');
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    el.setAttribute(MANAGED_ATTR, 'true');
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Apply SEO for the current page. Returns a cleanup fn that removes the JSON-LD
 * blocks (and managed OG tags) so single-page navigations don't leak stale
 * structured data onto the next route. Call it from a useEffect cleanup.
 */
export function applySeo({ title, description, path, image, type = 'website', robots, jsonLd }: SeoInput): () => void {
  const url = path ? `${SITE_URL}${path}` : SITE_URL;
  const img = image ? (image.startsWith('http') ? image : `${SITE_URL}${image}`) : undefined;

  const prevTitle = document.title;
  document.title = title;

  // Robots is always set explicitly so a noindex page can't leak its directive
  // onto the next route in a single-page session (cleanup only removes JSON-LD).
  const robotsMeta = robots ?? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  upsertMeta('meta[name="description"]', { name: 'description', content: description });
  upsertLink('canonical', url);
  upsertMeta('meta[name="robots"]', { name: 'robots', content: robotsMeta });

  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url });
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
  if (img) {
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: img });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: img });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
  }

  const scripts: HTMLScriptElement[] = [];
  if (jsonLd) {
    const blocks = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    blocks.forEach((block) => {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.setAttribute(MANAGED_ATTR, 'true');
      s.text = JSON.stringify(block);
      document.head.appendChild(s);
      scripts.push(s);
    });
  }

  return () => {
    document.title = prevTitle;
    scripts.forEach((s) => s.remove());
  };
}
