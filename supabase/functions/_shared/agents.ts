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

/* =========================================================== strategy director */
/**
 * The quarter, measured. Reports the launch board and the enrichment engine as
 * numbers the plan can be argued against, instead of a mood.
 */
export function strategyDirector(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'listings_public', label: 'Public listings', value: n(f, 'listings_public'), source: 'businesses', filter: 'is_listable' },
    { key: 'claimed', label: 'Claimed', value: n(f, 'claimed'), source: 'businesses' },
    { key: 'verified', label: 'Verified', value: n(f, 'verified'), source: 'businesses' },
    { key: 'claims_started', label: 'Claims ever started', value: n(f, 'claims_started'), source: 'business_claims' },
    { key: 'launches_total', label: 'Launches on the board', value: n(f, 'launches_total'), source: 'os_launches' },
    { key: 'launches_ready', label: 'Launches with a full checklist', value: n(f, 'launches_ready'), source: 'os_launches', filter: 'no false items' },
    { key: 'enrichment_backlog', label: 'Enrichment jobs queued or running', value: n(f, 'enrichment_backlog'), source: 'business_enrichment_jobs' },
    { key: 'suggestions_7d', label: 'Suggestions this week', value: n(f, 'suggestions_7d'), source: 'radar_candidates' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'launches_total') > 0 && n(f, 'launches_ready') === 0) {
    findings.push({
      title: 'No launch on the board is ready',
      severity: 'attention',
      detail: 'Every launch still has checklist items open. A board with nothing shippable is a todo list, not a plan.',
      basis: ['launches_total', 'launches_ready'],
    });
  }

  if (n(f, 'enrichment_backlog') > 0) {
    findings.push({
      title: `${n(f, 'enrichment_backlog')} business${n(f, 'enrichment_backlog') === 1 ? ' is' : 'es are'} queued for enrichment`,
      severity: 'watch',
      detail: 'The intelligence engine is falling behind its own queue. Each run makes the directory stronger; every queued row is that run not happening.',
      basis: ['enrichment_backlog'],
    });
  }

  return {
    agentKey: 'strategy-director',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'claimed')} claimed of ${n(f, 'listings_public')} public listings`),
  };
}

/* ============================================================ research analyst */
/**
 * Intelligence supply. Radar is the raw feed and the knowledge base is the
 * memory; an empty week on both means the strategy teams are planning blind
 * and nobody has noticed because nobody was scheduled to notice.
 */
export function researchAnalyst(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'radar_pending', label: 'Discovery records in review', value: n(f, 'radar_pending'), source: 'radar_candidates', filter: "status IN ('pending','review')" },
    { key: 'suggestions_7d', label: 'Suggestions this week', value: n(f, 'suggestions_7d'), source: 'radar_candidates' },
    { key: 'discovery_7d', label: 'Discovery records this week', value: n(f, 'discovery_7d'), source: 'radar_candidates' },
    { key: 'profile_requests_new', label: 'Profile requests to build', value: n(f, 'profile_requests_new'), source: 'profile_requests', filter: "status='new'" },
    { key: 'knowledge_7d', label: 'Knowledge entries this week', value: n(f, 'knowledge_7d'), source: 'os_knowledge' },
    { key: 'media_assets_discovered', label: 'Assets proposed by sources', value: n(f, 'media_assets_discovered'), source: 'business_media_assets', filter: "status='discovered'" },
  ];

  const findings: Finding[] = [];

  if (n(f, 'radar_pending') > 0) {
    findings.push({
      title: `${n(f, 'radar_pending')} discovery record${n(f, 'radar_pending') === 1 ? '' : 's'} waiting to be reviewed`,
      severity: 'watch',
      detail: 'Records that are not reviewed are not intelligence, they are a pile. Reviewing them is what turns sourcing into market data.',
      basis: ['radar_pending'],
    });
  }

  if (n(f, 'suggestions_7d') === 0 && n(f, 'discovery_7d') === 0) {
    findings.push({
      title: 'No discovery or suggestions this week',
      severity: 'watch',
      detail: 'The market feed has gone quiet on every source. Either nothing is being found or nothing is being submitted — both need attention.',
      basis: ['suggestions_7d', 'discovery_7d'],
    });
  }

  if (n(f, 'knowledge_7d') === 0) {
    findings.push({
      title: 'Nothing written to the knowledge base this week',
      severity: 'watch',
      detail: 'Decisions and SOPs that are not recorded are decisions that will be made differently next week.',
      basis: ['knowledge_7d'],
    });
  }

  return {
    agentKey: 'research-analyst',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'radar_pending')} records in the review queue`),
  };
}

