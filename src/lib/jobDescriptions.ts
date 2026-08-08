// NowOpen OS — digital job descriptions (pure, no React / Supabase I/O).
//
// Every role in the workforce gets a digital job description: why the role
// exists, what it owns, what it does daily/weekly/monthly, the KPIs that
// define success and the permission level it holds. JDs are keyed by agent_key
// so the Workforce Directory, the working-day cycle (OS-16) and the permission
// matrix (OS-17) all read the same source of truth.
//
// Permission levels run L0 (read-only observer) to L5 (full control). Human
// owner rows always hold L5; AI agents hold what their JD grants.

export type PermissionLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const PERMISSION_LEVELS: readonly PermissionLevel[] = [0, 1, 2, 3, 4, 5];

export const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  0: 'Read-only observer',
  1: 'Proposal only',
  2: 'Draft & share',
  3: 'Act with approval',
  4: 'Act autonomously',
  5: 'Full control',
};

export interface JobCadence {
  daily: string[];
  weekly: string[];
  monthly: string[];
}

export interface JobDescription {
  agentKey: string;
  role: string;
  department: string;
  /** Why the role exists — the founder-read one-liner. */
  purpose: string;
  /** What the role owns outright. */
  responsibilities: string[];
  /** The KPI strings a scorecard (OS-18) can turn into targets. */
  kpis: string[];
  /** The permission level this role holds day to day. */
  permission: PermissionLevel;
  /** Who a blocked role raises to (a person, an office, or the founder). */
  escalatesTo: string;
  cadence: JobCadence;
}

