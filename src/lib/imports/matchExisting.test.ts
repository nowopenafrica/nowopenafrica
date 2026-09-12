import { describe, it, expect } from 'vitest';

import {
  matchExisting,
  summariseMatches,
  updatePatch,
  UPDATABLE_FIELDS,
  NEVER_FROM_IMPORT,
  businessColumn,
  EXISTING_SELECT,
  type ExistingBusiness,
  type MatchInput,
} from './matchExisting';
import { normalizeBusiness } from '../radar/normalize';

/**
 * Is this row a business NowOpen already has?
 *
 * `findInternalDuplicates` catches the same shop twice inside one file. It says
 * nothing about the database — so re-uploading a corrected export, or a second
 * file from the same source, created every business again. The directory's
 * whole promise is that a name on NowOpen can be reached; two of the same,
 * one stale, breaks that directly.
 *
 * A matched row therefore becomes an UPDATE proposal, and the admin sees what
 * would change before anything is written.
 */

function row(lineNo: number, raw: Record<string, string>): MatchInput {
  return {
    lineNo,
    mapped: raw,
    normalized: normalizeBusiness({
      name: raw.name,
      category: raw.category ?? null,
      city: raw.city ?? null,
      address: raw.address ?? null,
      phone: raw.phone ?? null,
      email: raw.email ?? null,
      website: raw.website ?? null,
    } as never),
  };
}

function existing(over: Partial<ExistingBusiness> = {}): ExistingBusiness {
  return {
    id: 'b-1',
    name: 'Zanzibar Coffee',
    nameKey: 'zanzibar coffee',
    cityKey: 'lagos',
    phone: '+2348030000001',
    domain: 'zanzibarcoffee.ng',
    ownedByUser: false,
    fields: { description: 'Coffee shop.', phone: '+2348030000001', address: '1 Old Road' },
    ...over,
  };
}

describe('matching on a phone number', () => {
  it('recognises the business and proposes an update', () => {
    const rows = [row(2, { name: 'Zanzibar Coffee Ltd', phone: '08030000001', city: 'Lagos', description: 'Speciality coffee roaster.' })];
    const m = matchExisting(rows, [existing()]).get(2)!;

    expect(m.businessId).toBe('b-1');
    expect(m.basis).toBe('phone');
    expect(m.action).toBe('update');
    expect(m.reason).toMatch(/already on nowopen/i);
  });

  it('lists only the fields that would actually change', () => {
    const rows = [row(2, {
      name: 'Zanzibar Coffee',
      phone: '08030000001',
      description: 'Speciality coffee roaster.',
      address: '1 Old Road',
    })];
    const m = matchExisting(rows, [existing()]).get(2)!;

    // description differs; address is identical and must not appear.
    expect(m.changes.map((c) => c.field)).toEqual(['description']);
    expect(m.changes[0].from).toBe('Coffee shop.');
  });

  it('treats a blank cell as "this file does not say", never as delete', () => {
    /*
     * The distinction between an import that enriches a directory and one that
     * strips it. An exporter that omits a column would otherwise empty that
     * field on every business it touched.
     */
    const rows = [row(2, { name: 'Zanzibar Coffee', phone: '08030000001', description: '' })];
    const m = matchExisting(rows, [existing()]).get(2)!;
    expect(m.changes).toHaveLength(0);
    expect(m.identical).toBe(true);
    expect(m.action).toBe('leave_alone');
  });
});

describe('matching on a domain', () => {
  it('is a match, and says which basis it used', () => {
    const rows = [row(3, { name: 'Zanzibar Coffee Roasters', website: 'https://www.zanzibarcoffee.ng/about', description: 'New copy.' })];
    const m = matchExisting(rows, [existing({ phone: null })]).get(3)!;
    expect(m.basis).toBe('domain');
    expect(m.action).toBe('update');
  });
});

