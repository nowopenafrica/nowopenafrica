/**
 * The business story: what a page holds, what it shows, and what is missing.
 *
 * Two jobs, both pure so they can be tested without a browser or a database.
 *
 *   1. Reading the jsonb columns safely. They are owner-entered and arrive as
 *      `unknown`; a page that throws on a malformed value is worse than one
 *      that shows a section short.
 *
 *   2. Deciding what to ASK for. A page that demands Vision and Mission from a
 *      one-person laundry is a page that gets abandoned half-filled, so the
 *      completeness meter only counts fields that category actually needs.
 */

export interface ProfileStory {
  tagline?: string | null;
  about?: string | null;
  story?: string | null;
  vision?: string | null;
  mission?: string | null;
  core_values?: unknown;
  why_us?: unknown;
  faqs?: unknown;
  team?: unknown;
  credentials?: unknown;
  policies?: unknown;
  languages?: unknown;
  payment_methods?: unknown;
  social_links?: unknown;
  founded_year?: number | null;
  employees?: string | null;
  business_type?: string | null;
  service_area?: string | null;
  whatsapp?: string | null;
}

/* --- Reading owner-entered JSON ------------------------------------------ */

/** A list of non-empty strings, whatever the column actually contained. */
export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v !== '');
}

export interface Faq { q: string; a: string }

/** FAQs with both halves present — a question with no answer helps nobody. */
export function faqList(value: unknown): Faq[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((f) => (f && typeof f === 'object' ? f as Record<string, unknown> : {}))
    .map((f) => ({
      q: typeof f.q === 'string' ? f.q.trim() : '',
      a: typeof f.a === 'string' ? f.a.trim() : '',
    }))
    .filter((f) => f.q !== '' && f.a !== '');
}

export interface TeamMember { name: string; role?: string; photo_url?: string; bio?: string }

export function teamList(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((m) => (m && typeof m === 'object' ? m as Record<string, unknown> : {}))
    .map((m) => ({
      name: typeof m.name === 'string' ? m.name.trim() : '',
      role: typeof m.role === 'string' ? m.role.trim() || undefined : undefined,
      photo_url: typeof m.photo_url === 'string' ? m.photo_url.trim() || undefined : undefined,
      bio: typeof m.bio === 'string' ? m.bio.trim() || undefined : undefined,
    }))
    .filter((m) => m.name !== '');
}

export interface Credential { label: string; year?: number; issuer?: string }

export function credentialList(value: unknown): Credential[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((c) => (c && typeof c === 'object' ? c as Record<string, unknown> : {}))
    .map((c) => ({
      label: typeof c.label === 'string' ? c.label.trim() : '',
      year: typeof c.year === 'number' && Number.isFinite(c.year) ? c.year : undefined,
      issuer: typeof c.issuer === 'string' ? c.issuer.trim() || undefined : undefined,
    }))
    .filter((c) => c.label !== '');
}

/** Policy keys with actual text behind them. */
export function policyEntries(value: unknown): { key: string; text: string }[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([key, v]) => ({ key, text: typeof v === 'string' ? v.trim() : '' }))
    .filter((p) => p.text !== '');
}

/** Social links that are actually links. */
export function socialEntries(value: unknown): { key: string; url: string }[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([key, v]) => ({ key, url: typeof v === 'string' ? v.trim() : '' }))
    // Anything that is not a URL would render as a link that goes nowhere.
    .filter((s) => /^https?:\/\/\S+$/i.test(s.url));
}

/** How long they have been trading, from the founding year. */
export function yearsInBusiness(foundedYear: number | null | undefined, now: Date): number | null {
  if (!foundedYear || !Number.isFinite(foundedYear)) return null;
  const years = now.getFullYear() - foundedYear;
  // A future year is a typo, and "0 years in business" is not a credential.
  return years >= 1 ? years : null;
}

/* --- Completeness --------------------------------------------------------- */