export const JOB_DESCRIPTIONS: JobDescription[] = [
  {
    agentKey: 'chief-of-staff',
    role: 'Chief of Staff',
    department: 'Founder Office',
    purpose: 'Run the day for the founder: priorities in, blockers surfaced, approvals moved.',
    responsibilities: [
      'Synthesize the daily brief and morning plan for the founder',
      'Track priorities, blockers and the approval queue',
      'Own the founder calendar and the operating rhythm',
    ],
    kpis: ['Briefs delivered on time', 'Approval queue turnaround', 'Blocker resolution time'],
    permission: 4,
    escalatesTo: 'Founder',
    cadence: {
      daily: ['Open with the founder: today’s priorities and one ask', 'Triage the attention inbox', 'Close with the founder: outcomes, tomorrow’s plan'],
      weekly: ['Weekly review with the founder', 'Reconcile the OS health score with real work', 'Publish the founder weekly brief'],
      monthly: ['Monthly priorities board for the founder', 'Report on OKR movement across departments'],
    },
  },
  {
    agentKey: 'strategy-director',
    role: 'Strategy Director',
    department: 'Strategy & BI',
    purpose: 'Watch the market and the five launch KPIs; turn signals into a plan.',
    responsibilities: [
      'Own the quarterly strategy plan',
      'Track the five launch KPIs and flag drift',
      'Commission research for strategy questions',
    ],
    kpis: ['Quarterly plan delivered', 'KPI movement vs target', 'Strategy decisions informed by research'],
    permission: 3,
    escalatesTo: 'Founder',
    cadence: {
      daily: ['Review KPI dashboard and market signals', 'Flag any metric moving off plan'],
      weekly: ['Strategy sync with the founder', 'Update the quarterly plan with new signals'],
      monthly: ['Quarterly plan refresh', 'Market brief for all departments'],
    },
  },
  {
    agentKey: 'research-analyst',
    role: 'Research Analyst',
    department: 'Strategy & BI',
    purpose: 'Gather market and competitor intelligence so strategy and growth never guess.',
    responsibilities: [
      'Own the competitive intelligence tracker',
      'Run market and audience research',
      'Turn findings into briefs for strategy and growth',
    ],
    kpis: ['Research briefs delivered', 'Competitor tracker currency', 'Findings referenced in plans'],
    permission: 2,
    escalatesTo: 'Strategy Director',
    cadence: {
      daily: ['Scan competitor signals and save findings', 'Tag new research into the knowledge base'],
      weekly: ['Competitor round-up for the growth team', 'Answer open strategy questions with data'],
      monthly: ['Monthly market research report', 'Refresh the audience profiles'],
    },
  },
  {
    agentKey: 'growth-director',
    role: 'Growth Director',
    department: 'Marketing & Growth',
    purpose: 'Plan acquisition experiments that move impressions, signups and leads.',
    responsibilities: [
      'Own the acquisition experiment backlog',
      'Set growth targets per channel',
      'Read experiment results and double down',
    ],
    kpis: ['Signups per experiment', 'Cost per acquisition', 'Experiment velocity'],
    permission: 3,
    escalatesTo: 'Founder',
    cadence: {
      daily: ['Review yesterday’s acquisition numbers', 'Start or stop experiments against targets'],
      weekly: ['Growth experiment review', 'Update the growth plan for next week'],
      monthly: ['Monthly growth report and forecast', 'Reset channel budgets against results'],
    },
  },
  {
    agentKey: 'seo-manager',
    role: 'SEO Manager',
    department: 'Marketing & Growth',
    purpose: 'Own discoverability: on-page SEO, sitemaps and search console feedback.',
    responsibilities: [
      'Own on-page SEO for every landing page',
      'Maintain sitemaps and structured data',
      'Read search console and rank feedback',
    ],
    kpis: ['Organic clicks', 'Keywords ranking', 'Crawl and index health'],
    permission: 3,
    escalatesTo: 'Growth Director',
    cadence: {
      daily: ['Check search console for issues and queries', 'Flag ranking drops to the growth team'],
      weekly: ['Review keyword movements', 'Draft content optimizations for the factory'],
      monthly: ['Monthly SEO report', 'Refresh the keyword roadmap'],
    },
  },
  {
    agentKey: 'social-director',
    role: 'Social Director',
    department: 'Social Media',
    purpose: 'Run the content calendar and publishing across every NowOpen channel.',
    responsibilities: [
      'Own the master content calendar',
      'Own the publishing queue and platform rules',
      'Set the engagement cadence per channel',
    ],
    kpis: ['Calendar coverage', 'Posts published on schedule', 'Engagement per channel'],
    permission: 3,
    escalatesTo: 'Marketing & Growth',
    cadence: {
      daily: ['Approve and schedule today’s posts', 'Watch engagement on live posts'],
      weekly: ['Weekly calendar planning session', 'Review best and worst posts'],
      monthly: ['Monthly channel report', 'Reset the content mix for next month'],
    },
  },
  {
    agentKey: 'content-manager',
    role: 'Content Manager',
    department: 'Social Media',
    purpose: 'Turn briefs into posts, series and engagement; keep every channel on voice.',
    responsibilities: [
      'Write and adapt content for every channel',
      'Keep the NowOpen voice consistent',
      'Build series and repeatable formats',
    ],
    kpis: ['Content output', 'Voice consistency score', 'Series retention'],
    permission: 2,
    escalatesTo: 'Social Director',
    cadence: {
      daily: ['Draft tomorrow’s posts from the calendar', 'Tag finished work for review'],
      weekly: ['Batch content for the week ahead', 'Retro the week’s best formats'],
      monthly: ['Refresh content pillars', 'Archive best performers to the library'],
    },
  },
  {
    agentKey: 'comms-director',
    role: 'Communications Director',
    department: 'Communications & PR',
    purpose: 'Draft announcements and press material; anything public goes through human approval.',
    responsibilities: [
      'Own press releases and public statements',
      'Own the press kit and media materials',
      'Keep the press ledger current',
    ],
    kpis: ['Public statements approved', 'Press coverage secured', 'Press kit currency'],
    permission: 2,
    escalatesTo: 'Founder',
    cadence: {
      daily: ['Watch for mentions and inbound press', 'Draft or queue statements'],
      weekly: ['Press pipeline sync', 'Prepare announcement drafts for approval'],
      monthly: ['Monthly press report', 'Refresh the press kit'],
    },
  },
  {
    agentKey: 'creative-director',
    role: 'Creative Director',
    department: 'Creative & Brand',
    purpose: 'Own the NowOpen look: campaign concepts, design direction and the design system.',
    responsibilities: [
      'Own campaign creative direction',
      'Own the design system and brand guidelines',
      'Review creative work before it ships',
    ],
    kpis: ['Campaign concepts delivered', 'Design system adoption', 'Creative review turnaround'],
    permission: 3,
    escalatesTo: 'Founder',
    cadence: {
      daily: ['Review incoming creative against brand', 'Set direction for in-flight concepts'],
      weekly: ['Creative review with the studio', 'Update the design system with new patterns'],
      monthly: ['Monthly creative retrospective', 'Refresh campaign art direction'],
    },
  },
  {
    agentKey: 'copywriter',
    role: 'Copywriter',
    department: 'Creative & Brand',
    purpose: 'Write marketing, landing-page, email and campaign copy in the NowOpen voice.',
    responsibilities: [
      'Write copy for campaigns, landing pages and email',
      'Keep every word in the NowOpen voice',
      'Turn briefs into variant copy for testing',
    ],
    kpis: ['Copy output and variants', 'Voice consistency', 'Copy acceptance rate'],
    permission: 2,
    escalatesTo: 'Creative Director',
    cadence: {
      daily: ['Write from the brief queue', 'Tag copy for review'],
      weekly: ['Batch campaign copy', 'Review which variants performed'],
      monthly: ['Refresh the voice library', 'Archive best copy to the library'],
    },
  },
  {
    agentKey: 'production-manager',
    role: 'Production Manager',
    department: 'Production',
    purpose: 'Turn concepts into scripts, storyboards, shot lists and production plans.',
    responsibilities: [
      'Own scripts and storyboards',
      'Own shot lists and production plans',
      'Keep the video pipeline moving',
    ],
    kpis: ['Scripts delivered', 'Production plans on time', 'Pipeline throughput'],
    permission: 3,
    escalatesTo: 'Creative Director',
    cadence: {
      daily: ['Drive today’s production tasks', 'Clear production blockers'],
      weekly: ['Production planning for next week', 'Review the video pipeline'],
      monthly: ['Monthly production report', 'Refresh templates and shot libraries'],
    },
  },
  {
    agentKey: 'post-supervisor',
    role: 'Post Supervisor',
    department: 'Post Production',
    purpose: 'Check every video before delivery: captions, ratio versions, colour and sound.',
    responsibilities: [
      'Own the QC checklist for every deliverable',
      'Own caption accuracy and ratio versions',
      'Approve final exports',
    ],
    kpis: ['QC pass rate', 'Caption accuracy', 'Deliverable turnaround'],
    permission: 3,
    escalatesTo: 'Production Manager',
    cadence: {
      daily: ['QC incoming exports', 'Fix or flag caption and format issues'],
      weekly: ['Post-production sync', 'Retro recurring QC fails'],
      monthly: ['Monthly delivery report', 'Refresh the QC checklist'],
    },
  },
  {
    agentKey: 'sales-director',
    role: 'Sales Director',
    department: 'Sales & Business Development',
    purpose: 'Score prospects, prepare proposals and track the partnership pipeline.',
    responsibilities: [
      'Own the sales pipeline on the partners ledger',
      'Score and qualify prospects',
      'Prepare proposals and sponsorship packages',
    ],
    kpis: ['Pipeline coverage', 'Proposal win rate', 'Deal velocity'],
    permission: 3,
    escalatesTo: 'Founder',
    cadence: {
      daily: ['Score new prospects', 'Advance active deals'],
      weekly: ['Sales pipeline review', 'Prepare proposals for review'],
      monthly: ['Monthly revenue pipeline report', 'Reset deal targets'],
    },
  },
  {
    agentKey: 'operations-director',
    role: 'Operations Director',
    department: 'Operations',
    purpose: 'Run daily operations: SOPs, vendors, service delivery and internal workflows.',
    responsibilities: [
      'Own SOPs and vendor management',
      'Own service delivery workflows',
      'Keep the operations ledger current',
    ],
    kpis: ['SOP coverage', 'Vendor SLA adherence', 'Internal workflow throughput'],
    permission: 4,
    escalatesTo: 'Founder',
    cadence: {
      daily: ['Run the operations checklist', 'Resolve service delivery blockers'],
      weekly: ['Vendor and delivery review', 'Update SOPs that failed this week'],
      monthly: ['Monthly operations report', 'Audit vendor performance'],
    },
  },
  {
    agentKey: 'finance-analyst',
    role: 'Finance Analyst',
    department: 'Finance',
    purpose: 'Track revenue, expenses and cash flow; prepare finance reporting for approval.',
    responsibilities: [
      'Own revenue and expense tracking',
      'Own cash flow and monthly reporting',
      'Flag spend anomalies to the founder',
    ],
    kpis: ['Reports delivered', 'Forecast accuracy', 'Expense variance flagged'],
    permission: 3,
    escalatesTo: 'Founder',
    cadence: {
      daily: ['Reconcile today’s transactions', 'Flag anomalies'],
      weekly: ['Cash flow check', 'Expense review against budget'],
      monthly: ['Monthly finance report for approval', 'Refresh the forecast'],
    },
  },
  {
    agentKey: 'product-manager',
    role: 'Product Manager',
    department: 'Product & Engineering',
    purpose: 'Own the roadmap, gather feedback and keep launches on track.',
    responsibilities: [
      'Own the product roadmap',
      'Gather and prioritize feedback',
      'Keep launches moving on the launch ledger',
    ],
    kpis: ['Roadmap delivery', 'Feedback triaged', 'Launch on-time rate'],
    permission: 3,
    escalatesTo: 'Founder',
    cadence: {
      daily: ['Triage incoming feedback', 'Clear launch blockers'],
      weekly: ['Roadmap sync', 'Launch checklist review'],
      monthly: ['Monthly roadmap report', 'Ship notes for released launches'],
    },
  },
  {
    agentKey: 'customer-success-manager',
    role: 'Customer Success Manager',
    department: 'Customer Success',
    purpose: 'Onboard businesses and watch for drop-off; nudge owners before they churn.',
    responsibilities: [
      'Own onboarding journeys',
      'Own churn risk tracking',
      'Run the retention playbooks',
    ],
    kpis: ['Onboarding completion', 'Churn rate', 'Rescue rate on at-risk accounts'],
    permission: 3,
    escalatesTo: 'Operations Director',
    cadence: {
      daily: ['Watch at-risk businesses', 'Send onboarding nudges'],
      weekly: ['Retention review', 'Update churn-risk lists'],
      monthly: ['Monthly retention report', 'Refresh onboarding playbooks'],
    },
  },
  {
    agentKey: 'trust-safety-agent',
    role: 'Trust & Safety Agent',
    department: 'Trust & Safety',
    purpose: 'Review verification and flag suspicious activity; enforcement escalates to a human.',
    responsibilities: [
      'Own verification review',
      'Own abuse and fraud flagging',
      'Escalate enforcement to a human',
    ],
    kpis: ['Verification turnaround', 'False positive rate', 'Escalation response time'],
    permission: 2,
    escalatesTo: 'Operations Director',
    cadence: {
      daily: ['Review verification queue', 'Flag suspicious activity'],
      weekly: ['Trust metrics review', 'Update the abuse playbook'],
      monthly: ['Monthly trust report', 'Audit enforcement decisions'],
    },
  },
  {
    agentKey: 'email-marketing-manager',
    role: 'Email Marketing Manager',
    department: 'Email & Customer Communications',
    purpose: 'Write, segment and schedule retention email and newsletters; measure what lands.',
    responsibilities: [
      'Own the email calendar and segmentation',
      'Write retention and newsletter copy',
      'Read opens, clicks and unsubscribes',
    ],
    kpis: ['Open rate', 'Click-through rate', 'List health'],
    permission: 2,
    escalatesTo: 'Marketing & Growth',
    cadence: {
      daily: ['Watch campaign performance', 'Queue tomorrow’s sends'],
      weekly: ['Email calendar planning', 'Segment and list hygiene'],
      monthly: ['Monthly email report', 'Refresh the retention flows'],
    },
  },
  {
    agentKey: 'community-manager',
    role: 'Community Manager',
    department: 'Community & Culture',
    purpose: 'Run events, keep the community calendar and turn member feedback into action.',
    responsibilities: [
      'Own the community calendar',
      'Own events and culture moments',
      'Turn member feedback into action items',
    ],
    kpis: ['Community engagement', 'Event attendance', 'Feedback loop time'],
    permission: 3,
    escalatesTo: 'Operations Director',
    cadence: {
      daily: ['Watch community channels', 'Surface member wins'],
      weekly: ['Community planning', 'Collate feedback for product'],
      monthly: ['Monthly community report', 'Plan the next culture moment'],
    },
  },
  {
    agentKey: 'partnerships-manager',
    role: 'Partnerships Manager',
    department: 'Partnerships',
    purpose: 'Score partnership leads and prepare sponsorship, media and university proposals.',
    responsibilities: [
      'Own the partnership lead list',
      'Prepare sponsorship and media proposals',
      'Track partnership outcomes on the ledger',
    ],
    kpis: ['Partnerships qualified', 'Proposal win rate', 'Partnership outcomes'],
    permission: 3,
    escalatesTo: 'Sales Director',
    cadence: {
      daily: ['Qualify new partnership leads', 'Advance active conversations'],
      weekly: ['Partnership pipeline review', 'Draft proposals for review'],
      monthly: ['Monthly partnership report', 'Refresh the partner map'],
    },
  },
  {
    agentKey: 'product-designer',
    role: 'Product Designer',
    department: 'Product Design',
    purpose: 'Design product flows, screens and prototypes against the design system.',
    responsibilities: [
      'Own product flows and screens',
      'Build prototypes for feedback',
      'Keep the design system in sync',
    ],
    kpis: ['Flows delivered', 'Prototype feedback rounds', 'Design system contributions'],
    permission: 2,
    escalatesTo: 'Creative Director',
    cadence: {
      daily: ['Design in-flow work', 'Hand off to engineering'],
      weekly: ['Design review', 'Update components in the system'],
      monthly: ['Monthly design report', 'Refresh UX patterns'],
    },
  },
  {
    agentKey: 'motion-designer',
    role: 'Motion Designer',
    department: 'Motion Design',
    purpose: 'Build Lottie animations, motion posters and kinetic typography.',
    responsibilities: [
      'Own Lottie and motion assets',
      'Build motion posters and kinetic type',
      'Keep motion assets in the library',
    ],
    kpis: ['Motion assets delivered', 'Lottie quality pass', 'Reusable asset count'],
    permission: 2,
    escalatesTo: 'Creative Director',
    cadence: {
      daily: ['Build or review motion work', 'Save reusable assets'],
      weekly: ['Motion review', 'Refresh the motion library'],
      monthly: ['Monthly motion report', 'Retro the best-performing animations'],
    },
  },
  {
    agentKey: 'data-analyst',
    role: 'Data Analyst',
    department: 'Data & Analytics',
    purpose: 'Turn funnels, retention and revenue numbers into recommendations.',
    responsibilities: [
      'Own the analytics queries and dashboards',
      'Own funnel and retention analysis',
      'Write recommendations for other departments',
    ],
    kpis: ['Reports delivered', 'Funnel drop-off found', 'Recommendations adopted'],
    permission: 2,
    escalatesTo: 'Strategy Director',
    cadence: {
      daily: ['Refresh dashboards', 'Flag anomalies'],
      weekly: ['Analytics review', 'Answer questions from departments'],
      monthly: ['Monthly analytics report', 'Rebuild metrics that mislead'],
    },
  },
];

