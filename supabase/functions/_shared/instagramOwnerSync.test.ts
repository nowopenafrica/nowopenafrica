import { describe, it, expect } from 'vitest';

import {
  MAX_REQUESTS_PER_RUN,
  OWNER_RECHECK_HOURS,
  STALE_WORKING_MINUTES,
  decideRequest,
  isStaleWorking,
  requestOutcome,
} from './instagramOwnerSync';
import { normalizeHandle } from './discovery/instagram';

const NOW = new Date('2026-11-15T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('decideRequest (the handle ledger)', () => {
  it('asks when the ledger has never seen the handle', () => {
    expect(decideRequest(null, NOW)).toEqual({ ask: true });
  });

  it('asks whatever the ledger says, unless it is not_business', () => {
    for (const outcome of ['extracted', 'rate_limited', 'error', 'no_name']) {
      expect(decideRequest({ outcome, last_checked_at: hoursAgo(1) }, NOW).ask).toBe(true);
    }
  });

  it('does not spend a call on a not_business answer from the last day', () => {
    const d = decideRequest({ outcome: 'not_business', last_checked_at: hoursAgo(3) }, NOW);
    expect(d.ask).toBe(false);
    if (!d.ask) expect(d.status).toBe('not_business');
  });

  it('lets the owner re-ask once the answer is a day old (founder decision 2)', () => {
    expect(OWNER_RECHECK_HOURS).toBe(24);
    expect(decideRequest({ outcome: 'not_business', last_checked_at: hoursAgo(24) }, NOW).ask).toBe(true);
    expect(decideRequest({ outcome: 'not_business', last_checked_at: hoursAgo(23.9) }, NOW).ask).toBe(false);
  });

  it('asks rather than guessing when the date is unreadable', () => {
    expect(decideRequest({ outcome: 'not_business', last_checked_at: 'nonsense' }, NOW).ask).toBe(true);
  });
});

describe('requestOutcome', () => {
  it('records the posts added', () => {
    expect(requestOutcome({ ok: true, postsAdded: 12 })).toEqual({ status: 'done', postsAdded: 12, note: null });
  });

  it('treats a failed insert as an error, not success', () => {
    expect(requestOutcome({ ok: true, postsAdded: 0, insertFailed: true }).status).toBe('error');
  });

  it('leaves a rate-limited request waiting so the owner need not ask again', () => {
    expect(requestOutcome({ ok: false, reason: 'rate_limited' }).status).toBe('pending');
  });

  it('maps not_found to not_business', () => {
    expect(requestOutcome({ ok: false, reason: 'not_found' }).status).toBe('not_business');
  });

  it('carries Meta\'s own message for other failures, trimmed', () => {
    const out = requestOutcome({ ok: false, reason: 'permission', message: 'x'.repeat(500) });
    expect(out.status).toBe('error');
    expect(out.note!.length).toBe(300);
  });
});

describe('isStaleWorking', () => {
  it('keeps a fresh claim and releases an abandoned one', () => {
    const fresh = new Date(NOW.getTime() - 60_000).toISOString();
    const old = new Date(NOW.getTime() - STALE_WORKING_MINUTES * 60_000).toISOString();
    expect(isStaleWorking(fresh, NOW)).toBe(false);
    expect(isStaleWorking(old, NOW)).toBe(true);
    expect(isStaleWorking(null, NOW)).toBe(true);
  });
});

describe('budget', () => {
  it('owner requests take only a small share of a 15-lookup run', () => {
    expect(MAX_REQUESTS_PER_RUN).toBeLessThanOrEqual(5);
  });
});

// Same list as src/lib/instagramOwnerSync.test.ts and check 1 of
// scripts/check-instagram-owner-sync.sql (the SQL twin, instagram_handle_of).
const HANDLE_CASES: Array<[string, string | null]> = [
  ['@Business_Name', 'business_name'],
  ['businessname', 'businessname'],
  ['instagram.com/businessname/', 'businessname'],
  ['https://www.instagram.com/businessname?igsh=abc', 'businessname'],
  ['https://instagram.com/yemzoarts', 'yemzoarts'],
  ['  @dare.koya  ', 'dare.koya'],
  ['https://www.instagram.com/p/ABC123/', null],
  ['https://www.instagram.com/reel/XYZ/', null],
  ['not a handle!', null],
  ['', null],
  ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', null],
];

describe('normalizeHandle parity with the SQL twin', () => {
  it.each(HANDLE_CASES)('normalizeHandle(%j) = %j', (raw, expected) => {
    expect(normalizeHandle(raw)).toBe(expected);
  });
});
