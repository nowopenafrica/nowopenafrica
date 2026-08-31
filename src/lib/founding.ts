/**
 * The Founding 1,000.
 *
 * A permanent, numbered status for the first 1,000 businesses that are
 * genuinely finished. The distinction that matters: it rewards completed and
 * verified businesses, not registrations. Rewarding registration rewards empty
 * listings — somebody creates ten shells for ten badges and the badge then
 * certifies nothing.
 *
 * Qualification is enforced in the database (founding_qualifies) and the number
 * comes from a sequence there. Everything here is presentation: what to show,
 * what is still missing, and how to talk about it.
 */

export const FOUNDING_CAP = 1000;
export const FOUNDING_INNER_CIRCLE = 100;

export type FoundingTier = 'founding-100' | 'founding-1000' | null;

export interface FoundingMember {
  business_id: string;
  number: number;
  qualified_at?: string | null;
}

/**
 * Which tier a number falls in.
 *
 * The first hundred get their own name so there is a reason to move now,
 * without the remaining nine hundred feeling like an afterthought — they are
 * still Founding Businesses, permanently.
 */
export function tierOf(number: number | null | undefined): FoundingTier {
  if (!number || number < 1 || number > FOUNDING_CAP) return null;
  return number <= FOUNDING_INNER_CIRCLE ? 'founding-100' : 'founding-1000';
}

export function tierLabel(tier: FoundingTier): string {
  if (tier === 'founding-100') return 'Founding 100';
  if (tier === 'founding-1000') return 'Founding Business';
  return '';
}

/** "Founding No. 00347" — zero-padded, so the badge is a fixed width. */
export function foundingNumberLabel(number: number): string {
  return `Founding No. ${String(number).padStart(5, '0')}`;
}

export interface FoundingProgress {
  taken: number;
  remaining: number;
  /** 0–100, for the bar. */
  percent: number;
  full: boolean;
}

/**
 * The campaign counter.
 *
 * Fed by a real count — the brief's own condition, and the right one. A
 * hard-coded "347 claimed" is a fabricated scarcity claim shown to the exact
 * people being asked to trust the platform, and it is the sort of thing that
 * is noticed once and remembered.
 */
export function foundingProgress(taken: number): FoundingProgress {
  const safe = Math.max(0, Math.min(taken, FOUNDING_CAP));
  return {
    taken: safe,
    remaining: FOUNDING_CAP - safe,
    percent: Math.round((safe / FOUNDING_CAP) * 100),
    full: safe >= FOUNDING_CAP,
  };
}

/**
 * How to describe the state of the campaign truthfully at any point.
 *
 * Including at zero. "0 of 1,000 claimed" reads as an empty room, so an
 * un-started campaign says it is open rather than announcing its own emptiness
 * — but it never claims a number it does not have.
 */
export function progressLabel(p: FoundingProgress): string {
  if (p.full) return 'All 1,000 founding spots have been claimed';
  if (p.taken === 0) return 'Founding spots are open';
  return `${p.taken.toLocaleString()} of ${FOUNDING_CAP.toLocaleString()} claimed · ${p.remaining.toLocaleString()} left`;
}

export interface FoundingRequirement {
  key: string;
  label: string;
  done: boolean;
}

interface QualifyInput {
  user_id?: string | null;
  verified?: boolean | null;
  name?: string | null;
  category?: string | null;
  location?: string | null;
  about?: string | null;
  description?: string | null;
  opening_hours?: string | null;
  hours?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
}

/**
 * The checklist, mirroring founding_qualifies() in the database.
 *
 * Duplicated on purpose: the database is the authority and refuses a spot on
 * its own terms, but a business owner needs to SEE which step is outstanding.
 * "You do not qualify" with no reason is the fastest way to lose somebody who
 * was two fields away.
 */
export function foundingRequirements(b: QualifyInput): FoundingRequirement[] {
  const has = (...vals: (string | null | undefined)[]) =>
    vals.some((v) => typeof v === 'string' && v.trim() !== '');
  return [
    { key: 'owned', label: 'Business claimed by you', done: !!b.user_id },
    { key: 'verified', label: 'Verified business', done: !!b.verified },
    { key: 'name', label: 'Business name', done: has(b.name) },
    { key: 'category', label: 'Category', done: has(b.category) },
    { key: 'location', label: 'Location', done: has(b.location) },
    { key: 'about', label: 'About your business', done: has(b.about, b.description) },
    { key: 'hours', label: 'Opening hours', done: has(b.opening_hours, b.hours) },
    { key: 'contact', label: 'Phone or email', done: has(b.phone, b.email) },
    { key: 'image', label: 'Logo or cover photo', done: has(b.logo_url, b.image_url) },
  ];
}

export function qualifiesForFounding(b: QualifyInput): boolean {
  return foundingRequirements(b).every((r) => r.done);
}

/** What is still outstanding, for the nudge. */
export function foundingGaps(b: QualifyInput): FoundingRequirement[] {
  return foundingRequirements(b).filter((r) => !r.done);
}