/* ================================================================= seo manager */
/**
 * What search can actually read. The directory earns its traffic by answering
 * near-me queries, so a listing with no location, no description and no photo
 * might as well not exist — and the agent has to be willing to say that in
 * numbers rather than vibes.
 */
export function seoManager(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'listings_public', label: 'Public listings', value: n(f, 'listings_public'), source: 'businesses', filter: 'is_listable' },
    { key: 'no_description', label: 'Without a description', value: n(f, 'no_description'), source: 'businesses' },
    { key: 'no_location', label: 'Without a location', value: n(f, 'no_location'), source: 'businesses' },
    { key: 'no_website', label: 'Without a website', value: n(f, 'no_website'), source: 'businesses' },
    { key: 'no_media', label: 'Without any photo', value: n(f, 'no_media'), source: 'businesses' },
    { key: 'default_24_7', label: 'Relying on the platform default hours', value: n(f, 'default_24_7'), source: 'businesses' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'no_description') > 0 && n(f, 'listings_public') > 0) {
    findings.push({
      title: `${n(f, 'no_description')} listing${n(f, 'no_description') === 1 ? ' has' : 's have'} no description`,
      severity: 'attention',
      detail: 'With no body text there is almost nothing for search to index. These pages are invisible except to people who already know the name.',
      basis: ['no_description', 'listings_public'],
    });
  }

  if (n(f, 'no_media') > 0 && n(f, 'listings_public') > 0 && n(f, 'no_media') === n(f, 'listings_public')) {
    findings.push({
      title: 'Not one public listing has a photo',
      severity: 'attention',
      detail: 'Image-rich results are impossible without assets, and every category page looks abandoned.',
      basis: ['no_media', 'listings_public'],
    });
  }

  if (n(f, 'default_24_7') > 0) {
    findings.push({
      title: `${n(f, 'default_24_7')} listing${n(f, 'default_24_7') === 1 ? ' relies' : 's rely'} on platform-default hours`,
      severity: 'watch',
      detail: 'The default keeps the page honest, but search schema rewards explicit hours. These pages will not appear in rich results until an owner states them.',
      basis: ['default_24_7'],
    });
  }

  return {
    agentKey: 'seo-manager',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'no_description')} listings without a description`),
  };
}

/* ============================================================ social director */
/**
 * The calendar, not the sentiment. NowOpen's social function is a publishing
 * pipeline, so the agent watches whether the pipeline is fed, moving and
 * erroring — a failed post is a promise to a business owner that never lands.
 */
export function socialDirector(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'listings_public', label: 'Public listings', value: n(f, 'listings_public'), source: 'businesses', filter: 'is_listable' },
    { key: 'posts_scheduled', label: 'Posts scheduled', value: n(f, 'posts_scheduled'), source: 'social_scheduled_posts', filter: "status='scheduled'" },
    { key: 'posts_published_7d', label: 'Published this week', value: n(f, 'posts_published_7d'), source: 'social_scheduled_posts' },
    { key: 'posts_failed', label: 'Failed posts', value: n(f, 'posts_failed'), source: 'social_scheduled_posts', filter: "status='failed'" },
    { key: 'posts_due_24h', label: 'Due in the next 24 hours', value: n(f, 'posts_due_24h'), source: 'social_scheduled_posts' },
    { key: 'social_work_open', label: 'Open social work items', value: n(f, 'social_work_open'), source: 'os_work_items' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'posts_failed') > 0) {
    findings.push({
      title: `${n(f, 'posts_failed')} scheduled post${n(f, 'posts_failed') === 1 ? '' : 's'} failed`,
      severity: 'attention',
      detail: 'The publisher is erroring. Check last_error on the failed rows before anything else gets queued on top of them.',
      basis: ['posts_failed'],
    });
  }

  if (n(f, 'posts_scheduled') === 0 && n(f, 'listings_public') > 0) {
    findings.push({
      title: 'Nothing is scheduled',
      severity: 'watch',
      detail: 'An empty calendar means every channel goes quiet from here. Schedule ahead so nothing goes dark.',
      basis: ['posts_scheduled', 'listings_public'],
    });
  }

  if (n(f, 'posts_due_24h') > 0) {
    findings.push({
      title: `${n(f, 'posts_due_24h')} post${n(f, 'posts_due_24h') === 1 ? ' is' : 's are'} due in the next 24 hours`,
      severity: 'watch',
      detail: 'The publishing window is live. Anything wrong with these surfaces now will surface as a missed post.',
      basis: ['posts_due_24h'],
    });
  }

  return {
    agentKey: 'social-director',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'posts_published_7d')} posts published this week`),
  };
}

