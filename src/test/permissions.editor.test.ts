import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canAccessIntelligence, canAccessTab, canCreateBusiness, canEditBusinessProfile,
  canEditAdverts,
  ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_CAPABILITIES,
  type AppRole,
} from '../lib/permissions';

describe('canAccessIntelligence (Business Intelligence area)', () => {
  it('admits admin and editor — the roles the database allows on every BI table', () => {
    expect(canAccessIntelligence('admin')).toBe(true);
    expect(canAccessIntelligence('editor')).toBe(true);
  });

  it('keeps the narrowest staff role out: curator RLS only covers businesses', () => {
    expect(canAccessIntelligence('business_curator')).toBe(false);
  });

  it('keeps all non-staff roles out', () => {
    expect(canAccessIntelligence('business')).toBe(false);
    expect(canAccessIntelligence('media_service')).toBe(false);
    expect(canAccessIntelligence('personal')).toBe(false);
    expect(canAccessIntelligence(null)).toBe(false);
    expect(canAccessIntelligence(undefined)).toBe(false);
  });
});

describe('the Business Intelligence boundary is a database boundary too', () => {
  /* The tab is UX; the live BI tables were staff-named but admin-gated, so an
     editor rendering the section saw empty tables. This migration rewrites the
     "Staff" policies to is_staff() on every table the BI tabs read and write. */
  const sql = readFileSync(
    'supabase/migrations/20260930010000_business_intelligence_staff_rls.sql',
    'utf8',
  );
  const BI_TABLES = [
    'radar_candidates',
    'radar_config',
    'radar_sources',
    'radar_candidate_evidence',
    'business_discovery_campaigns',
    'business_discovery_runs',
  ];

  it('widens every BI read policy to is_staff()', () => {
    for (const table of BI_TABLES) {
      expect(sql, table).toMatch(new RegExp(`Staff read .* ON public\\.${table}`));
    }
    expect(sql.match(/FOR SELECT TO authenticated USING \(public\.is_staff\(\)\)/g)?.length).toBe(6);
  });

  it('widens every BI write policy to is_staff(), never is_admin()', () => {
    for (const table of BI_TABLES) {
      expect(sql, table).toMatch(new RegExp(`ON public\\.${table}`));
    }
    expect(sql).not.toMatch(/\(public\.is_admin\(\)\)/);
  });

  it('keeps the kill switches admin-only: feature_flags is untouched', () => {
    expect(sql).not.toMatch(/ON public\.feature_flags/);
  });
});

describe('editor business access', () => {
  it('lets an editor edit an unclaimed, ownerless listing', () => {
    const verdict = canEditBusinessProfile('editor', { claim_status: 'unclaimed', user_id: null });
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toMatch(/Unclaimed/i);
  });

  it('lets an admin edit an unclaimed listing', () => {
    expect(canEditBusinessProfile('admin', { claim_status: 'unclaimed', user_id: null }).allowed).toBe(true);
  });

  it('refuses an editor a claimed listing', () => {
    const verdict = canEditBusinessProfile('editor', { claim_status: 'claimed', user_id: null });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/claimed/i);
  });

  it('refuses an editor a listing with an owner, whatever the status says', () => {
    const verdict = canEditBusinessProfile('editor', { claim_status: 'unclaimed', user_id: 'owner-9' });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/owner holds/i);
  });

  it('refuses an editor while a claim is pending', () => {
    expect(canEditBusinessProfile('editor', { claim_status: 'claim_pending', user_id: null }).allowed).toBe(false);
  });

  it('refuses a non-staff role outright', () => {
    expect(canEditBusinessProfile('business', { claim_status: 'unclaimed', user_id: null }).allowed).toBe(false);
    expect(canEditBusinessProfile(null, { claim_status: 'unclaimed', user_id: null }).allowed).toBe(false);
  });
});

