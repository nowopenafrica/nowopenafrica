// NowOpen OS — press layer (pure, no React / Supabase I/O).
//
// The Press Room news timeline as a live press-and-coverage ledger: a press
// item is a release or a piece of coverage with an outlet, a status (draft /
// scheduled / published) and when it went live. The section reads os_press
// from Supabase and falls back to PRESS_SEED (clearly labelled) until the
// migration is applied, same honest-fallback pattern as the rest of the OS.

import { NOWOPEN_ORG_ID } from './workforce';

export const PRESS_KINDS = ['release', 'coverage'] as const;
export type PressKind = (typeof PRESS_KINDS)[number];

export const PRESS_STATUSES = ['draft', 'scheduled', 'published'] as const;
export type PressStatus = (typeof PRESS_STATUSES)[number];

export const PRESS_STATUS_LABELS: Record<PressStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  published: 'Published',
};

export interface PressItem {
  id: string;
  org_id: string;
  headline: string;
  outlet: string;
  kind: PressKind;
  status: PressStatus;
  published_at?: string | null;
  url: string;
  summary: string;
  created_at?: string;
  updated_at?: string;
}

export interface PressRow {
  id: string;
  org_id: string;
  headline: string;
  outlet: string;
  kind: string;
  status: string;
  published_at?: string | null;
  url: string;
  summary: string;
  created_at?: string;
  updated_at?: string;
}

/** Map an os_press row (kind/status as text) to the PressItem shape, falling
 *  back to safe defaults if the DB ever hands back an unknown value. */
export function mapPressRow(row: PressRow): PressItem {
  const kind = PRESS_KINDS.find((k) => k === row.kind) ?? 'release';
  const status = PRESS_STATUSES.find((s) => s === row.status) ?? 'draft';
  return {
    id: row.id,
    org_id: row.org_id,
    headline: row.headline,
    outlet: row.outlet,
    kind,
    status,
    published_at: row.published_at,
    url: row.url,
    summary: row.summary,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** "2026-08-01T09:00:00Z" → "Aug 2026". Tolerates missing dates. */
export function formatPressDate(iso: string | null | undefined): string {
  if (!iso) return 'Draft';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBA';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export interface PressSummary {
  total: number;
  published: number;
  draft: number;
  scheduled: number;
  releases: number;
  coverage: number;
}

export function summarizePress(items: PressItem[]): PressSummary {
  const s: PressSummary = { total: items.length, published: 0, draft: 0, scheduled: 0, releases: 0, coverage: 0 };
  for (const p of items) {
    if (p.status === 'published') s.published += 1;
    else if (p.status === 'draft') s.draft += 1;
    else s.scheduled += 1;
    if (p.kind === 'coverage') s.coverage += 1;
    else s.releases += 1;
  }
  return s;
}

// The news timeline Press Room used to hardcode, mirrored by the
// 20260808080000_os_press seed — the same three launches already on
// os_launches. The component uses these as the honest dev/fallback state
// until the migration is applied. Keep in sync with the SQL seed.
export const PRESS_SEED: PressItem[] = [
  { id: 'seed-press-0', org_id: NOWOPEN_ORG_ID, headline: 'NowOpen Africa launches the AI Video Studio', outlet: 'NowOpen Africa', kind: 'release', status: 'published', published_at: '2026-08-01T09:00:00Z', url: 'https://www.nowopen.africa/press/ai-video-studio', summary: 'Businesses now turn one idea into a full video campaign — script, voiceover, captions and export — without leaving the platform.' },
  { id: 'seed-press-1', org_id: NOWOPEN_ORG_ID, headline: 'Restaurant Week returns for its biggest run', outlet: 'Restaurant Week', kind: 'coverage', status: 'published', published_at: '2026-06-15T09:00:00Z', url: 'https://www.nowopen.africa/press/restaurant-week-2026', summary: "Hundreds of restaurants across Nigeria served record footfall through the platform's launch-week playbook." },
  { id: 'seed-press-2', org_id: NOWOPEN_ORG_ID, headline: 'Verified badge rolls out nationwide', outlet: 'NowOpen Africa', kind: 'release', status: 'published', published_at: '2026-03-10T09:00:00Z', url: 'https://www.nowopen.africa/press/verified-badge', summary: 'Document-based verification now protects the trusted signal behind every NowOpen profile.' },
];
