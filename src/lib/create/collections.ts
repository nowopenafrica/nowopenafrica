import type { DesignTemplate } from '../designTemplates';

/**
 * Featured collections on the Create page (spec §10: "curated by admins").
 *
 * FOUNDER-EDITABLE. This list is the curation: change the titles, the blurbs
 * or the keys here and the page follows. There is no admin screen for it yet,
 * so it is a committed list rather than a table.
 *
 * Rules a test holds it to:
 *  - at most MAX_COLLECTIONS collections;
 *  - every key names a design that is listed today (collections.test.ts);
 *  - no popularity claim in a title or blurb ("Best sellers", "Trending"):
 *    there is no reliable usage count to back one (spec §10).
 *
 * At render a key whose design is no longer listed is dropped, and a
 * collection left with nothing is not shown, so holding a design back never
 * leaves a broken card here.
 */
export interface Collection {
  key: string;
  title: string;
  blurb: string;
  templateKeys: string[];
}

export const MAX_COLLECTIONS = 2;

export const COLLECTIONS: Collection[] = [
  {
    key: 'business-cards',
    title: 'Business cards',
    blurb: 'Front and back, at the real card size, ready for your name and number.',
    templateKeys: ['card-front', 'card-minimal', 'card-centred', 'card-luxe-dark', 'card-type-led', 'card-logo-led'],
  },
  {
    key: 'social-posts',
    title: 'Social posts',
    blurb: 'Square and portrait posts for Instagram and Facebook.',
    templateKeys: ['app-download', 'insight-stat', 'testimonial-card', 'campaign-key-visual', 'tiered-sale', 'shop-product-card'],
  },
];

export interface ResolvedCollection {
  collection: Collection;
  templates: DesignTemplate[];
}

/** The collections with their listed designs, in the committed order; empty ones dropped. */
export function resolveCollections(
  listed: DesignTemplate[],
  from: Collection[] = COLLECTIONS,
): ResolvedCollection[] {
  const byKey = new Map(listed.map((t) => [t.key, t]));
  return from
    .map((collection) => ({
      collection,
      templates: collection.templateKeys
        .map((k) => byKey.get(k))
        .filter((t): t is DesignTemplate => Boolean(t)),
    }))
    .filter((r) => r.templates.length > 0);
}
