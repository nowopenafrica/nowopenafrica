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
  liftLicensedMediaToFields,
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
  /** Stock placeholders (searched for, not verified on the page) say so. */
  exact?: boolean;
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
  /*
   * `business.phone` does not exist on this type — the phone lives at
   * `phoneE164` (EntityKey) or `fields.phone` (PolicyBusiness). It was reading
   * `undefined`, so the phone signal never contributed to the identity match
   * and the gate decided on name and domain alone.
   *
   * Invisible until supabase/functions was typechecked at all; see
   * tsconfig.edge.json.
   */
  const identity = matchIdentity(
    {
      nameKey: business.name,
      domain: business.domain,
      phoneE164: business.phoneE164 ?? business.fields.phone ?? null,
    },
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
  /*
   * THE OVERWRITE GUARD WAS OPEN. Found 2026-09-15 when supabase/functions was
   * typechecked for the first time (tsconfig.edge.json).
   *
   * `resolveHours` reads `opening_hours`, `hours`, `availability_mode` and
   * `data_confidence` off the business it is given. It was handed
   * `business` — a PolicyBusiness & EntityKey, which carries NONE of those
   * names: its current column values live under `fields`, and its confirmation
   * state under `ownerConfirmed`. TypeScript's word for the mismatch was
   * "no properties in common with", which is as complete as a mismatch gets.
   *
   * What that produced, every single call:
   *
   *   ownerConfirmed -> ['owner_confirmed','admin_verified'].includes('')
   *                     -> false, ALWAYS
   *   existing       -> ('' || '' || '').trim()
   *                     -> '', ALWAYS
   *
   * So enrichment believed every business had no hours on file and no owner
   * confirmation — which is precisely the state in which overwriting is
   * allowed. The protection against AI enrichment overwriting hours a business
   * or an admin had confirmed was inert for as long as it has existed.
   *
   * It has not yet cost anything, because only 3 of 3,118 businesses have any
   * hours and none are owner-confirmed. That is luck, not design.
   */
  const hours = report.hours?.length
    ? resolveHours(
      {
        opening_hours: business.fields.opening_hours,
        hours: business.fields.hours,
        availability_mode: business.fields.availability_mode,
        data_confidence: business.fields.data_confidence,
      },
      report.hours,
      { ownerConfirmed: business.ownerConfirmed },
    )
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

  if (media.length) {
    const lifted = liftLicensedMediaToFields({
      business, media, sourceType: source.sourceType, pendingFields, now,
    });
    deliverables.evidence.push(...lifted.evidence);
    deliverables.proposals.push(...lifted.proposals);
    deliverables.notes.push(...lifted.notes);
  }

  const notes = [
    `identity: ${identity.score} (${identity.signals.join(', ')}).`,
    hours ? `hours: ${hours.kind}.` : 'hours: none reported.',
    ...deliverables.notes,
  ];

  return { matched: true, identity, hours, deliverables, notes };
}