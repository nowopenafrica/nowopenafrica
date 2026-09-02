/**
 * The Founding 1,000 campaign — everything that is a decision rather than a
 * layout.
 *
 * The rule the whole file exists to enforce: the campaign never invents social
 * proof. Every number shown comes from campaign_stats(), which counts rows, and
 * when there is nothing to count the page says so. A fabricated "742 already
 * joined" is shown to precisely the people being asked to trust the platform,
 * and it is the kind of thing that is noticed once and remembered.
 *
 * Today's real figures are 11 users and 32 businesses against targets of 1,000
 * and 300. Small numbers are a reason to say "you're early", not a reason to
 * make some up.
 */

export const CAMPAIGN_SLUG = 'founding-1000';
export const CAMPAIGN_PATH = '/campaign/founding-1000';

export type CampaignStatus = 'draft' | 'scheduled' | 'live' | 'paused' | 'ended';

export interface CampaignStats {
  slug: string;
  name: string;
  status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  target_users: number;
  target_businesses: number;
  hero_headline: string | null;
  hero_subcopy: string | null;
  users: number;
  businesses: number;
  claimed: number;
  founding: number;
  cities: number;
  categories: number;
  offers: number;
}

export interface Progress {
  count: number;
  target: number;
  remaining: number;
  /** 0–100, for the bar. */
  percent: number;
  full: boolean;
}

export function progress(count: number, target: number): Progress {
  const t = Math.max(1, target);
  const c = Math.max(0, Math.min(count, t));
  return {
    count: c,
    target: t,
    remaining: t - c,
    percent: Math.round((c / t) * 100),
    full: c >= t,
  };
}

/**
 * How to describe progress truthfully at any value.
 *
 * At zero it says the doors are opening rather than announcing "0 of 1,000",
 * which reads as an empty room and is the number most likely to be seen on day
 * one. It never rounds up and never pads.
 */
export function progressLabel(p: Progress, noun: string): string {
  if (p.full) return `All ${p.target.toLocaleString()} ${noun} places are taken`;
  if (p.count === 0) return `Opening now — be the first`;
  return `${p.count.toLocaleString()} of ${p.target.toLocaleString()} ${noun}`;
}

/**
 * Should the counter be shown at all?
 *
 * Below a handful, a progress bar pinned at 1% communicates nothing except how
 * early it is — which the copy already says better. The threshold is honesty in
 * both directions: it hides a discouraging bar, and it never hides a real one
 * to make things look better than they are.
 */
export const COUNTER_MIN = 5;

export function showCounter(stats: CampaignStats | null): boolean {
  if (!stats) return false;
  if (stats.status === 'draft' || stats.status === 'scheduled') return false;
  return stats.users >= COUNTER_MIN || stats.businesses >= COUNTER_MIN;
}

/** What the page should say about itself, given the campaign's state. */
export type CampaignPhase = 'preparing' | 'open' | 'paused' | 'closed';

export function phaseOf(stats: CampaignStats | null, now: Date = new Date()): CampaignPhase {
  if (!stats) return 'preparing';
  if (stats.status === 'ended') return 'closed';
  if (stats.status === 'paused') return 'paused';
  if (stats.status === 'draft') return 'preparing';
  if (stats.status === 'scheduled') {
    return stats.starts_at && Date.parse(stats.starts_at) <= now.getTime() ? 'open' : 'preparing';
  }
  // live
  if (stats.ends_at && Date.parse(stats.ends_at) < now.getTime()) return 'closed';
  return 'open';
}

/**
 * Whether joining is possible right now.
 *
 * A closed campaign must not keep showing a join button — the page becomes a
 * dead end that takes somebody's enthusiasm and returns an error.
 */
export function canJoin(phase: CampaignPhase): boolean {
  return phase === 'open' || phase === 'preparing';
}

// ------------------------------------------------------------------ referrals

/** A referral code is short, unambiguous and upper-case. */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const code = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Codes are six characters; anything else is a typo or someone probing.
  return code.length === 6 ? code : null;
}

