// ChangeProposals — pure decisions for the enrichment proposal queue
// (business_change_proposals). Shared by the admin review panel so staff and
// the engine agree on what a review action means and what the human-readable
// labels are. No React, no supabase calls — unit-testable.
//
// The DB owns the authority: a proposal only becomes real when
// `apply_business_change_proposal(uuid)` runs (SECURITY DEFINER, staff gate,
// evidence re-checked). This module only decides the reviewer's stamps and the
// copy — never the write itself.

export interface ChangeProposalRow {
  id: string;
  business_id: string | number;
  field_name: string;
  current_value: string | null;
  proposed_value: string;
  source_id: string | null;
  source_url: string | null;
  confidence: number;
  extraction_method: string | null;
  /** Null means "no evidence on file" — the applier refuses to write it. */
  evidence_id: string | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'superseded' | string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
  auto_applied: boolean;
  created_at: string;
  updated_at: string;
}

export type ProposalReviewAction = 'approve' | 'reject';

export const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  superseded: 'Superseded',
};

/** Human copy for the fields the applier can actually write. Anything new
 *  falls back to the raw column name rather than guessing. */
export const PROPOSAL_FIELD_LABEL: Record<string, string> = {
  description: 'Description',
  category: 'Category',
  address: 'Address',
  location: 'Location',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  email: 'Email',
  website: 'Website',
  logo_url: 'Logo',
  image_url: 'Cover image',
  opening_hours: 'Opening hours',
  tagline: 'Tagline',
  about: 'About',
  story: 'Story',
  mission: 'Mission',
  vision: 'Vision',
  subcategory: 'Subcategory',
  business_type: 'Business type',
  employees: 'Employees',
  service_area: 'Service area',
  timezone: 'Timezone',
  founded_year: 'Founded year',
  social_links: 'Social links',
};

export function proposalFieldLabel(field: string): string {
  return PROPOSAL_FIELD_LABEL[field] ?? field;
}

/** The sentinel the applier stamps on a fully-applied proposal. */
export const APPLIED_SENTINEL = 'Applied by engine';
/** The sentinel the owner-sync applier stamps on a proposal it applied. */
export const AUTO_APPLIED_SENTINEL = 'Auto-applied by owner preference';

export function isApplied(row: Pick<ChangeProposalRow, 'status' | 'note'>): boolean {
  return row.status === 'approved' && (row.note === APPLIED_SENTINEL || row.note === AUTO_APPLIED_SENTINEL);
}

/** The row's update for a reviewer stamp. The applier (RPC) does the real
 *  write afterwards; this just records WHO reviewed and WHEN, and moves it out
 *  of the pending queue. */
export function proposalReviewPatch(
  action: ProposalReviewAction,
  nowIso: string,
  reviewerId: string | null,
  note: string | null,
): Record<string, unknown> {
  const stamp = { reviewed_by: reviewerId, reviewed_at: nowIso };
  if (action === 'approve') {
    return { status: 'approved', ...stamp, note: note?.trim() || 'Approved in change review' };
  }
  return { status: 'rejected', ...stamp, note: note?.trim() || 'Rejected in change review' };
}

/** Readable rendering of a stored value. social_links is jsonb (a flat
 *  {platform: url} map) — listing the platforms reads better than the JSON. */
export function displayValue(field: string, value: string | null): string {
  if (value == null || value === '') return '—';
  if (field === 'social_links') {
    try {
      const parsed = JSON.parse(value) as Record<string, string>;
      const platforms = Object.keys(parsed).filter((k) => parsed[k]);
      return platforms.length ? platforms.join(', ') : '—';
    } catch {
      return value;
    }
  }
  return value;
}

/** Short, gutter-safe label for where a proposal came from. */
export function sourceLabel(sourceId: string | null, sourceUrl: string | null): string | null {
  if (sourceId) return sourceId.replace(/_/g, ' ');
  if (sourceUrl) return sourceUrl.replace(/^https?:\/\//, '');
  return null;
}