/* ============================================================ content manager */
/**
 * The copy layer under the calendar. A scheduled post without a caption is a
 * slot with nothing in it, and a work item that never leaves the department is
 * a brief that died on a desk.
 */
export function contentManager(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'social_work_open', label: 'Open content work items', value: n(f, 'social_work_open'), source: 'os_work_items' },
    { key: 'approvals_pending', label: 'Approvals waiting', value: n(f, 'approvals_pending'), source: 'os_approvals', filter: "status='pending'" },
    { key: 'posts_scheduled', label: 'Posts scheduled', value: n(f, 'posts_scheduled'), source: 'social_scheduled_posts' },
    { key: 'posts_needing_caption', label: 'Scheduled without a caption', value: n(f, 'posts_needing_caption'), source: 'social_scheduled_posts' },
    { key: 'posts_failed', label: 'Failed posts', value: n(f, 'posts_failed'), source: 'social_scheduled_posts' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'posts_needing_caption') > 0) {
    findings.push({
      title: `${n(f, 'posts_needing_caption')} scheduled post${n(f, 'posts_needing_caption') === 1 ? '' : 's'} have no caption`,
      severity: 'attention',
      detail: 'A slot without copy is a slot that will go out silent or not at all. Captions are the smallest asset with the largest effect.',
      basis: ['posts_needing_caption'],
    });
  }

  if (n(f, 'posts_failed') > 0) {
    findings.push({
      title: `${n(f, 'posts_failed')} post${n(f, 'posts_failed') === 1 ? '' : 's'} failed to publish`,
      severity: 'watch',
      detail: 'The failed rows still hold their copy. Republish once the reason is known.',
      basis: ['posts_failed'],
    });
  }

  if (n(f, 'social_work_open') > 0) {
    findings.push({
      title: `${n(f, 'social_work_open')} content work item${n(f, 'social_work_open') === 1 ? '' : 's'} open`,
      severity: 'watch',
      detail: 'Each open item is a piece of the content plan that has not finished moving.',
      basis: ['social_work_open'],
    });
  }

  return {
    agentKey: 'content-manager',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'posts_scheduled')} scheduled, ${n(f, 'posts_needing_caption')} without captions`),
  };
}

/* =========================================================== comms director */
/**
 * The gate on being public. Finished work in this department can damage the
 * company if it ships wrong, so the honest state is "waiting at approval",
 * counted until a person signs it — and the memory of the decision is only
 * kept if it reaches the knowledge base.
 */
export function commsDirector(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'publication_approvals_pending', label: 'Pieces waiting at the approval gate', value: n(f, 'publication_approvals_pending'), source: 'os_approvals', filter: "status='pending'" },
    { key: 'knowledge_30d', label: 'Knowledge entries in 30 days', value: n(f, 'knowledge_30d'), source: 'os_knowledge' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'publication_approvals_pending') > 0) {
    findings.push({
      title: `${n(f, 'publication_approvals_pending')} piece${n(f, 'publication_approvals_pending') === 1 ? '' : 's'} of finished work waiting on sign-off`,
      severity: 'attention',
      detail: 'Nothing public ships without a human decision, and every item here is that decision delayed. This queue is the real publish date.',
      basis: ['publication_approvals_pending'],
    });
  }

  if (n(f, 'knowledge_30d') === 0) {
    findings.push({
      title: 'No decisions recorded to the knowledge base in 30 days',
      severity: 'watch',
      detail: 'Approved work that is not written down stops being institutional memory and starts being something to rediscover.',
      basis: ['knowledge_30d'],
    });
  }

  return {
    agentKey: 'comms-director',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'publication_approvals_pending')} approvals pending`),
  };
}

/* ========================================================= creative director */
/**
 * The image supply chain, and its ethics. Media assets carry rights info or
 * they are a lawsuit waiting to be filed — an unlicensed asset is the one
 * thing that stays dangerous even when nobody is looking at it.
 */
