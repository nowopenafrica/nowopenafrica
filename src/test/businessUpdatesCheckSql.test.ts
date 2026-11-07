import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Structural guards on scripts/check-business-updates.sql. The script runs
 * against production, so what keeps it safe is that it can never commit.
 */

const SQL = readFileSync(join(process.cwd(), 'scripts', 'check-business-updates.sql'), 'utf8');
const RUNNER = readFileSync(join(process.cwd(), 'scripts', 'check-business-updates.mjs'), 'utf8');

// Line comments removed, so prose in the header cannot trip the assertions.
const CODE = SQL.split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')
  .trim();

const CHECKS = [
  'anon_sees_active',
  'boundary_24h_is_exclusive',
  'anon_blind_to_draft_scheduled_ended_hidden',
  'owner_sees_archive',
  'stranger_cannot_insert',
  'support_member_cannot_publish',
  'support_member_reads_archive',
  'marketing_member_can_publish',
  'published_at_locked_after_live',
  'live_update_text_locked',
  'ended_at_cannot_be_cleared',
  'owner_cannot_unhide',
  'admin_hide_removes_public',
  'owner_cannot_delete_hidden',
  'schedule_limit_14_days',
  'empty_update_refused',
  'offer_needs_own_offer',
  'media_cap_10',
  'media_locked_when_live',
  'media_path_must_match',
  'anon_cannot_read_ended_media',
  'member_reads_archive_media',
  'bad_path_refused',
  'alert_sets_notified_at',
  'dispatch_sends_due_scheduled',
  'report_insert_anon_ok',
  'report_hidden_from_owner',
  'author_forced_to_caller',
  // Fix pass after the whole-change review.
  'offer_delete_releases_updates',
  'storage_locked_after_live',
  'no_alert_after_expiry',
  'identity_locked',
  // Phase 2: publishing on the server's clock.
  'publish_uses_server_clock',
];

describe('business updates check script', () => {
  it('is one transaction: starts with BEGIN, ends with ROLLBACK;', () => {
    expect(CODE.startsWith('BEGIN;')).toBe(true);
    expect(CODE.endsWith('ROLLBACK;')).toBe(true);
  });

  it('never commits', () => {
    expect(CODE).not.toMatch(/\bCOMMIT\b/i);
  });

  it.each(CHECKS)('runs check %s', (name) => {
    expect(CODE).toContain(`chk_pass('${name}')`);
  });

  it('has a runner that rolls back and never commits', () => {
    expect(RUNNER).toContain('ROLLBACK');
    expect(RUNNER).not.toMatch(/COMMIT/);
  });
});
