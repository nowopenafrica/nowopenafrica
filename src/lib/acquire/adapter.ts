/**
 * AutoAcquire §6 — the source adapter contract, with zero live adapters.
 *
 * WHY AN INTERFACE AND NOTHING BEHIND IT
 *
 * Measured 2026-09-08: `radar_sources` holds four rows. Three are inbound —
 * an admin uploading a file, an owner submitting, a customer suggesting — and
 * none of them discovers anything. The fourth is the only external directory
 * on record:
 *
 *   businesslist_ng   active: FALSE
 *                     automated_access: prohibited
 *                     bulk_extraction:  prohibited
 *                     redistribution:   prohibited
 *                     licence: None   authorised_by: None
 *
 * So NowOpen currently has NO authorized source to discover from, and §0/§6/§29
 * forbid inventing one. §54 anticipates exactly this: build the adapter, name
 * the credential, do not pretend it works.
 *
 * WHAT THIS FILE THEREFORE IS
 *
 * The shape a future adapter must satisfy, and — more importantly — the gate
 * that decides whether it may run at all. An adapter cannot self-authorise:
 * `assertSourcePermits` reads the source's own `radar_sources` row and refuses
 * any operation the licence does not allow. That check lives here rather than
 * inside each adapter so that writing a new adapter cannot accidentally omit
 * it.
 */

import { checkFetchUrl, FETCH_CONTRACT, type UrlVerdict } from './safeUrl.js';

/** The rights columns on a `radar_sources` row, as data. */
export interface SourcePolicy {
  key: string;
  name: string;
  active: boolean;
  /** May we fetch this source with a program at all? */
  automatedAccess: 'permitted' | 'prohibited' | 'unknown' | string;
  /** May we take many records rather than one? */
  bulkExtraction: 'permitted' | 'prohibited' | 'unknown' | string;
  /** May we publish what we took? */
  redistribution: 'permitted' | 'prohibited' | 'unknown' | string;
  /** May the result compete with the source's own product? */
  competingDataset?: 'permitted' | 'prohibited' | 'unknown' | string | null;
  licence: string | null;
  authorisedBy: string | null;
}

export type SourceOperation = 'discover' | 'fetch' | 'bulk' | 'publish';

export interface PolicyVerdict {
  permitted: boolean;
  reason: string;
}

/**
 * May this source be used for this operation?
 *
 * UNKNOWN IS A REFUSAL, and that is the whole design. A source whose licence
 * nobody has recorded is a source nobody has cleared, and defaulting to
 * "probably fine" is how a platform ends up redistributing somebody else's
 * database. The cost of refusing wrongly is a config change; the cost of
 * permitting wrongly is a legal letter.
 */
export function sourcePermits(policy: SourcePolicy, op: SourceOperation): PolicyVerdict {
  const no = (reason: string): PolicyVerdict => ({ permitted: false, reason });

  if (!policy.active) {
    return no(`Source "${policy.name}" is not active.`);
  }

  /*
   * An authorising party is required for every operation.
   *
   * Not bureaucracy: it is the difference between "we believe this is allowed"
   * and "a named person decided it is". `businesslist_ng` has licence None and
   * authorised_by None, which is precisely the state this refuses.
   */
  if (!policy.authorisedBy || !policy.authorisedBy.trim()) {
    return no(`Nobody has authorised "${policy.name}" — authorised_by is empty.`);
  }

  const needs: Record<SourceOperation, keyof SourcePolicy> = {
    discover: 'automatedAccess',
    fetch: 'automatedAccess',
    bulk: 'bulkExtraction',
    publish: 'redistribution',
  };

  const field = needs[op];
  const value = String(policy[field] ?? 'unknown');
  if (value !== 'permitted') {
    return no(
      `"${policy.name}" does not permit ${op}: ${String(field)} is ${value}.` +
      (value === 'prohibited' ? ' Its terms forbid this.' : ' Nothing has recorded that it is allowed.'),
    );
  }

  /*
   * Publishing additionally requires that the result not be a competing
   * dataset, where the source has said so. A directory republishing a
   * directory is the case those terms exist to prevent.
   */
  if (op === 'publish' && String(policy.competingDataset ?? 'unknown') === 'prohibited') {
    return no(`"${policy.name}" forbids use in a competing dataset, which is what publishing here would be.`);
  }

  return { permitted: true, reason: `${policy.name} permits ${op} (authorised by ${policy.authorisedBy}).` };
}

/** Throw unless permitted. For call sites where continuing makes no sense. */
export function assertSourcePermits(policy: SourcePolicy, op: SourceOperation): void {
  const v = sourcePermits(policy, op);
  if (!v.permitted) throw new Error(`Refused: ${v.reason}`);
}