export interface ProfileField {
  key: string;
  label: string;
  /** Filled? */
  done: boolean;
  /** Weight in the score — identity counts more than a nice-to-have. */
  weight: number;
  /** What to do about it, if not done. */
  hint: string;
}

interface CompletenessInput extends ProfileStory {
  name?: string | null;
  description?: string | null;
  logo_url?: string | null;
  image_url?: string | null;
  phone?: string | null;
  location?: string | null;
  opening_hours?: string | null;
  hours?: string | null;
  category?: string | null;
  productCount?: number;
  serviceCount?: number;
  galleryCount?: number;
}

/**
 * Categories that genuinely benefit from a formal Vision and Mission.
 *
 * Asking a roadside mechanic for a mission statement is how a completeness
 * meter teaches people to ignore it. These are the categories where a customer
 * or partner plausibly looks for one.
 */
const WANTS_VISION = [
  'Non-profit & NGO', 'School & Education', 'International School', 'University & College',
  'Hospital & Clinic', 'Religious Organization', 'Community Association', 'Cooperative Society',
  'Consulting', 'Financial Services', 'Microfinance & SACCO', 'Manufacturing',
];

/** Categories where who does the work is the thing being bought. */
const WANTS_TEAM = [
  'Legal Services', 'Consulting', 'Accounting & Tax', 'Hospital & Clinic', 'Dental Care',
  'Salon / Barber', 'Spa & Beauty', 'Photography & Video', 'Architecture & Design',
  'Tailor & Fashion Designer', 'Business Coaching', 'Wellness & Therapy',
];

export function profileFields(b: CompletenessInput, now: Date = new Date()): ProfileField[] {
  const cat = (b.category ?? '').trim();
  const has = (v: unknown) => typeof v === 'string' && v.trim() !== '';

  const fields: ProfileField[] = [
    { key: 'logo', label: 'Logo', weight: 3, done: has(b.logo_url), hint: 'Add your logo so people recognise you' },
    { key: 'cover', label: 'Cover image', weight: 2, done: has(b.image_url), hint: 'Add a cover photo' },
    { key: 'tagline', label: 'Tagline', weight: 2, done: has(b.tagline), hint: 'One line on what you do' },
    { key: 'about', label: 'About', weight: 3, done: has(b.about) || has(b.description), hint: 'A short paragraph about the business' },
    { key: 'hours', label: 'Opening hours', weight: 3, done: has(b.opening_hours) || has(b.hours), hint: 'Without hours nobody can tell if you are open' },
    { key: 'location', label: 'Location', weight: 3, done: has(b.location), hint: 'Add where you are' },
    { key: 'phone', label: 'Phone', weight: 2, done: has(b.phone), hint: 'Add a number people can call' },
    { key: 'why_us', label: 'Why choose us', weight: 3, done: stringList(b.why_us).length >= 3, hint: 'List at least 3 reasons to pick you' },
    { key: 'faqs', label: 'FAQs', weight: 2, done: faqList(b.faqs).length >= 3, hint: 'Answer your 3 most common questions' },
    { key: 'story', label: 'Our story', weight: 1, done: has(b.story), hint: 'How the business started' },
    { key: 'values', label: 'Values', weight: 1, done: stringList(b.core_values).length > 0, hint: 'What you stand for' },
    { key: 'payments', label: 'Payment methods', weight: 1, done: stringList(b.payment_methods).length > 0, hint: 'How customers can pay' },
  ];

  // Only ask for a catalogue where there is something to catalogue.
  if ((b.productCount ?? 0) >= 0 || (b.serviceCount ?? 0) >= 0) {
    fields.push({
      key: 'catalogue',
      label: 'Products or services',
      weight: 3,
      done: (b.productCount ?? 0) + (b.serviceCount ?? 0) > 0,
      hint: 'Add at least one product or service',
    });
  }
  fields.push({
    key: 'gallery', label: 'Gallery', weight: 2,
    done: (b.galleryCount ?? 0) >= 3,
    hint: 'Add 3 or more photos',
  });

  if (WANTS_VISION.includes(cat)) {
    fields.push({ key: 'vision', label: 'Vision', weight: 2, done: has(b.vision), hint: 'Where the organisation is going' });
    fields.push({ key: 'mission', label: 'Mission', weight: 2, done: has(b.mission), hint: 'What it exists to do' });
  }
  if (WANTS_TEAM.includes(cat)) {
    fields.push({ key: 'team', label: 'Team', weight: 2, done: teamList(b.team).length > 0, hint: 'Introduce whoever does the work' });
  }
  // Years trading is a credential in its own right, so ask once it is plausible.
  fields.push({
    key: 'founded', label: 'Year founded', weight: 1,
    done: yearsInBusiness(b.founded_year, now) !== null,
    hint: 'Years in business builds trust',
  });

  return fields;
}

