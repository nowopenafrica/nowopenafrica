// NowOpen OS — workforce directory data layer (pure, no React / Supabase I/O).
//
// The people + AI roster for an org. Statuses are canonical lowercase; the
// per-kind allowed sets live here so the UI and the DB CHECK constraint stay in
// sync. Rollups and filtering are pure so they're unit-testable, matching the
// rest of src/lib. The component layer reads os_workforce from Supabase and
// falls back to AI_ROSTER_SEED (clearly labelled) until the migration is
// applied, the same honest-fallback pattern used elsewhere in the app.

export type WorkforceKind = 'human' | 'ai';

/** The first NowOpen tenant, seeded by 20260808010000_os_workforce. */
export const NOWOPEN_ORG_ID = '00000000-0000-4000-8000-00000000a001';

export const HUMAN_STATUSES = ['clocked-in', 'in-meeting', 'on-break', 'working', 'away', 'clocked-out'] as const;
export const AI_STATUSES = ['active', 'working', 'waiting', 'blocked', 'awaiting-approval', 'off-schedule', 'error'] as const;

export type HumanStatus = typeof HUMAN_STATUSES[number];
export type AiStatus = typeof AI_STATUSES[number];
export type WorkforceStatus = HumanStatus | AiStatus;

export const STATUS_LABELS: Record<WorkforceStatus, string> = {
  active: 'Active',
  working: 'Working',
  waiting: 'Waiting',
  blocked: 'Blocked',
  'awaiting-approval': 'Awaiting approval',
  'off-schedule': 'Off schedule',
  error: 'Error',
  'clocked-in': 'Clocked in',
  'in-meeting': 'In meeting',
  'on-break': 'On break',
  away: 'Away',
  'clocked-out': 'Clocked out',
};

/** The statuses a given kind may hold. */
export function statusesFor(kind: WorkforceKind): readonly WorkforceStatus[] {
  return kind === 'ai' ? AI_STATUSES : HUMAN_STATUSES;
}

export function isValidStatus(kind: WorkforceKind, status: string): status is WorkforceStatus {
  return (statusesFor(kind) as readonly string[]).includes(status);
}

export interface WorkforceMember {
  id: string;
  org_id: string;
  kind: WorkforceKind;
  name: string;
  title: string;
  department: string;
  status: WorkforceStatus;
  current_work?: string | null;
  owner_user_id?: string | null;
  agent_key?: string | null;
  /** The member this role reports to (an os_workforce row id). Seeded by
   *  20260808090000_os_hierarchy.sql; the org chart (OS-17) reads it. */
  reports_to?: string | null;
  kpis?: Record<string, unknown>;
  updated_at?: string;
}

// The 20 vision departments, each linked to the Admin Creator section that
// already powers it (when one exists). Departments without a home yet stay
// null — they're honest roadmap items, not fake offices.
export interface WorkforceDepartment {
  name: string;
  sectionId: string | null;
  blurb: string;
}

export const DEPARTMENTS: WorkforceDepartment[] = [
  { name: 'Founder Office', sectionId: 'founder', blurb: 'Vision, strategy, capital and the daily brief.' },
  { name: 'Strategy & BI', sectionId: 'analytics-war-room', blurb: 'Market intelligence, planning and KPI analysis.' },
  { name: 'Marketing & Growth', sectionId: 'brand-director', blurb: 'Acquisition, campaigns, SEO and growth experiments.' },
  { name: 'Social Media', sectionId: 'social', blurb: 'Every channel, the calendar and community publishing.' },
  { name: 'Communications & PR', sectionId: 'press-room', blurb: 'Announcements and press — public statements need human approval.' },
  { name: 'Creative & Brand', sectionId: 'creative', blurb: 'The NowOpen look: concepts, design and the design system.' },
  { name: 'Production', sectionId: 'video-studio', blurb: 'Scripts, storyboards, shot lists and production plans.' },
  { name: 'Post Production', sectionId: 'motion', blurb: 'Edits, captions, ratio versions and QC before delivery.' },
  { name: 'Sales & Business Development', sectionId: 'partners', blurb: 'Prospects, proposals, sponsorships and partnerships.' },
  { name: 'Operations', sectionId: null, blurb: 'SOPs, vendors, service delivery and internal workflows.' },
  { name: 'Finance', sectionId: null, blurb: 'Revenue, expenses, cash flow and reporting for approval.' },
  { name: 'Product & Engineering', sectionId: 'launch', blurb: 'Roadmap, builds, launches and QA.' },
  { name: 'Customer Success', sectionId: 'community', blurb: 'Onboarding, support and retention.' },
  { name: 'Trust & Safety', sectionId: null, blurb: 'Verification, moderation and abuse — human escalation.' },
  { name: 'Email & Customer Communications', sectionId: 'content-factory', blurb: 'Retention email, newsletters and customer comms — written, sent and measured.' },
  { name: 'Community & Culture', sectionId: 'community', blurb: 'The NowOpen community: events, culture and member voice.' },
  { name: 'Partnerships', sectionId: 'partners', blurb: 'Investors, media, government, creators, agencies, sponsors and universities.' },
  { name: 'Product Design', sectionId: 'design-system', blurb: 'Product flows, UI, prototypes and the design system.' },
  { name: 'Motion Design', sectionId: 'motion', blurb: 'Animation, Lottie, motion posters and kinetic type.' },
  { name: 'Data & Analytics', sectionId: 'analytics-war-room', blurb: 'Every number turned into a decision: funnels, retention and revenue.' },
];

