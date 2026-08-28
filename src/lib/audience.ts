/**
 * Which of the two products someone is using right now.
 *
 * NowOpen is two experiences on one network. A business is trying to acquire
 * customers; a person is trying to find and keep businesses. Those are
 * different jobs, so they get different navigation and different home screens,
 * and the two are never interleaved into one menu.
 *
 * The complication is that they are not different PEOPLE. A restaurant owner
 * eats at other restaurants. So this is not a permission check and must never
 * become one — it is a view preference, and everyone can hold both.
 *
 * Ownership decides the default, not `users.role`. Role is a signup answer that
 * can be stale the moment someone adds their first business; owning a row in
 * `businesses` is the fact. Someone who registered as a business but never
 * listed one is, for now, a person browsing — and showing them an empty
 * dashboard as their home would be wrong.
 */
export type Audience = 'people' | 'business';

const KEY = 'nowopen.audience';

export interface AudienceInput {
  /** Businesses this account owns. */
  ownedBusinesses: number;
  /** Media-service listings this account owns. */
  ownedMediaServices?: number;
  /** users.role, used only as a tie-breaker before anything is listed. */
  role?: string | null;
  /** An explicit switch, if they have used it. */
  preference?: Audience | null;
}

/** True when this account has something to manage. */
export function isSeller(input: AudienceInput): boolean {
  return (input.ownedBusinesses ?? 0) > 0 || (input.ownedMediaServices ?? 0) > 0;
}

/**
 * Someone who owns nothing gets the people experience even if they registered
 * as a business — until they list something, there is nothing to manage, and
 * the seller nav would be a menu of empty rooms. `role` only breaks the tie for
 * an admin, who should land where they work.
 */
export function resolveAudience(input: AudienceInput): Audience {
  // An explicit choice always wins, but only if it is still available to them:
  // someone who deleted their last business cannot sit in the business view.
  if (input.preference === 'business' && isSeller(input)) return 'business';
  if (input.preference === 'people') return 'people';
  if (isSeller(input)) return 'business';
  if (input.role === 'admin') return 'business';
  return 'people';
}

/** Only somebody who is both can be offered the switch. */
export function canSwitchAudience(input: AudienceInput): boolean {
  return isSeller(input);
}

export function readAudiencePreference(): Audience | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'people' || v === 'business' ? v : null;
  } catch {
    return null;
  }
}

export function writeAudiencePreference(a: Audience): void {
  try {
    localStorage.setItem(KEY, a);
  } catch {
    /* private mode; the default is good enough */
  }
}

export function clearAudiencePreference(): void {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to do */ }
}
