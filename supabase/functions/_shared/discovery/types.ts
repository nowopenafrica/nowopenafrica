/**
 * Shared types for the discovery engine (Phase 2).
 *
 * Mirrored from src/lib/acquire/adapter.ts's RawCandidate contract: a
 * candidate is raw until it is normalised, and every field has per-field
 * evidence recorded at the moment of extraction — see §8 in the source
 * adapter. These files run both under Vitest (pure TS) and as a Deno edge
 * function, and must not import anything from src/, which is browser-bundled.
 */

/** How a field's value was obtained — the same vocabulary as adapter.ts. */
export type ExtractionMethod =
  | 'structured_data'
  | 'dom_extraction'
  | 'regex'
  | 'api'
  | 'ai_extracted'
  | 'ai_inferred';

export interface EvidencePoint {
  method: ExtractionMethod;
  sourceUrl: string;
  confidence: number;
}

/** A candidate as a source yields it, before normalization. */
export interface RawCandidate {
  /** The source's own id, so a re-run updates rather than duplicates. */
  sourceRecordId: string;
  /** Where this came from — the evidence anchor for everything below. */
  sourceUrl: string;
  name: string;
  category?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  /**
   * Required, not optional. Record-level provenance cannot answer "why do we
   * believe this phone number", and an adapter that returns fields without
   * saying how it got them makes that question unanswerable for ever.
   */
  evidence: Record<string, EvidencePoint>;
}

/** The Wikidata fold's richer shape, ready for radar_candidates columns. */
export interface WikidataCandidate extends RawCandidate {
  qid: string;
  category: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Socials arrive as handles; stored for the normalizer, not as links. */
  profile: Record<string, string>;
}

/**
 * Any fold that produces radar_candidates columns (category, coordinates,
 * profile). Wikidata sets `qid`; sources without one (OpenStreetMap) leave it
 * unset and the worker uses `sourceRecordId` as the dedupe key.
 */
export interface DiscoveryCandidate extends RawCandidate {
  qid?: string;
  category: string;
  latitude?: number | null;
  longitude?: number | null;
  profile: Record<string, string>;
}

/** One row of radar_candidate_evidence — a field, its value, and how we got it. */
export interface CandidateEvidenceRow {
  evidence_field: string;
  field_value: string;
  source_key: string;
  method: ExtractionMethod;
  source_url: string | null;
  confidence: number;
  owner_confirmed: boolean;
  can_auto_update: boolean;
}

/** What finish_discovery_run records for one source after a run. */
export type SourceHealth = {
  key: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  error: string | null;
};