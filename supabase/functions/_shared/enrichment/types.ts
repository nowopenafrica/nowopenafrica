// Server-side row shapes for the enrichment engine.
//
// This file mirrors the migrations (2026091101xx – 2026091105xx) and the
// client's `src/types/enrichment.ts` so the edge function, the Vitest suite
// and the admin UI agree on one vocabulary. The migrations are the schema of
// record; these interfaces exist so the executor can't drift from the columns
// it writes.

/** Which field an evidence row describes. Free text, mirrors UPDATABLE_FIELDS
 *  in src/lib/imports/matchExisting.ts plus engine-only fields. */
export type EvidenceFieldName = string;

export interface BusinessEvidence {
  id: string;
  business_id: string;
  field_name: EvidenceFieldName;
  field_value?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  source_type?: string | null;
  /** Deterministic 0-100 score, not a probability. */
  confidence: number;
  observed_at: string;
  extraction_method:
    | 'structured_data'
    | 'dom_extraction'
    | 'regex'
    | 'api'
    | 'owner_submitted'
    | 'admin_entered'
    | 'csv_import'
    | 'ai_extracted'
    | 'ai_inferred';
  status:
    | 'owner_confirmed'
    | 'admin_verified'
    | 'source_confirmed'
    | 'multiple_sources'
    | 'single_source'
    | 'ai_inferred'
    | 'disputed'
    | 'superseded';
  generated_by_ai: boolean;
  ai_model?: string | null;
  superseded_at?: string | null;
  evidence_hash?: string | null;
  created_at: string;
}

export type MediaAssetType = 'logo' | 'cover' | 'gallery' | 'video' | 'document';
export type MediaAssetStatus =
  | 'discovered'
  | 'match_confirmed'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'removed';

export interface BusinessMediaAsset {
  id: string;
  business_id: string;
  asset_type: MediaAssetType;
  caption?: string | null;
  description?: string | null;
  keywords: string[];
  iconography?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  source_uri?: string | null;
  match_confidence: number;
  matching_signal: { fields?: string[]; exact?: boolean };
  rights_decision?:
    | 'licensed'
    | 'permission_obtained'
    | 'conservative_default'
    | 'no_rights'
    | 'unchecked'
    | null;
  licence?: string | null;
  rights_owner?: string | null;
  jurisdiction?: string | null;
  price?: string | null;
  criticality: 'critical' | 'non_critical' | 'mandatory';
  moderation_status: 'pending' | 'approved' | 'rejected';
  moderation_reason?: string | null;
  keep_url_only: boolean;
  hosted_url?: string | null;
  status: MediaAssetStatus;
  status_changed_at: string;
  conflicts_with?: string | null;
  conflict_note?: string | null;
  takedown_requested_at?: string | null;
  takedown_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export type EnrichmentJobType =
  | 'initial_enrichment'
  | 'profile_enrichment'
  | 'image_discovery'
  | 'hours_resolution'
  | 'reverification'
  | 'external_data_refresh'
  | 'website_check'
  | 'data_quality'
  | 'duplicate_detection'
  | 'closed_detection';

export interface BusinessEnrichmentJob {
  id: string;
  business_id: string;
  agent_key: string;
  job_type: EnrichmentJobType;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  priority: number;
  attempts: number;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
  reason?: string | null;
  run_cost_budget?: number | null;
  queue_reason?: string | null;
  run_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessChangeProposal {
  id: string;
  business_id: string;
  field_name: EvidenceFieldName;
  current_value?: string | null;
  proposed_value: string;
  source_id?: string | null;
  source_url?: string | null;
  confidence: number;
  extraction_method?: string | null;
  evidence_id?: string | null;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'superseded';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  note?: string | null;
  auto_applied: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessSyncPreferences {
  id: string;
  business_id: string;
  owner_id?: string | null;
  sync_enabled: boolean;
  auto_apply_hours: boolean;
  auto_apply_source_images: boolean;
  auto_apply_discovery_fields: boolean;
  notify_on_change: boolean;
  approval_threshold: number;
  confirm_24_hours: boolean;
  hours_override_reason?: string | null;
  created_at: string;
  updated_at: string;
}