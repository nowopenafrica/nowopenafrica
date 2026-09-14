// The engine's POLICY layer: decide what to WRITE.
//
// Everything upstream (identity, hours, text extraction) answers "what did a
// source say". This module answers the second, harder question: given what a
// source said and what we believe we know, what rows does the executor
// actually create? The executor itself never reasons — it writes exactly what
// `buildDeliverables` returns. That keeps the autonomy policy in one testable
// place instead of buried in an edge function.

import type { BusinessEvidence } from './types.ts';
import { sameValue } from './identity.ts';
import type { ExtractObservation } from './schema.ts';
import type { HoursResolution } from './hours.ts';

/** The subset of businesses the policy reads. */
export interface PolicyBusiness {
  id: string;
  name: string;
  claim_status?: string | null;
  /** Column name → current value (for history + no-change detection). */
  fields: Record<string, string | null | undefined>;
  social_links?: Record<string, string> | null;
  ownerConfirmed: boolean;
}

export interface PolicySource {
  key: string;
  url: string;
  sourceType: string;
}

export interface PolicyPrefs {
  autoApplyHours?: boolean;
  approvalThreshold?: number;
  confirm24Hours?: boolean;
}

export interface EvidenceDraft {
  field_name: string;
  field_value: string;
  source_id: string;
  source_url: string;
  source_type: string;
  confidence: number;
  observed_at: string;
  extraction_method: BusinessEvidence['extraction_method'];
  generated_by_ai: boolean;
  ai_model?: string | null;
  status: BusinessEvidence['status'];
}

export interface ProposalDraft {
  field_name: string;
  current_value: string | null;
  proposed_value: string;
  source_id: string;
  source_url: string;
  confidence: number;
  extraction_method: BusinessEvidence['extraction_method'];
  reason: string;
}

export interface MediaDraft {
  asset_type: 'logo' | 'cover' | 'gallery';
  source_id: string;
  source_url: string;
  source_uri: string;
  match_confidence: number;
  matching_signal: { fields: string[]; exact: boolean };
  rights_decision: 'licensed' | 'permission_obtained' | 'conservative_default' | 'no_rights' | 'unchecked';
  licence: string | null;
  rights_owner: string | null;
  jurisdiction: string | null;
  criticality: 'critical' | 'non_critical' | 'mandatory';
  moderation_status: 'pending' | 'approved' | 'rejected';
  keep_url_only: boolean;
  status: 'discovered' | 'match_confirmed';
  caption?: string | null;
}

export interface Deliverables {
  evidence: EvidenceDraft[];
  proposals: ProposalDraft[];
  media: MediaDraft[];
  /** One-line audit trail for the job result. */
  notes: string[];
}

/** Fields the applier can actually write this phase (string + social jsonb). */
const WRITABLE = new Set([
  'description', 'category', 'address', 'location', 'phone', 'whatsapp', 'email',
  'website', 'logo_url', 'image_url', 'opening_hours', 'tagline', 'about', 'story',
  'mission', 'vision', 'subcategory', 'business_type', 'employees', 'service_area',
  'timezone', 'founded_year', 'social_links',
]);

/** The floor below which we record evidence but never propose. */
export const PROPOSE_FLOOR = 30;

/** Fixed placement confidence for a licensed stock placeholder (Pexels): the
 *  asset is plausibly on-topic because we searched for it and its licence is
 *  solid, but it does not verifiably depict the business. 60 is high enough
 *  that the platform's unclaimed bar (60) applies it, and low enough that an
 *  owner's default bar (80) holds it for review. This is placement confidence,
 *  deliberately independent of the registry's match score. */
export const STOCK_PLACEHOLDER_CONFIDENCE = 60;

/** The floor below which licensed media never becomes a field proposal. */
export const IMAGE_PROPOSE_FLOOR = 50;

/** Registry asset types that map to a writable business field (gallery has no
 *  field — it stays registry-only). */
