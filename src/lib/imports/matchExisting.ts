/**
 * Is this row a business NowOpen already has?
 *
 * `findInternalDuplicates` catches the same shop appearing twice inside one
 * file. It says nothing about the database — so re-uploading a corrected
 * export, or a second file from the same source, created every business
 * again. The directory's whole promise is that a name on NowOpen can be
 * reached; two of the same name, one stale, breaks it directly.
 *
 * So a matched row becomes an UPDATE proposal rather than a create, and the
 * admin is shown what would actually change before anything is written.
 *
 * WHY A PROPOSAL AND NOT AN AUTOMATIC MERGE
 *
 * An import file is a claim about a business, not the truth about it. The
 * business may have been claimed by its owner since the last import, and an
 * owner's own edits must never be silently overwritten by a spreadsheet — so
 * `ownedByUser` rows are surfaced separately and default to leaving alone.
 *
 * MATCH STRENGTH, and why the order matters
 *
 *   phone   strongest. Two businesses do not share a line.
 *   domain  strong. A shared domain is a chain or a franchise, which is a
 *           real thing — so it is a match, but a weaker one.
 *   name+city  weakest, and the only one that can be wrong in an ordinary
 *           way: "Mama Put" in Lagos is a name a hundred businesses use.
 *
 * The weakest tier is reported as `review` rather than `matched`, because
 * merging two different shops is worse than creating one duplicate: a
 * duplicate can be merged later, a bad merge has already destroyed which
 * details belonged to whom.
 */

import type { NormalizedBusiness } from '../radar/normalize';

/** The subset of a live business row this needs. */
export interface ExistingBusiness {
  id: string;
  name: string;
  nameKey: string;
  cityKey: string;
  phone: string | null;
  domain: string | null;
  /** Set when a real person owns this profile. */
  ownedByUser: boolean;
  claimStatus?: string | null;
  /** Current values, so a diff can be computed. */
  fields: Record<string, string | null>;
  /**
   * The jsonb and array columns, as the database returned them.
   *
   * Separate from `fields` because they are not strings and must not be
   * diffed as strings: `["Cash","Card"]` and `["Card","Cash"]` are the same
   * list, and a text comparison would propose an update on every re-import.
   * They are only ever FILLED when empty — see jsonEnrichment.
   */
  json?: Record<string, unknown>;
}

export type MatchBasis = 'phone' | 'domain' | 'name_city';
export type MatchAction = 'update' | 'review' | 'leave_alone';

export interface FieldChange {
  field: string;
  from: string | null;
  to: string;
}

export interface ExistingMatch {
  lineNo: number;
  businessId: string;
  businessName: string;
  basis: MatchBasis;
  action: MatchAction;
  /** Only fields the file would actually change. */
  changes: FieldChange[];
  /** Set when the row matched but has nothing new to say. */
  identical: boolean;
  reason: string;
  /**
   * jsonb/array columns this row would fill, ready to write.
   *
   * Computed at match time because it needs the file row, which `updatePatch`
   * does not have. Only ever fills what is empty.
   */
  jsonPatch?: Record<string, unknown>;
}

/**
 * Fields an import is allowed to update on an existing business.
 *
 * These are IMPORT field names, which are not always the column names —
 * `businesses` has no `city` or `cover_image_url`. See BUSINESS_COLUMN.
 *
 * `latitude` and `longitude` are deliberately absent: they exist on
 * radar_candidates and NOT on businesses, so an update could never write them.
 * Listing them would show the admin a diff the database then rejects.
 */
export const UPDATABLE_FIELDS = [
  'description',
  'category',
  'address',
  /*
   * REAL COLUMN NAMES, and this is the second time the distinction has
   * mattered. `businesses` has `location`, not `city`, and `image_url`, not
   * `cover_image_url`. The code read the right columns and labelled them with
   * the wrong names, so the DIFF worked perfectly and the UPDATE would have
   * failed — PostgREST rejects an unknown column and takes the whole write
   * with it, which supabase-js reports as a resolved error a caller can
   * swallow. Every matched row supplying a city would have silently failed to
   * update.
   *
   * `npm run check:drift` now verifies this list against the live schema, so
   * a third occurrence is caught by a command rather than by reading.
   */
  'location',
  'phone',
  'whatsapp',
  'email',
  'website',
  'logo_url',
  'image_url',
  'opening_hours',
  /*
   * The rest of the profile, as of 20260908200000.
   *
   * Scalars only. The jsonb columns — socials, values, languages, payment
   * methods, FAQs — cannot be diffed as text, so they take the fill-when-empty
   * path in jsonEnrichment instead. `services` is absent for a different
   * reason: services are ROWS in business_services, and "updating" them means
   * reconciling a file against existing rows, which needs a rule about
   * deletion that nobody has set.
   */
  'tagline',
  'about',
  'story',
  'mission',
  'vision',
  'subcategory',
  'business_type',
  'employees',
  'service_area',
  'timezone',
  'founded_year',
] as const;

