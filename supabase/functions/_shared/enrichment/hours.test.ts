import { describe, it, expect } from 'vitest';
import { canonicalHoursText, hoursTextEqual, resolveHours, type SourceHoursEntry } from './hours';

const weekdays = (open: number, close: number): SourceHoursEntry[] => [
  { days: ['mon', 'tue', 'wed', 'thu', 'fri'], open, close },
];

describe('canonicalHoursText', () => {
  it('writes the app-parsable format with en-dashes', () => {
    const text = canonicalHoursText(weekdays(9 * 60, 17 * 60));
    expect(text).toBe('Mon–Fri: 9AM–5PM');
  });

  it('separates different day blocks with a middle dot', () => {
    const text = canonicalHoursText([
      { days: ['mon', 'tue', 'wed', 'thu', 'fri'], open: 8 * 60, close: 18 * 60 },
      { days: ['sat'], open: 9 * 60, close: 13 * 60 },
    ]);
    expect(text).toBe('Mon–Fri: 8AM–6PM · Sat: 9AM–1PM');
  });

  it('returns null when nothing is open', () => {
    expect(canonicalHoursText([])).toBeNull();
    expect(canonicalHoursText([{ days: ['mon'], open: 0, close: 0, alwaysOpen: true }])).toBe('Open 24/7');
  });

  it('never writes 24/7 unless the source says alwaysOpen', () => {
    expect(canonicalHoursText([{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], open: 0, close: 1440 }]))
      .toBe('Mon–Sun: 12AM–12AM');
    expect(canonicalHoursText([{ days: ['mon'], open: 0, close: 0, alwaysOpen: true }]))
      .toBe('Open 24/7');
  });
});

describe('hoursTextEqual', () => {
  it('ignores dash style and spacing', () => {
    expect(hoursTextEqual('Mon–Fri: 9AM–5PM', 'Mon-Fri: 9AM - 5PM')).toBe(true);
    expect(hoursTextEqual('Mon–Fri: 9AM–5PM', 'Sat: 10AM–4PM')).toBe(false);
  });
});

describe('resolveHours', () => {
  const default24 = () => ({ opening_hours: null, hours: null, availability_mode: 'default_24_7', data_confidence: 'unconfirmed' });

  it('proposes concrete hours against the unconfirmed default', () => {
    const r = resolveHours(default24(), weekdays(9 * 60, 17 * 60));
    expect(r.kind).toBe('proposal');
    expect(r.proposedText).toBe('Mon–Fri: 9AM–5PM');
  });

  it('stays quiet when a source only CONFIRMS the default 24/7', () => {
    const r = resolveHours(default24(), [{ days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], open: 0, close: 0, alwaysOpen: true }]);
    expect(r.kind).toBe('default_remains');
    expect(r.proposedText).toBeUndefined();
  });

  it('is no_change for identical stored hours', () => {
    const r = resolveHours(
      { opening_hours: 'Mon–Fri: 9AM–5PM', availability_mode: 'derived', data_confidence: 'partial' },
      weekdays(9 * 60, 17 * 60),
    );
    expect(r.kind).toBe('no_change');
  });

  it('flags a conflict against owner-confirmed hours instead of overwriting', () => {
    const r = resolveHours(
      { opening_hours: 'Mon–Sun: 24 hours', availability_mode: 'confirmed', data_confidence: 'owner_confirmed' },
      weekdays(9 * 60, 17 * 60),
    );
    expect(r.kind).toBe('skip_conflict');
  });

  it('does not overwrite an owner value with the same text', () => {
    const r = resolveHours(
      { opening_hours: 'Mon–Fri: 9AM–5PM', availability_mode: 'confirmed', data_confidence: 'owner_confirmed' },
      weekdays(9 * 60, 17 * 60),
    );
    expect(r.kind).toBe('no_change');
  });
});