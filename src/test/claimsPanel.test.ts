/**
 * The claims review screen must exist and must be reachable.
 *
 * ── WHY THIS IS A TEST AND NOT JUST A COMPONENT ──────────────────────────
 *
 * MEASURED 2026-10-06, auditing the acquisition funnel:
 *
 *   businesses                 3,906
 *   claims ever filed              0
 *   admin tabs                    27
 *   admin tabs for claims          0
 *
 * `ClaimBusiness` wrote claims, the database handled them correctly, and
 * `chiefOfStaff` even counted "Claims waiting for review" — but nothing
 * rendered them. A claim could be filed and then sit in the table forever,
 * because no person could see it.
 *
 * Nothing failed. No test broke. Every individual piece was correct and the
 * funnel had no exit. That is the specific failure these assertions guard:
 * not whether the panel works, but whether it is WIRED.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PANEL = 'src/components/admin/ClaimsPanel.tsx';
const DASHBOARD = 'src/pages/AdminDashboard.tsx';
const PERMISSIONS = 'src/lib/permissions.ts';

const panel = readFileSync(PANEL, 'utf8');
const dashboard = readFileSync(DASHBOARD, 'utf8');
const permissions = readFileSync(PERMISSIONS, 'utf8');

describe('claims can actually be reviewed', () => {
  it('declares a claims tab', () => {
    expect(permissions).toMatch(/'claims'/);
  });

  it('renders the panel for that tab', () => {
    // A tab id with no render is a menu entry that shows a blank page.
    expect(dashboard).toMatch(/activeTab === 'claims' && <ClaimsPanel \/>/);
    expect(dashboard).toMatch(/import ClaimsPanel from/);
  });

  it('puts the tab in the navigation', () => {
    // And a panel with no tab is unreachable, which is where this started.
    expect(dashboard).toMatch(/id: 'claims'/);
  });

  it('shows how many are waiting, counted in the database', () => {
    /*
     * head:true so it costs no rows. A claim is somebody who already acted
     * and is now waiting on us — the count belongs where it is seen.
     */
    expect(dashboard).toMatch(/from\('business_claims'\)/);
    expect(dashboard).toMatch(/count: 'exact', head: true/);
    expect(dashboard).toMatch(/eq\('status', 'pending'\)/);
  });
});

describe('the panel decides claims, and nothing else', () => {
  it('writes only the claim row, never the business', () => {
    /*
     * Approval is `trg_apply_business_claim`: setting status='approved'
     * assigns the owner and flips claim_status. Verified end to end against
     * the live database — a claim filed, approved through this screen, and
     * ownership transferred.
     *
     * If this panel also wrote `businesses` there would be two things
     * assigning ownership, and the one that ran second would win.
     */
    expect(panel).toMatch(/from\('business_claims'\)[\s\S]{0,200}\.update\(/);
    expect(panel, 'the panel must not assign ownership itself')
      .not.toMatch(/from\('businesses'\)[\s\S]{0,120}\.update\(/);
  });

  it('only ever sets a status the table allows', () => {
    // business_claims_status_check: pending | approved | rejected.
    const statuses = [...panel.matchAll(/decide\([^,]+, '([a-z]+)'/g)].map((m) => m[1]);
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(['approved', 'rejected']).toContain(s);
  });

  it('confirms a rejection but not an approval', () => {
    /*
     * Deliberate asymmetry. Approving is the expected outcome and the button
     * says exactly what it does. Rejecting tells a real business "no", so it
     * is the one that gets a confirmation step.
     */
    expect(panel).toMatch(/ConfirmDialog/);
    expect(panel).toMatch(/setRejecting\(/);
  });

  it('fetches the business and claimant separately, not through an embed', () => {
    /*
     * business_claims has no declared FK to users, and a PostgREST embed that
     * cannot resolve fails the WHOLE select — the trap this codebase has hit
     * before, where one bad name returns no rows and the screen looks empty
     * rather than broken.
     */
    expect(panel).not.toMatch(/select\([^)]*businesses\s*\(/);
    expect(panel).not.toMatch(/select\([^)]*users\s*\(/);
    expect(panel).toMatch(/from\('businesses'\)[\s\S]{0,160}\.in\('id'/);
  });

  it('says why the queue is empty instead of showing a bare zero', () => {
    // Zero claims is a fact about outreach, not about this screen.
    expect(panel).toMatch(/Claims arrive when a business owner/);
  });
});
