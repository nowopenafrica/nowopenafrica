import { supabase } from '../supabase';

/*
 * The one source of every trust string on the Promote pages, plus the reader
 * for the `placement_trust` view. No component spells "Partner verified" or
 * "requires confirmation" itself; it asks here.
 *
 * The rule these functions enforce: a placement is never described as
 * available, verified or partner-priced unless the database says a person
 * checked. Anything missing, unknown or unreadable degrades to the honest
 * default ("Source listed", "Availability requires confirmation").
 */

export type TrustLabel = 'source_listed' | 'partner_supplied' | 'partner_verified';

/*
 * 'available_from' is an in-date "available" confirmation whose period has not
 * started yet (Lagos calendar day, decided by the view). It is never read as
 * "Available" now.
 */
export type Availability =
  | 'confirmed_available'
  | 'available_from'
  | 'booked'
  | 'unavailable'
  | 'maintenance'
  | 'requires_confirmation';

export type PriceBasis = 'source_listed' | 'partner_supplied' | 'verified';

export type ConfirmationMethod = 'portal' | 'email' | 'phone' | 'document' | 'admin';

export interface PlacementTrust {
  advertId: string;
  trustLabel: TrustLabel;
  availability: Availability;
  availabilityConfirmedAt: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  /*
   * WHO CONFIRMED, as distinct from who owns. confirmedByName is the owner the
   * confirmation itself names (null for an admin, phone or email check that
   * nobody attributed to the owner). ownerName is the placement's linked
   * owner, for display elsewhere, and must never be used to say who confirmed.
   */
  confirmedByName: string | null;
  confirmationMethod: ConfirmationMethod | null;
  ownerName: string | null;
  ownerWebsite: string | null;
  /** Null when the placement has no pricing source row: the price is indicative and nothing more is claimed. */
  priceBasis: PriceBasis | null;
  priceAsOf: string | null;
}

/*
 * Rejected, archived and pending_review placements are not listed anywhere
 * public. The rule lives in listing.ts (import-free, so api/ can use it);
 * re-exported here for the pages that already import it from trust.
 */
export { isListedPlacement } from './listing';

