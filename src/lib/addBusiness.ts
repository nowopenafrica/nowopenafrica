// AddBusiness — the pure decisions behind /add-business.
//
// No React, no supabase, no side effects. The database owns every write
// (`submit_business`), this module owns what the form asks, what it refuses,
// and what it says afterwards — so all of that is testable without a browser
// or a network.
//
// WHY THE SUBMISSION TYPE IS THE FIRST QUESTION
//
// "I own this", "I work for them" and "I like this place" produce completely
// different records: the first two create a business with a pending claim, the
// third creates nothing but a review candidate. Asking last would mean either
// re-validating everything or quietly discarding answers. Asking first lets the
// rest of the form be honest about what it is collecting and why.

export type SubmissionType = 'owner' | 'representative' | 'recommendation';

export interface SubmissionTypeSpec {
  key: SubmissionType;
  label: string;
  blurb: string;
  /** What actually happens, said plainly before they invest seven steps. */
  outcome: string;
}

export const SUBMISSION_TYPES: readonly SubmissionTypeSpec[] = [
  {
    key: 'owner',
    label: 'My business',
    blurb: 'I own or run this business.',
    outcome:
      'Creates your profile with a claim in your name. You can edit it straight away; the verified badge comes after verification.',
  },
  {
    key: 'representative',
    label: 'A business I represent',
    blurb: 'I work for them, or manage their marketing.',
    outcome:
      'Creates the profile and records your relationship. Full ownership needs the owner to confirm it.',
  },
  {
    key: 'recommendation',
    label: 'Recommend a business',
    blurb: 'I am a customer or I just think they should be here.',
    outcome:
      'Sends it to our review queue. It does not create a profile in your name, and it stays unclaimed until the owner claims it.',
  },
] as const;

export function submissionTypeSpec(t: SubmissionType): SubmissionTypeSpec {
  return SUBMISSION_TYPES.find((s) => s.key === t) ?? SUBMISSION_TYPES[0];
}

/** The relationships a representative may declare. Free text invites nonsense. */
export const RELATIONSHIPS = [
  'Employee',
  'Marketing agency',
  'Social media manager',
  'Brand manager',
  'Partner',
  'Other',
] as const;

export const BUSINESS_TYPES = [
  'Business', 'Brand', 'Freelancer', 'Professional', 'Organization',
  'Store', 'Agency', 'Creator', 'Nonprofit', 'Other',
] as const;

// ─────────────────────────────────────────────────────────────────────────
// The form's shape
// ─────────────────────────────────────────────────────────────────────────

export interface SubmissionDraft {
  submission_type: SubmissionType;
  relationship?: string;

  name: string;
  business_type?: string;
  country?: string;
  region?: string;
  city?: string;
  category: string;
  subcategory?: string;

  tagline?: string;
  description?: string;
  about?: string;
  service_area?: string;
  languages?: string[];

  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  address?: string;
  landmark?: string;
  google_maps_url?: string;

  social_links?: Record<string, string>;

  opening_hours?: string;
  is_24_hours?: boolean;
  appointment_only?: boolean;
  temporarily_closed?: boolean;

  logo_url?: string;
  image_url?: string;

  /** Privacy: what may be shown publicly. Everything defaults to hidden. */
  show_phone?: boolean;
  show_email?: boolean;
  show_whatsapp?: boolean;
  show_full_address?: boolean;
}

export interface Consents {
  accuracy_confirmed: boolean;
  review_understood: boolean;
  ownership_not_implied: boolean;
  terms_accepted: boolean;
  media_rights_confirmed: boolean;
}

export const EMPTY_CONSENTS: Consents = {
  accuracy_confirmed: false,
  review_understood: false,
  ownership_not_implied: false,
  terms_accepted: false,
  media_rights_confirmed: false,
};

export type StepKey =
  | 'type' | 'identity' | 'about' | 'contact' | 'hours' | 'media' | 'review';

export interface StepSpec {
  key: StepKey;
  title: string;
  /** Recommendations skip most of the form: they are a tip, not a profile. */
  skipForRecommendation?: boolean;
}

export const STEPS: readonly StepSpec[] = [
  { key: 'type',     title: 'What are you adding?' },
  { key: 'identity', title: 'Business identity' },
  { key: 'about',    title: 'About the business', skipForRecommendation: true },
  { key: 'contact',  title: 'Contact and location' },
  { key: 'hours',    title: 'Hours and availability', skipForRecommendation: true },
  { key: 'media',    title: 'Logo and cover', skipForRecommendation: true },
  { key: 'review',   title: 'Review and submit' },
] as const;