export function creativeDirector(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'assets_awaiting_review', label: 'Assets awaiting review', value: n(f, 'assets_awaiting_review'), source: 'business_media_assets', filter: "moderation_status='pending'" },
    { key: 'assets_unlicensed', label: 'Assets with no rights decision', value: n(f, 'assets_unlicensed'), source: 'business_media_assets' },
    { key: 'takedowns_unhonoured', label: 'Takedown requests not honoured', value: n(f, 'takedowns_unhonoured'), source: 'business_media_assets' },
    { key: 'assets_published', label: 'Assets published', value: n(f, 'assets_published'), source: 'business_media_assets' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'assets_unlicensed') > 0) {
    findings.push({
      title: `${n(f, 'assets_unlicensed')} media asset${n(f, 'assets_unlicensed') === 1 ? '' : 's'} have no rights decision`,
      severity: 'attention',
      detail: 'Storing an asset without knowing whether we may use it is how a takedown starts. Decide rights before anything renders.',
      basis: ['assets_unlicensed'],
    });
  }

  if (n(f, 'takedowns_unhonoured') > 0) {
    findings.push({
      title: `${n(f, 'takedowns_unhonoured')} takedown request${n(f, 'takedowns_unhonoured') === 1 ? '' : 's'} not yet honoured`,
      severity: 'attention',
      detail: 'A takedown is a legal instruction, not a queue item. Honour it, keep the row as the record.',
      basis: ['takedowns_unhonoured'],
    });
  }

  if (n(f, 'assets_awaiting_review') > 0) {
    findings.push({
      title: `${n(f, 'assets_awaiting_review')} asset${n(f, 'assets_awaiting_review') === 1 ? '' : 's'} in the review queue`,
      severity: 'watch',
      detail: 'Discovered and waiting for a person to look. A review queue that grows owns every page it could have improved.',
      basis: ['assets_awaiting_review'],
    });
  }

  return {
    agentKey: 'creative-director',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'assets_awaiting_review')} assets in review`),
  };
}

/* ================================================================= copywriter */
/**
 * Whether the public pages can sell themselves. A description is the pitch, an
 * offer description is the deal, and a caption is the hook — each one is the
 * difference between a page that converts and a page that is furniture.
 */
export function copywriter(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'listings_public', label: 'Public listings', value: n(f, 'listings_public'), source: 'businesses', filter: 'is_listable' },
    { key: 'no_description', label: 'Without a description', value: n(f, 'no_description'), source: 'businesses' },
    { key: 'offers_no_description', label: 'Live offers without a description', value: n(f, 'offers_no_description'), source: 'business_offers' },
    { key: 'posts_needing_caption', label: 'Scheduled posts without a caption', value: n(f, 'posts_needing_caption'), source: 'social_scheduled_posts' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'no_description') > 0 && n(f, 'listings_public') > 0) {
    findings.push({
      title: `${n(f, 'no_description')} listing${n(f, 'no_description') === 1 ? ' has' : 's have'} no description`,
      severity: 'attention',
      detail: 'A page with no story cannot convert. This is the highest-yield copy task on the platform: one paragraph per business.',
      basis: ['no_description', 'listings_public'],
    });
  }

  if (n(f, 'offers_no_description') > 0) {
    findings.push({
      title: `${n(f, 'offers_no_description')} live offer${n(f, 'offers_no_description') === 1 ? '' : 's'} have no description`,
      severity: 'attention',
      detail: 'A deal nobody can read is not a deal. Every running offer needs the story of why it is worth acting on today.',
      basis: ['offers_no_description'],
    });
  }

  if (n(f, 'posts_needing_caption') > 0) {
    findings.push({
      title: `${n(f, 'posts_needing_caption')} scheduled post${n(f, 'posts_needing_caption') === 1 ? '' : 's'} have no caption`,
      severity: 'watch',
      detail: 'The hook is missing from the post itself.',
      basis: ['posts_needing_caption'],
    });
  }

  return {
    agentKey: 'copywriter',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'listings_public')} pages, ${n(f, 'no_description')} without a description`),
  };
}

/* ========================================================= production manager */
/**
 * Whether concepts become deliverables. The video product is only real when
 * an approved asset actually reaches the published state — everything before
 * that is a meeting.
 */
