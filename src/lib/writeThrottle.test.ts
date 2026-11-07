/**
 * Knowing a rate limit when the database raises one.
 *
 * The assertions that matter are about NOT over-matching. A detector that
 * fires on any error containing "limit" would stop a run that should have
 * continued, which costs an operator an afternoon in exactly the way the
 * thing it is meant to fix does.
 */

import { describe, it, expect } from 'vitest';

import { isWriteThrottled, throttleExplanation, THROTTLE_SQLSTATE } from './writeThrottle';

const THE_REAL_MESSAGE =
  'Too many submissions from this connection. Please wait a little and try again, '
  + 'or contact us if you need to add several at once.';

describe('it recognises the database saying stop', () => {
  it('matches on the SQLSTATE, which is the actual contract', () => {
    expect(isWriteThrottled({ code: THROTTLE_SQLSTATE, message: 'anything at all' })).toBe(true);
    expect(THROTTLE_SQLSTATE).toBe('53400');
  });

  it('still matches when only the message survives', () => {
    // An edge function relaying an error as text loses the code.
    expect(isWriteThrottled({ message: THE_REAL_MESSAGE })).toBe(true);
    expect(isWriteThrottled({ code: null, message: THE_REAL_MESSAGE.toUpperCase() })).toBe(true);
  });
});

describe('it does not over-match', () => {
  it('ignores unrelated failures', () => {
    /*
     * The damaging false positive. Stopping a 1,000-handle run because one
     * row violated a constraint would waste the operator's afternoon — the
     * same cost as the bug this detector exists to prevent.
     */
    for (const err of [
      { code: '23505', message: 'duplicate key value violates unique constraint' },
      { code: '42703', message: 'column "x" does not exist' },
      { code: 'PGRST116', message: 'The result contains 0 rows' },
      { message: 'rate limit' },
      { message: 'Instagram rate limit reached' },
      { message: 'too many requests' },
    ]) {
      expect(isWriteThrottled(err), JSON.stringify(err)).toBe(false);
    }
  });

  it('treats absence of an error as success, not as a limit', () => {
    expect(isWriteThrottled(null)).toBe(false);
    expect(isWriteThrottled(undefined)).toBe(false);
    expect(isWriteThrottled({})).toBe(false);
  });
});

describe('what the operator is told', () => {
  it('reports what was kept and what was not attempted', () => {
    const msg = throttleExplanation(40, 960);
    expect(msg).toMatch(/40 listings are filed/);
    expect(msg).toMatch(/960 handles were not attempted/);
    expect(msg).toMatch(/no lookups were wasted/);
  });

  it('does not tell the operator to contact themselves', () => {
    /*
     * The database's own sentence ends "contact us if you need to add several
     * at once". Said to the person who runs the platform, that is nonsense —
     * they are "us".
     */
    expect(throttleExplanation(40, 960)).not.toMatch(/contact us/i);
  });

  it('reads naturally for a single row', () => {
    const msg = throttleExplanation(1, 1);
    expect(msg).toMatch(/1 listing is filed/);
    expect(msg).toMatch(/1 handle was not attempted/);
  });
});