describe('matching on name and city only', () => {
  it('asks for review rather than updating', () => {
    /*
     * The weakest tier, and the only one that is wrong in an ordinary way:
     * "Mama Put" in Lagos is a name a hundred businesses use. Merging two
     * different shops is worse than creating one duplicate — a duplicate can
     * be merged later, a bad merge has already destroyed which details
     * belonged to whom.
     */
    const rows = [row(4, { name: 'Zanzibar Coffee', city: 'Lagos', description: 'Different shop, same name.' })];
    const m = matchExisting(rows, [existing({ phone: null, domain: null })]).get(4)!;

    expect(m.basis).toBe('name_city');
    expect(m.action).toBe('review');
    expect(m.reason).toMatch(/two different businesses can share/i);
  });
});

describe('a business its owner has claimed', () => {
  it('is left alone', () => {
    /*
     * An import file is a claim ABOUT a business, not the truth about it. If
     * the owner has since claimed the profile and written their own copy, a
     * spreadsheet must not silently overwrite it.
     */
    const rows = [row(5, { name: 'Zanzibar Coffee', phone: '08030000001', description: 'Stale import copy.' })];
    const m = matchExisting(rows, [existing({ ownedByUser: true })]).get(5)!;

    expect(m.action).toBe('leave_alone');
    expect(m.reason).toMatch(/claimed by its owner/i);
  });

  it('still reports what the file would have changed, for the admin to judge', () => {
    // Left alone is not the same as invisible: an admin may want to contact
    // the owner rather than discard the newer information.
    const rows = [row(5, { name: 'Zanzibar Coffee', phone: '08030000001', description: 'Newer copy.' })];
    const m = matchExisting(rows, [existing({ ownedByUser: true })]).get(5)!;
    expect(m.changes).toHaveLength(1);
  });
});

describe('what it will not touch', () => {
  it('never updates identity, ownership or customer signals', () => {
    for (const f of ['name', 'username', 'verified', 'claim_status', 'user_id', 'rating', 'review_count']) {
      expect(NEVER_FROM_IMPORT).toContain(f);
      expect(UPDATABLE_FIELDS as readonly string[]).not.toContain(f);
    }
  });

  it('builds a patch containing only permitted fields', () => {
    /*
     * The patch is built from the diff, not from the row, so a wider object
     * passed by some future caller still cannot reach the database.
     */
    const m = {
      lineNo: 1, businessId: 'b-1', businessName: 'X', basis: 'phone' as const,
      action: 'update' as const, identical: false, reason: '',
      changes: [
        { field: 'description', from: 'a', to: 'b' },
        { field: 'name', from: 'X', to: 'Renamed Ltd' },
        { field: 'verified', from: 'false', to: 'true' },
      ],
    };
    const patch = updatePatch(m);
    expect(patch).toEqual({ description: 'b' });
    expect(patch.name).toBeUndefined();
    expect(patch.verified).toBeUndefined();
  });

  it('does not rename a live business from a spreadsheet', () => {
    // A profile somebody bookmarked becoming unrecognisable is a worse
    // outcome than a slightly stale name.
    const rows = [row(6, { name: 'Zanzibar Coffee Roasters PLC', phone: '08030000001' })];
    const m = matchExisting(rows, [existing()]).get(6)!;
    expect(m.changes.some((c) => c.field === 'name')).toBe(false);
  });
});

describe('rows that match nothing', () => {
  it('are absent from the result, so they create as normal', () => {
    const rows = [row(7, { name: 'Somewhere New', phone: '08099999999', city: 'Abuja' })];
    expect(matchExisting(rows, [existing()]).has(7)).toBe(false);
  });

  it('an unparseable row is skipped rather than guessed at', () => {
    const rows: MatchInput[] = [{ lineNo: 8, mapped: {}, normalized: null }];
    expect(matchExisting(rows, [existing()]).size).toBe(0);
  });
});

