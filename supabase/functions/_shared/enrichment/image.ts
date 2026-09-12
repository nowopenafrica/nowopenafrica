// Media candidate intelligence for the enrichment engine.
//
// The engine never inserts a photo straight into the page. §16 divides the
// moment a crawler finds an asset from the moment a person (or an owner's
// explicit licence decision) approves it. Everything in this module is the
// pure decision layer: given what a source told us about an asset — where it
// comes from, what it depicts, and (critically) what licence governs it — do
// we record it, propose it, or drop it?

import type { BusinessMediaAsset, MediaAssetStatus } from './types.ts';

/** The asset-type vocabulary the registry stores. */
export type AssetTypeCandidate = 'logo' | 'cover' | 'gallery';

/** A permissive-licence whitelist. CC BY-SA gains attribution; PD/CC0 need none. */
export const PERMISSIVE_LICENCES: Record<string, { owned: boolean; attributionRequired: boolean }> = {
  'public domain': { owned: true, attributionRequired: false },
  'cc0': { owned: true, attributionRequired: false },
  'cc0 1.0': { owned: true, attributionRequired: false },
  'cc by 3.0': { owned: true, attributionRequired: true },
  'cc by 3.0 unported': { owned: true, attributionRequired: true },
  'cc by 4.0': { owned: true, attributionRequired: true },
  'cc by-sa 3.0': { owned: true, attributionRequired: true },
  'cc by-sa 4.0': { owned: true, attributionRequired: true },
};

/**
 * Classify a URL/hint into the registry's asset_type. Prefers the source's own
 * hint (the "logo" case); falls back to path conventions (favicon, screener,
 * cover dimensions, gallery thumbnails).
 */
export function classifyAsset(
  url: string,
  hint?: string | null,
): AssetTypeCandidate {
  const path = (url.split('?')[0] ?? '').toLowerCase();
  const hinted = (hint ?? '').toLowerCase();
  if (['logo', 'cover', 'gallery'].includes(hinted)) return hinted as AssetTypeCandidate;
  if (/favicon|logo/.test(path)) return 'logo';
  if (/cover|banner|hero/.test(path)) return 'cover';
  return 'gallery';
}

export interface RightsDecision {
  rights_decision: BusinessMediaAsset['rights_decision'];
  licence: string | null;
  rights_owner: string | null;
  /** Which jurisdiction owns the decision when it is not obvious (asset's home). */
  jurisdiction: string | null;
  /** human reason this ended up the way it did */
  reason: string;
}

/**
 * Decide whether we may even RECORD a reference to this asset.
 * We never hotlink an image whose licence we cannot name: that is the same
 * dishonesty as faking an OpenAI response — we would put someone else's work
 * on the page while pretending to have permission. The default is to keep the
 * asset OFF the page (conservative_default) and flag it for a person.
 */
export function decideImageRights(opts: {
  licence?: string | null;
  attribution?: string | null;
  sourceCountry?: string | null;
  commercialUseAllowed?: boolean;
}): RightsDecision {
  const licence = (opts.licence ?? '').trim().toLowerCase();
  const match = licence ? PERMISSIVE_LICENCES[licence] : undefined;

  if (match) {
    return {
      rights_decision: 'licensed',
      licence: opts.licence?.trim() || null,
      rights_owner: match.attributionRequired ? opts.attribution?.trim() || null : null,
      jurisdiction: opts.sourceCountry?.trim() || null,
      reason: `Licence ${opts.licence} is on the permissive whitelist.`,
    };
  }

  // No named licence (or one we cannot verify) → the asset is not usable
  // without asking. "permission_obtained" only ever comes from a person; the
  // engine itself is capped at conservative_default.
  if (opts.commercialUseAllowed) {
    return {
      rights_decision: 'permission_obtained',
      licence: opts.licence?.trim() || null,
      rights_owner: opts.attribution?.trim() || null,
      jurisdiction: opts.sourceCountry?.trim() || null,
      reason: 'Commercial use explicitly allowed by the source, but kept for a person to confirm.',
    };
  }

  return {
    rights_decision: 'conservative_default',
    licence: null,
    rights_owner: null,
    jurisdiction: opts.sourceCountry?.trim() || null,
    reason: 'No verifiable licence; asset is kept for review but never rendered.',
  };
}

export interface AssetAction {
  action: 'record' | 'update' | 'reject' | 'pending_review';
  targetStatus: MediaAssetStatus;
  matching_signal: { fields: string[]; exact: boolean };
  match_confidence: number;
  reason: string;
}

/**
 * Compare a candidate against what the business already has and decide the
 * registry write. Matching signals (name/domain/phone agreement on the page
 * that referenced the asset) raise confidence; licence problems cap it.
 */
export function decideAssetAction(opts: {
  business: { name: string };
  existing: BusinessMediaAsset[];
  candidate: {
    url: string;
    hint?: string | null;
    signals: string[];
    exact?: boolean;
    licence?: string | null;
    rights: RightsDecision;
  };
}): AssetAction {
  const { business, candidate, existing } = opts;
  const type = classifyAsset(candidate.url, candidate.hint);
  const fields = candidate.signals.length ? candidate.signals : ['url_reference'];
  const exact = candidate.exact !== false && candidate.signals.length > 0;

  // Already have an asset of this type from this source/URL.
  const dup = existing.find(
    (a) => a.asset_type === type && a.source_uri === candidate.url && a.status === 'removed',
  );
  if (dup) return { action: 'reject', targetStatus: 'removed', matching_signal: { fields, exact }, match_confidence: 0, reason: 'Asset was previously taken down for this business.' };

  const already = existing.find((a) => a.asset_type === type && a.source_uri === candidate.url);
  if (already && already.status !== 'removed') {
    return { action: 'reject', targetStatus: already.status, matching_signal: { fields, exact }, match_confidence: already.match_confidence, reason: 'Already recorded from this source.' };
  }

  // Confidence: name evidence on the referencing page is the strongest signal,
  // licence-unsafe candidates never reach the page regardless.
  let score = 10;
  if (exact) score += 35;
  if (candidate.signals.length >= 2) score += 20;
  if (business.name) score += 10;

  const isLicensed = candidate.rights.rights_decision === 'licensed';
  const usesNamedLicence = isLicensed && candidate.rights.licence;
  if (!usesNamedLicence) score = Math.min(score, 45);      // decent match, unusable rights
  if (score >= 60) {
    return {
      action: 'record',
      // No licence on the record path means it never reaches the page: status
      // stays "discovered" (review queue), not match_confirmed — there is no
      // "pending_review" value; the lifecycle is discovered → match_confirmed
      // → approved → published, and a rights-unverified asset stops at the
      // first of those until a person (or a rights decision) moves it.
      targetStatus: usesNamedLicence ? 'match_confirmed' : 'discovered',
      matching_signal: { fields, exact },
      match_confidence: score,
      reason: usesNamedLicence
        ? `Licenced asset (${candidate.rights.licence}) with ${candidate.signals.length} matching signal(s).`
        : 'Matched but licence unverified; queued for a person.',
    };
  }
  if (score >= 30) {
    return { action: 'record', targetStatus: 'discovered', matching_signal: { fields, exact }, match_confidence: score, reason: 'Weak automatic match recorded for review.' };
  }
  return { action: 'reject', targetStatus: 'rejected', matching_signal: { fields, exact }, match_confidence: score, reason: 'Below the recording floor.' };
}