const MEDIA_TO_FIELD: Record<string, string | undefined> = {
  logo: 'logo_url',
  cover: 'image_url',
  gallery: undefined,
};

export function buildDeliverables(input: {
  business: PolicyBusiness;
  source: PolicySource;
  hours?: HoursResolution | null;
  /** Structured observations, e.g. from the AI resolver. */
  observations?: ExtractObservation[];
  /** Normalised social links flat record { instagram, facebook, x, … }. */
  social?: Record<string, string>;
  /** Fields that already have a pending proposal — never duplicate them. */
  pendingFields?: Set<string>;
  prefs?: PolicyPrefs;
  now?: string;
}): Deliverables {
  const {
    business, source, hours = null, observations = [], social = {},
    pendingFields = new Set<string>(), prefs = {}, now = new Date().toISOString(),
  } = input;

  const evidence: EvidenceDraft[] = [];
  const proposals: ProposalDraft[] = [];
  const notes: string[] = [];

  const pending = (field: string) => pendingFields.has(field);
  const record = (draft: Omit<EvidenceDraft, 'observed_at'>) => {
    evidence.push({ ...draft, observed_at: now });
  };
  const propose = (
    field: string, value: string, current: string | null,
    confidence: number, method: BusinessEvidence['extraction_method'], reason: string,
  ) => {
    if (current && sameValue(current, value)) {
      notes.push(`${field}: matches stored value, nothing to propose.`);
      return;
    }
    if (confidence < (prefs.approvalThreshold ?? PROPOSE_FLOOR)) {
      notes.push(`${field}: recorded but below proposal floor (${confidence}).`);
      return;
    }
    if (pending(field)) {
      notes.push(`${field}: already pending, not duplicated.`);
      return;
    }
    proposals.push({
      field_name: field,
      current_value: current,
      proposed_value: value,
      source_id: source.key,
      source_url: source.url,
      confidence,
      extraction_method: method,
      reason,
    });
  };

  // 1. Hours ---------------------------------------------------------------
  if (hours && hours.kind === 'proposal' && hours.proposedText) {
    const current = business.fields.opening_hours ?? business.fields.hours ?? null;
    record({
      field_name: 'opening_hours',
      field_value: hours.proposedText,
      source_id: source.key,
      source_url: source.url,
      source_type: source.sourceType,
      confidence: hours.confidence,
      extraction_method: 'structured_data',
      generated_by_ai: false,
      status: 'source_confirmed',
    });
    propose('opening_hours', hours.proposedText, current, hours.confidence, 'structured_data', hours.reason);
  } else if (hours && hours.kind !== 'no_change' && hours.kind !== 'default_remains') {
    notes.push(hours.reason);
  }

  // 2. AI-extracted text fields --------------------------------------------
  for (const obs of observations) {
    record({
      field_name: obs.field,
      field_value: obs.value,
      source_id: source.key,
      source_url: source.url,
      source_type: source.sourceType,
      confidence: obs.confidence,
      extraction_method: obs.method === 'ai_inferred' ? 'ai_inferred' : 'ai_extracted',
      generated_by_ai: true,
      ai_model: obs.method === 'ai_inferred' ? 'ai_inferred' : undefined,
      status: obs.method === 'ai_inferred' ? 'ai_inferred' : 'single_source',
    });
    if (obs.confidence > 0 && WRITABLE.has(obs.field)) {
      propose(obs.field, obs.value, business.fields[obs.field] ?? null, obs.confidence, 'ai_extracted', `AI read this on ${source.url} (${source.key}).`);
    } else {
      notes.push(`${obs.field}: evidence only (${obs.method}).`);
    }
  }

  // 3. Social links ----------------------------------------------------------
  const platforms = Object.keys(social).filter((p) => social[p]);
  if (platforms.length) {
    const currentSocial = business.social_links ?? {};
    const changed = platforms.filter((p) => (currentSocial[p] ?? '') !== social[p]);
    const valueToStore = JSON.stringify(social);
    record({
      field_name: 'social_links',
      field_value: valueToStore,
      source_id: source.key,
      source_url: source.url,
      source_type: source.sourceType,
      confidence: platforms.length >= 2 ? 40 : 30,
      extraction_method: 'dom_extraction',
      generated_by_ai: false,
      status: 'source_confirmed',
    });
    if (changed.length) {
      propose('social_links', valueToStore, Object.keys(currentSocial).length ? JSON.stringify(currentSocial) : null, platforms.length >= 2 ? 40 : 30, 'dom_extraction', `Source lists ${platforms.join(', ')}.`);
    } else {
      notes.push('social_links: platforms already stored.');
    }
  }

  return { evidence, proposals, media: [], notes };
}

