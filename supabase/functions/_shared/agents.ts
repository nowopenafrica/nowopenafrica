/**
 * What each agent concludes, given the numbers.
 *
 * ONE IMPLEMENTATION, DELIBERATELY. This file holds no Deno globals and no
 * imports, so the scheduler runs it and vitest tests it — the same code, not
 * two copies that agree until they quietly stop agreeing. Agent rules that
 * drift between the scheduled run and the console are worse than no agents,
 * because the founder would be reading one thing while the platform acted on
 * another.
 *
 * Every rule below is arithmetic on a counted fact. Nothing here calls a model.
 * These agents are judgement encoded as thresholds, and the reason to keep them
 * that way is that a threshold can be argued with: each finding carries the
 * fact keys it rests on, so "why did it say that" is always answerable.
 */

export type Severity = 'critical' | 'attention' | 'watch' | 'good';

export interface Fact {
  key: string;
  label: string;
  value: number;
  source: string;
  filter?: string;
}

export interface Finding {
  title: string;
  severity: Severity;
  detail: string;
  /** Fact keys this rests on. A finding resting on nothing is not reportable. */
  basis: string[];
}

export interface AgentResult {
  agentKey: string;
  facts: Fact[];
  findings: Finding[];
  summary: string;
}

export type RawFacts = Record<string, number>;

const n = (f: RawFacts, k: string): number => Number(f?.[k] ?? 0);

const RANK: Record<Severity, number> = { critical: 0, attention: 1, watch: 2, good: 3 };

/** Worst first — an operator reads the top of the list, not the middle. */
export function bySeverity(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/* ============================================================ chief of staff */
/**
 * The founder's daily read: is the platform coherent today?
 *
 * Deliberately not a metrics dump. It reports the handful of things that would
 * change what somebody does this morning, and says "nothing to report" when
 * that is the truth — a brief that always finds something teaches people to
 * skim it.
 */
export function chiefOfStaff(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'listings_public', label: 'Public listings', value: n(f, 'listings_public'), source: 'businesses', filter: 'is_listable' },
    { key: 'claimed', label: 'Claimed', value: n(f, 'claimed'), source: 'businesses', filter: "claim_status='claimed'" },
    { key: 'verified', label: 'Verified', value: n(f, 'verified'), source: 'businesses', filter: "verification_status='verified'" },
    { key: 'missing_hours', label: 'Public listings with no hours', value: n(f, 'missing_hours'), source: 'businesses' },
    { key: 'claims_pending', label: 'Claims awaiting review', value: n(f, 'claims_pending'), source: 'business_claims', filter: "status='pending'" },
    { key: 'reports_open', label: 'Open reports', value: n(f, 'reports_open'), source: 'business_reports', filter: "status='open'" },
    { key: 'review_queue', label: 'Review queue', value: n(f, 'review_queue'), source: 'radar_candidates' },
    { key: 'offers_running', label: 'Offers running', value: n(f, 'offers_running'), source: 'business_offers' },
    { key: 'founding_claimed', label: 'Founding numbers issued', value: n(f, 'founding_claimed'), source: 'founding_members' },
  ];

  const findings: Finding[] = [];
  const pub = n(f, 'listings_public');

  /*
   * The platform is called NowOpen. A listing that cannot answer "are they open
   * now" is failing at the one thing the name promises, so this leads.
   */
  const noHours = n(f, 'missing_hours');
  if (pub > 0 && pct(noHours, pub) >= 50) {
    findings.push({
      title: `${noHours} of ${pub} public listings cannot say whether they are open`,
      severity: 'critical',
      detail: 'Opening hours are missing, so the open/closed state on those pages is unknown. This is the core promise of the product.',
      basis: ['missing_hours', 'listings_public'],
    });
  }

  if (n(f, 'reports_open') > 0) {
    findings.push({
      title: `${n(f, 'reports_open')} report${n(f, 'reports_open') === 1 ? '' : 's'} waiting`,
      severity: 'attention',
      detail: 'Someone told us a listing is wrong. Unanswered reports are how a directory stops being trusted.',
      basis: ['reports_open'],
    });
  }

  if (n(f, 'claims_pending') > 0) {
    findings.push({
      title: `${n(f, 'claims_pending')} claim${n(f, 'claims_pending') === 1 ? '' : 's'} awaiting a decision`,
      severity: 'attention',
      detail: 'A business owner is waiting to be given their page. This is the slowest step in the acquisition funnel.',
      basis: ['claims_pending'],
    });
  }

  if (n(f, 'review_queue') > 0) {
    findings.push({
      title: `${n(f, 'review_queue')} record${n(f, 'review_queue') === 1 ? '' : 's'} in the review queue`,
      severity: 'watch',
      detail: 'Suggestions and imports waiting to be published or rejected.',
      basis: ['review_queue'],
    });
  }

  // Stated as a fact, not a crisis: no offers is normal before launch, but it
  // means the Offers tab is an empty room for every visitor who opens it.
  if (pub > 0 && n(f, 'offers_running') === 0) {
    findings.push({
      title: 'No offers are running',
      severity: 'watch',
      detail: 'The Offers page has nothing to show. It is the only surface that gives a customer a reason to act today.',
      basis: ['offers_running'],
    });
  }

  return {
    agentKey: 'chief-of-staff',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${pub} public listings, ${n(f, 'claimed')} claimed`),
  };
}

/* ============================================================= trust & safety */
/**
 * Runs hourly, because these age badly.
 *
 * A report saying a business does not exist, or is impersonating another, is
 * not the same kind of thing as a wrong phone number — it is a claim that the
 * directory is actively misleading somebody, and it escalates on its own if
 * left. Age is therefore weighted as heavily as volume.
 */
export function trustSafety(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'reports_open', label: 'Open reports', value: n(f, 'reports_open'), source: 'business_reports', filter: "status='open'" },
    { key: 'reports_over_24h', label: 'Open more than 24h', value: n(f, 'reports_over_24h'), source: 'business_reports' },
    { key: 'reports_not_real', label: 'Fake or impersonation reports', value: n(f, 'reports_not_real'), source: 'business_reports' },
    { key: 'reports_closed_claim', label: 'Reported as closed down', value: n(f, 'reports_closed_claim'), source: 'business_reports' },
    { key: 'suspended', label: 'Suspended listings', value: n(f, 'suspended'), source: 'businesses' },
    { key: 'unverified_public', label: 'Public but unverified', value: n(f, 'unverified_public'), source: 'businesses' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'reports_not_real') > 0) {
    findings.push({
      title: `${n(f, 'reports_not_real')} listing${n(f, 'reports_not_real') === 1 ? '' : 's'} reported as fake or impersonating`,
      severity: 'critical',
      detail: 'Someone is telling us the directory is misleading people. Handle before anything else in the queue.',
      basis: ['reports_not_real'],
    });
  }

  if (n(f, 'reports_over_24h') > 0) {
    findings.push({
      title: `${n(f, 'reports_over_24h')} report${n(f, 'reports_over_24h') === 1 ? '' : 's'} unanswered for over a day`,
      severity: 'attention',
      detail: 'The person who reported it has no way to know anything happened. A stale queue is what makes people stop reporting.',
      basis: ['reports_over_24h'],
    });
  } else if (n(f, 'reports_open') > 0) {
    findings.push({
      title: `${n(f, 'reports_open')} report${n(f, 'reports_open') === 1 ? '' : 's'} open, all under a day old`,
      severity: 'watch',
      detail: 'Within the response window.',
      basis: ['reports_open'],
    });
  }

  if (n(f, 'reports_closed_claim') > 0) {
    findings.push({
      title: `${n(f, 'reports_closed_claim')} business${n(f, 'reports_closed_claim') === 1 ? '' : 'es'} reported as closed down`,
      severity: 'attention',
      detail: 'Mark them permanently closed rather than deleting — the page keeps the record straight and stops the report recurring.',
      basis: ['reports_closed_claim'],
    });
  }

  return {
    agentKey: 'trust-safety',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'reports_open')} open reports`),
  };
}