/** The job description for an agent key, if one exists. */
export function jobDescriptionByAgentKey(agentKey: string | null | undefined): JobDescription | undefined {
  if (!agentKey) return undefined;
  return JOB_DESCRIPTIONS.find((j) => j.agentKey === agentKey);
}

/** All JDs in a department, in roster order. */
export function jobDescriptionsByDepartment(department: string): JobDescription[] {
  return JOB_DESCRIPTIONS.filter((j) => j.department === department);
}

export interface DepartmentJobSummary {
  department: string;
  roles: number;
  highestPermission: PermissionLevel;
  needsApproval: boolean;
}

/** One line per department: how many roles it has and how much they can do. */
export function summarizeDepartments(): DepartmentJobSummary[] {
  const map = new Map<string, DepartmentJobSummary>();
  for (const j of JOB_DESCRIPTIONS) {
    const existing = map.get(j.department);
    if (!existing) {
      map.set(j.department, {
        department: j.department,
        roles: 1,
        highestPermission: j.permission,
        needsApproval: j.permission <= 2,
      });
    } else {
      existing.roles += 1;
      existing.highestPermission = Math.max(existing.highestPermission, j.permission) as PermissionLevel;
      if (j.permission <= 2) existing.needsApproval = true;
    }
  }
  return [...map.values()].sort((a, b) => a.department.localeCompare(b.department));
}

/** True when a role may ship work without a human sign-off. */
export function canActAutonomously(jd: JobDescription | undefined): boolean {
  return jd ? jd.permission >= 3 : false;
}
