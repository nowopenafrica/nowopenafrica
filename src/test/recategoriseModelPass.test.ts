import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * MEASURED 2026-10-12: 223 listable, unclaimed businesses sit in "Other" or
 * uncategorised; 217 carry an Instagram link and 211 have a description. The
 * vocabulary reader matches only an exact trade word, so "we bake bespoke
 * cakes for Lagos weddings" stayed in Other.
 */
const RAW = readFileSync('supabase/functions/recategorise-businesses/index.ts', 'utf8');
const SWEEP = RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('the model only ever gets a second look, never the first', () => {
  it('tries the deterministic reader first and skips the model on a match', () => {
    const order = SWEEP.indexOf('categoryFromSelfDescription') < SWEEP.indexOf('runAgent');
    expect(order).toBe(true);
    expect(SWEEP).toMatch(/if \(match\) \{/);
  });

  it('does not spend a call on a business that described nothing', () => {
    expect(SWEEP).toMatch(/worthAsking\(/);
  });

  /* The sweep runs every 30 minutes; an uncapped run turns a backlog into a bill. */
  it('caps how many businesses one run may ask about', () => {
    expect(SWEEP).toMatch(/MODEL_BUDGET/);
    expect(RAW).toMatch(/const MODEL_BUDGET = \d+/);
  });
});

describe('an answer is checked before it is believed', () => {
  it('validates the reply against our own category list', () => {
    expect(SWEEP).toMatch(/parseCategoryAnswer\(outcome\.text, categories\)/);
    expect(SWEEP).toMatch(/if \(!picked\) \{ modelRefused \+= 1; continue; \}/);
  });

  it('still only proposes — it never writes businesses.category', () => {
    expect(SWEEP).toMatch(/business_change_proposals/);
    expect(SWEEP).not.toMatch(/from\("businesses"\)\s*\.update/);
  });

  it('records that a proposal was model-derived, and weights it lower', () => {
    expect(SWEEP).toMatch(/self_description_model/);
    expect(SWEEP).toMatch(/readBy === "model" \? 55 : 70/);
  });
});

describe('a model outage is not a sweep failure', () => {
  it('stops asking and reports why instead of failing the run', () => {
    /*
     * The reason CODE alone is not enough. A live run reported 'error', which
     * sent me looking at model ids; the provider's own words said "Your credit
     * balance is too low". A 404 model_not_found and an unpaid account need
     * completely different actions.
     */
    expect(SWEEP).toMatch(/outcome\.reason, outcome\.status, outcome\.detail/);
    expect(SWEEP).toMatch(/unavailable: modelUnavailable/);
  });

  it('reports the model pass separately so a zero is explainable', () => {
    for (const key of ['queued:', 'asked,', 'refused:', 'accepted:']) {
      expect(SWEEP).toContain(key);
    }
  });
});