describe('the summary an admin sees', () => {
  it('counts each outcome separately', () => {
    const rows = [
      row(2, { name: 'Zanzibar Coffee', phone: '08030000001', description: 'New copy.' }),
      row(3, { name: 'Owned Place', phone: '08030000002', description: 'New copy.' }),
      row(4, { name: 'Same Name', city: 'Lagos', description: 'Maybe different.' }),
      row(5, { name: 'Unchanged Co', phone: '08030000003' }),
      row(6, { name: 'Brand New', phone: '08088888888' }),
    ];
    const db: ExistingBusiness[] = [
      existing(),
      existing({ id: 'b-2', name: 'Owned Place', nameKey: 'owned place', phone: '+2348030000002', domain: null, ownedByUser: true, fields: { description: 'Owner wrote this.' } }),
      existing({ id: 'b-3', name: 'Same Name', nameKey: 'same name', phone: null, domain: null, fields: { description: 'Original.' } }),
      /*
       * `fields` must already hold the phone for this row to count as
       * unchanged. An earlier version left it empty, and the row was then
       * correctly reported as an UPDATE — the phone really was new
       * information. The fixture was wrong, not the matcher.
       */
      existing({ id: 'b-4', name: 'Unchanged Co', nameKey: 'unchanged co', phone: '+2348030000003', domain: null, fields: { phone: '+2348030000003' } }),
    ];

    const s = summariseMatches(matchExisting(rows, db));
    expect(s.matched).toBe(4);
    expect(s.toUpdate).toBe(1);
    expect(s.toReview).toBe(1);
    expect(s.ownerClaimed).toBe(1);
    expect(s.unchanged).toBe(1);
  });
});

describe('the earliest business stays canonical', () => {
  it('matches the first of two that share a key', () => {
    /*
     * Otherwise the order of an array decides which of two existing rows an
     * import enriches, and repeated imports would ping-pong between them.
     */
    const db = [
      existing({ id: 'first' }),
      existing({ id: 'second' }),
    ];
    const rows = [row(2, { name: 'Zanzibar Coffee', phone: '08030000001', description: 'New.' })];
    expect(matchExisting(rows, db).get(2)!.businessId).toBe('first');
  });
});

describe('import field names are not businesses column names', () => {
  it('translates the two that differ', () => {
    /*
     * THE BUG THAT MADE THIS FEATURE SILENTLY INERT.
     *
     * The importer maps `city` and `cover_image_url` because RADAR CANDIDATES
     * have those columns. `businesses` does not — it stores `location` and
     * `image_url`, and has no latitude/longitude at all.
     *
     * The first version selected the import names straight from `businesses`.
     * PostgREST rejected the whole query, the code checked `error` and
     * returned, and the matcher then compared the file against an empty set:
     * a CSV containing a business NowOpen already had was offered as "2 new
     * businesses". Verified on production before it was fixed.
     */
    expect(businessColumn('city')).toBe('location');
    expect(businessColumn('cover_image_url')).toBe('image_url');
  });

  it('leaves every other field alone', () => {
    for (const f of ['description', 'phone', 'email', 'website', 'logo_url', 'opening_hours']) {
      expect(businessColumn(f)).toBe(f);
    }
  });

  it('does not offer to update a field businesses cannot store', () => {
    // latitude/longitude exist on radar_candidates and not on businesses, so
    // a diff naming them is one the admin approves and the database rejects.
    expect(UPDATABLE_FIELDS as readonly string[]).not.toContain('latitude');
    expect(UPDATABLE_FIELDS as readonly string[]).not.toContain('longitude');
  });

  it('builds the patch with column names, not field names', () => {
    const patch = updatePatch({
      lineNo: 1, businessId: 'b', businessName: 'X', basis: 'phone',
      action: 'update', identical: false, reason: '',
      changes: [
        { field: 'city', from: 'Ikeja', to: 'Lekki' },
        { field: 'cover_image_url', from: null, to: 'https://x/y.jpg' },
      ],
    });
    expect(patch).toEqual({ location: 'Lekki', image_url: 'https://x/y.jpg' });
    expect(patch.city).toBeUndefined();
  });

  it('the select list covers every updatable field, under its real column', () => {
    /*
     * The guard that stops this recurring: if somebody adds an updatable
     * field and forgets the column, the diff would compare against undefined
     * and report a change on every business.
     */
    const cols = EXISTING_SELECT.split(',');
    for (const f of UPDATABLE_FIELDS) {
      expect(cols, `${f} → ${businessColumn(f)} must be selected`).toContain(businessColumn(f));
    }
  });

  it('selects the keys the matcher needs', () => {
    const cols = EXISTING_SELECT.split(',');
    for (const c of ['id', 'name', 'location', 'phone', 'website', 'user_id', 'claim_status']) {
      expect(cols).toContain(c);
    }
  });
});