export function departmentByName(name: string): WorkforceDepartment | undefined {
  return DEPARTMENTS.find((d) => d.name === name);
}

/** The honest dev/fallback roster: the planned AI team plus (when signed in)
 *  the current user as a clocked-in human owner. Used by the OS modules until
 *  the os_workforce migration is applied to the project. */
export function seedMembers(user?: { id?: string; email?: string }): WorkforceMember[] {
  const ai: WorkforceMember[] = AI_ROSTER_SEED.map((r) => ({
    id: `seed-ai-${r.agentKey}`,
    org_id: NOWOPEN_ORG_ID,
    kind: 'ai',
    name: r.name,
    title: r.title,
    department: r.department,
    status: 'active',
    current_work: r.currentWork,
    agent_key: r.agentKey,
  }));
  if (!user?.id) return ai;
  return [{
    id: `seed-human-${user.id}`,
    org_id: NOWOPEN_ORG_ID,
    kind: 'human',
    name: user.email?.split('@')[0] || 'Owner',
    title: 'Owner',
    department: 'Founder Office',
    status: 'clocked-in',
    current_work: 'Running NowOpen Africa — this view is you. Clock in from the office.',
    owner_user_id: user.id,
  }, ...ai];
}

// Planned AI roster, mirrored by the 20260808010000_os_workforce seed. The
// component uses this as the honest dev/fallback state until the migration is
// applied to the project. Keep it in sync with the SQL seed.
export interface AiRosterSeed {
  name: string;
  title: string;
  department: string;
  agentKey: string;
  currentWork: string;
}

export const AI_ROSTER_SEED: AiRosterSeed[] = [
  { name: 'Chief of Staff', title: 'Chief of Staff', department: 'Founder Office', agentKey: 'chief-of-staff', currentWork: 'Synthesizes the daily brief for the founder; tracks priorities, blockers and approvals.' },
  { name: 'Strategy Director', title: 'Strategy Director', department: 'Strategy & BI', agentKey: 'strategy-director', currentWork: 'Watches the market and the five launch KPIs; drafts the quarterly plan.' },
  { name: 'Research Analyst', title: 'Research Analyst', department: 'Strategy & BI', agentKey: 'research-analyst', currentWork: 'Gathers market and competitor intelligence for the strategy and growth teams.' },
  { name: 'Growth Director', title: 'Growth Director', department: 'Marketing & Growth', agentKey: 'growth-director', currentWork: 'Plans acquisition experiments that move profile impressions, signups and leads.' },
  { name: 'SEO Manager', title: 'SEO Manager', department: 'Marketing & Growth', agentKey: 'seo-manager', currentWork: 'Owns discoverability: on-page SEO, sitemaps and search console feedback.' },
  { name: 'Social Director', title: 'Social Director', department: 'Social Media', agentKey: 'social-director', currentWork: 'Runs the content calendar and publishing across every NowOpen channel.' },
  { name: 'Content Manager', title: 'Content Manager', department: 'Social Media', agentKey: 'content-manager', currentWork: 'Turns briefs into posts, series and engagement; keeps every channel on voice.' },
  { name: 'Communications Director', title: 'Communications Director', department: 'Communications & PR', agentKey: 'comms-director', currentWork: 'Drafts announcements and press material; anything public goes through human approval.' },
  { name: 'Creative Director', title: 'Creative Director', department: 'Creative & Brand', agentKey: 'creative-director', currentWork: 'Owns the NowOpen look: campaign concepts, design direction and the design system.' },
  { name: 'Copywriter', title: 'Copywriter', department: 'Creative & Brand', agentKey: 'copywriter', currentWork: 'Writes marketing, landing-page, email and campaign copy in the NowOpen voice.' },
  { name: 'Production Manager', title: 'Production Manager', department: 'Production', agentKey: 'production-manager', currentWork: 'Turns concepts into scripts, storyboards, shot lists and production plans.' },
  { name: 'Post Supervisor', title: 'Post Supervisor', department: 'Post Production', agentKey: 'post-supervisor', currentWork: 'Checks every video before delivery: captions, ratio versions, colour and sound.' },
  { name: 'Sales Director', title: 'Sales Director', department: 'Sales & Business Development', agentKey: 'sales-director', currentWork: 'Scores prospects, prepares proposals and tracks the partnership pipeline.' },
  { name: 'Operations Director', title: 'Operations Director', department: 'Operations', agentKey: 'operations-director', currentWork: 'Runs daily operations: SOPs, vendors, service delivery and internal workflows.' },
  { name: 'Finance Analyst', title: 'Finance Analyst', department: 'Finance', agentKey: 'finance-analyst', currentWork: 'Tracks revenue, expenses and cash flow; prepares monthly finance reporting for approval.' },
  { name: 'Product Manager', title: 'Product Manager', department: 'Product & Engineering', agentKey: 'product-manager', currentWork: 'Owns the roadmap, gathers feedback and keeps launches on track.' },
  { name: 'Customer Success Manager', title: 'Customer Success Manager', department: 'Customer Success', agentKey: 'customer-success-manager', currentWork: 'Onboards businesses and watches for drop-off; nudges owners before they churn.' },
  { name: 'Trust & Safety Agent', title: 'Trust & Safety Agent', department: 'Trust & Safety', agentKey: 'trust-safety-agent', currentWork: 'Reviews verification and flags suspicious activity; enforcement escalates to a human.' },
  { name: 'Email Marketing Manager', title: 'Email Marketing Manager', department: 'Email & Customer Communications', agentKey: 'email-marketing-manager', currentWork: 'Writes, segments and schedules retention email and newsletters; measures opens and clicks.' },
  { name: 'Community Manager', title: 'Community Manager', department: 'Community & Culture', agentKey: 'community-manager', currentWork: 'Runs events, keeps the community calendar and turns member feedback into action.' },
  { name: 'Partnerships Manager', title: 'Partnerships Manager', department: 'Partnerships', agentKey: 'partnerships-manager', currentWork: 'Scores partnership leads and prepares sponsorship, media and university proposals.' },
  { name: 'Product Designer', title: 'Product Designer', department: 'Product Design', agentKey: 'product-designer', currentWork: 'Designs product flows, screens and prototypes against the design system.' },
  { name: 'Motion Designer', title: 'Motion Designer', department: 'Motion Design', agentKey: 'motion-designer', currentWork: 'Builds Lottie animations, motion posters and kinetic typography.' },
  { name: 'Data Analyst', title: 'Data Analyst', department: 'Data & Analytics', agentKey: 'data-analyst', currentWork: 'Turns funnels, retention and revenue numbers into recommendations.' },
];

