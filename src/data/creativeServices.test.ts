import { describe, it, expect } from 'vitest';

import { generateMediaServices } from './populateData';
import { MEDIA_SERVICE_TYPES, MEDIA_CATEGORY_GROUPS } from './mediaCategories';

// The Create page (/media) offers a filter for every service type and every
// discipline group. A type with no listing behind it renders an empty grid,
// which reads as a broken page rather than a quiet category — "Advertising"
// was in that state, offered as a filter with nothing to show.
//
// These run against generateMediaServices rather than the raw array because
// that is what the page actually calls, and it is also the source the
// media_services SQL is generated from.

// Samples are gated on import.meta.env.DEV so production shows a real empty
// state. Vitest runs in DEV, so the generator returns rows here.
const services = generateMediaServices(30);

describe('creative services sample data', () => {
  it('produces listings at all (guards the DEV-only gate)', () => {
    expect(services.length).toBeGreaterThan(0);
  });

  it('covers every service type the Create page offers as a filter', () => {
    const covered = new Set(services.map((s) => s.service_type));
    const missing = MEDIA_SERVICE_TYPES.filter((t) => !covered.has(t));
    expect(missing, 'these filters would show an empty grid').toEqual([]);
  });

  it('covers every discipline group', () => {
    for (const group of MEDIA_CATEGORY_GROUPS) {
      const count = services.filter((s) => group.members.includes(s.service_type)).length;
      expect(count, `${group.label} has no listings`).toBeGreaterThan(0);
    }
  });

  it('gives every listing the details a card renders', () => {
    // The card shows an image, a title, a description, a rating and a price.
    // Any of them missing leaves a visibly half-built tile.
    for (const s of services) {
      expect(s.title?.trim(), 'title').toBeTruthy();
      expect(s.description?.trim().length ?? 0, `${s.title} description`).toBeGreaterThan(40);
      expect(s.image_url, `${s.title} image`).toMatch(/^https:\/\/images\.pexels\.com\//);
      expect(s.pricing, `${s.title} pricing`).toBeGreaterThan(0);
      expect(s.pricing_model?.trim(), `${s.title} pricing model`).toBeTruthy();
    }
  });

  it('keeps ratings inside a believable range', () => {
    // A directory where everything is 5.0 reads as fabricated, and a rating
    // above 5 would break the star row outright.
    for (const s of services) {
      expect(s.rating, `${s.title} rating`).toBeGreaterThanOrEqual(4);
      expect(s.rating, `${s.title} rating`).toBeLessThanOrEqual(5);
    }
    expect(new Set(services.map((s) => s.rating)).size).toBeGreaterThan(3);
  });

  it('never reuses the same photo on two listings', () => {
    // Two identical tiles side by side is the tell that a directory is seeded
    // rather than real.
    const images = services.map((s) => s.image_url);
    expect(new Set(images).size).toBe(images.length);
  });

  it('gives every listing a unique title, so the SQL prefix match is unambiguous', () => {
    // update_media_services.sql matches rows by the text before the em-dash.
    // Two services sharing that prefix would overwrite each other's image.
    const prefixes = services.map((s) => s.title.split('—')[0].trim());
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