export function productionManager(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'video_assets_approved', label: 'Approved videos', value: n(f, 'video_assets_approved'), source: 'business_media_assets', filter: "asset_type='video' AND status='approved'" },
    { key: 'video_assets_published', label: 'Published videos', value: n(f, 'video_assets_published'), source: 'business_media_assets' },
    { key: 'video_assets_pending', label: 'Videos at discovery', value: n(f, 'video_assets_pending'), source: 'business_media_assets' },
    { key: 'production_work_open', label: 'Open production items', value: n(f, 'production_work_open'), source: 'os_work_items' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'video_assets_approved') > 0 && n(f, 'video_assets_published') === 0) {
    findings.push({
      title: `${n(f, 'video_assets_approved')} approved video${n(f, 'video_assets_approved') === 1 ? '' : 's'} not yet published`,
      severity: 'attention',
      detail: 'Work that passed QA is stuck between approval and delivery. The video product has inventory nobody can see.',
      basis: ['video_assets_approved', 'video_assets_published'],
    });
  }

  if (n(f, 'video_assets_pending') > 0) {
    findings.push({
      title: `${n(f, 'video_assets_pending')} video asset${n(f, 'video_assets_pending') === 1 ? '' : 's'} still at discovery`,
      severity: 'watch',
      detail: 'Discovered is a proposal, not a product. Decide which of these become real assets.',
      basis: ['video_assets_pending'],
    });
  }

  return {
    agentKey: 'production-manager',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'video_assets_approved')} approved videos`),
  };
}

/* ========================================================== post supervisor */
/**
 * The QA gate. Assets must be checked before they render — the moderation
 * queue is the honest inventory of what has not been verified, and a rejected
 * asset that is never revisited is a page quietly missing its image.
 */
export function postSupervisor(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'assets_awaiting_review', label: 'Assets awaiting QA', value: n(f, 'assets_awaiting_review'), source: 'business_media_assets', filter: "moderation_status='pending'" },
    { key: 'assets_rejected', label: 'Rejected assets', value: n(f, 'assets_rejected'), source: 'business_media_assets', filter: "moderation_status='rejected'" },
  ];

  const findings: Finding[] = [];

  if (n(f, 'assets_awaiting_review') > 0) {
    findings.push({
      title: `${n(f, 'assets_awaiting_review')} asset${n(f, 'assets_awaiting_review') === 1 ? '' : 's'} not yet quality-checked`,
      severity: 'attention',
      detail: 'Nothing should render before it is checked. This queue is the line between a curated directory and a scraped one.',
      basis: ['assets_awaiting_review'],
    });
  }

  if (n(f, 'assets_rejected') > 0) {
    findings.push({
      title: `${n(f, 'assets_rejected')} asset${n(f, 'assets_rejected') === 1 ? '' : 's'} were rejected`,
      severity: 'watch',
      detail: 'Rejected is not finished — the moderation reason decides whether it is corrected, replaced or dropped.',
      basis: ['assets_rejected'],
    });
  }

  return {
    agentKey: 'post-supervisor',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'assets_awaiting_review')} assets awaiting QA`),
  };
}

/* ============================================================= sales director */
/**
 * Where the pipeline can stall. Every profile request is a business owner who
 * asked us to do the work for them — the warmest lead there is — and it decays
 * in hours, not weeks. Also: create orders are revenue sitting at the quote
 * step, where the price decides whether the sale closes.
 */