/** A candidate as an adapter yields it, before normalisation. */
export interface RawCandidate {
  /** The source's own identifier, so a re-run updates rather than duplicates. */
  sourceRecordId: string;
  /** Where this came from. Must pass checkFetchUrl before being fetched. */
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
   * How each field was obtained, keyed by field name.
   *
   * Required, not optional. §8 exists because record-level provenance cannot
   * answer "why do we believe this phone number", and an adapter that returns
   * fields without saying how it got them makes that question unanswerable
   * for ever — the information is lost at the moment of extraction.
   */
  evidence: Record<string, {
    method: 'structured_data' | 'dom_extraction' | 'regex' | 'api' | 'ai_extracted' | 'ai_inferred';
    sourceUrl: string;
    confidence: number;
  }>;
}

export interface DiscoverQuery {
  category?: string;
  city?: string;
  /** Where to resume, so a run is restartable rather than starting again. */
  cursor?: string;
  limit: number;
}

export interface DiscoverResult {
  candidates: RawCandidate[];
  /** Absent when the source has no more. */
  nextCursor?: string;
}

/**
 * What every source adapter must provide.
 *
 * `getRightsPolicy` is first in spirit if not in order: the engine calls it
 * before anything else and refuses the adapter outright when the answer does
 * not permit the operation. An adapter does not get to assert its own rights.
 */
export interface SourceAdapter {
  readonly key: string;
  readonly name: string;

  getRightsPolicy(): Promise<SourcePolicy>;

  /** Requests per minute this source tolerates. Never exceeded, never guessed high. */
  getRateLimit(): { requestsPerMinute: number; concurrency: number };

  discover(query: DiscoverQuery): Promise<DiscoverResult>;

  /**
   * Fetch one candidate's page.
   *
   * Implementations MUST route the URL through `checkFetchUrl` and honour
   * FETCH_CONTRACT — manual redirects re-checked per hop, DNS re-checked after
   * resolution, and the time and size bounds. `guardedFetchUrl` below is the
   * shortest correct way to do the first half.
   */
  fetch(candidate: RawCandidate): Promise<{ html: string; finalUrl: string } | null>;

  extract(html: string, candidate: RawCandidate): Promise<RawCandidate>;
}

/**
 * The URL check every adapter must pass a URL through before fetching.
 *
 * Re-exported from here so an adapter author reaches for it without needing to
 * know it lives in safeUrl.ts — the single most likely omission in a new
 * adapter is the one that turns a source listing into server-side request
 * forgery.
 */
export function guardedFetchUrl(url: string): UrlVerdict {
  return checkFetchUrl(url);
}

export { FETCH_CONTRACT };

/**
 * Every IN-PROCESS adapter registered with the engine.
 *
 * Still empty, and now for a narrower reason than before. The first authorised
 * source arrived on 2026-09-08 — Wikidata, CC0, `automated_access: permitted`
 * with a named `authorised_by` — but it is not reached through this interface:
 * Wikimedia asks every automated client for a descriptive User-Agent, a
 * browser will not let a page set one, so the request is made by
 * `api/acquire/wikidata.ts` on the server and the parsing lives in
 * `src/lib/acquire/wikidata.ts`.
 *
 * This contract remains the shape for an adapter that must FETCH AND SCRAPE a
 * page — where `guardedFetchUrl`, the rate limit and the per-hop redirect
 * checks all matter. Wikidata needs none of that: it answers one endpoint with
 * structured JSON.
 *
 * So: empty is still honest, and it no longer means "no source is authorised".
 */
export const ADAPTERS: readonly SourceAdapter[] = Object.freeze([]);

/**
 * The credentials a future adapter will need, documented rather than faked.
 *
 * §54: "If an external data provider is required but unavailable, create a
 * clean adapter/interface and document the required credential/configuration
 * without pretending it works."
 */
export const REQUIRED_CONFIGURATION = Object.freeze({
  note: 'No in-process adapter is registered. Wikidata (CC0) is authorised and is queried by '
    + 'api/acquire/wikidata.ts, which needs no credential. The entries below are what a '
    + 'fetch-and-extract adapter would need, and none is set.',
  perAdapter: [
    {
      kind: 'licensed_directory',
      envVars: ['ACQUIRE_<SOURCE>_API_KEY', 'ACQUIRE_<SOURCE>_BASE_URL'],
      alsoRequired: 'A radar_sources row with automated_access=permitted, bulk_extraction=permitted and a named authorised_by.',
    },
    {
      kind: 'official_website',
      envVars: [],
      alsoRequired: 'Nothing beyond the SSRF guard — a business\'s own site needs no credential. Still requires a radar_sources row, because rate limits and robots.txt are per-source facts.',
    },
  ],
});