/* =========================================================== customer success */
/**
 * The owner's side: is anybody waiting on us, and can they finish their page?
 *
 * A pending claim is a business owner sitting in front of a screen that says
 * "we are checking it". That is the single most expensive thing to leave — the
 * person has already decided to join and is being made to wait.
 */
export function customerSuccess(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'claims_pending', label: 'Claims awaiting review', value: n(f, 'claims_pending'), source: 'business_claims', filter: "status='pending'" },
    { key: 'claims_over_48h', label: 'Waiting over 48h', value: n(f, 'claims_over_48h'), source: 'business_claims' },
    { key: 'claimed_incomplete', label: 'Claimed but unfinished', value: n(f, 'claimed_incomplete'), source: 'businesses', filter: 'listing_score < 60' },
    { key: 'claimed_no_hours', label: 'Claimed without hours', value: n(f, 'claimed_no_hours'), source: 'businesses' },
    { key: 'owners', label: 'Business owners', value: n(f, 'owners'), source: 'businesses' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'claims_over_48h') > 0) {
    findings.push({
      title: `${n(f, 'claims_over_48h')} owner${n(f, 'claims_over_48h') === 1 ? ' has' : 's have'} waited over 48 hours to be given their page`,
      severity: 'critical',
      detail: 'They have already chosen to join and are being made to wait. This is the most expensive queue on the platform.',
      basis: ['claims_over_48h'],
    });
  } else if (n(f, 'claims_pending') > 0) {
    findings.push({
      title: `${n(f, 'claims_pending')} claim${n(f, 'claims_pending') === 1 ? '' : 's'} to review`,
      severity: 'attention',
      detail: 'Within the 48-hour window, but every hour here is a business waiting.',
      basis: ['claims_pending'],
    });
  }

  if (n(f, 'claimed_no_hours') > 0) {
    findings.push({
      title: `${n(f, 'claimed_no_hours')} claimed business${n(f, 'claimed_no_hours') === 1 ? '' : 'es'} still have no opening hours`,
      severity: 'attention',
      detail: 'These owners took their page and stopped before the field that makes it useful. One nudge each is the highest-yield outreach available.',
      basis: ['claimed_no_hours'],
    });
  }

  if (n(f, 'claimed_incomplete') > 0) {
    findings.push({
      title: `${n(f, 'claimed_incomplete')} claimed page${n(f, 'claimed_incomplete') === 1 ? ' is' : 's are'} under 60% complete`,
      severity: 'watch',
      detail: 'Incomplete pages convert badly and cannot qualify for a founding number.',
      basis: ['claimed_incomplete'],
    });
  }

  return {
    agentKey: 'customer-success',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'owners')} owners, ${n(f, 'claims_pending')} claims pending`),
  };
}

/* ============================================================ growth director */
/**
 * Where the funnel is losing people.
 *
 * Reports conversion rather than volume, because volume flatters. 500 prospects
 * with no claims is not progress, and the honest way to say so is the ratio.
 */
export function growthDirector(f: RawFacts): AgentResult {
  const prospects = n(f, 'prospects');
  const claimed = n(f, 'claimed');
  const started = n(f, 'claims_started');

  const facts: Fact[] = [
    { key: 'listings_public', label: 'Public listings', value: n(f, 'listings_public'), source: 'businesses', filter: 'is_listable' },
    { key: 'prospects', label: 'Prospects awaiting an owner', value: prospects, source: 'businesses', filter: "data_status='synthetic_unverified'" },
    { key: 'claims_started', label: 'Claims ever started', value: started, source: 'business_claims' },
    { key: 'claimed', label: 'Businesses claimed', value: claimed, source: 'businesses' },
    { key: 'suggestions_7d', label: 'Suggestions this week', value: n(f, 'suggestions_7d'), source: 'radar_candidates' },
    { key: 'review_queue', label: 'Awaiting review', value: n(f, 'review_queue'), source: 'radar_candidates' },
    { key: 'founding_claimed', label: 'Founding numbers issued', value: n(f, 'founding_claimed'), source: 'founding_members' },
    { key: 'offers_running', label: 'Offers running', value: n(f, 'offers_running'), source: 'business_offers' },
  ];

  const findings: Finding[] = [];

  /*
   * The claim funnel is the whole acquisition strategy. If prospects exist and
   * nobody has ever started a claim, the funnel has no entrance — which is a
   * different problem from a funnel that leaks.
   */
  if (prospects > 0 && started === 0) {
    findings.push({
      title: `${prospects} prospect listings and not one claim started`,
      severity: 'critical',
      detail: 'Nobody has reached the claim form. Either owners are not finding their page, or the page is not asking clearly enough.',
      basis: ['prospects', 'claims_started'],
    });
  } else if (started > 0 && claimed === 0) {
    findings.push({
      title: `${started} claims started, none approved`,
      severity: 'critical',
      detail: 'People are asking for their page and not getting it. The funnel is blocked at review, not at discovery.',
      basis: ['claims_started', 'claimed'],
    });
  }

  if (n(f, 'suggestions_7d') === 0) {
    findings.push({
      title: 'No businesses suggested this week',
      severity: 'watch',
      detail: 'Suggest a business is the only discovery source running. Nothing arriving means the prompt is not being seen.',
      basis: ['suggestions_7d'],
    });
  }

  if (n(f, 'founding_claimed') === 0) {
    findings.push({
      title: 'No founding numbers issued yet',
      severity: 'watch',
      detail: 'The Founding 1,000 has no members. It needs claimed, verified, completed businesses to have anybody to award.',
      basis: ['founding_claimed'],
    });
  }

  return {
    agentKey: 'growth-director',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${claimed} claimed of ${n(f, 'listings_public')} public`),
  };
}

