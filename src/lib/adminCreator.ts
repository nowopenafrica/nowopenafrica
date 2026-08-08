// NowOpen Admin Creator — the internal growth operating system.
//
// One shell for the NowOpen team: create, market, publish, analyse and grow
// the platform from a single place, separate from the business-facing Studio.
// This file is the IA + data layer only (no React), so the section map and the
// command-center calculations stay unit-testable like the rest of the app.

export type AdminGroup = 'Oversight' | 'People' | 'Create' | 'Produce' | 'Operate' | 'Grow' | 'Run';

export type AdminSectionStatus = 'live' | 'soon';

/** Where the embedded Studio tools can jump when a suggestion references a
 *  department. Modules without a natural admin-section home fall back to the
 *  business Studio. Pure so the mapping stays unit-testable. */
import type { GrowthPlanModule } from './growth';

export function growthModuleToSection(module: GrowthPlanModule): string | null {
  const map: Record<string, string> = {
    home: 'command',
    'brand-kit': 'brand-assets',
    card: 'creative',
    social: 'social',
    flyer: 'creative',
    poster: 'creative',
    banner: 'creative',
    copywriter: 'content-factory',
    promotions: 'campaign-factory',
    planner: 'social',
    health: 'analytics-war-room',
    assistant: 'brand-director',
    'live-promo': 'video-studio',
    campaigns: 'campaign-factory',
  };
  return map[module] ?? null;
}

export interface AdminSection {
  /** Stable id used by the shell and deep links. */
  id: string;
  /** The 1–20 numbering from the roadmap. */
  num: number;
  label: string;
  group: AdminGroup;
  blurb: string;
  status: AdminSectionStatus;
  /** Existing business-facing Studio tools this section is expected to build on. */
  reuses?: string[];
}

export const ADMIN_GROUPS: AdminGroup[] = ['Oversight', 'People', 'Create', 'Produce', 'Operate', 'Grow', 'Run'];

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'command', num: 1, group: 'Oversight', status: 'live', label: 'Growth Command Center', blurb: 'Everything happening across NowOpen Africa today — the front door of the internal system.' },
  { id: 'analytics-war-room', num: 13, group: 'Oversight', status: 'live', label: 'Analytics War Room', blurb: 'Maps, funnels, attribution, retention and revenue — the platform heartbeat.', reuses: ['CampaignAnalytics', 'HealthDashboard'] },
  { id: 'founder', num: 20, group: 'Oversight', status: 'live', label: 'Founder Dashboard', blurb: 'Private executive view: company health score, growth velocity, churn and strategic recommendations.' },

  { id: 'workforce', num: 21, group: 'People', status: 'live', label: 'Workforce Directory', blurb: 'The whole team — humans and AI agents — with honest statuses, workload and approvals from os_workforce.', reuses: ['os_workforce', 'AdminCreatorShell'] },
  { id: 'work-board', num: 22, group: 'People', status: 'live', label: 'Work Board', blurb: 'The daily work layer — projects, tasks and goals assigned to the team, with honest statuses from os_work_items.', reuses: ['os_work_items', 'os_workforce'] },

  { id: 'creative', num: 2, group: 'Create', status: 'live', label: 'Creative Studio', blurb: 'Internal design department — canvas, layers, artboards, vectors, masks, components and export.', reuses: ['DesignStudio', 'QuickCreatePanel', 'FreeCanvas'] },
  { id: 'motion', num: 3, group: 'Create', status: 'live', label: 'Motion Graphics Studio', blurb: 'Logo reveals, motion posters, lower thirds, kinetic typography and Lottie animations.' },
  { id: 'video-studio', num: 4, group: 'Create', status: 'live', label: 'AI Video Studio', blurb: 'Idea → script → storyboard → voiceover → AI video → captions → music → export in every aspect ratio.', reuses: ['VideoStudio', 'CreativeDirectorStudio'] },
  { id: 'video-templates', num: 16, group: 'Create', status: 'live', label: 'Video Template Library', blurb: 'Ready-made editable promos per industry — restaurant, barber, church, hotel, real estate, events and more.' },
  { id: 'design-system', num: 17, group: 'Create', status: 'live', label: 'Design System', blurb: 'The single source of truth: buttons, type, spacing, icons, colours, shadows and the UI kit.' },
  { id: 'prompt-library', num: 15, group: 'Create', status: 'live', label: 'AI Prompt Library', blurb: 'Every proven prompt, organised — video, image, voice, copy, animation and social.' },

  { id: 'social', num: 5, group: 'Produce', status: 'live', label: 'Social Media Department', blurb: 'Operate like an agency: calendar, every channel, publish now/scheduled/series, analytics and an AI coach.', reuses: ['SchedulePublish', 'SocialStudioHub'] },
  { id: 'campaign-factory', num: 6, group: 'Produce', status: 'live', label: 'Campaign Factory', blurb: 'Launch platform campaigns — Africa is NowOpen, Restaurant Week, Tailor Week — with assets, ads and performance.', reuses: ['CampaignManager', 'CampaignStudio', 'AnnouncementsStudio'] },
  { id: 'content-factory', num: 7, group: 'Produce', status: 'live', label: 'Content Factory', blurb: 'Ideas, scripts, copy, SEO, press releases, emails and newsletters — an AI writer that knows the NowOpen voice.', reuses: ['ContentFactory', 'CaptionEnginePanel', 'MarketingAssistant'] },

  { id: 'community', num: 8, group: 'Operate', status: 'live', label: 'Community Management', blurb: 'Every reply — Facebook, Instagram, TikTok, WhatsApp, chat, email and support — in one inbox.', reuses: ['LiveChat', 'EnquiryModal'] },
  { id: 'brand-assets', num: 9, group: 'Operate', status: 'live', label: 'Brand Asset Manager', blurb: 'Every asset with smart search: logos, videos, photos, music, fonts, templates, Lottie and guidelines.', reuses: ['MediaLibrary'] },
  { id: 'press-room', num: 10, group: 'Operate', status: 'live', label: 'Press Room', blurb: 'Press kit, founder bio, media photos, news, investor deck and a download centre.' },
  { id: 'partners', num: 11, group: 'Operate', status: 'live', label: 'Partnership CRM', blurb: 'Investors, media, government, creators, agencies, sponsors and universities — with pipelines from proposal to active.', reuses: ['CampaignMarketplace'] },

  { id: 'brand-director', num: 12, group: 'Grow', status: 'live', label: 'AI Brand Director', blurb: '"Launch our restaurant campaign" → strategy, timeline, flyers, videos, emails, landing page, ads, budget and KPIs.', reuses: ['MarketingDirector'] },
  { id: 'trends', num: 14, group: 'Grow', status: 'live', label: 'Trend Discovery', blurb: 'AI scans Google, TikTok, Instagram, YouTube, news and NowOpen searches to say what to make next.', reuses: ['TrendRadarPanel'] },

  { id: 'launch', num: 18, group: 'Run', status: 'live', label: 'Launch Control', blurb: 'Every feature launch: checklist, QA, design, marketing, videos, emails, docs, release notes and rollout.' },
  { id: 'knowledge', num: 19, group: 'Run', status: 'live', label: 'Internal Knowledge Base', blurb: 'Everything documented — brand, engineering, marketing, design, growth, legal, finance and support SOPs.' },
];

