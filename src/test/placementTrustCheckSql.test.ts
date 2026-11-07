import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Structural guards on scripts/check-placement-trust.sql. The script runs
 * against production, so what keeps it safe is that it can never commit.
 */

const SQL = readFileSync(join(process.cwd(), 'scripts', 'check-placement-trust.sql'), 'utf8');

// Line comments removed, so prose in the header cannot trip the assertions.
const CODE = SQL.split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')
  .trim();

const CHECKS = [
  'partner_verified_requires_verified_owner',
  'owner_unverify_downgrades',
  'expired_confirmation_requires_confirmation',
  'digital_window_is_14_days',
  'unknown_medium_uses_7_days',
  'latest_confirmation_wins',
  'archived_hidden',
  'anon_cannot_read_private',
  'audience_needs_partner_source',
  'the_97_are_honest',
  // v2 view (20261109020000_placement_trust_v2.sql)
  'confirmed_by_names_the_confirming_owner',
  'future_period_is_available_from',
  'lapsed_period_requires_confirmation',
  'rejected_owner_name_hidden',
  'price_basis_null_without_source',
];

describe('placement trust check script', () => {
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

  it.each(CHECKS)('contains the %s check', (name) => {
    expect(SQL).toContain(`chk_pass('${name}')`);
    expect(SQL).toContain(`${name}:`);
  });
});
