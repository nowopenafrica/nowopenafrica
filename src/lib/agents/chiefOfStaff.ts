/**
 * The Chief of Staff, actually doing the job its title claims.
 *
 * Its seeded description was "Synthesizes the daily brief for the founder;
 * tracks priorities, blockers and approvals" — a sentence nobody performed.
 * This performs it.
 *
 * Deliberately rule-based, no model. The brief is a set of counts and the
 * judgements that follow from them, and for that a model adds only the risk of
 * a confident wrong number. The eighteen roles do not all need to be language
 * tasks to be real; most of the useful work in an operating brief is
 * measurement plus a threshold. Where a model genuinely helps — drafting copy,
 * summarising free text — it can be added per agent behind the same
 * verification contract, which rejects any figure that was not measured.
 */

import type { AgentResult, Fact, Finding } from '../workforceRuntime';

/** The shape platform_facts() returns. */
export interface PlatformFacts {
  listings_public: number;
  listings_total: number;
  claimed: number;
  verified: number;
  missing_hours: number;
  claims_pending: number;
  reports_open: number;
  review_queue: number;
  offers_running: number;
  founding_claimed: number;
}

const SOURCES: Record<keyof PlatformFacts, { label: string; source: string; filter?: string }> = {
  listings_public:  { label: 'Listings the public can see', source: 'businesses', filter: 'is_listable' },
  listings_total:   { label: 'Listings in total', source: 'businesses' },
  claimed:          { label: 'Claimed by an owner', source: 'businesses', filter: "claim_status = 'claimed'" },
  verified:         { label: 'Verified businesses', source: 'businesses', filter: "verification_status = 'verified'" },
  missing_hours:    { label: 'Public listings with no opening hours', source: 'businesses', filter: 'is_listable and hours empty' },
  claims_pending:   { label: 'Claims waiting for review', source: 'business_claims', filter: "status = 'pending'" },
  reports_open:     { label: 'Open reports', source: 'business_reports', filter: "status = 'open'" },
  review_queue:     { label: 'Records waiting in the review queue', source: 'radar_candidates', filter: "status in ('pending','review')" },
  offers_running:   { label: 'Offers running now', source: 'business_offers', filter: 'active and within dates' },
  founding_claimed: { label: 'Founding numbers issued', source: 'founding_members' },
};

export function toFacts(raw: PlatformFacts): Fact[] {
  return (Object.keys(SOURCES) as Array<keyof PlatformFacts>).map((key) => ({
    key,
    label: SOURCES[key].label,
    value: Number(raw[key] ?? 0),
    source: SOURCES[key].source,
    filter: SOURCES[key].filter,
  }));
}

/**
 * Anything a person should act on today.
 *
 * Thresholds are deliberately low. This is a platform before launch — one
 * unanswered report matters here in a way it would not at ten thousand
 * listings — and a brief that only speaks up at scale says nothing during the
 * period it is most needed.
 */
export function assess(f: PlatformFacts): Finding[] {
  const out: Finding[] = [];

  if (f.reports_open > 0) {
    out.push({
      title: `${f.reports_open} report${f.reports_open === 1 ? '' : 's'} unanswered`,
      severity: 'act',
      detail: 'Somebody told us a listing is wrong. Until it is read, the directory is knowingly showing something a customer flagged.',
      basis: ['reports_open'],
    });
  }

  if (f.claims_pending > 0) {
    out.push({
      title: `${f.claims_pending} claim${f.claims_pending === 1 ? '' : 's'} waiting`,
      severity: 'act',
      detail: 'A business owner asked for their page and cannot manage it until this is approved. This is the slowest step in the acquisition funnel.',
      basis: ['claims_pending'],
    });
  }

  if (f.review_queue > 0) {
    out.push({
      title: `${f.review_queue} in the review queue`,
      severity: 'act',
      detail: 'Suggestions and imports waiting on a decision. Nothing reaches the directory until they are published or rejected.',
      basis: ['review_queue'],
    });
  }

  /*
   * The one that decides whether the product answers its own question. A
   * listing with no hours cannot say whether the business is open, which is
   * what the platform is named after.
   */
  if (f.listings_public > 0) {
    const share = f.missing_hours / f.listings_public;
    if (share >= 0.5) {
      out.push({
        title: `${f.missing_hours} of ${f.listings_public} public listings cannot say if they are open`,
        severity: 'act',
        detail: 'Opening hours are missing, so the open/closed state on those pages is unknown — the one question the platform exists to answer.',
        basis: ['missing_hours', 'listings_public'],
      });
    } else if (f.missing_hours > 0) {
      out.push({
        title: `${f.missing_hours} listings without opening hours`,
        severity: 'watch',
        detail: 'Those pages cannot show an open or closed state.',
        basis: ['missing_hours', 'listings_public'],
      });
    }
  }

  if (f.claimed === 0 && f.listings_public > 0) {
    out.push({
      title: 'No listing has an owner',
      severity: 'act',
      detail: 'Every public page is unmanaged, so nothing can be replied to, corrected or kept up to date by the business itself.',
      basis: ['claimed', 'listings_public'],
    });
  } else if (f.listings_public > 0 && f.claimed / f.listings_public < 0.1) {
    out.push({
      title: `Only ${f.claimed} of ${f.listings_public} listings are claimed`,
      severity: 'watch',
      detail: 'Claiming is the conversion step between a directory entry and a business account.',
      basis: ['claimed', 'listings_public'],
    });
  }

  if (f.offers_running === 0 && f.claimed > 0) {
    out.push({
      title: 'No offers running',
      severity: 'watch',
      detail: 'Offers are the reason a customer returns. Owners who have claimed a page have nothing published.',
      basis: ['offers_running', 'claimed'],
    });
  }

  return out;
}

/**
 * The one line the founder reads.
 *
 * Every number in it comes from a fact, because the verifier rejects the run
 * otherwise — that check exists precisely because this sentence is the part
 * that gets acted on without being checked.
 */
export function summarise(f: PlatformFacts, findings: Finding[]): string {
  const acts = findings.filter((x) => x.severity === 'act').length;
  const head = `${f.listings_public} public listings, ${f.claimed} claimed, ${f.verified} verified.`;
  if (acts === 0) return `${head} Nothing needs a decision today.`;
  return `${head} ${acts === 1 ? '1 thing needs' : `${acts} things need`} a decision.`;
}

export function chiefOfStaffBrief(raw: PlatformFacts): AgentResult {
  const findings = assess(raw);
  return {
    agentKey: 'chief-of-staff',
    facts: toFacts(raw),
    findings,
    summary: summarise(raw, findings),
  };
}
