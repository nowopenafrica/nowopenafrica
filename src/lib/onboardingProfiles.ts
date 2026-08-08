// NowOpen OS — onboarding profiles (pure, no React / Supabase I/O).
//
// The People OS "Onboarding Command Center": every person or company gets a
// NowOpen Relationship Profile, and the status shown is always derived from the
// row — which steps of their relationship's journey are done, which signed
// documents exist, whether anything is blocked. Nothing is guessed: progress
// and status are recomputed from the journey (src/lib/relationships.ts), and
// the component falls back to ONBOARDING_SEED (clearly labelled) until the
// os_onboarding migration is applied.

import { NOWOPEN_ORG_ID } from './workforce';
import {
  journeyFor, stepsAwaitingSignature, RELATIONSHIP_TYPES,
  type RelationshipType,
} from './relationships';

export type OnboardingStatus = 'invited' | 'in_progress' | 'awaiting_signature' | 'blocked' | 'completed';

export const ONBOARDING_STATUSES: readonly OnboardingStatus[] = [
  'invited', 'in_progress', 'awaiting_signature', 'blocked', 'completed',
];

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  invited: 'Invited',
  in_progress: 'In progress',
  awaiting_signature: 'Awaiting signature',
  blocked: 'Blocked',
  completed: 'Completed',
};

/** A NowOpen Relationship Profile — one row per person or company being
 *  onboarded. Mirrors the os_onboarding table (snake_case columns). */
export interface OnboardingProfile {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  relationship: RelationshipType;
  department?: string | null;
  role?: string | null;
  country?: string | null;
  manager?: string | null;
  account_manager?: string | null;
  /** Step ids from the relationship's journey that are genuinely done. */
  steps_completed: string[];
  /** Labels of signed agreements (NDA, IP agreement, ...). */
  signed_agreements: string[];
  /** Access scopes granted once onboarding finishes (role-based). */
  access_grants: string[];
  blocked_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** A raw os_onboarding row as Supabase returns it (jsonb arrays as text). */
export interface OnboardingRow {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  relationship: string;
  department?: string | null;
  role?: string | null;
  country?: string | null;
  manager?: string | null;
  account_manager?: string | null;
  steps_completed?: unknown;
  signed_agreements?: unknown;
  access_grants?: unknown;
  blocked_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

const asStringList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) {
    try { return asStringList(JSON.parse(v)); } catch { return []; }
  }
  return [];
};

/** Map an os_onboarding row to the profile shape, falling back to 'other' if
 *  the DB ever hands back an unknown relationship. */