describe('the fields it writes are real columns', () => {
  /**
   * This bug landed twice, and neither the diff nor the existing tests saw it.
   *
   * `UPDATABLE_FIELDS` named `city` and `cover_image_url`. `businesses` has
   * `location` and `image_url`. Both sides of the comparison used the same
   * wrong label, so the DIFF was perfect and the UPDATE was doomed: PostgREST
   * rejects an unknown column and discards the whole write, and supabase-js
   * reports that as a RESOLVED error — invisible to a caller checking only for
   * a thrown exception.
   *
   * `npm run check:drift` now verifies this against the live schema. This test
   * is the CI half, so the mistake cannot merge before anybody runs drift.
   */
  it('uses the real column names, not the CSV header aliases', () => {
    expect(UPDATABLE_FIELDS as readonly string[]).toContain('location');
    expect(UPDATABLE_FIELDS as readonly string[]).toContain('image_url');
    expect(UPDATABLE_FIELDS as readonly string[]).not.toContain('city');
    expect(UPDATABLE_FIELDS as readonly string[]).not.toContain('cover_image_url');
  });

  it('names no column that businesses does not have', () => {
    /*
     * Pinned from the live schema on 2026-09-08. Deliberately a literal list
     * rather than a live query: a unit test must not need the database, and
     * the live check exists separately in check-schema-drift.mjs.
     */
    const REAL = new Set([
      'description', 'category', 'address', 'location', 'phone', 'whatsapp',
      'email', 'website', 'logo_url', 'image_url', 'opening_hours', 'hours',
      'timezone', 'open_status', 'name', 'username', 'verified',
      // The profile columns the importer gained on 2026-09-08. Scalars only:
      // the jsonb ones take the fill-when-empty path in jsonEnrichment and
      // never appear in UPDATABLE_FIELDS.
      'tagline', 'about', 'story', 'mission', 'vision', 'subcategory',
      'business_type', 'employees', 'service_area', 'founded_year',
    ]);
    for (const f of UPDATABLE_FIELDS) {
      expect(REAL.has(f), `${f} is not a column on businesses`).toBe(true);
    }
  });

  it('still reads a city from the CSV, under the column name', () => {
    // The spreadsheet says "city"; the column is "location". The translation
    // has to happen somewhere, and it happens in incomingValue.
    const rows = [row(9, { name: 'Zanzibar Coffee', phone: '08030000001', city: 'Abuja' })];
    const m = matchExisting(rows, [existing({ fields: { location: 'Lagos' } })]).get(9)!;
    const change = m.changes.find((c) => c.field === 'location');
    expect(change, 'a changed city must surface as a location change').toBeTruthy();
    expect(change!.to.toLowerCase()).toContain('abuja');
  });

  it('carries a cover image through from its CSV alias', () => {
    /*
     * The mapper accepts a `cover_image_url` header; the column is
     * `image_url`. Without the translation the image was silently dropped
     * from every update — a field that looked supported and never applied.
     */
    const rows = [{
      lineNo: 10,
      normalized: normalizeBusiness({ name: 'Zanzibar Coffee', phone: '08030000001' } as never),
      mapped: { name: 'Zanzibar Coffee', phone: '08030000001', cover_image_url: 'https://cdn.example.com/cover.jpg' },
    }];
    const m = matchExisting(rows, [existing({ fields: {} })]).get(10)!;
    expect(m.changes.find((c) => c.field === 'image_url')?.to).toBe('https://cdn.example.com/cover.jpg');
  });
});