export interface WorkforceSummary {
  total: number;
  humans: number;
  ai: number;
  byStatus: Record<string, number>;
  byDepartment: Record<string, number>;
  /** blocked + awaiting-approval + error — the rows a founder should look at. */
  needingAttention: number;
}

export function summarizeWorkforce(members: WorkforceMember[]): WorkforceSummary {
  const byStatus: Record<string, number> = {};
  const byDepartment: Record<string, number> = {};
  let humans = 0;
  let attention = 0;
  for (const m of members) {
    if (m.kind === 'human') humans += 1;
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
    byDepartment[m.department] = (byDepartment[m.department] ?? 0) + 1;
    if (m.status === 'blocked' || m.status === 'awaiting-approval' || m.status === 'error') attention += 1;
  }
  return {
    total: members.length,
    humans,
    ai: members.length - humans,
    byStatus,
    byDepartment,
    needingAttention: attention,
  };
}

export interface WorkforceFilters {
  kind: 'all' | WorkforceKind;
  department: 'all' | string;
  status: 'all' | string;
}

export function filterWorkforce(members: WorkforceMember[], filters: WorkforceFilters): WorkforceMember[] {
  return members.filter((m) => {
    if (filters.kind !== 'all' && m.kind !== filters.kind) return false;
    if (filters.department !== 'all' && m.department !== filters.department) return false;
    if (filters.status !== 'all' && m.status !== filters.status) return false;
    return true;
  });
}

/** The human roster row that belongs to a signed-in user, if one exists. */
export function findHumanOwner(
  members: readonly WorkforceMember[],
  userId?: string | null,
): WorkforceMember | undefined {
  if (!userId) return undefined;
  return members.find((m) => m.kind === 'human' && m.owner_user_id === userId);
}

/** Clock a human in from the office. Pure — the board patches the same shape
 *  it would write to os_workforce, so the fallback session stays honest. */
export function clockIn(member: WorkforceMember, now = new Date()): WorkforceMember {
  return { ...member, status: 'clocked-in', updated_at: now.toISOString() };
}

/** Clock a human out — status only; their assigned work stays on the board. */
export function clockOut(member: WorkforceMember, now = new Date()): WorkforceMember {
  return { ...member, status: 'clocked-out', current_work: null, updated_at: now.toISOString() };
}