export function mapOnboardingRow(row: OnboardingRow): OnboardingProfile {
  const relationship = RELATIONSHIP_TYPES.find((r) => r === row.relationship) ?? 'other';
  return {
    id: row.id,
    org_id: row.org_id,
    full_name: row.full_name,
    email: row.email,
    relationship,
    department: row.department,
    role: row.role,
    country: row.country,
    manager: row.manager,
    account_manager: row.account_manager,
    steps_completed: asStringList(row.steps_completed),
    signed_agreements: asStringList(row.signed_agreements),
    access_grants: asStringList(row.access_grants),
    blocked_at: row.blocked_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 0–100 completion over the relationship's journey steps. */
export function onboardingProgress(profile: OnboardingProfile): number {
  const journey = journeyFor(profile.relationship);
  if (journey.length === 0) return 0;
  const done = journey.filter((s) => profile.steps_completed.includes(s.id)).length;
  return Math.round((done / journey.length) * 100);
}

/** The honest status of a profile, derived from the row — never stored. */
export function onboardingStatus(profile: OnboardingProfile): OnboardingStatus {
  if (profile.blocked_at) return 'blocked';
  const progress = onboardingProgress(profile);
  if (progress >= 100) return 'completed';
  if (progress === 0) return 'invited';
  if (stepsAwaitingSignature(profile.relationship, profile.steps_completed).length > 0) {
    return 'awaiting_signature';
  }
  return 'in_progress';
}

/** The automatic document packet a relationship receives, straight from the
 *  People OS vision: the employee, volunteer, partner and creative packs. */
export function docPackFor(relationship: RelationshipType): readonly string[] {
  const packs: Record<RelationshipType, readonly string[]> = {
    employee: [
      'Welcome letter', 'Employee handbook', 'NDA', 'Employment agreement',
      'IP agreement', 'Code of conduct', 'AI usage policy', 'Security policy',
      'Data protection policy', 'Social media policy', 'Department guide',
      'Role description', 'KPI framework', 'First 30 days plan',
    ],
    volunteer: [
      'Welcome letter', 'Volunteer guide', 'Volunteer agreement',
      'NDA / confidentiality', 'Code of conduct', 'Safeguarding / safety guidance',
      'Brand guidelines', 'Communication guide', 'Volunteer role description',
      'First assignment',
    ],
    partner: [
      'Welcome letter', 'Partner guide', 'NDA', 'Partnership agreement',
      'Brand guidelines', 'Communication guidelines', 'Partnership objectives',
      'Contact directory', 'Partner portal access',
    ],
    creative: [
      'Creative briefing guide', 'NDA', 'Contractor / collaboration agreement',
      'IP / rights agreement', 'Brand guidelines', 'File standards',
      'Delivery specifications', 'Creative workflow', 'Payment / invoice procedures',
    ],
    agency: [
      'Welcome letter', 'Agency guide', 'NDA', 'Service agreement', 'Statement of work',
      'Brand guidelines', 'Contact directory', 'Vendor portal access',
    ],
    'production-partner': [
      'Welcome letter', 'Production guide', 'NDA', 'Production partnership agreement',
      'Delivery specifications', 'File standards', 'Contact directory',
      'Production portal access',
    ],
    'strategic-collaborator': [
      'Welcome letter', 'NDA', 'Strategic collaboration agreement',
      'Shared objectives', 'Contact directory',
    ],
    investor: [
      'Welcome letter', 'NDA', 'Investor / advisor agreement',
      'Pitch materials', 'Data room access',
    ],
    'media-partner': [
      'Welcome letter', 'Media partnership agreement', 'Brand guidelines',
      'Press kit', 'Contact directory',
    ],
    'technology-partner': [
      'Welcome letter', 'NDA', 'Technology partnership agreement',
      'Integration guide', 'Contact directory',
    ],
    other: [
      'Welcome letter', 'Agreement', 'Contact directory',
    ],
  };
  return packs[relationship] ?? packs.other;
}

export interface OnboardingSummary {
  total: number;
  byStatus: Record<OnboardingStatus, number>;
  byRelationship: Record<string, number>;
  completed: number;
  inProgress: number;
  awaitingSignature: number;
  blocked: number;
  /** Percent of profiles fully onboarded, rounded. */
  completionRate: number;
}

/** The command-center rollup: totals per status and per relationship. */
export function summarizeOnboarding(profiles: OnboardingProfile[]): OnboardingSummary {
  const byStatus: Record<OnboardingStatus, number> = {
    invited: 0, in_progress: 0, awaiting_signature: 0, blocked: 0, completed: 0,
  };
  const byRelationship: Record<string, number> = {};
  for (const p of profiles) {
    byStatus[onboardingStatus(p)] += 1;
    byRelationship[p.relationship] = (byRelationship[p.relationship] ?? 0) + 1;
  }
  return {
    total: profiles.length,
    byStatus,
    byRelationship,
    completed: byStatus.completed,
    inProgress: byStatus.in_progress,
    awaitingSignature: byStatus.awaiting_signature,
    blocked: byStatus.blocked,
    completionRate: profiles.length === 0 ? 0 : Math.round((byStatus.completed / profiles.length) * 100),
  };
}

// The dev/fallback roster, mirrored by the 20260808100000_os_onboarding seed.
// The component uses these as the honest dev state until the migration is
// applied. Keep in sync with the SQL seed.
export const ONBOARDING_SEED: OnboardingProfile[] = [
  {
    id: 'seed-obo-0', org_id: NOWOPEN_ORG_ID, full_name: 'Adeyemi Odunaiike',
    email: 'founder@nowopen.africa', relationship: 'employee', department: 'Executive',
    role: 'Founder & CEO', country: 'Nigeria',
    steps_completed: journeyFor('employee').map((s) => s.id),
    signed_agreements: ['NDA', 'Confidentiality', 'IP agreement', 'Code of conduct'],
    access_grants: ['Founder Command Center', 'Company OS', 'Strategy', 'Creative Studio'],
    created_at: '2026-05-01T09:00:00Z',
  },
  {
    id: 'seed-obo-1', org_id: NOWOPEN_ORG_ID, full_name: 'Chukwu Emeka',
    email: 'chukwu@nowopen.africa', relationship: 'employee', department: 'Creative & Brand',
    role: 'Motion Designer', country: 'Nigeria',
    steps_completed: ['personal-information', 'professional-information', 'department', 'role', 'employment-documents', 'nda', 'ip-confidentiality', 'code-of-conduct', 'policies', 'orientation'],
    signed_agreements: ['NDA', 'IP agreement', 'Code of conduct'],
    access_grants: ['Creative', 'Motion Design', 'Creative Studio', 'Brand Library'],
    created_at: '2026-08-01T09:00:00Z',
  },
  {
    id: 'seed-obo-2', org_id: NOWOPEN_ORG_ID, full_name: 'Meatclub Nigeria',
    email: 'ops@meatclub.ng', relationship: 'partner', department: 'Partnerships',
    role: 'Strategic / Business partner', country: 'Nigeria',
    steps_completed: ['company-information', 'representative', 'partnership-type', 'business-verification', 'partnership-proposal', 'nda'],
    signed_agreements: ['NDA'],
    access_grants: ['Partner portal'],
    created_at: '2026-08-03T09:00:00Z',
  },
  {
    id: 'seed-obo-3', org_id: NOWOPEN_ORG_ID, full_name: 'Zainab Bello',
    email: 'zainab.b@example.com', relationship: 'volunteer', country: 'Nigeria',
    steps_completed: ['personal-information', 'skills-interests', 'availability', 'location', 'volunteer-agreement'],
    signed_agreements: ['Volunteer agreement'],
    access_grants: [],
    created_at: '2026-08-06T09:00:00Z',
  },
  {
    id: 'seed-obo-4', org_id: NOWOPEN_ORG_ID, full_name: 'Lagos Tech Studio',
    email: 'hello@lagostech.studio', relationship: 'creative', country: 'Nigeria',
    steps_completed: ['personal-information', 'creative-briefing', 'portfolio', 'nda'],
    signed_agreements: ['NDA'],
    access_grants: ['Creative workspace'],
    created_at: '2026-08-07T09:00:00Z',
  },
  {
    id: 'seed-obo-5', org_id: NOWOPEN_ORG_ID, full_name: 'Kofi Mensah',
    email: 'kofi@example.com', relationship: 'volunteer', country: 'Ghana',
    steps_completed: ['personal-information', 'skills-interests', 'availability', 'location', 'volunteer-agreement', 'nda-confidentiality', 'code-of-conduct', 'consent', 'orientation'],
    signed_agreements: ['Volunteer agreement', 'NDA / confidentiality'],
    access_grants: ['Community portal', 'Volunteer workspace'],
    created_at: '2026-07-15T09:00:00Z',
  },
  {
    id: 'seed-obo-6', org_id: NOWOPEN_ORG_ID, full_name: 'Atlas Capital',
    email: 'invest@atlascap.co', relationship: 'investor', country: 'United Kingdom',
    steps_completed: ['contact-information', 'investor-type', 'fund-information'],
    signed_agreements: [],
    access_grants: [],
    created_at: '2026-08-08T09:00:00Z',
  },
  {
    id: 'seed-obo-7', org_id: NOWOPEN_ORG_ID, full_name: 'Nairobi Media House',
    email: 'news@nairobi.media', relationship: 'media-partner', country: 'Kenya',
    steps_completed: ['media-information', 'outlet-details', 'reach-audience'],
    signed_agreements: [],
    access_grants: [],
    blocked_at: '2026-08-08T12:00:00Z',
    created_at: '2026-08-04T09:00:00Z',
  },
];
