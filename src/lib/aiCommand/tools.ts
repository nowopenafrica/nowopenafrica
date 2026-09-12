// OpenAI Code Center — client tool registry.
//
// Mirrors the authoritative server registry (supabase/functions/_shared/
// aiTools.ts) for routing, planning and the UI. The server is the authority:
// an unknown tool, a mismatch between client risk and server risk, or a Phase 2
// write is rejected server-side regardless of what this file says. This copy
// is for honest UX and deterministic planning, not for enforcement.

import type { AiTool, AiToolCategory, AiRisk, AiToolRole, AiToolPhase } from './types';

interface ToolSeed {
  name: string;
  label: string;
  description: string;
  risk: AiRisk;
  phase: AiToolPhase;
  role: AiToolRole;
  category: AiToolCategory;
}

const seeds: ToolSeed[] = [
  { name: 'platform_health', label: 'Platform health', description: 'Directory, claims, verification, growth and activity overview.', risk: 'READ', phase: 1, role: 'staff', category: 'ops' },
  { name: 'businesses_snapshot', label: 'Businesses snapshot', description: 'Filtered listings: category, city, claim status, verification.', risk: 'READ', phase: 1, role: 'staff', category: 'directory' },
  { name: 'claim_pipeline', label: 'Claim pipeline', description: 'Claims by status, oldest pending, outreach replies.', risk: 'READ', phase: 1, role: 'staff', category: 'claims' },
  { name: 'analytics_overview', label: 'Engagement overview', description: 'Searches, views, keeps, enquiries, signups over a window.', risk: 'READ', phase: 1, role: 'staff', category: 'analytics' },
  { name: 'opportunity_finder', label: 'Opportunity finder', description: 'Unclaimed, listable, contactable acquisition candidates.', risk: 'READ', phase: 1, role: 'staff', category: 'growth' },
  { name: 'duplicate_finder', label: 'Duplicate finder', description: 'Same name + city, or same phone — merge candidates.', risk: 'READ', phase: 1, role: 'staff', category: 'quality' },
  { name: 'data_quality', label: 'Data quality', description: 'Missing description/phone/email/website/hours among listable.', risk: 'READ', phase: 1, role: 'staff', category: 'quality' },
  { name: 'growth_gaps', label: 'Growth gaps', description: 'Search demand vs listing supply, by category and city.', risk: 'READ', phase: 1, role: 'staff', category: 'growth' },
  { name: 'system_health', label: 'System health', description: 'Workforce runs, cron schedule, automation tail, outreach state.', risk: 'READ', phase: 1, role: 'admin', category: 'ops' },
  { name: 'security_snapshot', label: 'Security snapshot', description: 'RLS posture across critical tables.', risk: 'READ', phase: 1, role: 'admin', category: 'security' },
];

const phaseTwoWrites: ToolSeed[] = [
  { name: 'merge_business', label: 'Merge businesses', description: 'Merge duplicate listings into one. Approval-gated, Phase 2.', risk: 'CRITICAL', phase: 2, role: 'admin', category: 'quality' },
  { name: 'approve_claim', label: 'Approve claim', description: 'Approve a pending claim, handing the listing to its owner. Phase 2.', risk: 'HIGH', phase: 2, role: 'admin', category: 'claims' },
  { name: 'update_business', label: 'Update listing', description: 'Edit a public listing profile fields. Phase 2.', risk: 'MEDIUM', phase: 2, role: 'admin', category: 'directory' },
  { name: 'send_outreach', label: 'Send outreach', description: 'Send a ClaimReach message to a contact. Phase 2.', risk: 'HIGH', phase: 2, role: 'admin', category: 'claims' },
  { name: 'toggle_feature', label: 'Toggle feature', description: 'Flip a feature flag for everyone. Phase 2.', risk: 'MEDIUM', phase: 2, role: 'admin', category: 'ops' },
];

export const AI_TOOLS: AiTool[] = [...seeds, ...phaseTwoWrites].map((t) => ({
  ...t,
  readOnly: t.phase === 1,
  riskLabel: riskLabel(t.risk),
}));

export const READ_TOOLS: AiTool[] = AI_TOOLS.filter((t) => t.readOnly && t.phase === 1);

export const REQUIRES_APPROVAL: AiTool[] = AI_TOOLS.filter((t) => t.phase === 2);

const TOOL_INDEX: Record<string, AiTool> = Object.fromEntries(AI_TOOLS.map((t) => [t.name, t]));

export function toolByName(name: string): AiTool | undefined {
  return TOOL_INDEX[name];
}

export function riskLabel(risk: AiRisk): string {
  switch (risk) {
    case 'READ': return 'Read-only';
    case 'LOW': return 'Low impact';
    case 'MEDIUM': return 'Medium impact';
    case 'HIGH': return 'High impact';
    case 'CRITICAL': return 'Critical, irreversible';
  }
}

export function riskTone(risk: AiRisk): string {
  switch (risk) {
    case 'READ': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50';
    case 'LOW': return 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50';
    case 'MEDIUM': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50';
    case 'HIGH': return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50';
    case 'CRITICAL': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50';
  }
}

/**
 * Whether a staff role may open/run a tool in the UI. Mirrors the server's
 * gate so the UI never offers what the API will refuse.
 */
export function roleMayRun(role: string | null | undefined, tool: AiTool): boolean {
  if (tool.role === 'staff') return true;
  if (tool.role === 'editor') return true;
  return role === 'admin';
}