/** The linked owner's website, as a link target, only when the owner is verified and the URL is http(s). */
export function ownerWebsiteHref(t: PlacementTrust): string | null {
  if (t.trustLabel !== 'partner_verified' || !t.ownerWebsite) return null;
  try {
    const u = new URL(t.ownerWebsite.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? t.ownerWebsite.trim() : null;
  } catch {
    return null;
  }
}

export function trustLabelText(t: TrustLabel): string {
  switch (t) {
    case 'partner_verified':
      return 'Partner verified';
    case 'partner_supplied':
      return 'Partner supplied';
    default:
      return 'Source listed';
  }
}

const REQUIRES_CONFIRMATION = 'Availability requires confirmation';

export function availabilityText(t: PlacementTrust, formatDate: (iso: string) => string): string {
  switch (t.availability) {
    case 'confirmed_available': {
      // "Available" needs a confirmation date to stand on. Without one the
      // claim is unsupported, so say what is true instead.
      if (!t.availabilityConfirmedAt) return REQUIRES_CONFIRMATION;
      const when = `Available · confirmed ${formatDate(t.availabilityConfirmedAt)}`;
      // Only the owner the confirmation names. The linked owner (ownerName)
      // did not necessarily say anything: an admin or phone check is not theirs.
      return t.confirmedByName ? `${when} by ${t.confirmedByName}` : when;
    }
    case 'available_from':
      // A future period: say when it starts, never "Available" now.
      if (!t.periodFrom || !t.availabilityConfirmedAt) return REQUIRES_CONFIRMATION;
      return `Available from ${formatDate(t.periodFrom)} · confirmed ${formatDate(t.availabilityConfirmedAt)}`;
    case 'booked':
      return t.periodTo ? `Booked until ${formatDate(t.periodTo)}` : 'Booked';
    case 'unavailable':
      return 'Unavailable';
    case 'maintenance':
      return 'Under maintenance';
    default:
      return REQUIRES_CONFIRMATION;
  }
}

/**
 * The price basis in two parts, so a component composes the words without
 * searching them: is the price merely indicative, and what (if anything) is
 * known about where it came from.
 *
 *   no pricing source row  -> indicative, no detail (no rate-card claim)
 *   source_listed          -> indicative, "published rate card"
 *   partner / verified     -> not merely indicative, "partner price[ · date]"
 */
export function priceBasisParts(
  t: PlacementTrust,
  formatDate: (iso: string) => string,
): { indicative: boolean; detail: string | null } {
  if (t.priceBasis === null) return { indicative: true, detail: null };
  if (t.priceBasis === 'source_listed') return { indicative: true, detail: 'published rate card' };
  // The rate card carries no date by design (nobody recorded one), but a
  // partner price may also lack one; never invent it.
  return { indicative: false, detail: t.priceAsOf ? `partner price · ${formatDate(t.priceAsOf)}` : 'partner price' };
}

export function priceBasisText(t: PlacementTrust, formatDate: (iso: string) => string): string {
  const { indicative, detail } = priceBasisParts(t, formatDate);
  return [indicative ? 'indicative' : null, detail].filter(Boolean).join(' · ');
}

/**
 * Used when the view is unavailable (error, still loading, or no row). The
 * price basis is unknown here, so it is null: "indicative", with no claim
 * that a rate card stands behind it.
 */
export function IMPORTED_FALLBACK(advertId: string): PlacementTrust {
  return {
    advertId,
    trustLabel: 'source_listed',
    availability: 'requires_confirmation',
    availabilityConfirmedAt: null,
    periodFrom: null,
    periodTo: null,
    confirmedByName: null,
    confirmationMethod: null,
    ownerName: null,
    ownerWebsite: null,
    priceBasis: null,
    priceAsOf: null,
  };
}

/**
 * 0 (verified, confirmed available now) to 8 (source listed, needs
 * confirmation). For tiebreaks. Within a label: available now, then available
 * from a future date, then everything else.
 */
export function trustRank(t: PlacementTrust): number {
  const label = t.trustLabel === 'partner_verified' ? 0 : t.trustLabel === 'partner_supplied' ? 1 : 2;
  const availability = t.availability === 'confirmed_available' ? 0 : t.availability === 'available_from' ? 1 : 2;
  return label * 3 + availability;
}

const CHUNK = 200;

const TRUST_LABELS: readonly TrustLabel[] = ['source_listed', 'partner_supplied', 'partner_verified'];
const AVAILABILITIES: readonly Availability[] = [
  'confirmed_available',
  'available_from',
  'booked',
  'unavailable',
  'maintenance',
  'requires_confirmation',
];
const PRICE_BASES: readonly PriceBasis[] = ['source_listed', 'partner_supplied', 'verified'];
const METHODS: readonly ConfirmationMethod[] = ['portal', 'email', 'phone', 'document', 'admin'];

// An unrecognised value must never read as a stronger claim than the honest default.
function pick<T extends string, F extends T | null>(allowed: readonly T[], value: unknown, fallback: F): T | F {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

/*
 * One placement_trust row. period_from, confirmed_by_name and
 * confirmation_method arrive with 20261109020000_placement_trust_v2.sql; until
 * that is applied they are absent and read as null (nobody named). The view's
 * availability_valid_until column is still returned but no page uses it, so
 * it is not mapped.
 */
interface TrustRow {
  advert_id: string;
  trust_label: unknown;
  availability: unknown;
  availability_confirmed_at: unknown;
  period_from?: unknown;
  period_to: unknown;
  confirmed_by_name?: unknown;
  confirmation_method?: unknown;
  owner_name: unknown;
  owner_website: unknown;
  price_basis: unknown;
  price_as_of: unknown;
}

function fromRow(r: TrustRow): PlacementTrust {
  return {
    advertId: r.advert_id,
    trustLabel: pick(TRUST_LABELS, r.trust_label, 'source_listed'),
    availability: pick(AVAILABILITIES, r.availability, 'requires_confirmation'),
    availabilityConfirmedAt: str(r.availability_confirmed_at),
    periodFrom: str(r.period_from),
    periodTo: str(r.period_to),
    confirmedByName: str(r.confirmed_by_name),
    confirmationMethod: pick(METHODS, r.confirmation_method, null),
    ownerName: str(r.owner_name),
    ownerWebsite: str(r.owner_website),
    priceBasis: pick(PRICE_BASES, r.price_basis, null),
    priceAsOf: str(r.price_as_of),
  };
}

/**
 * Reads placement_trust for the given placements. Chunks of 200 ids keep each
 * response well under PostgREST's 1000-row cap and the URL short. supabase-js
 * returns { data, error } rather than throwing, so the error is checked; on
 * any failure the whole result is an empty Map (never a partial one) and
 * `failed` is true.
 *
 * `failed` is what lets a caller tell "this placement has no trust row" (it
 * was archived or rejected) from "we could not ask". Only the first is a
 * claim about the placement.
 */
export async function fetchPlacementTrustResult(
  ids: string[],
): Promise<{ map: Map<string, PlacementTrust>; failed: boolean }> {
  const out = new Map<string, PlacementTrust>();
  const unique = Array.from(new Set(ids));
  try {
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const { data, error } = await supabase.from('placement_trust').select('*').in('advert_id', chunk);
      if (error) return { map: new Map(), failed: true };
      for (const row of (data ?? []) as TrustRow[]) out.set(row.advert_id, fromRow(row));
    }
  } catch {
    return { map: new Map(), failed: true };
  }
  return { map: out, failed: false };
}

/**
 * The same read, as just the Map: empty on failure, so callers fall back to
 * IMPORTED_FALLBACK for every id. Use fetchPlacementTrustResult where a
 * missing row means something (a plan line no longer listed).
 */
export async function fetchPlacementTrust(ids: string[]): Promise<Map<string, PlacementTrust>> {
  return (await fetchPlacementTrustResult(ids)).map;
}
