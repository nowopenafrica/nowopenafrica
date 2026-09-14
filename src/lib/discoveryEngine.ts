/**
 * Business Discovery & Claim Engine — Phase 1 workspace logic.
 *
 * The database systems (radar candidates, evidence, claims, suppression) all
 * predate this file. What this adds is the CAMPAIGN that scopes a run and the
 * classification that decides what a campaign may publish — wrapping the one
 * existing publish gate instead of forking it, so the workspace answers a
 * question the engine was already asked.
 *
 * One boundary repeated from radar: these scores decide whether a record may
 * reach the public directory. They say nothing about who owns it. A campaign
 * can publish an UNCLAIMED shell; it can never create an owner.
 */

import { DEFAULT_THRESHOLDS, publishGate, type GateThresholds } from './radar/confidence';
import { sourceGate, type RadarSource } from './radar/sources';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export interface CampaignFilters {
  has_website?: boolean;
  has_social?: boolean;
  has_phone?: boolean;
  has_whatsapp?: boolean;
  has_email?: boolean;
  has_address?: boolean;
  has_coordinates?: boolean;
  has_logo?: boolean;
  has_products?: boolean;
  has_services?: boolean;
  has_recent_activity?: boolean;
  has_storefront?: boolean;
  has_branches?: boolean;
  no_existing_profile?: boolean;
  has_unclaimed_profile?: boolean;
  min_confidence?: number;
  min_source_count?: number;
  min_freshness_days?: number;
}

export interface CampaignInput {
  name: string;
  countries: string[];
  regions: string[];
  cities: string[];
  neighborhoods: string[];
  categories: string[];
  services: string[];
  products: string[];
  filters: CampaignFilters;
  sourceKeys: string[];
  maxRecords: number | null;
  dailyLimit: number | null;
  budgetMax: number | null;
  reviewThreshold: number;
  autoPublishThreshold: number;
  outreachEnabled: boolean;
  outreachChannel: string | null;
  outreachApprovalRequired: boolean;
  startAt: string | null;
  endAt: string | null;
}

export function campaignDefaults(): CampaignInput {
  return {
    name: '',
    countries: [],
    regions: [],
    cities: [],
    neighborhoods: [],
    categories: [],
    services: [],
    products: [],
    filters: {},
    sourceKeys: [],
    maxRecords: null,
    dailyLimit: null,
    budgetMax: null,
    reviewThreshold: DEFAULT_THRESHOLDS.review,
    autoPublishThreshold: DEFAULT_THRESHOLDS.autoPublish,
    outreachEnabled: false,
    outreachChannel: null,
    outreachApprovalRequired: true,
    startAt: null,
    endAt: null,
  };
}

export interface CampaignTargets {
  countries: string[];
  regions: string[];
  cities: string[];
  neighborhoods: string[];
  categories: string[];
  services: string[];
  products: string[];
}

/** The selected target lists, as the campaign's own preview line. */
export function campaignTargetSummary(c: CampaignTargets): string {
  const parts: string[] = [];
  if (c.countries.length) parts.push(`${c.countries.length} countries`);
  if (c.regions.length) parts.push(`${c.regions.length} regions`);
  if (c.cities.length) parts.push(`${c.cities.length} cities`);
  if (c.neighborhoods.length) parts.push(`${c.neighborhoods.length} neighbourhoods`);
  if (c.categories.length) parts.push(`${c.categories.length} categories`);
  if (c.services.length) parts.push(`${c.services.length} services`);
  if (c.products.length) parts.push(`${c.products.length} products`);
  return parts.length ? parts.join(' · ') : 'No targets selected';
}

export interface CampaignError {
  field: string;
  message: string;
}

/**
 * Validate what an operator typed before a row is written.
 *
 * The database check constraints keep the numbers sane; this keeps the intent
 * sane — a campaign needs at least one geography and one subject, and outreach
 * cannot be switched on for a channel that is not named.
 */
export function validateCampaign(c: CampaignInput): CampaignError[] {
  const errors: CampaignError[] = [];
  if (!c.name.trim()) errors.push({ field: 'name', message: 'Give the campaign a name.' });
  if (
    c.countries.length + c.regions.length + c.cities.length + c.neighborhoods.length === 0
  ) {
    errors.push({ field: 'geography', message: 'Pick at least one country, region, city or neighbourhood.' });
  }
  if (c.categories.length + c.services.length + c.products.length === 0) {
    errors.push({ field: 'subject', message: 'Pick at least one category, service or product.' });
  }
  if (c.sourceKeys.length === 0) {
    errors.push({ field: 'sources', message: 'Pick at least one discovery source.' });
  }
  if (c.autoPublishThreshold < 50 || c.autoPublishThreshold > 100) {
    errors.push({ field: 'autoPublishThreshold', message: 'Auto-publish threshold must be 50–100.' });
  }
  if (c.reviewThreshold < 0 || c.reviewThreshold > c.autoPublishThreshold) {
    errors.push({ field: 'reviewThreshold', message: 'Review threshold must be 0–auto-publish threshold.' });
  }
  if ((c.maxRecords ?? 0) < 0 || (c.dailyLimit ?? 0) < 0 || (c.budgetMax ?? 0) < 0) {
    errors.push({ field: 'limits', message: 'Limits and budget cannot be negative.' });
  }
  if (c.outreachEnabled && !c.outreachChannel) {
    errors.push({ field: 'outreachChannel', message: 'Choose an outreach channel, or leave outreach off.' });
  }
  if (c.startAt && c.endAt && c.endAt < c.startAt) {
    errors.push({ field: 'dates', message: 'End date must be after the start date.' });
  }
  return errors;
}

