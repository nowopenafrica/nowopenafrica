// NowOpen OS — partnerships layer (pure, no React / Supabase I/O).
//
// The Partnership CRM pipeline: investors, media, government, creators,
// agencies, sponsors and universities, moved through proposal → negotiation →
// active → alumni. The stage on the row is the truth (a partner only moves
// when the deal actually moves), and the summary counts are derived from it.
// The section reads os_partners from Supabase and falls back to PARTNERS_SEED
// (clearly labelled) until the migration is applied, same honest-fallback
// pattern as the rest of the OS.

import { NOWOPEN_ORG_ID } from './workforce';

export const PARTNER_STAGES = ['Proposal', 'Negotiation', 'Active', 'Alumni'] as const;
export type PartnerStage = (typeof PARTNER_STAGES)[number];

export const PARTNER_TYPES = ['Investor', 'Media', 'Government', 'Creator', 'Agency', 'Sponsor', 'University'] as const;

export interface PartnerItem {
  id: string;
  org_id: string;
  name: string;
  type: string;
  note: string;
  stage: PartnerStage;
  created_at?: string;
  updated_at?: string;
}

export interface PartnerRow {
  id: string;
  org_id: string;
  name: string;
  type: string;
  note: string;
  stage: string;
  created_at?: string;
  updated_at?: string;
}

/** Map an os_partners row (stage as text) to the PartnerItem shape, falling
 *  back to 'Proposal' if the DB ever hands back an unknown stage. */
export function mapPartnerRow(row: PartnerRow): PartnerItem {
  const stage = PARTNER_STAGES.find((s) => s === row.stage) ?? 'Proposal';
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    type: row.type,
    note: row.note,
    stage,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function stageIndex(stage: PartnerStage): number {
  return PARTNER_STAGES.indexOf(stage);
}

/** Move a partner one stage forward or back, clamped to the pipeline ends. */
export function advanceStage(stage: PartnerStage, dir: 1 | -1): PartnerStage {
  const next = Math.max(0, Math.min(PARTNER_STAGES.length - 1, stageIndex(stage) + dir));
  return PARTNER_STAGES[next];
}

export interface PartnerSummary {
  total: number;
  active: number;
  perStage: Record<PartnerStage, number>;
  perType: Record<string, number>;
}

export function summarizePartners(partners: PartnerItem[]): PartnerSummary {
  const perStage: Record<PartnerStage, number> = { Proposal: 0, Negotiation: 0, Active: 0, Alumni: 0 };
  const perType: Record<string, number> = {};
  for (const p of partners) {
    perStage[p.stage] += 1;
    perType[p.type] = (perType[p.type] ?? 0) + 1;
  }
  return {
    total: partners.length,
    active: perStage.Active,
    perStage,
    perType,
  };
}

// The pipeline Partnership CRM used to keep in localStorage, mirrored by the
// 20260808070000_os_partners seed. The component uses these as the honest
// dev/fallback state until the migration is applied. Keep in sync with the
// SQL seed.
export const PARTNERS_SEED: PartnerItem[] = [
  { id: 'seed-partner-0', org_id: NOWOPEN_ORG_ID, name: 'Aurora Growth Fund', type: 'Investor', note: 'Late-stage funding conversations for the Creator Studio.', stage: 'Proposal', created_at: '2026-07-20T09:00:00Z' },
  { id: 'seed-partner-1', org_id: NOWOPEN_ORG_ID, name: 'TechCabal', type: 'Media', note: 'Co-announce the Restaurant Week 2026 launch together.', stage: 'Negotiation', created_at: '2026-07-02T09:00:00Z' },
  { id: 'seed-partner-2', org_id: NOWOPEN_ORG_ID, name: 'Lagos Business School', type: 'University', note: 'Creator economy case study — joint research sprint.', stage: 'Active', created_at: '2026-05-14T09:00:00Z' },
  { id: 'seed-partner-3', org_id: NOWOPEN_ORG_ID, name: 'Magnet Agency', type: 'Agency', note: 'Past campaigns with our creator network.', stage: 'Alumni', created_at: '2025-11-30T09:00:00Z' },
];
