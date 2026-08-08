// NowOpen OS — campaigns layer (pure, no React / Supabase I/O).
//
// The Campaign Factory's platform ledger: platform-wide campaigns (Africa is
// NowOpen, Restaurant Week, Tailor Week) moved through idea → planning →
// in_build → live → wrapped. The status on the row is the truth; the summary
// counts are derived from it, and performance is intentionally never seeded —
// it will come from real platform data. The section reads os_campaigns from
// Supabase and falls back to CAMPAIGNS_SEED (clearly labelled) until the
// migration is applied, same honest-fallback pattern as the rest of the OS.

import { NOWOPEN_ORG_ID } from './workforce';

export const CAMPAIGN_STATUSES = ['idea', 'planning', 'in_build', 'live', 'wrapped'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  idea: 'Idea',
  planning: 'Planning',
  in_build: 'In build',
  live: 'Live',
  wrapped: 'Wrapped',
};

export interface CampaignItem {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  focus: string;
  audience: string;
  channels: string[];
  status: CampaignStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignRow {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  focus: string;
  audience: string;
  channels: string[];
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Map an os_campaigns row (status as text, channels as an array) to the
 *  CampaignItem shape, falling back to 'idea' on an unknown status. */
export function mapCampaignRow(row: CampaignRow): CampaignItem {
  const status = CAMPAIGN_STATUSES.find((s) => s === row.status) ?? 'idea';
  return {
    id: row.id,
    org_id: row.org_id,
    slug: row.slug,
    name: row.name,
    focus: row.focus,
    audience: row.audience,
    channels: row.channels,
    status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Move a campaign one stage forward, clamped at the pipeline ends. */
export function advanceStatus(status: CampaignStatus): CampaignStatus {
  const next = Math.min(CAMPAIGN_STATUSES.length - 1, CAMPAIGN_STATUSES.indexOf(status) + 1);
  return CAMPAIGN_STATUSES[next];
}

/** "2026-09-14T09:00:00Z" → "Sep 2026". Tolerates missing dates. */
export function formatCampaignDate(iso: string | null | undefined): string {
  if (!iso) return 'TBA';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBA';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Honest, derived run window for a campaign row. */
export function campaignWindowLabel(c: CampaignItem): string {
  const start = formatCampaignDate(c.starts_at);
  const end = formatCampaignDate(c.ends_at);
  if (c.status === 'live') return c.ends_at ? `Live · ${start} → ${end}` : `Live since ${start}`;
  if (c.status === 'wrapped') return `Wrapped · ${end}`;
  return c.ends_at ? `${start} → ${end}` : `Target ${start}`;
}

/** The honest next action for a campaign's current status. */
export function nextStep(c: CampaignItem): string {
  switch (c.status) {
    case 'idea': return 'Write the one-page plan';
    case 'planning': return 'Lock channels and start building assets';
    case 'in_build': return 'QA the landing page, ads and emails';
    case 'live': return 'Read the signals and respond — coverage drops next';
    case 'wrapped': return 'File the retro and archive the assets';
  }
}

export interface CampaignSummary {
  total: number;
  live: number;
  inBuild: number;
  wrapped: number;
}

export function summarizeCampaigns(campaigns: CampaignItem[]): CampaignSummary {
  const s: CampaignSummary = { total: campaigns.length, live: 0, inBuild: 0, wrapped: 0 };
  for (const c of campaigns) {
    if (c.status === 'live') s.live += 1;
    else if (c.status === 'in_build') s.inBuild += 1;
    else if (c.status === 'wrapped') s.wrapped += 1;
  }
  return s;
}

// The platform campaigns the Campaign Factory section promised in its blurb,
// mirrored by the 20260808090000_os_campaigns seed — the same Restaurant Week
// run already on os_launches and os_press. The component uses these as the
// honest dev/fallback state until the migration is applied. Keep in sync with
// the SQL seed.
export const CAMPAIGNS_SEED: CampaignItem[] = [
  { id: 'seed-campaign-0', org_id: NOWOPEN_ORG_ID, slug: 'africa-is-nowopen', name: 'Africa is NowOpen', focus: 'Open every African business on the map', audience: 'Business owners across Africa', channels: ['Social', 'Email', 'SMS', 'Press'], status: 'live', starts_at: '2026-01-15T09:00:00Z', ends_at: null, created_at: '2025-12-01T09:00:00Z' },
  { id: 'seed-campaign-1', org_id: NOWOPEN_ORG_ID, slug: 'restaurant-week-2026', name: 'Restaurant Week 2026', focus: 'The biggest restaurant run of the year', audience: 'Restaurants in Nigeria', channels: ['Social', 'WhatsApp', 'Email'], status: 'in_build', starts_at: '2026-09-14T09:00:00Z', ends_at: '2026-09-20T09:00:00Z', created_at: '2026-07-15T09:00:00Z' },
  { id: 'seed-campaign-2', org_id: NOWOPEN_ORG_ID, slug: 'tailor-week-2026', name: 'Tailor Week', focus: 'Fashion and tailoring, platform-wide', audience: 'Fashion businesses', channels: ['Social', 'Email'], status: 'planning', starts_at: '2026-11-02T09:00:00Z', ends_at: null, created_at: '2026-08-01T09:00:00Z' },
];