export function referralLink(code: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}${CAMPAIGN_PATH}?ref=${encodeURIComponent(code)}`;
}

/**
 * The message that actually gets forwarded.
 *
 * Written for WhatsApp, where this campaign will mostly live: short enough to
 * read in a preview, no marketing throat-clearing, and it says what the
 * recipient gets rather than what NowOpen wants.
 */
export function inviteMessage(link: string, kind: 'person' | 'business'): string {
  return kind === 'business'
    ? `Your business should be on NowOpen Africa — get discovered, show when you're open, and connect with customers. Join here: ${link}`
    : `I'm on NowOpen Africa — find what's open near you, discover local businesses and keep the ones you like. Join here: ${link}`;
}

export interface ShareTarget {
  key: 'whatsapp' | 'copy' | 'x' | 'facebook' | 'linkedin';
  label: string;
  href?: string;
}

/**
 * Share targets, WhatsApp first.
 *
 * Deliberately ordered rather than alphabetical: in this market WhatsApp is not
 * one option among five, it is how a link travels. Copy-link is second because
 * it works everywhere, including apps this list does not know about.
 */
export function shareTargets(link: string, message: string): ShareTarget[] {
  const text = encodeURIComponent(message);
  const url = encodeURIComponent(link);
  return [
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${text}` },
    { key: 'copy', label: 'Copy link' },
    { key: 'x', label: 'X', href: `https://x.com/intent/post?text=${text}` },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}` },
  ];
}

export interface Circle {
  invited: number;
  activated: number;
}

/** The next milestone worth aiming at, given how many have activated. */
export const MILESTONES = [1, 3, 10, 25, 50] as const;

export function nextMilestone(activated: number): number | null {
  return MILESTONES.find((m) => m > activated) ?? null;
}

/**
 * What a referrer is told.
 *
 * "Activated" is stated in terms of what the person did, not the word
 * "activated", because a referrer needs to understand why an invite has not
 * counted yet — otherwise a working system looks broken.
 */
export function circleLabel(c: Circle): string {
  if (c.invited === 0) return 'Nobody yet — share your link to start your circle';
  if (c.activated === 0) {
    return `${c.invited} joined. They count once they keep a business or add their own.`;
  }
  return `${c.activated} of ${c.invited} have started using NowOpen`;
}

// ------------------------------------------------------------------ campaign

/** The four phases of the launch. Phases, never claimed as achievements. */
export const TIMELINE = [
  { week: 'Week 1', title: 'Open the doors', goal: 'First businesses and the earliest explorers.' },
  { week: 'Week 2', title: 'Get discovered', goal: 'Business claims, and customers finding them.' },
  { week: 'Week 3', title: 'Keep the good ones', goal: 'Keeps, referrals and the first offers.' },
  { week: 'Week 4', title: 'Africa is NowOpen', goal: 'Scale the network city by city.' },
] as const;

/**
 * What NowOpen actually does today, for the "why" section.
 *
 * Every entry maps to a route that exists and a feature that works. Nothing
 * aspirational — a campaign that promises a feature the product does not have
 * converts once and then costs a refund and a reputation.
 */
export const PILLARS = [
  { key: 'discover', title: 'Discover', body: 'Find businesses by what you need, where you are and what is open.', href: '/discover' },
  { key: 'open-now', title: 'Open Now', body: 'Know who is open before you make the trip.', href: '/open-now' },
  { key: 'keep', title: 'Keep', body: 'Keep the businesses you rely on and stay connected to them.', href: '/keeps' },
  { key: 'offers', title: 'Offers', body: 'See what businesses are running right now.', href: '/offers' },
  { key: 'grow', title: 'Grow', body: 'Businesses get a profile, customer contact, offers and NowOpen Studio.', href: '/studio' },
] as const;

/** The owner's path, in the order it actually happens in the product. */
export const BUSINESS_JOURNEY = [
  { step: 'Create', body: 'Add your business, or claim the page that is already there.' },
  { step: 'Show', body: 'Say what you sell, where you are and when you are open.' },
  { step: 'Connect', body: 'Customers find you, keep you and get in touch.' },
  { step: 'Promote', body: 'Publish offers people can act on today.' },
  { step: 'Grow', body: 'Use Studio and the business tools to stay visible.' },
] as const;
