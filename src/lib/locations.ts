// Branches of one business.
//
// A chain used to have to register each branch as a separate business, which
// split the brand: five listings, five ratings, five half-empty catalogues, and
// a customer searching the name finding none of them convincing.
//
// A branch owns the things that genuinely differ between them — address, phone,
// opening hours, timezone, and its own open/closed override. The brand, the
// catalogue and the reviews stay on the parent, because they are the same
// wherever you walk in.
//
// Everything here is pure. The open state comes from the same publicOpenState
// the profile and the crawler page use, so a branch's badge cannot disagree
// with the business's.

// .js extension required: this file is reachable from api/business/[slug].ts,
// which runs as a Node ESM serverless function where an extensionless relative
// specifier does not resolve. Vite rewrites it for the browser build either
// way, so the extension costs nothing on the web side.
import { publicOpenState, type OpenState } from './openingHours.js';

export interface BusinessLocation {
  id: string;
  business_id?: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  timezone?: string | null;
  open_status?: 'open' | 'closed' | null;
  latitude?: number | null;
  longitude?: number | null;
  is_primary?: boolean | null;
}

/** The parent's own details, used when a branch leaves a field blank. */
export interface LocationFallback {
  location?: string | null;
  phone?: string | null;
  opening_hours?: string | null;
  hours?: string | null;
  timezone?: string | null;
  open_status?: 'open' | 'closed' | null;
}

/**
 * A branch's open state.
 *
 * Falls back to the parent field by field rather than all-or-nothing: a chain
 * usually keeps the same hours everywhere and only one branch stays open late,
 * so making every branch restate the whole timetable would guarantee they drift
 * out of date.
 *
 * The branch's own override still wins outright when it has one — that is the
 * field whose entire purpose is "today is different here".
 */
export function locationOpenState(
  loc: BusinessLocation,
  parent: LocationFallback,
  now: Date = new Date(),
): OpenState {
  return publicOpenState({
    opening_hours: loc.opening_hours || parent.opening_hours || parent.hours || null,
    timezone: loc.timezone || parent.timezone || null,
    open_status: loc.open_status ?? null,
  }, now);
}

/** What a branch shows for a field it did not set. */
export const locationAddress = (loc: BusinessLocation, parent: LocationFallback): string =>
  (loc.address || '').trim() || (parent.location || '').trim();

export const locationPhone = (loc: BusinessLocation, parent: LocationFallback): string =>
  (loc.phone || '').trim() || (parent.phone || '').trim();

/**
 * Order branches the way someone choosing one would want them.
 *
 * Primary first — it is the flagship and usually the one meant — then whatever
 * is open, then alphabetically so the list is stable between renders. Sorting
 * open branches above closed ones matters more than tidiness: the reason to
 * open this list is to find somewhere you can actually go.
 */
export function sortLocations(
  locations: BusinessLocation[],
  parent: LocationFallback,
  now: Date = new Date(),
): BusinessLocation[] {
  const rank = (l: BusinessLocation): number => {
    if (l.is_primary) return 0;
    const kind = locationOpenState(l, parent, now).kind;
    if (kind === 'open') return 1;
    if (kind === 'closing-soon') return 2;
    if (kind === 'unknown') return 3;
    return 4;
  };
  return [...(locations || [])].sort((a, b) => {
    const r = rank(a) - rank(b);
    return r !== 0 ? r : (a.name || '').localeCompare(b.name || '');
  });
}

export const primaryLocation = (locations: BusinessLocation[]): BusinessLocation | null =>
  (locations || []).find((l) => l.is_primary) || (locations || [])[0] || null;

/**
 * The line above the list: "3 of 5 branches open now".
 *
 * Counts closing-soon as open, matching the directory filter — a branch closing
 * in twenty minutes is one you can still reach. Branches whose hours cannot be
 * read are left out of the numerator rather than assumed shut, and the sentence
 * degrades to a plain count when none of them can be read at all, because
 * "0 of 5 open" would be a claim we cannot support.
 */
export function locationsSummary(
  locations: BusinessLocation[],
  parent: LocationFallback,
  now: Date = new Date(),
): string {
  const list = locations || [];
  if (list.length === 0) return '';
  const label = list.length === 1 ? '1 branch' : `${list.length} branches`;

  const states = list.map((l) => locationOpenState(l, parent, now).kind);
  const known = states.filter((k) => k !== 'unknown').length;
  if (known === 0) return label;

  const open = states.filter((k) => k === 'open' || k === 'closing-soon').length;
  return `${open} of ${list.length} open now`;
}

/**
 * Straight-line distance in kilometres, or null when either point is missing.
 *
 * Haversine. Good enough to order a list of branches in one city, which is all
 * it is used for — it is not a routing distance and should not be presented as
 * one.
 */
export function distanceKm(
  aLat: number | null | undefined, aLng: number | null | undefined,
  bLat: number | null | undefined, bLng: number | null | undefined,
): number | null {
  if ([aLat, aLng, bLat, bLng].some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad((bLat as number) - (aLat as number));
  const dLng = toRad((bLng as number) - (aLng as number));
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat as number)) * Math.cos(toRad(bLat as number)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

/** Human distance, or nothing at all rather than a fake precision. */
export function distanceLabel(km: number | null): string {
  if (km === null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km} km away`;
}

/**
 * Nearest branch to a point, when both are known.
 *
 * Returns null rather than a guess when nothing has coordinates — a "nearest"
 * that is really "first in the list" would send someone the wrong way.
 */
export function nearestLocation(
  locations: BusinessLocation[],
  lat: number | null | undefined,
  lng: number | null | undefined,
): { location: BusinessLocation; km: number } | null {
  let best: { location: BusinessLocation; km: number } | null = null;
  for (const l of locations || []) {
    const km = distanceKm(lat, lng, l.latitude, l.longitude);
    if (km === null) continue;
    if (!best || km < best.km) best = { location: l, km };
  }
  return best;
}

/** A branch row ready to save, with the blanks normalised to null. */
export function normaliseLocation(draft: Partial<BusinessLocation>): Partial<BusinessLocation> {
  const trim = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s || null;
  };
  return {
    name: (draft.name || '').trim().slice(0, 80) || 'Branch',
    address: trim(draft.address),
    phone: trim(draft.phone),
    opening_hours: trim(draft.opening_hours),
    timezone: trim(draft.timezone),
    // '' from a select must become null, not an invalid enum value the CHECK
    // constraint would reject.
    open_status: draft.open_status === 'open' || draft.open_status === 'closed' ? draft.open_status : null,
    is_primary: !!draft.is_primary,
  };
}