/**
 * The steps this submission actually has to complete.
 *
 * A person recommending their favourite restaurant does not know its founding
 * year, does not have its logo, and will abandon a seven-step form. Asking them
 * for a name, a city and a phone number is the whole job.
 */
export function stepsFor(type: SubmissionType): StepSpec[] {
  return STEPS.filter((s) => type !== 'recommendation' || !s.skipForRecommendation);
}

// ─────────────────────────────────────────────────────────────────────────
// Validation — mirrors submit_business(), never replaces it
// ─────────────────────────────────────────────────────────────────────────

/**
 * These checks exist so the user hears about a problem on the step that caused
 * it, not as a database error after seven steps. The function re-checks every
 * one of them server-side; a client that skipped this would be refused there.
 */
export function stepError(step: StepKey, d: SubmissionDraft): string | null {
  if (step === 'identity') {
    const name = (d.name ?? '').trim();
    if (name.length < 2) return 'What is the business called?';
    if (name.length > 160) return 'That name is too long for a profile.';
    // Recommendations go to radar_candidates, where category is optional —
    // somebody recommending a shop should not have to classify it.
    if (d.submission_type !== 'recommendation' && !(d.category ?? '').trim()) {
      return 'Choose a category so customers can find it.';
    }
    if (d.submission_type === 'representative' && !(d.relationship ?? '').trim()) {
      return 'How are you connected to this business?';
    }
  }

  if (step === 'contact') {
    const hasContact = [d.phone, d.whatsapp, d.email, d.website, d.address]
      .some((v) => (v ?? '').trim().length > 0);
    if (!hasContact) {
      return 'Add at least one way to reach them — a phone number, an address or a website.';
    }
    const email = (d.email ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return 'That email address does not look right.';
    }
    const site = (d.website ?? '').trim();
    if (site && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/.test(site)) {
      return 'That website address does not look right.';
    }
  }

  return null;
}

/** Which consents this submission type must have before Submit does anything. */
export function requiredConsents(type: SubmissionType, d: SubmissionDraft): (keyof Consents)[] {
  const required: (keyof Consents)[] = ['accuracy_confirmed', 'terms_accepted'];
  if (type === 'recommendation') required.push('ownership_not_implied');
  if ((d.logo_url ?? '') || (d.image_url ?? '')) required.push('media_rights_confirmed');
  return required;
}

export function consentError(type: SubmissionType, d: SubmissionDraft, c: Consents): string | null {
  for (const key of requiredConsents(type, d)) {
    if (!c[key]) return CONSENT_LABEL[key];
  }
  return null;
}

export const CONSENT_LABEL: Record<keyof Consents, string> = {
  accuracy_confirmed: 'Confirm the information is accurate to the best of your knowledge.',
  review_understood: 'Understand that NowOpen may review this information.',
  ownership_not_implied: 'Confirm you are not claiming to own this business.',
  terms_accepted: 'Accept the terms and privacy policy.',
  media_rights_confirmed: 'Confirm you have the rights to the images you attached.',
};

// ─────────────────────────────────────────────────────────────────────────
// Privacy — nothing personal is published unless it is asked for
// ─────────────────────────────────────────────────────────────────────────

/**
 * Strip contact details the submitter did not agree to publish.
 *
 * A sole trader's business phone IS their personal phone. Defaulting to public
 * would publish a personal number because a checkbox was left alone, so the
 * payload sent to the server carries only what was positively chosen.
 *
 * Applied before the payload leaves the browser: a value never sent cannot be
 * published by a later bug.
 */
export function applyPrivacy(d: SubmissionDraft): SubmissionDraft {
  const out: SubmissionDraft = { ...d };
  if (!d.show_phone) delete out.phone;
  if (!d.show_whatsapp) delete out.whatsapp;
  if (!d.show_email) delete out.email;
  if (!d.show_full_address) delete out.address;
  return out;
}

/**
 * The payload for `submit_business`, built explicitly.
 *
 * Explicitly, because the RPC reads named keys and a spread would send the
 * privacy flags, the consent state and anything a future field adds to the
 * draft — data the server has no use for and no reason to hold.
 */
