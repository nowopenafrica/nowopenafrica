/**
 * Feature flags — the operational kill switches.
 *
 * What they are for: if Live, Offers, ordering or AI video misbehaves in front
 * of real customers, one toggle takes that surface down instead of the whole
 * platform.
 *
 * WHAT THEY ARE NOT: permissions. Turning a flag off hides a surface; it does
 * not protect anything. Every authorisation decision stays in RLS, where a
 * client that ignores the flag cannot get past it. Treating a flag as a
 * security control is how a hidden button becomes an open endpoint.
 */

export type FlagKey =
  | 'offers' | 'keeps' | 'live' | 'bookings' | 'ordering'
  | 'studio_video' | 'ai_director' | 'campaigns' | 'adverts'
  | 'outbound_email' | 'outbound_whatsapp' | 'payments';

export interface FeatureFlag {
  key: FlagKey;
  enabled: boolean;
  label: string;
  description: string | null;
  default_when_unreachable: boolean;
}

/**
 * What each flag does when the table cannot be read at all.
 *
 * Mirrors the database column, and exists so a cold start with no network still
 * has an answer rather than a blank screen.
 *
 * Almost everything is ON: a connectivity blip must not disable the product,
 * and an operator reaching for a kill switch has a working database by
 * definition — they just used the console to flip it.
 *
 * The exception is anything that spends money or reaches a customer. There,
 * silence is the safe failure: not sending is recoverable, sending is not.
 */
export const FALLBACK: Record<FlagKey, boolean> = {
  offers: true,
  keeps: true,
  live: true,
  bookings: true,
  ordering: true,
  studio_video: true,
  ai_director: true,
  campaigns: true,
  adverts: true,
  outbound_email: false,
  outbound_whatsapp: false,
  payments: false,
};

export type FlagMap = Record<string, boolean>;

/**
 * Turn rows from the table into the map the app reads.
 *
 * Takes a loose row shape on purpose: the table is the source of truth and may
 * carry a flag this build has never heard of — a newer deploy elsewhere, or one
 * added ahead of the code. Those are kept rather than dropped, so an operator
 * can create and use a flag without waiting for a release.
 */
export function toFlagMap(rows: Array<{ key: string; enabled: boolean }> | null | undefined): FlagMap {
  const map: FlagMap = { ...FALLBACK };
  for (const row of rows ?? []) map[row.key] = !!row.enabled;
  return map;
}

/**
 * Is this surface on?
 *
 * An unknown key returns true. A flag that has not been created yet must not
 * silently disable a working feature — the failure mode of a typo should be a
 * feature that stays on, not one that disappears with no error anywhere.
 */
export function isEnabled(flags: FlagMap | null | undefined, key: FlagKey | string): boolean {
  if (!flags) return FALLBACK[key as FlagKey] ?? true;
  if (!(key in flags)) return FALLBACK[key as FlagKey] ?? true;
  return flags[key];
}

/** The flags an operator would reach for first, in the order they matter. */
export const KILL_SWITCH_ORDER: FlagKey[] = [
  'payments', 'outbound_email', 'outbound_whatsapp',
  'ordering', 'bookings', 'live',
  'ai_director', 'studio_video', 'adverts', 'offers', 'campaigns', 'keeps',
];

/**
 * A short, plain sentence about what turning this off will do.
 *
 * Written for the moment somebody is reaching for it under pressure, when
 * "disables the offers module" is less useful than knowing what a customer will
 * see.
 */
export const CONSEQUENCE: Record<FlagKey, string> = {
  offers: 'The Offers page and offer publishing disappear. Existing offers stop showing on profiles.',
  keeps: 'Customers can no longer keep businesses. Existing Keeps are untouched.',
  live: 'The Live tab disappears from every profile. Any broadcast in progress ends.',
  bookings: 'Booking buttons disappear. Existing bookings are untouched.',
  ordering: 'Cart and ordering disappear. Existing orders are untouched.',
  studio_video: 'Reel, Video and Motion studios stop loading. These are the heaviest bundles on the platform.',
  ai_director: 'AI creative generation stops. Everything already generated is kept.',
  campaigns: 'The Founding 1,000 page and referral links stop working.',
  adverts: 'The ad placements marketplace disappears.',
  outbound_email: 'No automated email leaves the platform. Reminders and nudges silently stop.',
  outbound_whatsapp: 'No automated WhatsApp leaves the platform.',
  payments: 'Checkout stops. Nobody can pay, and no subscription renews.',
};
