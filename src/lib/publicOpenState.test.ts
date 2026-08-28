import { describe, it, expect } from 'vitest';

import { publicOpenState, CLOSING_SOON_MINUTES, type OpenStateInput } from './openingHours';

const shop = (over: Partial<OpenStateInput> = {}): OpenStateInput => ({
  opening_hours: 'Mon-Sat: 9AM-8PM',
  timezone: 'Africa/Lagos',
  open_status: null,
  ...over,
});

// Lagos is UTC+1 and does not observe DST, so these are exact.
const wed10 = new Date('2026-08-26T09:00:00Z');
const wed1930 = new Date('2026-08-26T18:30:00Z');
const wed1955 = new Date('2026-08-26T18:55:00Z');
const sun = new Date('2026-08-23T09:00:00Z');

describe('publicOpenState', () => {
  it('says open and when it closes', () => {
    const s = publicOpenState(shop(), wed10);
    expect(s.kind).toBe('open');
    expect(s.label).toBe('Open now');
    expect(s.detail).toBe('Open until 8:00 PM');
  });

  it('flips to closing soon inside the last hour', () => {
    expect(publicOpenState(shop(), wed1930).kind).toBe('closing-soon');
    expect(publicOpenState(shop(), wed1955).detail).toBe('Closes in 5 minutes');
  });

  it('says "1 minute", not "1 minutes"', () => {
    const s = publicOpenState(shop(), new Date('2026-08-26T18:59:00Z'));
    expect(s.detail).toBe('Closes in 1 minute');
  });

  it('is still open, not closing soon, earlier in the day', () => {
    expect(publicOpenState(shop(), wed10).kind).toBe('open');
    expect(CLOSING_SOON_MINUTES).toBe(60);
  });

  it('says closed and when it opens again', () => {
    const s = publicOpenState(shop(), sun);
    expect(s.kind).toBe('closed');
    expect(s.detail).toMatch(/^Opens/);
  });

  it('reads the hours in the BUSINESS timezone, not the visitor one', () => {
    // The same instant is inside opening hours in Lagos and outside them in
    // Honolulu. A customer in London must see what the shop in Lagos is doing.
    expect(publicOpenState(shop(), wed10).kind).toBe('open');
    expect(publicOpenState(shop({ timezone: 'Pacific/Honolulu' }), wed10).kind).toBe('closed');
  });

  it("lets the owner's override beat the timetable", () => {
    // A shop that shut early knows something the schedule does not.
    expect(publicOpenState(shop({ open_status: 'closed' }), wed10).kind).toBe('closed');
    expect(publicOpenState(shop({ open_status: 'open' }), sun).kind).toBe('open');
  });

  it('admits it does not know rather than guessing open', () => {
    // Guessing open sends someone to a shut shop with our name on it.
    const s = publicOpenState({ opening_hours: 'Call ahead', timezone: 'Africa/Lagos' }, wed10);
    expect(s.kind).toBe('unknown');
    expect(s.label).toMatch(/not confirmed/i);
  });

  it('handles a business that never set anything at all', () => {
    expect(publicOpenState({}, wed10).kind).toBe('unknown');
  });

  it('treats an always-open business as open, with no countdown', () => {
    const s = publicOpenState(shop({ opening_hours: '24 hours' }), wed10);
    expect(s.kind).toBe('open');
    expect(s.detail).not.toMatch(/Closes in/);
  });

  it('falls back to the legacy hours column', () => {
    const s = publicOpenState({ opening_hours: null, hours: 'Mon-Sat: 9AM-8PM', timezone: 'Africa/Lagos' }, wed10);
    expect(s.kind).toBe('open');
  });
});
