import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { readHandle } from './instagramBatch';
import {
  INSTAGRAM_SYNC_NOTE,
  instagramHandleChanged,
  ownerSyncApplies,
  ownerSyncMessage,
  type SyncRequestRow,
} from './instagramOwnerSync';

/**
 * The cases the SQL twin `instagram_handle_of()` is checked against on live
 * (scripts/check-instagram-owner-sync.sql, check 1). The same list checks the
 * edge's normalizeHandle() in supabase/functions/_shared/instagramOwnerSync.test.ts
 * and the browser's readHandle() here, so the trigger, the edge function and
 * the editor's "did the handle change?" all agree.
 */
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

describe('handle normalisation parity', () => {
  it.each(HANDLE_CASES)('readHandle(%j) = %j', (raw, expected) => {
    expect(readHandle(raw)).toBe(expected);
  });

  it('the live check SQL carries exactly these cases', () => {
    const sql = readFileSync(join(process.cwd(), 'scripts', 'check-instagram-owner-sync.sql'), 'utf8');
    for (const [raw, expected] of HANDLE_CASES) {
      const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
      expect(sql).toContain(`(${lit(raw)}, ${expected === null ? 'NULL' : lit(expected)})`);
    }
  });
});

describe('ownerSyncApplies', () => {
  it('only for a claimed business with an owner', () => {
    expect(ownerSyncApplies({ claim_status: 'claimed', user_id: 'u' })).toBe(true);
    expect(ownerSyncApplies({ claim_status: 'unclaimed', user_id: 'u' })).toBe(false);
    expect(ownerSyncApplies({ claim_status: 'claimed', user_id: null })).toBe(false);
    expect(ownerSyncApplies({})).toBe(false);
  });
});

describe('instagramHandleChanged', () => {
  it('is false for the same account written differently', () => {
    expect(instagramHandleChanged('https://www.instagram.com/yemzoarts/', '@YemzoArts')).toBe(false);
  });
  it('is true for a new or different account', () => {
    expect(instagramHandleChanged(null, '@yemzoarts')).toBe(true);
    expect(instagramHandleChanged('@a', '@b')).toBe(true);
  });
  it('is false when the handle is removed or unusable', () => {
    expect(instagramHandleChanged('@a', '')).toBe(false);
    expect(instagramHandleChanged('@a', 'not a handle!')).toBe(false);
  });
});

const row = (over: Partial<SyncRequestRow>): SyncRequestRow => ({
  status: 'pending', handle: 'yemzoarts', requested_at: '2026-11-15T10:00:00Z',
  processed_at: null, posts_added: 0, note: null, ...over,
});

describe('ownerSyncMessage', () => {
  it('says nothing with no request', () => {
    expect(ownerSyncMessage(null)).toBeNull();
  });
  it('reports a waiting or running sync', () => {
    expect(ownerSyncMessage(row({ status: 'pending' }))!.text).toMatch(/Bringing in your posts from @yemzoarts/);
    expect(ownerSyncMessage(row({ status: 'working' }))!.tone).toBe('info');
  });
  it('counts the posts added, singular and plural', () => {
    expect(ownerSyncMessage(row({ status: 'done', posts_added: 12, processed_at: '2026-11-15T10:05:00Z' }))!.text)
      .toMatch(/^12 posts from @yemzoarts added/);
    expect(ownerSyncMessage(row({ status: 'done', posts_added: 1, processed_at: '2026-11-15T10:05:00Z' }))!.text)
      .toMatch(/^1 post from/);
  });
  it('does not claim posts were added when none were new', () => {
    const m = ownerSyncMessage(row({ status: 'done', posts_added: 0, processed_at: '2026-11-15T10:05:00Z' }))!;
    expect(m.text).not.toMatch(/added/);
  });
  it('tells the owner how to fix a non-business account', () => {
    const m = ownerSyncMessage(row({ status: 'not_business' }))!;
    expect(m.tone).toBe('warn');
    expect(m.text).toMatch(/Business or Creator/);
  });
});

describe('copy honesty', () => {
  it('promises neither instant sync nor live video', () => {
    expect(INSTAGRAM_SYNC_NOTE).not.toMatch(/instant|real-?time|live/i);
    expect(INSTAGRAM_SYNC_NOTE).toMatch(/every few hours/);
  });
});
