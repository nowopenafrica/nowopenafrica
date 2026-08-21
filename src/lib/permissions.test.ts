import { describe, it, expect } from 'vitest';
import {
  canAccessTab, canDelete, canManageRoles, canManagePlans, canVerify, canManageHero,
  isStaff, isAdmin, isEditor, EDITOR_TABS, ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS,
  type AdminTabId, type AppRole,
} from './permissions';

const ALL_TABS: AdminTabId[] = [
  'overview', 'users', 'businesses', 'verification', 'subscriptions', 'requests',
  'adverts', 'media', 'bookings', 'payments', 'waitlist', 'registrations',
  'applications', 'enquiries', 'audit', 'hero-videos',
];

describe('staff gate', () => {
  it('admits admins and editors, nobody else', () => {
    expect(isStaff('admin')).toBe(true);
    expect(isStaff('editor')).toBe(true);
    for (const r of ['business', 'media_service', null, undefined, '', 'ADMIN', 'Editor']) {
      expect(isStaff(r as string)).toBe(false);
    }
  });

  it('keeps admin and editor distinct', () => {
    expect(isAdmin('editor')).toBe(false);
    expect(isEditor('admin')).toBe(false);
  });
});

describe('tab access', () => {
  it('gives admins every tab', () => {
    for (const t of ALL_TABS) expect(canAccessTab('admin', t)).toBe(true);
  });

  it('gives editors only the content tabs', () => {
    for (const t of ALL_TABS) {
      expect(canAccessTab('editor', t)).toBe(EDITOR_TABS.includes(t));
    }
  });

  // The point of the role. If any of these ever pass for an editor, the
  // console is exposing accounts, money or identity documents.
  it('never lets an editor near accounts, money, identity or deletion', () => {
    for (const t of ['users', 'audit', 'payments', 'subscriptions', 'bookings',
                     'verification', 'registrations', 'waitlist', 'applications', 'requests'] as AdminTabId[]) {
      expect(canAccessTab('editor', t)).toBe(false);
    }
  });

  it('locks out non-staff entirely', () => {
    for (const t of ALL_TABS) {
      expect(canAccessTab('business', t)).toBe(false);
      expect(canAccessTab(null, t)).toBe(false);
    }
  });

  it('lists no editor tab that is not a real tab', () => {
    for (const t of EDITOR_TABS) expect(ALL_TABS).toContain(t);
  });
});

describe('privileged actions', () => {
  it('reserves deletion, roles, plans and verification to admins', () => {
    for (const fn of [canDelete, canManageRoles, canManagePlans, canVerify]) {
      expect(fn('admin')).toBe(true);
      expect(fn('editor')).toBe(false);
      expect(fn('business')).toBe(false);
      expect(fn(null)).toBe(false);
    }
  });

  it('gives the hero banner to both staff roles — it is the editor’s job', () => {
    expect(canManageHero('admin')).toBe(true);
    expect(canManageHero('editor')).toBe(true);
    expect(canManageHero('business')).toBe(false);
  });
});

describe('role metadata', () => {
  it('describes and labels every assignable role', () => {
    for (const r of ASSIGNABLE_ROLES) {
      expect(ROLE_LABELS[r]).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[r]).toBeTruthy();
    }
  });

  it('offers editor as an assignable role', () => {
    expect(ASSIGNABLE_ROLES).toContain('editor' as AppRole);
  });
});