export function salesDirector(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'prospects', label: 'Prospects awaiting an owner', value: n(f, 'prospects'), source: 'businesses', filter: "data_status='synthetic_unverified'" },
    { key: 'profile_requests_new', label: 'Profile requests to build', value: n(f, 'profile_requests_new'), source: 'profile_requests', filter: "status='new'" },
    { key: 'profile_requests_7d', label: 'Profile requests this week', value: n(f, 'profile_requests_7d'), source: 'profile_requests' },
    { key: 'orders_open', label: 'Orders awaiting a quote', value: n(f, 'orders_open'), source: 'create_orders', filter: "status IN ('new','quoting')" },
    { key: 'claimed', label: 'Businesses claimed', value: n(f, 'claimed'), source: 'businesses' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'profile_requests_new') > 0) {
    findings.push({
      title: `${n(f, 'profile_requests_new')} owner${n(f, 'profile_requests_new') === 1 ? ' has' : 's have'} asked us to build their page`,
      severity: 'attention',
      detail: 'Someone sent their name and their number and then waited. Answer before the ask goes cold — this is acquisition arriving by itself.',
      basis: ['profile_requests_new'],
    });
  }

  if (n(f, 'orders_open') > 0) {
    findings.push({
      title: `${n(f, 'orders_open')} order${n(f, 'orders_open') === 1 ? '' : 's'} waiting for a real quote`,
      severity: 'attention',
      detail: 'The catalogue shows estimates nobody has confirmed. The quoted price is the moment each one becomes a yes or a no.',
      basis: ['orders_open'],
    });
  }

  if (n(f, 'prospects') > 0 && n(f, 'profile_requests_7d') === 0) {
    findings.push({
      title: `${n(f, 'prospects')} prospects, but nobody asked to be built this week`,
      severity: 'watch',
      detail: 'The front door for that funnel is not being seen. The request form is the surface that turns prospects into jobs of work.',
      basis: ['prospects', 'profile_requests_7d'],
    });
  }

  return {
    agentKey: 'sales-director',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'profile_requests_new')} profile requests waiting`),
  };
}

/* ======================================================== operations director */
/**
 * Whether anything is stuck and unspoken. Blocked work and failed queues are
 * the operations cost of silence — each one is a thing that was supposed to
 * happen and did not, sitting in a status column instead of in front of a
 * person.
 */
export function operationsDirector(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'work_blocked', label: 'Blocked work items', value: n(f, 'work_blocked'), source: 'os_work_items', filter: "status='blocked'" },
    { key: 'work_waiting', label: 'Waiting work items', value: n(f, 'work_waiting'), source: 'os_work_items', filter: "status='waiting'" },
    { key: 'approvals_pending', label: 'Approvals waiting on a human', value: n(f, 'approvals_pending'), source: 'os_approvals', filter: "status='pending'" },
    { key: 'orders_open', label: 'Orders awaiting a quote', value: n(f, 'orders_open'), source: 'create_orders' },
    { key: 'enrichment_failed', label: 'Failed enrichment jobs', value: n(f, 'enrichment_failed'), source: 'business_enrichment_jobs', filter: "status='failed'" },
  ];

  const findings: Finding[] = [];

  if (n(f, 'work_blocked') > 0) {
    findings.push({
      title: `${n(f, 'work_blocked')} work item${n(f, 'work_blocked') === 1 ? ' is' : 's are'} blocked`,
      severity: 'attention',
      detail: 'Blocked is the most expensive status in the company: a dependency problem owned by nobody. Unblocking these is the highest-leverage action available.',
      basis: ['work_blocked'],
    });
  }

  if (n(f, 'enrichment_failed') > 0) {
    findings.push({
      title: `${n(f, 'enrichment_failed')} enrichment job${n(f, 'enrichment_failed') === 1 ? '' : 's'} failed`,
      severity: 'attention',
      detail: 'The intelligence engine is losing rows. Check the error column before the backlog hides the pattern.',
      basis: ['enrichment_failed'],
    });
  }

  if (n(f, 'approvals_pending') > 0) {
    findings.push({
      title: `${n(f, 'approvals_pending')} approval${n(f, 'approvals_pending') === 1 ? '' : 's'} waiting on a human`,
      severity: 'watch',
      detail: 'Approvals are where work converts to decisions. Each day an approval waits, the work behind it ages.',
      basis: ['approvals_pending'],
    });
  }

  return {
    agentKey: 'operations-director',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'work_blocked')} blocked work items`),
  };
}

/* ============================================================ finance analyst */
/**
 * The cash flow the revenue board can show pre-revenue. Order quotes decide
 * whether money appears, and checkout intents that never become paid are a
 * funnel leaking at the very last step — which is worth saying even though the
 * numbers are small.
 */