/**
 * Import field → `businesses` column.
 *
 * The two vocabularies genuinely differ, and treating them as one is what
 * broke this on first run: a SELECT naming `city`, `cover_image_url`,
 * `latitude` and `longitude` was rejected outright, so the matcher compared
 * the file against nothing at all and every duplicate looked new.
 *
 * Anything absent from this map uses its own name.
 */
export const BUSINESS_COLUMN: Record<string, string> = {
  city: 'location',
  cover_image_url: 'image_url',
};

/** The `businesses` column an import field writes to. */
export function businessColumn(field: string): string {
  return BUSINESS_COLUMN[field] ?? field;
}

/** Every column the matcher needs to read, as PostgREST wants it. */
export const EXISTING_SELECT = [
  'id', 'name', 'location', 'phone', 'whatsapp', 'email', 'website',
  'description', 'address', 'category', 'logo_url', 'image_url',
  'opening_hours', 'user_id', 'claim_status',
  // The profile columns, so the matcher can tell "already has one" from
  // "empty". `npm run check:drift` verifies this list against the live schema.
  'tagline', 'about', 'story', 'mission', 'vision', 'subcategory',
  'business_type', 'employees', 'service_area', 'timezone', 'founded_year',
  'social_links', 'core_values', 'why_us', 'languages', 'payment_methods',
  'faqs', 'secondary_categories',
].join(',');

/**
 * Deliberately NOT updatable, and each for its own reason:
 *
 *   name            renaming a live business from a spreadsheet is how a
 *                   profile somebody bookmarked becomes unrecognisable
 *   username/slug   the public URL; changing it breaks every existing link
 *   verified,
 *   verification_*  verification is a human act with a counterparty
 *   claim_status,
 *   user_id         ownership is never assigned by a file
 *   rating,
 *   review_count    customer signals, not import data
 */
export const NEVER_FROM_IMPORT = [
  'name', 'username', 'verified', 'verification_status', 'verification_tier',
  'claim_status', 'user_id', 'rating', 'review_count', 'data_status',
] as const;

/**
 * The value this row is actually proposing for a field.
 *
 * CANONICAL, not raw — and this is the bug the tests caught.
 *
 * The database stores a phone as `+2348030000001`; a spreadsheet writes
 * `08030000001`. Comparing the raw cell against the stored value made every
 * phone number look changed, so a harmless re-import would have proposed a
 * spurious update on every business it touched — and an admin who trusted the
 * count would have been approving nothing.
 *
 * Fields with a canonical form therefore compare AND write the canonical one.
 * Everything else is free text and compares as typed.
 */
function incomingValue(field: string, row: MatchInput): string {
  const n = row.normalized;
  if (n) {
    switch (field) {
      case 'phone': return n.phone ?? '';
      case 'whatsapp': return n.whatsapp ?? '';
      case 'email': return n.email ?? '';
      case 'website': return n.website ?? '';
      // The column is `location`; the normalised value is still the city.
      case 'location': return n.city ?? '';
      /*
       * COLUMN NAME vs CSV FIELD NAME, which are not the same thing.
       *
       * The mapper accepts a spreadsheet column called `cover_image_url` —
       * a sensible alias for a header — but the database column is
       * `image_url`. Without this case, `incomingValue('image_url')` would
       * fall through to `mapped.image_url`, which a business CSV never sets,
       * and a cover image would be silently dropped from every update.
       */
      case 'image_url': return String(row.mapped.image_url ?? row.mapped.cover_image_url ?? '').trim();
      case 'address': return n.address ?? '';
      case 'category': return n.category ?? '';
      case 'latitude': return n.latitude === null ? '' : String(n.latitude);
      case 'longitude': return n.longitude === null ? '' : String(n.longitude);
      default: break;
    }
  }
  return String(row.mapped[field] ?? '').trim();
}

/** A stable key for each match tier. */
function keysFor(n: NormalizedBusiness): { basis: MatchBasis; key: string }[] {
  const out: { basis: MatchBasis; key: string }[] = [];
  if (n.phone) out.push({ basis: 'phone', key: `p:${n.phone}` });
  if (n.domain) out.push({ basis: 'domain', key: `d:${n.domain}` });
  if (n.nameKey) out.push({ basis: 'name_city', key: `n:${n.nameKey}|${n.cityKey}` });
  return out;
}

