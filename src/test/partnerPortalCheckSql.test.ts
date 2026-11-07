import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Structural guards on scripts/check-partner-portal.sql. The script runs
 * against production, so what keeps it safe is that it can never commit.
 */

const SQL = readFileSync(join(process.cwd(), 'scripts', 'check-partner-portal.sql'), 'utf8');

// Line comments removed, so prose in the header cannot trip the assertions.
const CODE = SQL.split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')
  .trim();

const CHECKS = [
  'enable_is_idempotent',
  'unverified_owner_creates_pending_review',
  'verified_owner_creates_partner_verified',
  'verify_promotes_supplied_not_pending',
  'owner_cannot_set_lifecycle_directly',
  'user_id_alone_cannot_edit_owned',
  'owner_update_only_allowed_fields',
  'owner_availability_names_owner',
  'one_pending_claim_per_advert',
  'representative_claim_needs_document',
  'admin_claim_approval_links_owner',
  'admin_review_reject_needs_reason',
  'pending_review_hidden_from_trust_view',
  'anon_cannot_read_documents_claims_imports',
  'expiry_notice_once',
  'stock_photo_refused',
  // Required by the Task 1 review
  'owner_create_end_to_end',
  'user_id_alone_cannot_update_or_delete_owned',
  // Required by the final review (20261111030000_partner_portal_fixes.sql)
  'admin_approve_uses_current_verification',
  'rejected_owner_cannot_edit_or_confirm',
  'resubmit_needs_new_document',
  'cleared_price_has_no_source',
  'approve_refused_for_rejected_owner',
];

describe('partner portal check script', () => {
  it('is one transaction: starts with BEGIN, ends with ROLLBACK;', () => {
    expect(CODE.startsWith('BEGIN;')).toBe(true);
    expect(CODE.endsWith('ROLLBACK;')).toBe(true);
    expect(CODE.match(/^BEGIN;/gm)?.length).toBe(1);
  });

  it('never commits', () => {
    expect(/\bCOMMIT\b/i.test(CODE)).toBe(false);
    expect(/\bEND\s+TRANSACTION\b/i.test(CODE)).toBe(false);
  });

  it('reads the business day in Lagos, never the UTC date', () => {
    expect(/\bcurrent_date\b/i.test(CODE)).toBe(false);
    expect(/now\(\)\s*::\s*date/i.test(CODE)).toBe(false);
    expect(CODE).toMatch(/\(now\(\) AT TIME ZONE 'Africa\/Lagos'\)::date/);
  });

  it('names its throwaway rows, and creates no permanent object', () => {
    expect(CODE).toContain('zz-portal-check');
    expect(/\bCREATE\s+(TABLE|VIEW|POLICY|TRIGGER)\b/i.test(CODE)).toBe(false);
    for (const m of CODE.matchAll(/\bCREATE\s+FUNCTION\s+([\w.]+)/gi)) {
      expect(m[1].startsWith('pg_temp.')).toBe(true);
    }
  });

  it('makes an authenticated caller go back to the owner role before asserting', () => {
    const sets = CODE.match(/SET LOCAL ROLE (authenticated|anon)/g)?.length ?? 0;
    const resets = CODE.match(/RESET ROLE/g)?.length ?? 0;
    expect(sets).toBeGreaterThan(0);
    expect(resets).toBeGreaterThanOrEqual(sets - 1);
  });

  it('checks every name exactly once', () => {
    expect(CHECKS).toHaveLength(23);
    const passes = [...SQL.matchAll(/chk_pass\('([a-z0-9_]+)'\)/g)].map((m) => m[1]);
    expect(passes.sort()).toEqual([...CHECKS].sort());
  });

  it('the summary expects every check, and one final SELECT reports them', () => {
    expect(CODE).toMatch(/= 23,\s*'summary: expected 23 passing checks/);
    // Only the setup set_config and the summary row are top-level SELECTs.
    const selects = CODE.match(/^SELECT .*/gm) ?? [];
    expect(selects).toHaveLength(2);
    expect(selects[0]).toMatch(/^SELECT set_config\('chk\.passed'/);
    expect(selects[1]).toMatch(/AS checks_passed|string_agg/);
  });

  it.each(CHECKS)('contains the %s check', (name) => {
    expect(SQL).toContain(`chk_pass('${name}')`);
    expect(SQL).toContain(`${name}:`);
  });
});
