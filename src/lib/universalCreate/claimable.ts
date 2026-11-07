/**
 * "Is this your business?" — the Radar→Create link.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * NowOpen Radar discovers businesses before their owners arrive. MEASURED
 * 2026-10-06: 3,208 of 3,210 listings have no owner. So the most likely thing
 * a new business owner can do on NowOpen is create a second copy of a listing
 * that is already here — because nothing told them it was.
 *
 * This asks instead. It is a question, never an assertion: the person may have
 * nothing to do with the listing, and a confident "we found your business"
 * that turns out to be somebody else's is worse than not asking.
 *
 * ── NO LOGIC HERE, ON PURPOSE ────────────────────────────────────────────
 *
 * The matching is `claimable_for_me()` in Postgres. It takes no user id, acts
 * on auth.uid(), and matches only GoTrue-CONFIRMED email or phone — so a
 * profile field somebody can type cannot be used to fish for listings. A
 * matcher written here would be client code deciding whose business is whose.
 */

import { supabase } from '../supabase';

export interface ClaimableMatch {
  id: string;
  name: string;
  location: string | null;
  category: string | null;
  imageUrl: string | null;
  /** Which confirmed channel matched — shown so the prompt is explicable. */
  matchedOn: 'email' | 'phone';
}

/**
 * Unclaimed listings that match the signed-in person's confirmed contact
 * details. Empty for everyone else, including signed-out visitors.
 *
 * Returns [] on error rather than throwing: this is a helpful extra on a
 * screen whose job is something else, and a failed lookup must not stop
 * somebody creating a business.
 */
export async function fetchClaimableForMe(): Promise<ClaimableMatch[]> {
  const { data, error } = await supabase.rpc('claimable_for_me');
  if (error) return [];

  return ((data ?? []) as Array<Record<string, string | null>>).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    location: r.location ?? null,
    category: r.category ?? null,
    imageUrl: r.image_url ?? null,
    matchedOn: (r.matched_on === 'phone' ? 'phone' : 'email'),
  }));
}

/**
 * How the prompt is worded.
 *
 * Deliberately interrogative. "We found your business" asserts a relationship
 * the platform cannot know — the match is one shared contact detail, which is
 * good evidence and not proof. Claiming still goes through review.
 */
export function claimPromptFor(match: ClaimableMatch): string {
  const where = match.location ? ` in ${match.location}` : '';
  const how = match.matchedOn === 'email'
    ? 'it lists your email address'
    : 'it lists your phone number';
  return `${match.name}${where} is already on NowOpen, and ${how}. Is it yours?`;
}
