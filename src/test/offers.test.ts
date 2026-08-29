import { describe, it, expect } from 'vitest';
import {
  isRunning, runningOffers, isUpcoming, hasExpired, endsLabel, isEndingSoon,
  byUrgency, offerHeadline, type Offer,
} from '../lib/offers';

const now = new Date('2026-08-29T12:00:00Z');
const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

const o = (over: Partial<Offer> & { id: string }): Offer => ({
  business_id: 'b', title: 'Weekend Special', ...over,
} as Offer);

describe('isRunning', () => {
  it('runs an offer with no dates at all', () => {
    expect(isRunning(o({ id: '1' }), now)).toBe(true);
  });

  it('does not run one that has not started', () => {
    expect(isRunning(o({ id: '2', starts_at: at(24) }), now)).toBe(false);
    expect(isUpcoming(o({ id: '2', starts_at: at(24) }), now)).toBe(true);
  });

  it('does not run one that has ended', () => {
    const past = o({ id: '3', ends_at: at(-1) });
    expect(isRunning(past, now)).toBe(false);
    expect(hasExpired(past, now)).toBe(true);
  });

  it('respects the off switch even inside the dates', () => {
    // A paused offer is still a row; it just is not on.
    expect(isRunning(o({ id: '4', active: false, ends_at: at(48) }), now)).toBe(false);
  });

  it('ignores an unparseable date rather than hiding the offer', () => {
    expect(isRunning(o({ id: '5', ends_at: 'not-a-date' }), now)).toBe(true);
  });

  it('filters a list', () => {
    const list = [o({ id: 'live' }), o({ id: 'dead', ends_at: at(-5) }), o({ id: 'later', starts_at: at(5) })];
    expect(runningOffers(list, now).map((x) => x.id)).toEqual(['live']);
  });
});

describe('endsLabel', () => {
  it('says nothing for an open-ended offer', () => {
    expect(endsLabel(o({ id: '1' }), now)).toBeNull();
  });

  it('counts in the unit a person acts on', () => {
    // "Ends in 47 hours" makes nobody hurry.
    expect(endsLabel(o({ id: '2', ends_at: at(0.5) }), now)).toBe('Ends within the hour');
    expect(endsLabel(o({ id: '3', ends_at: at(5) }), now)).toBe('Ends in 5 hours');
    expect(endsLabel(o({ id: '4', ends_at: at(30) }), now)).toBe('Ends tomorrow');
    expect(endsLabel(o({ id: '5', ends_at: at(72) }), now)).toBe('3 days left');
  });

  it('stops counting when the deadline is too far to feel urgent', () => {
    expect(endsLabel(o({ id: '6', ends_at: at(24 * 40) }), now)).toBeNull();
  });

  it('says so when it is over', () => {
    expect(endsLabel(o({ id: '7', ends_at: at(-1) }), now)).toBe('Ended');
  });

  it('flags only the ones ending within a day', () => {
    expect(isEndingSoon(o({ id: '8', ends_at: at(6) }), now)).toBe(true);
    expect(isEndingSoon(o({ id: '9', ends_at: at(48) }), now)).toBe(false);
    expect(isEndingSoon(o({ id: '10' }), now)).toBe(false);
  });
});

describe('byUrgency', () => {
  it('puts the soonest deadline first and open-ended last', () => {
    const sorted = byUrgency([
      o({ id: 'open' }),
      o({ id: 'late', ends_at: at(72) }),
      o({ id: 'soon', ends_at: at(2) }),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(['soon', 'late', 'open']);
  });
});

describe('offerHeadline', () => {
  it('shouts the headline, and falls back so a card is never blank', () => {
    expect(offerHeadline(o({ id: '1', headline: '20% OFF' }))).toBe('20% OFF');
    expect(offerHeadline(o({ id: '2', headline: '  ' }))).toBe('Weekend Special');
  });
});