/**
 * Turn LICENSED media from this run into field proposals. This is what lets a
 * licensed stock cover (Pexels) reach the business's image_url/logo_url slot
 * without a person in the loop WHILE staying honest: the proposal is clearly
 * labelled a licensed placeholder, the registry row records the weak match,
 * and whether it ever APPLIES is decided elsewhere — the platform's unclaimed
 * bar for businesses nobody owns, or the owner's stored bar for claimed ones.
 * unlicensed (conservative_default) media never lifts: that is the recorded
 * "we cannot verify who owns this" boundary.
 */
export function liftLicensedMediaToFields(input: {
  business: PolicyBusiness;
  media: MediaDraft[];
  /** Source type recorded on the evidence rows (mirrors PolicySource.sourceType). */
  sourceType?: string;
  pendingFields?: Set<string>;
  now?: string;
}): Pick<Deliverables, 'evidence' | 'proposals' | 'notes'> {
  const { business, media, sourceType = 'api', pendingFields = new Set<string>(), now = new Date().toISOString() } = input;

  const evidence: EvidenceDraft[] = [];
  const proposals: ProposalDraft[] = [];
  const notes: string[] = [];

  for (const draft of media) {
    const want = MEDIA_TO_FIELD[draft.asset_type];
    if (!want || STOCK_PLACEHOLDER_CONFIDENCE < IMAGE_PROPOSE_FLOOR) continue;

    if (draft.rights_decision !== 'licensed' || !draft.licence) {
      notes.push(`${draft.asset_type}: rights not placeable (${draft.rights_decision}); registry only.`);
      continue;
    }

    const current = business.fields[want] ?? null;
    if (current) {
      notes.push(`${want}: business already has a value; media recorded only.`);
      continue;
    }
    if (pendingFields.has(want)) {
      notes.push(`${want}: already pending, not duplicated.`);
      continue;
    }

    evidence.push({
      field_name: want,
      field_value: draft.source_uri,
      source_id: draft.source_id,
      source_url: draft.source_url,
      source_type: sourceType,
      confidence: STOCK_PLACEHOLDER_CONFIDENCE,
      observed_at: now,
      extraction_method: 'api',
      generated_by_ai: false,
      status: 'source_confirmed',
    });
    proposals.push({
      field_name: want,
      current_value: current,
      proposed_value: draft.source_uri,
      source_id: draft.source_id,
      source_url: draft.source_url,
      confidence: STOCK_PLACEHOLDER_CONFIDENCE,
      extraction_method: 'api',
      reason: `Licensed stock placeholder (${draft.licence}) for the ${draft.asset_type} slot; replace it with the real ${draft.asset_type} when you claim or upload.`,
    });
    notes.push(`${want}: lifted licensed ${draft.asset_type} to a proposal (${draft.source_uri}).`);
  }

  return { evidence, proposals, notes };
}

/** Surface-only helper: a shutoff for empty runs. */
export function isEmpty(deliverables: Deliverables): boolean {
  return deliverables.evidence.length === 0
    && deliverables.proposals.length === 0
    && deliverables.media.length === 0;
}