/* ------------------------------------------------------------- the lists */

/** Countries the campaign builder offers. Curated from the acquisition brief. */
export const AFRICAN_COUNTRIES: string[] = [
  'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Rwanda', 'Uganda', 'Tanzania',
  'Ethiopia', 'Senegal', 'Côte dʼIvoire', 'Togo', 'Benin', 'Cameroon', 'Zambia',
  'Zimbabwe', 'Namibia', 'Botswana', 'Egypt', 'Morocco', 'Tunisia', 'Sierra Leone',
  'Liberia', 'Malawi', 'Mozambique', 'Mauritius', 'Other African countries',
];

export const CITIES: string[] = [
  'Lagos', 'Abuja', 'Ibadan', 'Port Harcourt', 'Calabar', 'Enugu', 'Onitsha', 'Awka',
  'Benin City', 'Kano', 'Kaduna', 'Accra', 'Kumasi', 'Nairobi', 'Mombasa',
  'Johannesburg', 'Cape Town', 'Durban', 'Kigali', 'Kampala', 'Dar es Salaam',
  'Cairo', 'Casablanca', 'Dakar', 'Abidjan',
];

export const NEIGHBORHOODS: string[] = [
  'Lekki', 'Victoria Island', 'Ikoyi', 'Ikeja', 'Yaba', 'Surulere', 'Lagos Island',
  'Maryland', 'Gbagada', 'Ajah', 'Wuse', 'Maitama', 'Asokoro', 'Garki', 'Jabi', 'Utako', 'Wuye',
];

export const CATEGORIES: string[] = [
  'Fashion & Apparel', 'Beauty & Hair', 'Food & Restaurants', 'Bakeries', 'Catering',
  'Real Estate', 'Retail & Shopping', 'Hospitality & Travel', 'Fitness & Wellness',
  'Automotive', 'Events & Entertainment', 'Health & Medical', 'Professional Services',
  'Home & Interior', 'Photography & Creative', 'Tech & Digital', 'Education', 'Logistics',
  'Construction', 'Agriculture & Food Supply', 'Finance & Insurance', 'Manufacturing',
  'Religious & Community', 'Legal', 'Sports', 'Beauty Products', 'Skincare',
  'Fashion Designers', 'Tailors', 'Barbers', 'Makeup Artists', 'Restaurants',
  'Food Vendors', 'Frozen Food', 'Supermarkets', 'Mechanics', 'Car Dealers',
  'Electronics', 'Furniture', 'Printing', 'Advertising', 'Branding', 'Video Production',
  'Motion Design', 'Web Design', 'Software', 'Other',
];

export const SERVICES: string[] = [
  'Tailoring', 'Custom clothing', 'Bridal wear', 'Hair styling', 'Makeup', 'Nails',
  'Skincare', 'Catering', 'Event planning', 'Photography', 'Videography', 'Branding',
  'Graphic design', 'Web design', 'Digital marketing', 'Logistics', 'Repairs',
  'Consulting', 'Interior design', 'Construction', 'Training', 'Coaching', 'Retail',
  'Wholesale', 'Manufacturing',
];

export const PRODUCTS: string[] = [
  'Dresses', 'Shoes', 'Bags', 'Fabrics', 'Cosmetics', 'Skincare products', 'Cakes',
  'Meals', 'Furniture', 'Electronics', 'Auto parts', 'Building materials',
  'Household goods', 'Digital products',
];

export const FILTER_OPTIONS: Array<{ key: keyof CampaignFilters; label: string }> = [
  { key: 'has_website', label: 'Has website' },
  { key: 'has_social', label: 'Has official social profile' },
  { key: 'has_phone', label: 'Has phone' },
  { key: 'has_whatsapp', label: 'Has WhatsApp' },
  { key: 'has_email', label: 'Has email' },
  { key: 'has_address', label: 'Has physical address' },
  { key: 'has_coordinates', label: 'Has location coordinates' },
  { key: 'has_logo', label: 'Has logo' },
  { key: 'has_products', label: 'Has product catalog' },
  { key: 'has_services', label: 'Has service list' },
  { key: 'has_recent_activity', label: 'Has recent activity' },
  { key: 'has_storefront', label: 'Has customer-facing storefront' },
  { key: 'has_branches', label: 'Has multiple branches' },
  { key: 'no_existing_profile', label: 'Has no existing NowOpen profile' },
  { key: 'has_unclaimed_profile', label: 'Has an unclaimed profile' },
];