export function sectionById(id: string): AdminSection | undefined {
  return ADMIN_SECTIONS.find((s) => s.id === id);
}

/** Per-business content pipeline counted from the localStorage stores the
 *  Studio tools write (publisher jobs, video projects, campaigns). Takes an
 *  injectable accessor so it stays unit-testable without a browser. */
export interface PipelineCounts {
  scheduledPosts: number;
  publishedPosts: number;
  videoQueue: number;
  campaigns: number;
}

export function scanPipelineLocal(
  getItem: (key: string) => string | null,
  keys: readonly string[],
): PipelineCounts {
  const posts = { scheduled: 0, published: 0 };
  let videos = 0;
  let campaigns = 0;
  for (const key of keys) {
    if (key.startsWith('nowopen_publisher_')) {
      try {
        const state = JSON.parse(getItem(key) ?? '{}') as { jobs?: { status?: string }[] };
        (state.jobs ?? []).forEach((j) => {
          if (j.status === 'scheduled') posts.scheduled += 1;
          else if (j.status === 'published') posts.published += 1;
        });
      } catch { /* corrupt entry */ }
    } else if (key.startsWith('nowopen_videos_')) {
      try {
        const projects = JSON.parse(getItem(key) ?? '[]') as { status?: string }[];
        videos += projects.filter((p) => p.status !== 'published').length;
      } catch { /* corrupt entry */ }
    } else if (key.startsWith('nowopen_campaigns_')) {
      try {
        const list = JSON.parse(getItem(key) ?? '[]');
        campaigns += Array.isArray(list) ? list.length : 0;
      } catch { /* corrupt entry */ }
    }
  }
  return { scheduledPosts: posts.scheduled, publishedPosts: posts.published, videoQueue: videos, campaigns };
}

export function scanLocalPipeline(): PipelineCounts {
  if (typeof localStorage === 'undefined') return { scheduledPosts: 0, publishedPosts: 0, videoQueue: 0, campaigns: 0 };
  return scanPipelineLocal((k) => localStorage.getItem(k), Object.keys(localStorage));
}

// --- Command Center data ----------------------------------------------------

export interface CommandStats {
  totalBusinesses: number;
  businessesToday: number;
  verifiedBusinesses: number;
  totalUsers: number;
  usersToday: number;
  revenueToday: number;
  paidPayments: number;
  pendingApprovals: number;
  scheduledPosts: number;
  publishedPosts: number;
  videoQueue: number;
  campaigns: number;
  openSupport: number;
  uptime: number;
  topCategory?: string;
}

