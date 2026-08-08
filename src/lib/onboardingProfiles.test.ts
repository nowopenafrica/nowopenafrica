import { describe, it, expect } from 'vitest';
import {
  mapOnboardingRow, onboardingProgress, onboardingStatus,
  docPackFor, summarizeOnboarding, ONBOARDING_SEED,
  type OnboardingProfile,
} from './onboardingProfiles';
import { journeyFor } from './relationships';

const base = (p: Partial<OnboardingProfile>): OnboardingProfile => ({
  id: 'p1',
  org_id: '00000000-0000-4000-8000-00000000a001',
  full_name: 'Ada Obi',
  email: 'ada@example.com',
  relationship: 'employee',
  steps_completed: [],
  signed_agreements: [],
  access_grants: [],
  ...p,
});

describe('onboardingProfiles — progress and status', () => {
  it('derives progress from completed journey steps, never a stored number', () => {
    const journey = journeyFor('employee');
    const allButLast = journey.slice(0, -1).map((s) => s.id);
    expect(onboardingProgress(base({ steps_completed: allButLast }))).toBeLessThan(100);
    expect(onboardingProgress(base({ steps_completed: journey.map((s) => s.id) }))).toBe(100);
    expect(onboardingProgress(base({ steps_completed: [] }))).toBe(0);
  });

  it('labels a fresh profile invited, never guessing a score', () => {
    expect(onboardingStatus(base({ steps_completed: [] }))).toBe('invited');
  });

  it('calls a partially-done journey with unsigned documents "awaiting signature"', () => {
    const partial = base({
      relationship: 'employee',
      steps_completed: ['personal-information', 'professional-information', 'department', 'role'],
    });
    expect(onboardingStatus(partial)).toBe('awaiting_signature');
  });

  it('completes only when every step is genuinely done', () => {
    const done = base({ steps_completed: journeyFor('employee').map((s) => s.id) });
    expect(onboardingStatus(done)).toBe('completed');
  });

  it('never lets a blocked profile look complete', () => {
    const allSteps = journeyFor('media-partner').map((s) => s.id);
    const blocked = base({
      relationship: 'media-partner',
      steps_completed: allSteps.slice(0, 3),
      blocked_at: '2026-08-08T12:00:00Z',
    });
    expect(onboardingStatus(blocked)).toBe('blocked');
  });
});

describe('onboardingProfiles — document packets', () => {
  it('generates the employee welcome kit from the vision', () => {
    const pack = docPackFor('employee');
    expect(pack).toContain('Welcome letter');
    expect(pack).toContain('NDA');
    expect(pack).toContain('IP agreement');
    expect(pack).toContain('First 30 days plan');
  });

  it('generates the partner and volunteer packs', () => {
    expect(docPackFor('partner')).toContain('Partnership agreement');
    expect(docPackFor('volunteer')).toContain('Volunteer agreement');
  });

  it('every relationship gets a pack', () => {
    const relationships = ['employee', 'volunteer', 'partner', 'creative', 'investor', 'other'] as const;
    for (const r of relationships) {
      expect(docPackFor(r).length).toBeGreaterThan(0);
    }
  });
});

describe('onboardingProfiles — command center rollup', () => {
  it('rolls up totals per status and per relationship', () => {
    const s = summarizeOnboarding(ONBOARDING_SEED);
    expect(s.total).toBe(ONBOARDING_SEED.length);
    expect(s.byStatus.completed).toBeGreaterThanOrEqual(1);
    expect(s.byStatus.blocked).toBeGreaterThanOrEqual(1);
    expect(s.byStatus.awaiting_signature).toBeGreaterThanOrEqual(1);
    expect(s.byRelationship.employee).toBeGreaterThan(0);
    expect(s.byRelationship.volunteer).toBeGreaterThan(0);
    expect(s.completionRate).toBeGreaterThan(0);
  });

  it('is honest on an empty roster — no invented rates', () => {
    const s = summarizeOnboarding([]);
    expect(s.total).toBe(0);
    expect(s.completionRate).toBe(0);
    expect(s.byStatus.completed).toBe(0);
  });
});

describe('onboardingProfiles — row mapping', () => {
  it('maps snake_case rows and normalises jsonb arrays', () => {
    const p = mapOnboardingRow({
      id: 'r1',
      org_id: '00000000-0000-4000-8000-00000000a001',
      full_name: 'Adeyemi Odunaiike',
      email: 'founder@nowopen.africa',
      relationship: 'employee',
      steps_completed: ['personal-information', 'nda'],
      signed_agreements: '["NDA"]',
      access_grants: null,
    });
    expect(p.relationship).toBe('employee');
    expect(p.steps_completed).toEqual(['personal-information', 'nda']);
    expect(p.signed_agreements).toEqual(['NDA']);
    expect(p.access_grants).toEqual([]);
  });

  it('falls back to "other" for an unknown relationship', () => {
    const p = mapOnboardingRow({
      id: 'r2',
      org_id: '00000000-0000-4000-8000-00000000a001',
      full_name: 'X',
      email: 'x@example.com',
      relationship: 'time-traveller',
    });
    expect(p.relationship).toBe('other');
  });
});
