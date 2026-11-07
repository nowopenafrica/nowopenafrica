/**
 * What an Instagram lookup becomes in the review queue.
 *
 * The field mapping is tested rather than the UI, because this is where the
 * costly bugs are: the website extractor shipped for weeks dropping four
 * fields it had read and displayed. Extraction, display and persistence are
 * three separate lists.
 */

import { describe, it, expect } from 'vitest';

import { buildInstagramCandidate, type InstagramProfile } from './instagramCandidate';

const profile = (over: Partial<InstagramProfile> = {}): InstagramProfile => ({
  name: 'Ada Fabrics',
  biography: 'Bespoke tailoring in Lagos. Open Mon–Sat.',
  website: 'https://adafabrics.ng',
  followersCount: 4210,
  mediaCount: 88,
  profilePictureUrl: 'https://scontent.example/pic.jpg?oe=EXPIRES',
  retrievedAt: '2026-10-08T12:00:00.000Z',
  ...over,
});

const build = (p = profile(), authoredConfirmed = false) =>
  buildInstagramCandidate('adafabrics', p, { authoredConfirmed });

describe('the fields that must survive to the queue', () => {
  it('carries the name, website and description', () => {
    const row = build();
    expect(row).not.toBeNull();
    expect(row!.name).toBe('Ada Fabrics');
    expect(row!.website).toBe('https://adafabrics.ng');
    expect(row!.description).toMatch(/Bespoke tailoring/);
  });

  it('stages the account under the key that actually publishes', () => {
    /*
     * radar_publish_candidate projects profile->>'instagram' into
     * social_links.instagram. A key outside that whitelist — instagram_url,
     * say — would be staged, shown to a reviewer, and silently dropped at
     * publication.
     */
    expect(build()!.profile.instagram).toBe('https://www.instagram.com/adafabrics/');
  });

  it('keys the row on the profile URL so a re-read updates instead of duplicating', () => {
    // There is a unique index on (source_key, source_record_id); a plain
    // insert fails the second time a handle is read.
    const row = build()!;
    expect(row.source_record_id).toBe('https://www.instagram.com/adafabrics/');
    expect(row.source_key).toBe('manual_extraction');
  });

  it('goes through the same pipeline as every other source', () => {
    // One staging path, one review queue, one place a business is created.
    expect(build()!.source_key).toBe('manual_extraction');
  });
});

describe('what it refuses to stage', () => {
  it('never stages the profile picture, under any key', () => {
    /*
     * image_reuse_allowed = 'prohibited' for this source: Meta Platform Data,
     * and the URL expires within days. A staged expiring URL publishes as a
     * broken image on somebody's business profile.
     */
    const row = build(profile(), true)!;
    const serialised = JSON.stringify(row);
    expect(serialised).not.toContain('scontent.example');
    expect(serialised).not.toContain('profilePictureUrl');
    expect(row.profile.logo_url).toBeUndefined();
    expect(row.profile.cover_image_url).toBeUndefined();
    expect(row.profile.image_url).toBeUndefined();
  });

  it('keeps follower counts away from the publish whitelist', () => {
    /*
     * A follower count describes the account on a day, not the business. It
     * is reviewer context and must not reach a profile, so it is deliberately
     * stored under a name radar_publish_candidate does not know.
     */
    const row = build()!;
    expect(row.profile.instagram_followers_seen).toBe(4210);
    expect(row.profile.followers_count).toBeUndefined();
    // Nor smuggled into a publishable text field.
    expect(row.profile.about).toBeUndefined();
    expect(row.description).not.toMatch(/4210|followers/i);
  });

  it('does not carry the biography unless the rights box is ticked', () => {
    const withoutRights = build(profile(), false)!;
    expect(withoutRights.profile.about).toBeUndefined();

    const withRights = build(profile(), true)!;
    expect(withRights.profile.about).toMatch(/Bespoke tailoring/);
  });

  it('files nothing for a profile with no name', () => {
    // A handle is not a business record; a reviewer could do nothing with it.
    expect(build(profile({ name: null }))).toBeNull();
    expect(build(profile({ name: '   ' }))).toBeNull();
  });
});

