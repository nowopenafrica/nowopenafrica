import { describe, it, expect } from 'vitest';
import {
  canAccessTab, canCreateBusiness, canEditBusinessProfile,
  ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_CAPABILITIES,
  type AppRole,
} from '../lib/permissions';

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
    expect(canCreateBusiness('business')).toBe(false);
    expect(canCreateBusiness('media_service')).toBe(false);
    expect(canCreateBusiness('personal')).toBe(false);
    expect(canCreateBusiness(null)).toBe(false);
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
});

describe('every assignable role is defined for the matrix', () => {
  const roles: AppRole[] = ['business', 'media_service', 'personal', 'editor', 'admin'];

  it('has all five roles assignable, in order', () => {
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
});