function indexExisting(existing: ExistingBusiness[]): Map<string, ExistingBusiness> {
  const index = new Map<string, ExistingBusiness>();
  for (const b of existing) {
    // First writer wins, so the earliest-created business stays canonical
    // rather than the ordering of the array deciding.
    const add = (k: string) => { if (!index.has(k)) index.set(k, b); };
    if (b.phone) add(`p:${b.phone}`);
    if (b.domain) add(`d:${b.domain}`);
    if (b.nameKey) add(`n:${b.nameKey}|${b.cityKey}`);
  }
  return index;
}

/** Normalise for comparison only — never for storage. */
function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

export interface MatchInput {
  lineNo: number;
  normalized: NormalizedBusiness | null;
  /** The mapped, cleaned cells for this row. */
  mapped: Record<string, string>;
}

/**
 * Match rows against what NowOpen already has.
 *
 * Pure: it reads, compares and reports. Nothing here writes, and nothing here
 * decides — the admin does, from what this returns.
 */
export function matchExisting(
  rows: MatchInput[],
  existing: ExistingBusiness[],
): Map<number, ExistingMatch> {
  const index = indexExisting(existing);
  const matches = new Map<number, ExistingMatch>();

  for (const row of rows) {
    if (!row.normalized) continue;

    let hit: ExistingBusiness | undefined;
    let basis: MatchBasis | undefined;
    for (const { basis: b, key } of keysFor(row.normalized)) {
      const found = index.get(key);
      if (found) { hit = found; basis = b; break; }
    }
    if (!hit || !basis) continue;

    /*
     * What would actually change. A field the file leaves blank is not a
     * change — an empty cell means "this file does not say", never "delete
     * what you have". That distinction is the difference between an import
     * that enriches a directory and one that strips it.
     */
    const changes: FieldChange[] = [];
    for (const field of UPDATABLE_FIELDS) {
      const incoming = incomingValue(field, row);
      if (!incoming) continue;
      const current = hit.fields[field] ?? null;
      if (same(current, incoming)) continue;
      changes.push({ field, from: current, to: incoming });
    }

    /*
     * The jsonb columns, which do not diff as text. Their summaries join
     * `changes` so the preview shows them, and the real payload rides on the
     * match for updatePatch to apply.
     */
    const enrichment = jsonEnrichment(hit, row);
    if (enrichment) changes.push(...enrichment.changes);

    const identical = changes.length === 0;

    let action: MatchAction;
    let reason: string;

    if (hit.ownedByUser) {
      action = 'leave_alone';
      reason = `${hit.name} has been claimed by its owner. An import must not overwrite what they have written.`;
    } else if (identical) {
      action = 'leave_alone';
      reason = `Already on NowOpen with the same details — nothing in this file is new.`;
    } else if (basis === 'name_city') {
      action = 'review';
      reason = `Matched only on name and city, which two different businesses can share. Confirm this is the same one before updating.`;
    } else {
      action = 'update';
      reason = `Already on NowOpen (matched on ${basis === 'phone' ? 'phone number' : 'website'}). ${changes.length} field${changes.length === 1 ? '' : 's'} would change.`;
    }

    matches.set(row.lineNo, {
      lineNo: row.lineNo,
      businessId: hit.id,
      businessName: hit.name,
      basis,
      action,
      changes,
      identical,
      reason,
      ...(enrichment ? { jsonPatch: enrichment.patch } : {}),
    });
  }

  return matches;
}

export interface MatchSummary {
  matched: number;
  toUpdate: number;
  toReview: number;
  leaveAlone: number;
  ownerClaimed: number;
  unchanged: number;
}

export function summariseMatches(matches: Map<number, ExistingMatch>): MatchSummary {
  const all = [...matches.values()];
  return {
    matched: all.length,
    toUpdate: all.filter((m) => m.action === 'update').length,
    toReview: all.filter((m) => m.action === 'review').length,
    leaveAlone: all.filter((m) => m.action === 'leave_alone').length,
    ownerClaimed: all.filter((m) => m.reason.includes('claimed by its owner')).length,
    unchanged: all.filter((m) => m.identical).length,
  };
}

/**
 * The patch to apply for one match.
 *
 * Built from the changes rather than from the row, so a field that is not in
 * UPDATABLE_FIELDS cannot reach the database even if a future caller passes a
 * wider object.
 */
