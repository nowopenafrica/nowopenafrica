import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  canAccessTab, canDelete, canManageRoles, canManagePlans, canVerify, canManageHero,
  canEditBusinessProfile,
  isStaff, isAdmin, isEditor, EDITOR_TABS, ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS,
  type AdminTabId, type AppRole,
} from './permissions';

// Read the union from the source rather than restating it. A hand-kept copy
// silently stops covering new tabs — this list had already fallen four behind,
// so every one of those tabs went untested for the editor role.
const ALL_TABS: AdminTabId[] = (() => {
  const src = readFileSync('src/lib/permissions.ts', 'utf8');
  const union = src.slice(src.indexOf('export type AdminTabId'));
  return [...union.slice(0, union.indexOf(';')).matchAll(/'([a-z-]+)'/g)]
    .map((m) => m[1] as AdminTabId);
})();

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

describe('editing a business profile', () => {
  /*
   * An unclaimed listing is NowOpen's own work — imported, or built for a
   * business that has not arrived. Somebody has to be able to fix a wrong
   * phone number. The moment an owner claims it, the page is theirs, and an
   * admin editing it is a stranger rewriting a business's own words with no
   * way for them to know it happened.
   */
  const unclaimed = { claim_status: 'unclaimed', user_id: null };

  it('lets an admin maintain an unclaimed listing', () => {
    const v = canEditBusinessProfile('admin', unclaimed);
    expect(v.allowed).toBe(true);
    expect(v.reason).toMatch(/unclaimed/i);
  });

  it('stops at the moment of claiming', () => {
    expect(canEditBusinessProfile('admin', { claim_status: 'claimed', user_id: null }).allowed).toBe(false);
    expect(canEditBusinessProfile('admin', { claim_status: 'unclaimed', user_id: 'u1' }).allowed).toBe(false);
  });

  it('treats an owner as decisive even when the status disagrees', () => {
    /*
     * The two can fall out of step — a row with an owner and a stale status is
     * claimed in every sense that matters, and reading only `claim_status`
     * would hand an admin the edit button for somebody's live page.
     */
    const v = canEditBusinessProfile('admin', { claim_status: 'unclaimed', user_id: 'u1' });
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/owner/i);
  });

  it('waits for a pending claim to be decided', () => {
    // Editing underneath a pending claim changes what the claimant is claiming.
    const v = canEditBusinessProfile('admin', { claim_status: 'claim_pending', user_id: null });
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/pending/i);
  });

  it('is admin-only — an editor cannot rewrite a business', () => {
    expect(canEditBusinessProfile('editor', unclaimed).allowed).toBe(false);
    expect(canEditBusinessProfile('business', unclaimed).allowed).toBe(false);
    expect(canEditBusinessProfile(null, unclaimed).allowed).toBe(false);
  });

  it('always explains itself', () => {
    // A refusal with no reason sends an admin to the SQL editor, where nothing
    // is logged and nothing is guarded.
    for (const business of [
      unclaimed,
      { claim_status: 'claimed', user_id: 'u1' },
      { claim_status: 'claim_pending', user_id: null },
    ]) {
      for (const role of ['admin', 'editor', null]) {
        expect(canEditBusinessProfile(role, business).reason.length).toBeGreaterThan(15);
      }
    }
  });
});

describe('the database enforces the same boundary', () => {
  /*
   * The button is hidden by canEditBusinessProfile, and RLS still says an
   * admin may update any row — so without the trigger the rule would live
   * only in a React component, and a business's own words would depend on
   * which screen somebody happened to use.
   */
  const sql = readFileSync(
    'supabase/migrations/20260908210000_admin_edits_until_claimed.sql',
    'utf8',
  );

  it('guards the update path on businesses', () => {
    expect(sql).toContain('before update on public.businesses');
    expect(sql).toContain('guard_claimed_profile_edits');
  });

  it('lets the owner through', () => {
    expect(sql).toContain('auth.uid() = old.user_id');
  });

  it('protects the fields a business writes about itself', () => {
    for (const column of [
      'name', 'description', 'about', 'tagline', 'social_links', 'phone',
      'email', 'website', 'logo_url', 'image_url', 'opening_hours',
    ]) {
      expect(sql, column).toContain(`new.${column}`);
    }
  });

  it('leaves moderation alone', () => {
    /*
     * Suspending a listing, setting verification, adjusting trust or changing
     * a plan must keep working on a claimed business — otherwise this guard
     * takes away the admin's actual job.
     */
    for (const column of [
      'lifecycle_status', 'verification_status', 'verification_tier',
      'trust_score', 'verified', 'claim_status', 'data_status',
    ]) {
      expect(sql, column).not.toContain(`new.${column},`);
    }
  });

  it('raises rather than silently reverting', () => {
    // The actor is an admin doing what they believe is their job. Telling them
    // "saved" and changing nothing would be a lie they would repeat.
    expect(sql).toMatch(/raise exception/i);
    expect(sql).toContain('Only they can change its details');
  });
});