describe('the shapes the database insists on', () => {
  it('sends an object for profile, never null', () => {
    /*
     * The column is NOT NULL with a '{}' default, and an explicit null
     * OVERRIDES a default rather than falling back to it — which is how "null
     * value in column profile violates not-null constraint" once reached an
     * operator who had simply read a page with nothing extra on it.
     */
    const row = build(profile({ biography: null, website: null, followersCount: null, mediaCount: null }))!;
    expect(row.profile).toBeTypeOf('object');
    expect(row.profile).not.toBeNull();
  });

  it('nulls empty strings rather than writing them', () => {
    const row = build(profile({ website: '   ', biography: '' }))!;
    expect(row.website).toBeNull();
    expect(row.description).toBeNull();
  });

  it('truncates a name to the column width', () => {
    const row = build(profile({ name: 'x'.repeat(400) }))!;
    expect(row.name.length).toBe(200);
  });
});

describe('provenance a reviewer can act on', () => {
  it('records where it came from and what was deliberately left out', () => {
    const row = build()!;
    expect(row.decision_reason).toMatch(/business_discovery/);
    expect(row.decision_reason).toMatch(/@adafabrics/);
    expect(row.decision_reason).toMatch(/Photographs not carried/);
  });

  it('says whether the description was carried', () => {
    expect(build(profile(), false)!.decision_reason).toMatch(/not carried/);
    expect(build(profile(), true)!.decision_reason).toMatch(/Rights .* confirmed/);
  });

  it('records when the read happened', () => {
    // A follower count without a date is a number with no meaning.
    expect(build()!.profile.instagram_read_at).toBe('2026-10-08T12:00:00.000Z');
  });
});

describe('enrichment from captions, confirmed by a person', () => {
  const opts = (over = {}) => ({ authoredConfirmed: false, ...over });

  it('stages only the service names the operator ticked', () => {
    /*
     * The caption reader proposes; a person decides. Publishing a service a
     * business does not offer is worse than publishing none.
     */
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      confirmedOfferings: ['Braiding', 'Gele'],
    }))!;
    expect(JSON.parse(String(row.profile.services_json))).toEqual([
      { name: 'Braiding' }, { name: 'Gele' },
    ]);
  });

  it('stages no services when nothing was ticked', () => {
    expect(buildInstagramCandidate('adafabrics', profile(), opts())!.profile.services_json)
      .toBeUndefined();
  });

  it('carries no price or description with a service name', () => {
    // A caption's price is true the week it was posted and misleading after.
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      confirmedOfferings: ['Braiding'],
    }))!;
    const parsed = JSON.parse(String(row.profile.services_json));
    expect(Object.keys(parsed[0])).toEqual(['name']);
  });

  it('puts contact details in the real columns, not inside profile', () => {
    /*
     * radar_candidates has its own phone/email/whatsapp columns. Staging a
     * phone inside `profile` is a mistake this codebase has already made —
     * nothing that read the column ever saw it.
     */
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      phone: '+234 801 234 5678', email: 'hello@ada.ng', whatsapp: 'https://wa.me/2348012345678',
    }))!;
    expect(row.phone).toBe('+234 801 234 5678');
    expect(row.email).toBe('hello@ada.ng');
    expect(row.whatsapp).toMatch(/wa\.me/);
    expect(row.profile.phone).toBeUndefined();
  });

  it('records post LINKS, never images, and not under a publishable key', () => {
    /*
     * media_url expires within days and may not be stored under Meta's
     * Platform Terms. A gallery built from it would be broken images on
     * somebody's listing inside a week.
     */
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      permalinks: ['https://www.instagram.com/p/A/', 'https://www.instagram.com/reel/B/'],
    }))!;
    expect(row.profile.instagram_recent_posts).toHaveLength(2);
    expect(row.profile.gallery).toBeUndefined();
    expect(row.profile.image_url).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain('scontent');
  });

  it('caps the recorded links so a feed is not bulk-exported', () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://www.instagram.com/p/${i}/`);
    const row = buildInstagramCandidate('adafabrics', profile(), opts({ permalinks: many }))!;
    expect((row.profile.instagram_recent_posts as string[]).length).toBe(12);
  });

  it('says in the provenance what was confirmed', () => {
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      confirmedOfferings: ['Braiding'], permalinks: ['https://www.instagram.com/p/A/'],
    }))!;
    expect(row.decision_reason).toMatch(/1 service name\(s\) confirmed/);
    expect(row.decision_reason).toMatch(/1 recent post link\(s\)/);
  });
});