/* ===================================================================== shared */
function summarise(findings: Finding[], fallback: string): string {
  const critical = findings.filter((x) => x.severity === 'critical').length;
  const attention = findings.filter((x) => x.severity === 'attention').length;
  if (critical > 0) return `${critical} critical, ${attention} needing attention. ${fallback}.`;
  if (attention > 0) return `${attention} needing attention. ${fallback}.`;
  if (findings.length > 0) return `Nothing urgent. ${fallback}.`;
  return `All clear. ${fallback}.`;
}

export const AGENTS: Record<string, (f: RawFacts) => AgentResult> = {
  'chief-of-staff': chiefOfStaff,
  'trust-safety': trustSafety,
  'customer-success': customerSuccess,
  'growth-director': growthDirector,
};

/**
 * The status a run is recorded under.
 *
 * 'nothing-to-report' is a real, useful outcome and is kept distinct from 'ok'.
 * An agent that only ever reports 'ok' cannot be distinguished from one that is
 * silently broken.
 */
export function runStatus(result: AgentResult): 'ok' | 'nothing-to-report' {
  return result.findings.length > 0 ? 'ok' : 'nothing-to-report';
}

/**
 * Findings serious enough to put in front of a person right now.
 *
 * Only critical. An agent that notifies on everything trains people to mute it,
 * and a muted alarm is worse than none because it looks like coverage.
 */
export function notifiable(result: AgentResult): Finding[] {
  return result.findings.filter((x) => x.severity === 'critical');
}