/** jsonb list columns an import may fill, and the import field that feeds each. */
const JSON_LIST_FIELDS: [column: string, field: string][] = [
  ['core_values', 'core_values'],
  ['why_us', 'why_us'],
  ['languages', 'languages'],
  ['payment_methods', 'payment_methods'],
];

const isEmptyJson = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  if (typeof v === 'string') return v.trim() === '' || v === '[]' || v === '{}';
  return false;
};

/**
 * The jsonb and array columns a matched row would fill.
 *
 * FILL ONLY, NEVER REPLACE, and the two cases differ:
 *
 *   social_links   MERGED by key. A business with an Instagram link and no
 *                  TikTok gains the TikTok and keeps the Instagram — the file
 *                  cannot overwrite a link somebody already has, because a
 *                  stale handle in a third-party export would then replace a
 *                  working one.
 *
 *   lists, FAQs,   Set only when the existing value is empty. Merging two
 *   categories     lists means deciding what "the same value" is and in what
 *                  order the result goes, and getting that wrong quietly
 *                  rewrites what a business chose to say.
 *
 * Returns undefined when there is nothing to add, so a match with no JSON
 * enrichment carries no key at all.
 */
export function jsonEnrichment(
  existing: ExistingBusiness,
  row: MatchInput,
): { patch: Record<string, unknown>; changes: FieldChange[] } | undefined {
  const current = existing.json ?? {};
  const patch: Record<string, unknown> = {};
  const changes: FieldChange[] = [];

  // Socials: merge by key.
  const incomingSocials: Record<string, string> = {};
  for (const key of ['instagram', 'facebook', 'twitter', 'tiktok', 'linkedin', 'youtube']) {
    const v = String(row.mapped[key] ?? '').trim();
    if (v) incomingSocials[key] = v;
  }
  if (Object.keys(incomingSocials).length) {
    const existingSocials = (current.social_links && typeof current.social_links === 'object'
      && !Array.isArray(current.social_links))
      ? { ...(current.social_links as Record<string, unknown>) }
      : {};
    const added: string[] = [];
    for (const [key, url] of Object.entries(incomingSocials)) {
      if (isEmptyJson(existingSocials[key])) { existingSocials[key] = url; added.push(key); }
    }
    if (added.length) {
      patch.social_links = existingSocials;
      changes.push({ field: 'social_links', from: null, to: added.join(', ') });
    }
  }

  for (const [column, field] of JSON_LIST_FIELDS) {
    const raw = String(row.mapped[field] ?? '').trim();
    if (!raw) continue;
    if (!isEmptyJson(current[column])) continue;
    const list = raw.split('|').map((v) => v.trim()).filter(Boolean);
    if (!list.length) continue;
    patch[column] = list;
    changes.push({ field: column, from: null, to: list.join(', ') });
  }

  // secondary_categories is text[], not jsonb — same rule, different type.
  const secondary = String(row.mapped.secondary_categories ?? '').trim();
  if (secondary && isEmptyJson(current.secondary_categories)) {
    const list = secondary.split('|').map((v) => v.trim()).filter(Boolean);
    if (list.length) {
      patch.secondary_categories = list;
      changes.push({ field: 'secondary_categories', from: null, to: list.join(', ') });
    }
  }

  // FAQs arrive as JSON text from the validator.
  const faqsJson = String(row.mapped.faqs_json ?? '').trim();
  if (faqsJson && isEmptyJson(current.faqs)) {
    try {
      const parsed = JSON.parse(faqsJson);
      if (Array.isArray(parsed) && parsed.length) {
        patch.faqs = parsed;
        changes.push({ field: 'faqs', from: null, to: `${parsed.length} question${parsed.length === 1 ? '' : 's'}` });
      }
    } catch {
      // A cell the validator already flagged. Silence here, not a second alarm.
    }
  }

  return Object.keys(patch).length ? { patch, changes } : undefined;
}

export function updatePatch(match: ExistingMatch): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const json = match.jsonPatch ?? {};

  for (const c of match.changes) {
    if ((NEVER_FROM_IMPORT as readonly string[]).includes(c.field)) continue;
    /*
     * A jsonb column's `to` is a HUMAN SUMMARY ("instagram, tiktok"), not a
     * value — writing it would put that string into the column. The real
     * payload is in jsonPatch, applied below.
     */
    if (c.field in json) continue;
    // Keyed by COLUMN. `city` and `cover_image_url` are import field names;
    // writing them literally would fail against businesses.
    patch[businessColumn(c.field)] = c.to;
  }

  for (const [column, value] of Object.entries(json)) {
    if ((NEVER_FROM_IMPORT as readonly string[]).includes(column)) continue;
    patch[column] = value;
  }

  return patch;
}