export function toPayload(d: SubmissionDraft): Record<string, unknown> {
  const p = applyPrivacy(d);
  const location = [p.city, p.region, p.country].filter(Boolean).join(', ');
  return {
    name: (p.name ?? '').trim(),
    category: (p.category ?? '').trim() || undefined,
    subcategory: p.subcategory || undefined,
    business_type: p.business_type || undefined,
    location: location || undefined,
    city: p.city || undefined,
    address: p.address || undefined,
    tagline: p.tagline || undefined,
    description: p.description || undefined,
    about: p.about || undefined,
    service_area: p.service_area || undefined,
    languages: p.languages?.length ? p.languages : undefined,
    phone: p.phone || undefined,
    whatsapp: p.whatsapp || undefined,
    email: p.email || undefined,
    website: p.website || undefined,
    google_maps_url: p.google_maps_url || undefined,
    social_links: p.social_links && Object.keys(p.social_links).length ? p.social_links : undefined,
    opening_hours: p.opening_hours || undefined,
    logo_url: p.logo_url || undefined,
    image_url: p.image_url || undefined,
    temporarily_closed: p.temporarily_closed || undefined,
    relationship: p.relationship || undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Campaign attribution
// ─────────────────────────────────────────────────────────────────────────

/** Campaign slugs are a label on a flyer, never an identifier for a person. */
export function readCampaign(search: string): string | null {
  const raw = new URLSearchParams(search).get('campaign');
  if (!raw) return null;
  const slug = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 48);
  return slug || null;
}

/**
 * Anything that looks like a person is refused rather than trimmed.
 *
 * `?campaign=` is written by whoever makes the link, and a well-meaning
 * colleague pasting a customer's email into it would otherwise put that address
 * in the database and in analytics. The brief forbids personal data in URLs;
 * this enforces it rather than trusting the link-maker.
 */
export function isSafeCampaignValue(raw: string | null | undefined): boolean {
  if (!raw) return true;
  if (raw.includes('@')) return false;
  if (/\d{7,}/.test(raw)) return false;           // phone-number shaped
  if (/[0-9a-f]{8}-[0-9a-f]{4}/i.test(raw)) return false;  // a uuid
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// After the submission
// ─────────────────────────────────────────────────────────────────────────

export interface SubmissionResult {
  business_id?: string | null;
  candidate_id?: string | null;
  username?: string | null;
  submission_type?: string;
  profile_state?: string;
  claim_status?: string;
  status?: string;
  duplicate_of_submission?: boolean;
}

/** Honest headline for what actually happened. Never "verified", never "live". */
export function resultHeadline(r: SubmissionResult): string {
  if (r.duplicate_of_submission) return 'You have already submitted this business';
  if (r.candidate_id && !r.business_id) return 'Thank you — your recommendation is with our team';
  if (r.profile_state === 'published') return 'Your business is on NowOpen Africa';
  return 'Your business has been submitted';
}

export function resultDetail(r: SubmissionResult): string {
  if (r.candidate_id && !r.business_id) {
    return 'We review every recommendation before it appears, so the business stays unclaimed until an authorised person claims it. Nothing has been created in your name.';
  }
  if (r.profile_state === 'published') {
    return 'Your profile is live. It shows as awaiting ownership verification until you verify — that badge is what customers trust, so it is worth doing next.';
  }
  return 'Your profile has been created and is waiting for review before it appears in the directory. You can keep editing it in the meantime.';
}

/**
 * How complete the profile is, on the same 100-point scale as the database's
 * generated `listing_score`, so the number the user sees is the number that
 * decides whether their page gets indexed.
 */
export function completeness(d: SubmissionDraft): number {
  let score = 0;
  if ([d.phone, d.whatsapp, d.email].some((v) => (v ?? '').trim())) score += 25;
  if ((d.opening_hours ?? '').trim() || d.is_24_hours) score += 20;
  if ((d.address ?? '').trim()) score += 15;
  if ((d.about ?? '').trim() || (d.description ?? '').trim()) score += 15;
  if ((d.logo_url ?? '').trim() || (d.image_url ?? '').trim()) score += 15;
  if ((d.website ?? '').trim()) score += 5;
  score += 5;  // a signed-in submitter is always the owner of the record
  return Math.min(100, score);
}

/** The one thing most worth doing next, by what it adds to the score. */
export function nextBestAction(d: SubmissionDraft): string | null {
  if (![d.phone, d.whatsapp, d.email].some((v) => (v ?? '').trim())) {
    return 'Add a phone number — it is the single biggest thing customers look for.';
  }
  if (!((d.opening_hours ?? '').trim() || d.is_24_hours)) {
    return 'Add your opening hours so you appear in "Open now" searches.';
  }
  if (!(d.logo_url ?? '').trim() && !(d.image_url ?? '').trim()) {
    return 'Add a logo or a photo — profiles with an image get noticeably more visits.';
  }
  if (!(d.about ?? '').trim() && !(d.description ?? '').trim()) {
    return 'Describe what you do, in your own words.';
  }
  return null;
}
