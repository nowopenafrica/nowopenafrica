/**
 * Knowing what a CSV already contains before spending the hour on it.
 *
 * The assertions that matter are about the NORMALISATION, because a miss
 * there does not error — it quietly reports an account we already hold as
 * new, and spends an Instagram lookup proving the database right. That is
 * the exact cost this module exists to avoid.
 */

import { describe, it, expect } from 'vitest';

import { classifyHandles, preflightSummary, EMPTY_KNOWN, type KnownHandles } from './instagramPreflight';
import { readHandle } from './instagramBatch';

const known = (over: Partial<Record<keyof KnownHandles, string[]>> = {}): KnownHandles => ({
  listed: new Set(over.listed ?? []),
  filed: new Set(over.filed ?? []),
  unreadable: new Set(over.unreadable ?? []),
});

describe('the three stored shapes all compare as the same handle', () => {
  it.each([
    // businesses.social_links->>'instagram' holds both of these forms
    ['hilton_addis_ababa', 'hilton_addis_ababa'],
    ['https://www.instagram.com/leoburnettlagos/profilecard/', 'leoburnettlagos'],
    // radar_candidates.source_record_id
    ['https://www.instagram.com/9ja_phone_stores/', '9ja_phone_stores'],
    // what a person pastes into a spreadsheet
    ['@AdaFabrics', 'adafabrics'],
    ['instagram.com/AdaFabrics?igsh=xyz', 'adafabrics'],
  ])('reads %j as %s', (stored, expected) => {
    /*
     * All three sources go through readHandle before being compared. If this
     * ever stops holding, the preflight silently under-reports and the run
     * pays for it in quota.
     */
    expect(readHandle(stored)).toBe(expected);
  });
});

describe('it tells new from already known', () => {
  const handles = ['adafabrics', 'bolastyles', 'chopnlife', 'deejay'];

  it('marks a published listing as listed', () => {
    const p = classifyHandles(handles, known({ listed: ['adafabrics'] }));
    expect(p.rows.find((r) => r.handle === 'adafabrics')?.state).toBe('listed');
    expect(p.newHandles).not.toContain('adafabrics');
  });

  it('marks a queued candidate as filed', () => {
    const p = classifyHandles(handles, known({ filed: ['bolastyles'] }));
    expect(p.counts.filed).toBe(1);
    expect(p.newHandles).not.toContain('bolastyles');
  });

  it('marks a ledger entry as unreadable', () => {
    const p = classifyHandles(handles, known({ unreadable: ['chopnlife'] }));
    expect(p.counts.unreadable).toBe(1);
  });

  it('spends lookups only on what is genuinely new', () => {
    const p = classifyHandles(handles, known({
      listed: ['adafabrics'], filed: ['bolastyles'], unreadable: ['chopnlife'],
    }));
    expect(p.newHandles).toEqual(['deejay']);
    expect(p.counts).toEqual({ new: 1, listed: 1, filed: 1, unreadable: 1 });
  });

  it('treats everything as new when nothing is known yet', () => {
    const p = classifyHandles(handles, EMPTY_KNOWN);
    expect(p.newHandles).toEqual(handles);
    expect(p.counts.new).toBe(4);
  });
});

describe('precedence, where a handle is in more than one place', () => {
  it('reports a listed account as listed, not as unreadable', () => {
    /*
     * The ledger may hold an old "not a Business account" for a handle that
     * has since converted and been published. Reporting that as unreadable
     * would tell an operator to go and ask the business to switch — which it
     * evidently already did.
     */
    const p = classifyHandles(['adafabrics'], known({
      listed: ['adafabrics'], unreadable: ['adafabrics'],
    }));
    expect(p.rows[0].state).toBe('listed');
  });

  it('prefers filed over unreadable for the same reason', () => {
    const p = classifyHandles(['adafabrics'], known({
      filed: ['adafabrics'], unreadable: ['adafabrics'],
    }));
    expect(p.rows[0].state).toBe('filed');
  });
});

describe('one row per account', () => {
  it('collapses a handle the file repeats', () => {
    // A spreadsheet listing the same shop twice is not two lookups.
    const p = classifyHandles(['adafabrics', 'AdaFabrics'.toLowerCase(), 'adafabrics']);
    expect(p.rows).toHaveLength(1);
    expect(p.newHandles).toEqual(['adafabrics']);
  });

  it('ignores blanks rather than counting them', () => {
    const p = classifyHandles(['', '   ', 'adafabrics']);
    expect(p.counts.new).toBe(1);
  });
});

describe('what the operator is told before anything is spent', () => {
  it('says how many lookups are saved', () => {
    const p = classifyHandles(['a', 'b', 'c', 'd'], known({ listed: ['a', 'b'], filed: ['c'] }));
    const s = preflightSummary(p);
    expect(s).toMatch(/2 already listed/);
    expect(s).toMatch(/1 already in the review queue/);
    expect(s).toMatch(/1 will be looked up/);
    expect(s).toMatch(/3 lookups saved/);
  });

  it('does not pretend there is work when the whole file is already held', () => {
    const p = classifyHandles(['a', 'b'], known({ listed: ['a', 'b'] }));
    expect(preflightSummary(p)).toMatch(/Nothing left to look up/);
  });

  it('stays quiet about savings when there are none', () => {
    const s = preflightSummary(classifyHandles(['a', 'b']));
    expect(s).toMatch(/2 accounts/);
    expect(s).not.toMatch(/saved/);
  });

  it('reads naturally for one account', () => {
    expect(preflightSummary(classifyHandles(['a']))).toMatch(/^1 account,/);
  });
});
