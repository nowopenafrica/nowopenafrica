// Brand identity for the Brand OS (formerly Brand Kit).
//
// This is the single source of truth Studio references everywhere: tagline,
// mission, vision, story, brand promise, brand voice and keywords. Every
// generated asset (guidelines, email signature, letterhead, banners) reads
// from here. Persisted per business in localStorage.
//
// Editable from Brand OS → Brand Identity. Nothing here touches the business
// row — it's the *brand layer* on top of the profile.

export interface BrandIdentity {
  /** One-line promise/positioning shown across assets. */
  tagline: string;
  mission: string;
  vision: string;
  story: string;
  /** The core promise, e.g. "Our meat is always fresh." */
  brandPromise: string;
  /** Year the business was established (for the brand story). */
  established: string;
  /** Selected brand-voice trait keys (see BRAND_VOICE_TRAITS). */
  voice: string[];
  /** Writing-style key (see WRITING_STYLES). */
  writingStyle: string;
  /** Comma-separated keywords AI should weave into content. */
  keywords: string;
}

export const DEFAULT_BRAND_IDENTITY: BrandIdentity = {
  tagline: '',
  mission: '',
  vision: '',
  story: '',
  brandPromise: '',
  established: '',
  voice: [],
  writingStyle: 'professional',
  keywords: '',
};

export const BRAND_VOICE_TRAITS: { key: string; label: string }[] = [
  { key: 'friendly', label: 'Friendly' },
  { key: 'luxury', label: 'Luxury' },
  { key: 'professional', label: 'Professional' },
  { key: 'bold', label: 'Bold' },
  { key: 'youthful', label: 'Youthful' },
  { key: 'funny', label: 'Funny' },
];

export const WRITING_STYLES: { key: string; label: string }[] = [
  { key: 'professional', label: 'Professional' },
  { key: 'relaxed', label: 'Relaxed' },
  { key: 'short', label: 'Short & Punchy' },
  { key: 'corporate', label: 'Corporate' },
  { key: 'luxury', label: 'Luxury' },
  { key: 'street', label: 'Street' },
];

export const voiceTraitLabel = (key: string) =>
  BRAND_VOICE_TRAITS.find((t) => t.key === key)?.label ?? key;

export const writingStyleLabel = (key: string) =>
  WRITING_STYLES.find((s) => s.key === key)?.label ?? key;

// One-click Brand Voice preview — the same thought written in every tone so
// owners can *hear* their brand before committing to it.
export interface VoiceSample {
  tone: string;
  text: string;
}

export function voicePreview(business: { name: string; category: string }, identity: BrandIdentity): VoiceSample[] {
  const n = business.name;
  const c = business.category || 'business';
  const tag = identity.tagline.trim();
  return [
    { tone: 'Normal', text: tag || `${n} — ${c} you can rely on.` },
    { tone: 'Professional', text: `Premium ${c}, delivered with care.` },
    { tone: 'Luxury', text: `Curated ${c}, sourced for discerning customers.` },
    { tone: 'Street', text: `${c}. Better prices.` },
    { tone: 'Funny', text: `You'll smell dinner before you see us.` },
  ];
}

const keyFor = (businessId: string) => `nowopen-brand-identity-${businessId}`;

export function loadBrandIdentity(businessId: string): BrandIdentity {
  try {
    const raw = localStorage.getItem(keyFor(businessId));
    if (!raw) return { ...DEFAULT_BRAND_IDENTITY };
    return { ...DEFAULT_BRAND_IDENTITY, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BRAND_IDENTITY };
  }
}

export function saveBrandIdentity(businessId: string, identity: BrandIdentity) {
  try {
    localStorage.setItem(keyFor(businessId), JSON.stringify(identity));
  } catch {
    /* storage unavailable — the edit just won't persist */
  }
}

export function resetBrandIdentity(businessId: string) {
  try {
    localStorage.removeItem(keyFor(businessId));
  } catch {
    /* ignore */
  }
}