export interface CommandRaw {
  users: { created_at?: string; plan_status?: string }[];
  businesses: { verified?: boolean; created_at?: string; category?: string }[];
  payments: { status?: string; amount_local?: number; currency?: string; created_at?: string }[];
  verificationDocs: { status?: string }[];
  registrations: { status?: string }[];
  enquiries: unknown[];
  waitlist: { invited?: boolean }[];
  /** Posts scheduled ahead across all businesses (from the publisher). */
  scheduledPosts: number;
  /** Posts marked published (all businesses, localStorage publishers). */
  publishedPosts: number;
  /** Video projects in the production pipeline (all businesses). */
  videoQueue: number;
  /** Campaigns created across all businesses. */
  campaigns: number;
  /** Last 30 days uptime, percent. */
  uptime: number;
}

const isToday = (iso: string | undefined, now = new Date()): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime())
    && d.getUTCFullYear() === now.getUTCFullYear()
    && d.getUTCMonth() === now.getUTCMonth()
    && d.getUTCDate() === now.getUTCDate();
};

export function commandCenterStats(raw: CommandRaw): CommandStats {
  const pending =
    raw.verificationDocs.filter((d) => (d.status || 'pending') === 'pending').length
    + raw.registrations.length
    + raw.enquiries.length
    + raw.waitlist.filter((w) => !w.invited).length;

  const paid = raw.payments.filter((p) => p.status === 'paid');
  const revenueToday = paid
    .filter((p) => isToday(p.created_at))
    .reduce((sum, p) => sum + (Number(p.amount_local) || 0), 0);

  const newBusinesses = raw.businesses.filter((b) => isToday(b.created_at));
  const counts: Record<string, number> = {};
  newBusinesses.forEach((b) => {
    const c = b.category || 'Other';
    counts[c] = (counts[c] ?? 0) + 1;
  });
  const topCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    totalBusinesses: raw.businesses.length,
    businessesToday: newBusinesses.length,
    verifiedBusinesses: raw.businesses.filter((b) => b.verified).length,
    totalUsers: raw.users.length,
    usersToday: raw.users.filter((u) => isToday(u.created_at)).length,
    revenueToday,
    paidPayments: paid.length,
    pendingApprovals: pending,
    scheduledPosts: raw.scheduledPosts,
    publishedPosts: raw.publishedPosts,
    videoQueue: raw.videoQueue,
    campaigns: raw.campaigns,
    openSupport: raw.enquiries.length,
    uptime: raw.uptime,
    topCategory,
  };
}

const fmtMoney = (n: number): string => n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : `₦${n.toLocaleString()}`;

/** Rule-based "AI" summary so the Command Center reads like a briefing without
 *  depending on a live model — deterministic from today's data. */
export function aiRecommendations(s: CommandStats, now = new Date()): string[] {
  const lines: string[] = [];
  const day = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  lines.push(`${day} — ${s.totalUsers} users, ${s.totalBusinesses} businesses, ${s.verifiedBusinesses} verified.`);

  if (s.businessesToday > 0) {
    lines.push(`${s.businessesToday} business${s.businessesToday === 1 ? '' : 'es'} onboarded today${s.topCategory ? `, ${s.topCategory} leading the pack` : ''}.`);
  } else {
    lines.push('No new businesses yet today — a midday outreach push could change that.');
  }

  if (s.revenueToday > 0) {
    lines.push(`Revenue today: ${fmtMoney(s.revenueToday)} across ${s.paidPayments} paid order${s.paidPayments === 1 ? '' : 's'}.`);
  } else {
    lines.push(s.paidPayments > 0 ? `${s.paidPayments} paid order${s.paidPayments === 1 ? '' : 's'} today so far.` : 'No paid orders yet today.');
  }

  if (s.pendingApprovals > 0) {
    lines.push(`${s.pendingApprovals} approval${s.pendingApprovals === 1 ? '' : 's'} waiting in the queue — clear them to keep onboarding fast.`);
  } else {
    lines.push('Approval queue is clear.');
  }

  const inFlight = s.scheduledPosts + s.videoQueue;
  if (inFlight > 0) {
    lines.push(`${s.scheduledPosts} post${s.scheduledPosts === 1 ? '' : 's'} scheduled and ${s.videoQueue} video${s.videoQueue === 1 ? '' : 's'} in production.`);
  } else {
    lines.push('No content scheduled yet — the Content Factory can fix that in minutes.');
  }

  const cat = s.topCategory?.toLowerCase() ?? '';
  if (/restaurant|food|caf|kitchen|eatery/.test(cat)) {
    lines.push(`${s.topCategory} is trending — a "${s.topCategory} Week" campaign on Instagram Reels would ride the wave.`);
  } else if (/fashion|cloth|tailor|beauty|salon|hair/.test(cat)) {
    lines.push(`${s.topCategory} is trending — a "${s.topCategory} Spotlight" series would perform well this week.`);
  } else if (s.topCategory) {
    lines.push(`${s.topCategory} is the day's fastest-growing segment — worth a featured landing banner.`);
  }

  return lines;
}