export interface Completeness {
  percent: number;
  done: ProfileField[];
  missing: ProfileField[];
  /** The few worth doing next, heaviest first. */
  next: ProfileField[];
}

export function profileCompleteness(b: CompletenessInput, now: Date = new Date()): Completeness {
  const fields = profileFields(b, now);
  const total = fields.reduce((n, f) => n + f.weight, 0);
  const earned = fields.filter((f) => f.done).reduce((n, f) => n + f.weight, 0);
  const missing = fields.filter((f) => !f.done);
  return {
    // Rounded down: 99% should not read as finished when something is missing.
    percent: total === 0 ? 100 : Math.floor((earned / total) * 100),
    done: fields.filter((f) => f.done),
    missing,
    // Three at a time. A list of twelve chores gets none of them done.
    next: [...missing].sort((a, b2) => b2.weight - a.weight).slice(0, 3),
  };
}

/* --- Which sections to render --------------------------------------------- */

export type SectionKey =
  | 'about' | 'why_us' | 'products' | 'services' | 'gallery' | 'live' | 'reviews'
  | 'team' | 'faqs' | 'locations' | 'hours' | 'contact' | 'policies' | 'info' | 'credentials';

/**
 * A section appears only when it has something in it.
 *
 * The brief's own warning, and the right rule: a page of empty headings tells a
 * visitor the business could not be bothered, which is the opposite of what a
 * profile is for. Nothing here is category-gated — a category cannot know
 * whether THIS business wrote an FAQ, and the content already knows.
 */
export function visibleSections(b: CompletenessInput & {
  productCount?: number; serviceCount?: number; galleryCount?: number;
  reviewCount?: number; locationCount?: number; isLive?: boolean;
}): SectionKey[] {
  const has = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  const out: SectionKey[] = [];

  if (has(b.about) || has(b.description) || has(b.story) || has(b.vision) || has(b.mission)
      || stringList(b.core_values).length > 0) out.push('about');
  if (stringList(b.why_us).length > 0) out.push('why_us');
  if ((b.productCount ?? 0) > 0) out.push('products');
  if ((b.serviceCount ?? 0) > 0) out.push('services');
  if ((b.galleryCount ?? 0) > 0) out.push('gallery');
  if (b.isLive) out.push('live');
  if ((b.reviewCount ?? 0) > 0) out.push('reviews');
  if (credentialList(b.credentials).length > 0) out.push('credentials');
  if (teamList(b.team).length > 0) out.push('team');
  if (faqList(b.faqs).length > 0) out.push('faqs');
  if ((b.locationCount ?? 0) > 0) out.push('locations');
  if (has(b.opening_hours) || has(b.hours)) out.push('hours');
  out.push('contact');
  if (policyEntries(b.policies).length > 0) out.push('policies');
  if (b.founded_year || has(b.business_type) || has(b.service_area)
      || stringList(b.languages).length > 0 || stringList(b.payment_methods).length > 0) out.push('info');

  return out;
}
