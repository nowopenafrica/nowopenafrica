// Business Trust & Verification model.
//
// Two related ideas:
//  - a discrete *verification tier* (none → Bronze → Silver → Gold → Platinum),
//    earned by clearing verification signals an admin has confirmed, and
//  - a continuous *Trust Score* (0–100) that also rewards profile quality,
//    reviews and tenure — a richer credibility picture than a single badge.
//
// The signals live on the `businesses` row (email_verified, phone_verified,
// id_verified, registration_verified, address_verified, documents_reviewed,
// onsite_verified) and are set only by an admin reviewer (a DB trigger blocks
// self-verification). Everything here is a pure function of the row.

export type Tier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

export interface TierMeta {
  key: Tier;
  label: string;
  rank: number;
  // Tailwind classes for a badge (static strings so JIT keeps them).
  badge: string;
  ring: string;
  blurb: string;
}

export const TIERS: Record<Tier, TierMeta> = {
  none: {
    key: 'none', label: 'Unverified', rank: 0,
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    ring: 'text-gray-400',
    blurb: 'Not yet verified.',
  },
  bronze: {
    key: 'bronze', label: 'Bronze', rank: 1,
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    ring: 'text-amber-600',
    blurb: 'Email & phone verified.',
  },
  silver: {
    key: 'silver', label: 'Silver', rank: 2,
    badge: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    ring: 'text-slate-500',
    blurb: 'Identity & business registration verified.',
  },
  gold: {
    key: 'gold', label: 'Gold', rank: 3,
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    ring: 'text-yellow-500',
    blurb: 'Address confirmed & documents reviewed.',
  },
  platinum: {
    key: 'platinum', label: 'Platinum', rank: 4,
    badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    ring: 'text-indigo-500',
    blurb: 'On-site (or trusted-partner) verified.',
  },
};

// Minimal shape we read — kept loose so it accepts the dashboard's `any` rows.
export interface TrustSignals {
  email_verified?: boolean;
  phone_verified?: boolean;
  id_verified?: boolean;
  registration_verified?: boolean;
  address_verified?: boolean;
  documents_reviewed?: boolean;
  onsite_verified?: boolean;
  // profile-quality inputs
  description?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
  location?: string | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  rating?: number | null;
  created_at?: string | null;
}

export function deriveTier(b: TrustSignals): Tier {
  const contact = !!b.email_verified && !!b.phone_verified;
  const identity = !!b.id_verified && !!b.registration_verified;
  const docs = !!b.address_verified && !!b.documents_reviewed;
  if (contact && identity && docs && b.onsite_verified) return 'platinum';
  if (contact && identity && docs) return 'gold';
  if (contact && identity) return 'silver';
  if (contact) return 'bronze';
  return 'none';
}

export interface ScoreBreakdown {
  label: string;
  earned: number;
  max: number;
}

// 0–100, with a transparent breakdown for the owner UI.
export function computeTrustScore(b: TrustSignals, now: number = 0): { score: number; breakdown: ScoreBreakdown[] } {
  const breakdown: ScoreBreakdown[] = [];
  const add = (label: string, earned: number, max: number) => breakdown.push({ label, earned: Math.round(earned), max });

  // Verification signals — 70 pts
  add('Email verified', b.email_verified ? 5 : 0, 5);
  add('Phone verified', b.phone_verified ? 5 : 0, 5);
  add('Identity verified', b.id_verified ? 15 : 0, 15);
  add('Business registration', b.registration_verified ? 15 : 0, 15);
  add('Address confirmed', b.address_verified ? 10 : 0, 10);
  add('Documents reviewed', b.documents_reviewed ? 10 : 0, 10);
  add('On-site verified', b.onsite_verified ? 10 : 0, 10);

  // Profile completeness — 15 pts
  const fields = [b.description, b.logo_url, b.image_url, b.location, b.phone, b.website, b.email];
  const filled = fields.filter((f) => !!(f && String(f).trim())).length;
  add('Profile completeness', (filled / fields.length) * 15, 15);

  // Reviews quality — 10 pts (uses the stored average rating)
  const rating = Number(b.rating) || 0;
  add('Customer reviews', rating > 0 ? (rating / 5) * 10 : 0, 10);

  // Tenure — 5 pts (roughly +1 per 2 months, capped)
  let tenure = 0;
  if (b.created_at && now) {
    const months = (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
    tenure = Math.max(0, Math.min(5, Math.floor(months / 2)));
  }
  add('Time on platform', tenure, 5);

  const score = Math.max(0, Math.min(100, breakdown.reduce((s, x) => s + x.earned, 0)));
  return { score, breakdown };
}

// The ordered verification checklist an owner works through, and which tier
// each step unlocks — drives the dashboard checklist + admin review toggles.
export interface VerificationStep {
  key: 'email_verified' | 'phone_verified' | 'id_verified' | 'registration_verified' | 'address_verified' | 'documents_reviewed' | 'onsite_verified';
  label: string;
  detail: string;
  tier: Tier;
}

export const VERIFICATION_STEPS: VerificationStep[] = [
  { key: 'email_verified', label: 'Email verified', detail: 'Confirm the business email address', tier: 'bronze' },
  { key: 'phone_verified', label: 'Phone verified', detail: 'Confirm the business phone via OTP', tier: 'bronze' },
  { key: 'id_verified', label: 'Owner identity verified', detail: 'Passport, national ID or driver’s license + selfie', tier: 'silver' },
  { key: 'registration_verified', label: 'Business registration', detail: 'Company registration / CAC document', tier: 'silver' },
  { key: 'address_verified', label: 'Address confirmed', detail: 'Proof of the physical business address', tier: 'gold' },
  { key: 'documents_reviewed', label: 'Documents reviewed', detail: 'Submitted documents checked by our team', tier: 'gold' },
  { key: 'onsite_verified', label: 'On-site verification', detail: 'In-person or trusted-partner confirmation', tier: 'platinum' },
];

// Document types an owner can upload for review.
export const DOC_TYPES: { value: string; label: string }[] = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's license" },
  { value: 'selfie', label: 'Selfie / liveness photo' },
  { value: 'company_registration', label: 'Company registration (CAC)' },
  { value: 'tax_id', label: 'Tax identification' },
  { value: 'address_proof', label: 'Proof of address' },
];