describe('canCreateBusiness', () => {
  it('is staff-only', () => {
    expect(canCreateBusiness('admin')).toBe(true);
    expect(canCreateBusiness('editor')).toBe(true);
    expect(canCreateBusiness('business_curator')).toBe(true);
    expect(canCreateBusiness('business')).toBe(false);
    expect(canCreateBusiness('media_service')).toBe(false);
    expect(canCreateBusiness('personal')).toBe(false);
    expect(canCreateBusiness(null)).toBe(false);
  });
});

describe('editing a placement from the admin console', () => {
  /* The Adverts tab is visible to editors, but the database is not the same
     boundary: every non-admin write policy on advertisements is narrowed to
     the row's own user_id (20261111010000_partner_portal.sql), and the only
     broad one is is_admin(). A button for an editor would fail at RLS. */
  const sql = readFileSync('supabase/migrations/20240701000000_admin_access.sql', 'utf8');

  it('admits an admin, whose policy is FOR ALL USING (is_admin())', () => {
    expect(canEditAdverts('admin')).toBe(true);
    expect(sql).toMatch(/Admins can manage advertisements/);
  });

  it('refuses an editor, who may read the row but not change it', () => {
    expect(canAccessTab('editor', 'adverts')).toBe(true);
    expect(canEditAdverts('editor')).toBe(false);
  });

  it('refuses every other role, and the signed-out case', () => {
    expect(canEditAdverts('business_curator')).toBe(false);
    expect(canEditAdverts('business')).toBe(false);
    expect(canEditAdverts('media_service')).toBe(false);
    expect(canEditAdverts('personal')).toBe(false);
    expect(canEditAdverts(null)).toBe(false);
    expect(canEditAdverts(undefined)).toBe(false);
  });
});

describe('the Roles definition tab', () => {
  it('is admin-only', () => {
    expect(canAccessTab('admin', 'roles')).toBe(true);
    expect(canAccessTab('editor', 'roles')).toBe(false);
    expect(canAccessTab('business', 'roles')).toBe(false);
  });

  it('stays reachable for editors on the businesses tab', () => {
    expect(canAccessTab('editor', 'businesses')).toBe(true);
    expect(canAccessTab('admin', 'businesses')).toBe(true);
  });

  it('keeps account administration admin-only', () => {
    expect(canAccessTab('editor', 'users')).toBe(false);
    expect(canAccessTab('editor', 'payments')).toBe(false);
  });

  it('gives editors the embedded Business Intelligence tab', () => {
    expect(canAccessTab('editor', 'business-intel')).toBe(true);
    expect(canAccessTab('admin', 'business-intel')).toBe(true);
    expect(canAccessTab('business_curator', 'business-intel')).toBe(false);
    expect(canAccessTab('business', 'business-intel')).toBe(false);
  });
});

describe('every assignable role is defined for the matrix', () => {
  const roles: AppRole[] = ['business', 'media_service', 'personal', 'business_curator', 'editor', 'admin'];

  it('has all six roles assignable, in order', () => {
    expect(ASSIGNABLE_ROLES).toEqual(roles);
  });

  it('has a label, a description and capabilities for each', () => {
    for (const r of roles) {
      expect(ROLE_LABELS[r]).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[r]).toBeTruthy();
      expect(ROLE_CAPABILITIES[r].length).toBeGreaterThan(0);
    }
  });

  it('says an editor cannot touch moderation', () => {
    expect(ROLE_DESCRIPTIONS.editor).toMatch(/UNCLAIMED/i);
    expect(ROLE_CAPABILITIES.editor.some(c => c.startsWith('Cannot edit claimed'))).toBe(true);
  });

  it('says a business curator is narrower than an editor', () => {
    expect(ROLE_DESCRIPTIONS.business_curator).toMatch(/UNCLAIMED/i);
    expect(ROLE_CAPABILITIES.business_curator.some(c => c.startsWith('Cannot edit claimed'))).toBe(true);
    expect(ROLE_CAPABILITIES.business_curator.some(c => c.includes('Overview + Businesses'))).toBe(true);
  });
});