describe('the logo, when an operator asks for it', () => {
  const opts = (over = {}) => ({ authoredConfirmed: false, ...over });

  it('stages a stored logo under the key that publishes', () => {
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      logoUrl: 'https://xyz.supabase.co/storage/v1/object/public/business-images/instagram-logos/adafabrics.jpg',
    }))!;
    expect(row.profile.logo_url).toMatch(/business-images/);
  });

  it('REFUSES a Meta CDN address, which would break within days', () => {
    /*
     * Measured 2026-10-08: profile_picture_url carried oe=6ACD7273, an expiry
     * four days out. Staging that link gives a logo that works today and is a
     * broken image on a real business's listing next week. The bytes must be
     * copied into our own storage first; this is the guard that stops the
     * shortcut.
     */
    for (const bad of [
      'https://scontent-cdg4-1.xx.fbcdn.net/v/t51.123/abc.jpg?oe=6ACD7273',
      'https://instagram.fabc1-1.fna.fbcdn.net/v/t51/x.jpg',
      'https://scontent.cdninstagram.com/v/t51/x.jpg',
    ]) {
      const row = buildInstagramCandidate('adafabrics', profile(), opts({ logoUrl: bad }))!;
      expect(row.profile.logo_url, `${bad} was staged`).toBeUndefined();
    }
  });

  it('stages no logo when the operator did not ask', () => {
    expect(buildInstagramCandidate('adafabrics', profile(), opts())!.profile.logo_url)
      .toBeUndefined();
  });

  it('still never stages the raw profile picture from the lookup', () => {
    // The only route to a logo is the copied one above.
    const row = buildInstagramCandidate('adafabrics', profile(), opts({ authoredConfirmed: true }))!;
    expect(JSON.stringify(row)).not.toContain('scontent.example');
  });
});

describe('products are kept distinct from services', () => {
  const opts = (over = {}) => ({ authoredConfirmed: false, ...over });

  it('stages confirmed products under products_json', () => {
    /*
     * That key had no projection at all until 20261020010000 — the extractor
     * staged names under `products_seen` precisely because there was nowhere
     * for them to go, so a shop published with an empty product list.
     */
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      confirmedProducts: ['Ankara shirt', 'Kaftan'],
    }))!;
    expect(JSON.parse(String(row.profile.products_json))).toEqual([
      { name: 'Ankara shirt' }, { name: 'Kaftan' },
    ]);
  });

  it('does not file a product as a service', () => {
    // A salon offers services, a shop sells products; filing one as the other
    // describes the business wrongly, and they publish to different tables.
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      confirmedOfferings: ['Braiding'], confirmedProducts: ['Ankara shirt'],
    }))!;
    expect(JSON.parse(String(row.profile.services_json))).toEqual([{ name: 'Braiding' }]);
    expect(JSON.parse(String(row.profile.products_json))).toEqual([{ name: 'Ankara shirt' }]);
  });

  it('carries no price with a product, for the same reason as a service', () => {
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      confirmedProducts: ['Ankara shirt'],
    }))!;
    expect(Object.keys(JSON.parse(String(row.profile.products_json))[0])).toEqual(['name']);
  });

  it('says in the provenance how many products a person confirmed', () => {
    const row = buildInstagramCandidate('adafabrics', profile(), opts({
      confirmedProducts: ['Ankara shirt'],
    }))!;
    expect(row.decision_reason).toMatch(/1 product name\(s\) confirmed/);
  });
});
