// The NowOpen enrichment orchestrator.
//
// One pure function that takes a source's report about a business and answers
// "what would this engine write?" — used identically by the edge function
// (which then writes the deliverables) and by tests (which assert on them).
// Keeping it pure means the autonomy decision ("should we even trust this
// source about this business?") is a plain function, not a policy buried in
// Postgres default apply logic.
//
// Dry-run: callers pass dryRun only when they want the summary; the rule is
// enforced by the executor not writing anything in that mode, not by this
// module producing different output.

import {
  matchIdentity,
  type IdentityMatch,
  type EntityKey,
} from './identity.ts';
import {
  resolveHours,
  type SourceHoursEntry,
  type HoursResolution,
} from './hours.ts';
import { validateObservations, type ExtractObservation } from './schema.ts';
import { normalizeSocialLinks } from './text.ts';
import { decideImageRights, decideAssetAction, classifyAsset } from './image.ts';
import {
  buildDeliverables,
  type Deliverables,
  type PolicyBusiness,
  type PolicyPrefs,
  type MediaDraft,
} from './proposals.ts';

export interface SourceReport {
  name: string;
  domain?: string | null;
  phone?: string | null;
  hours?: SourceHoursEntry[] | null;
  /** Raw structured JSON from a model, to be validated — never trusted as-is. */
  observations?: unknown;
  social?: Record<string, unknown> | Array<{ platform?: string; url?: string }> | null;
  images?: ImageCandidate[] | null;
}

export interface ImageCandidate {
  url: string;
  hint?: 'logo' | 'cover' | 'gallery' | null;
  /** Name/domain/phone signal provenance for the page that referenced it. */
  signals: string[];
  licence?: string | null;
  attribution?: string | null;
  sourceCountry?: string | null;
  commercialUseAllowed?: boolean;
}

export interface SourceContext {
  key: string;
  url: string;
  sourceType: string;
}

export interface RunEnrichmentOptions {
  business: PolicyBusiness & EntityKey;
  source: SourceContext;
  report: SourceReport;
  pendingFields?: Set<string>;
  prefs?: PolicyPrefs;
  now?: string;
  dryRun?: boolean;
}

export interface EnrichmentSummary {
  matched: boolean;
  identity?: IdentityMatch;
  hours?: HoursResolution | null;
  deliverables: Deliverables;
  notes: string[];
}

export function runEnrichment(opts: RunEnrichmentOptions): EnrichmentSummary {
  const {
    business, source, report,
    pendingFields = new Set<string>(), prefs = {}, now = new Date().toISOString(),
  } = opts;

  // GATE: is this source's entity the same business as the one we hold?
  const identity = matchIdentity(
    { nameKey: business.name, domain: business.domain, phoneE164: business.phone },
    { nameKey: report.name, domain: report.domain, phoneE164: report.phone },
  );
  if (!identity.matched) {
    return {
      matched: false,
      identity,
      hours: null,
      deliverables: { evidence: [], proposals: [], media: [], notes: [] },
      notes: [`Identity check failed (${identity.signals.join(', ')}); recording nothing.`],
    };
  }

  // Hours -----------------------------------------------------------------
  const hours = report.hours?.length
    ? resolveHours(business, report.hours)
    : null;

  // Text fields ------------------------------------------------------------
  const observations: ExtractObservation[] = report.observations
    ? validateObservations(report.observations, source.url)
    : [];

  // Social links -----------------------------------------------------------
  const social: Record<string, string> = report.social
    ? normalizeSocialLinks(report.social)
    : {};

  // Media (image intelligence) ----------------------------------------------
  const media: MediaDraft[] = [];
  for (const candidate of report.images ?? []) {
    const rights = decideImageRights({
      licence: candidate.licence,
      attribution: candidate.attribution,
      sourceCountry: candidate.sourceCountry,
      commercialUseAllowed: candidate.commercialUseAllowed,
    });
    const decision = decideAssetAction({
      business: { name: business.name },
      existing: [], // executor supplies assets it already holds; see note below
      candidate: { ...candidate, rights },
    });
    if (decision.action === 'record') {
      media.push({
        asset_type: classifyAsset(candidate.url, candidate.hint),
        source_id: source.key,
        source_url: source.url,
        source_uri: candidate.url,
        match_confidence: decision.match_confidence,
        matching_signal: decision.matching_signal,
        rights_decision: rights.rights_decision ?? 'conservative_default',
        licence: rights.licence,
        rights_owner: rights.rights_owner,
        jurisdiction: rights.jurisdiction,
        criticality: 'non_critical',
        moderation_status: 'pending',
        keep_url_only: true,
        // decision.targetStatus is already a registry-valid status for the
        // record action (discovered | match_confirmed).
        status: decision.targetStatus === 'match_confirmed' ? 'match_confirmed' : 'discovered',
      });
    }
  }

  const deliverables = buildDeliverables({
    business, source, hours, observations, social, pendingFields, prefs, now,
  });
  deliverables.media = media;

  const notes = [
    `identity: ${identity.score} (${identity.signals.join(', ')}).`,
    hours ? `hours: ${hours.kind}.` : 'hours: none reported.',
    ...deliverables.notes,
  ];

  return { matched: true, identity, hours, deliverables, notes };
}