export function financeAnalyst(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'orders_open', label: 'Orders awaiting a quote', value: n(f, 'orders_open'), source: 'create_orders', filter: "status IN ('new','quoting')" },
    { key: 'orders_quoted', label: 'Orders quoted', value: n(f, 'orders_quoted'), source: 'create_orders', filter: "status='quoted'" },
    { key: 'orders_delivered', label: 'Orders delivered', value: n(f, 'orders_delivered'), source: 'create_orders', filter: "status='delivered'" },
    { key: 'orders_cancelled', label: 'Orders cancelled', value: n(f, 'orders_cancelled'), source: 'create_orders', filter: "status='cancelled'" },
    { key: 'leads_total', label: 'Checkout intents', value: n(f, 'leads_total'), source: 'payment_intents' },
    { key: 'leads_paid', label: 'Intents paid', value: n(f, 'leads_paid'), source: 'payment_intents', filter: "status='paid'" },
    { key: 'founding_claimed', label: 'Founding numbers issued', value: n(f, 'founding_claimed'), source: 'founding_members' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'orders_open') > 0) {
    findings.push({
      title: `${n(f, 'orders_open')} order${n(f, 'orders_open') === 1 ? '' : 's'} awaiting a quote`,
      severity: 'watch',
      detail: 'Revenue is being decided in a queue, not by a price. Quoted orders are the number this platform can point to.',
      basis: ['orders_open'],
    });
  }

  if (n(f, 'leads_total') > 0 && n(f, 'leads_paid') === 0) {
    findings.push({
      title: `${n(f, 'leads_total')} checkout intent${n(f, 'leads_total') === 1 ? '' : 's'}, none paid`,
      severity: 'watch',
      detail: 'Capture is working and checkout is closing nobody. Pre-payment that is a real gap, not just a stage.',
      basis: ['leads_total', 'leads_paid'],
    });
  }

  return {
    agentKey: 'finance-analyst',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'orders_open')} open orders`),
  };
}

/* ============================================================ product manager */
/**
 * Whether the roadmap can ship. A launch with open checklist items is not
 * behind the plan — it IS the plan, and this agent counts how many times the
 * team is right about that. Blocked work and a quiet suggestion door are the
 * two ways the roadmap learns nothing.
 */
export function productManager(f: RawFacts): AgentResult {
  const facts: Fact[] = [
    { key: 'launches_total', label: 'Launches on the board', value: n(f, 'launches_total'), source: 'os_launches' },
    { key: 'launches_ready', label: 'Launches with a full checklist', value: n(f, 'launches_ready'), source: 'os_launches' },
    { key: 'work_items_open', label: 'Open work items', value: n(f, 'work_items_open'), source: 'os_work_items' },
    { key: 'work_blocked', label: 'Blocked items', value: n(f, 'work_blocked'), source: 'os_work_items' },
    { key: 'suggestions_7d', label: 'Suggestions this week', value: n(f, 'suggestions_7d'), source: 'radar_candidates' },
    { key: 'listings_public', label: 'Public listings', value: n(f, 'listings_public'), source: 'businesses', filter: 'is_listable' },
  ];

  const findings: Finding[] = [];

  if (n(f, 'launches_total') > 0 && n(f, 'launches_ready') === 0) {
    findings.push({
      title: 'Nothing on the launch board is shippable',
      severity: 'attention',
      detail: 'Every launch still has checklist items open. The roadmap is a set of commitments with no completion.',
      basis: ['launches_total', 'launches_ready'],
    });
  }

  if (n(f, 'work_blocked') > 0) {
    findings.push({
      title: `${n(f, 'work_blocked')} roadmap item${n(f, 'work_blocked') === 1 ? '' : 's'} blocked`,
      severity: 'attention',
      detail: 'Find the dependency and unblock it — blocked roadmap items are how delivery dates quietly stop being true.',
      basis: ['work_blocked'],
    });
  }

  if (n(f, 'suggestions_7d') === 0 && n(f, 'listings_public') > 0) {
    findings.push({
      title: 'No suggestions this week',
      severity: 'watch',
      detail: 'The feedback door is quiet. Either the platform is not being seen or nobody bothered to tell us what to fix.',
      basis: ['suggestions_7d', 'listings_public'],
    });
  }

  return {
    agentKey: 'product-manager',
    facts,
    findings: bySeverity(findings),
    summary: summarise(findings, `${n(f, 'launches_ready')} of ${n(f, 'launches_total')} launches ready`),
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
  'strategy-director': strategyDirector,
  'research-analyst': researchAnalyst,
  'seo-manager': seoManager,
  'social-director': socialDirector,
  'content-manager': contentManager,
  'comms-director': commsDirector,
  'creative-director': creativeDirector,
  'copywriter': copywriter,
  'production-manager': productionManager,
  'post-supervisor': postSupervisor,
  'sales-director': salesDirector,
  'operations-director': operationsDirector,
  'finance-analyst': financeAnalyst,
  'product-manager': productManager,
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