export const OUTREACH_CHANNELS = [
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp Business' },
  { key: 'sms', label: 'SMS' },
  { key: 'instagram_interaction', label: 'Instagram (owner-initiated)' },
  { key: 'manual', label: 'Manual outreach' },
] as const;

/* ------------------------------------------------------------- classify */

/** A candidate as the queue sees it — the subset classification reads. */
export interface CandidateForGate {
  id: string;
  source_key: string;
  name: string;
  category: string | null;
  confidence: number;
  status: string;
  duplicate_of: string | null;
  published_business_id: string | null;
}

/** A radar_sources row mapped into the shape the Radar gate expects. */
export function toRadarSource(row: {
  key: string;
  name: string;
  active: boolean;
  automated_access?: string | null;
  bulk_extraction?: string | null;
  competing_dataset?: string | null;
  redistribution?: string | null;
  licence?: string | null;
  authorised_by?: string | null;
  authorised_at?: string | null;
  kind?: string;
}): RadarSource {
  return {
    key: row.key,
    name: row.name,
    kind: (row.kind ?? 'admin_import') as RadarSource['kind'],
    enabled: row.active,
    rights: {
      automatedAccess: (row.automated_access as 'permitted') ?? 'unknown',
      bulkExtraction: (row.bulk_extraction as 'permitted') ?? 'unknown',
      competingDataset: (row.competing_dataset as 'permitted') ?? 'unknown',
      redistribution: (row.redistribution as 'permitted') ?? 'unknown',
      licence: row.licence ?? null,
      authorisedBy: row.authorised_by ?? null,
      authorisedAt: row.authorised_at ?? null,
    },
  };
}

export type IngestDecision =
  | { action: 'auto-publish' | 'review' | 'hold' | 'reject'; reason: string };

export interface ClassifyInput {
  candidate: CandidateForGate;
  source: RadarSource | null;
  mode?: 'manual' | 'assisted' | 'autonomous';
  thresholds?: GateThresholds;
}

/**
 * What should happen to this candidate — the campaign's own copy of the gate
 * that Radar ships with. Kept as a wrapper rather than a second policy so a
 * campaign threshold difference cannot disagree with the queue.
 */
export function classifyCandidate(input: ClassifyInput): IngestDecision {
  if (input.candidate.published_business_id) {
    return { action: 'hold', reason: 'Already published — a re-run would update, not duplicate.' };
  }
  const effectiveSource: RadarSource = input.source ?? {
    key: input.candidate.source_key,
    name: 'Unknown',
    kind: 'admin_import',
    enabled: false,
    rights: { automatedAccess: 'unknown', bulkExtraction: 'unknown', competingDataset: 'unknown', redistribution: 'unknown', licence: null, authorisedBy: null, authorisedAt: null },
  };
  const decision = publishGate({
    confidence: input.candidate.confidence,
    mode: input.mode ?? 'manual',
    duplicate: input.candidate.duplicate_of ? 'match' : 'no-match',
    source: effectiveSource,
    thresholds: input.thresholds,
    category: input.candidate.category,
  });
  return decision;
}

/** Explainable source of a decision for the review screen. */
export function decisionReason(_candidate: CandidateForGate, source: RadarSource | null): string {
  const gate = sourceGate(source);
  if (gate.allowed) {
    return 'Allowed by the source gate — human decision required before publish.';
  }
  return gate.reason;
}

/* ------------------------------------------------------------ quality */

export interface QualityComponent {
  label: string;
  present: boolean;
  weight: number;
}

/**
 * The completeness side of a candidate, separate from confidence.
 *
 * The candidate's own `confidence` is Radar's exist-as-described score; this is
 * "how many of the fields a useful profile needs are actually populated" and it
 * deliberately does not weigh — it is display, not authority. Neither number is
 * ownership or verification.
 */
export function completenessBreakdown(c: CandidateForGate): { score: number; components: QualityComponent[] } {
  const fields: Array<[string, string | null | undefined, number]> = [
    ['name', c.name, 25],
    ['category', c.category, 15],
    ['source', c.source_key, 15],
    ['confidence', c.confidence >= 50 ? String(c.confidence) : null, 20],
    ['decision', c.duplicate_of ? 'duplicate' : c.status, 10],
    ['reproducible', String(true), 15],
  ];
  const components: QualityComponent[] = fields.map(([label, value, weight]) => ({
    label, weight,
    present: !!value && value.trim().length > 0,
  }));
  const score = Math.round(
    components.reduce((s, x) => s + (x.present ? x.weight : 0), 0),
  );
  return { score, components };
}