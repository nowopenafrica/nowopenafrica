import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  STATUS_META, STATUS_LIST, isBusinessOpen, statusSortRank,
  parseMinutes, formatMinutes, dateKey,
  defaultAutoHours, autoStatusForTime,
  defaultClockConfig, loadClockConfig, saveClockConfig, resolveBusinessStatus, getStatusMeta,
  buildBusinessTimeline, loadTimelineEvents, saveTimelineEvents, toggleBusinessStatus,
  buildBusinessPulse, isOrderingCategory, businessTimezone, resolvePublicStatus,
  getOpenStreak, getOpeningReliability, getBusinessHealth, healthLabel,
  getSmartReminder, getCoachReminder, getStaffState,
  getAIOpeningAssistant, getOpeningCampaign, getNotificationCopy,
  queueCopyFor, pendingScheduledOpen, applyReminderOption,
} from './businessStatus';

const biz: Business = {
  id: 'biz-1',
  name: 'Meat Club',
  description: 'Smoked meats and grills in Lagos.',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  logo_url: 'https://img/logo.png',
  rating: 4.6,
  status: 'open',
};

const hotel: Business = {
  id: 'biz-2',
  name: 'Grand Hotel',
  description: 'Five star rooms in Abuja.',
  category: 'Hotel & Lodging',
  location: 'Abuja',
  rating: 4.8,
  status: 'open',
};

// 9:00 AM local on a Tuesday (getDay() === 2).
const nineAM = new Date(2026, 7, 4, 9, 0, 0);
// 11:00 PM local on a Tuesday.
const elevenPM = new Date(2026, 7, 4, 23, 0, 0);

describe('businessStatus — status model', () => {
  it('every status has a meta entry with dot, text and chip classes', () => {
    expect(STATUS_LIST.length).toBe(7);
    for (const s of STATUS_LIST) {
      const meta = STATUS_META[s];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.dot).toMatch(/^bg-/);
      expect(meta.text).toMatch(/^text-/);
      expect(meta.chip).toMatch(/^bg-/);
    }
  });

  it('isBusinessOpen only treats closed as not open', () => {
    expect(isBusinessOpen('open')).toBe(true);
    expect(isBusinessOpen('live')).toBe(true);
    expect(isBusinessOpen('closed')).toBe(false);
  });

  it('live sorts above open which sorts above closed', () => {
    expect(statusSortRank('live')).toBeLessThan(statusSortRank('open'));
    expect(statusSortRank('open')).toBeLessThan(statusSortRank('closed'));
  });

  it('queue copy is category and status aware', () => {
    expect(queueCopyFor('Restaurant', 'busy')).toContain('wait');
    expect(queueCopyFor('Salon / Barber', 'busy')).toContain('clients');
    expect(queueCopyFor('Mechanic', 'busy')).toContain('available');
  });

  it('getStatusMeta swaps the sub copy for a live queue line', () => {
    const meta = getStatusMeta('busy', 'Restaurant');
    expect(meta.sub).toContain('wait');
    expect(meta.label).toBe('Busy');
  });
});

describe('businessStatus — time helpers', () => {
  it('parses and formats minutes round-trip', () => {
    expect(parseMinutes('08:30')).toBe(510);
    expect(parseMinutes('24:00')).toBe(1440);
    expect(parseMinutes('nope')).toBeNull();
    expect(formatMinutes(510)).toBe('8:30 AM');
    expect(formatMinutes(1200)).toBe('8:00 PM');
  });

  it('dateKey is stable local YYYY-MM-DD', () => {
    expect(dateKey(nineAM)).toBe('2026-08-04');
  });
});

describe('businessStatus — opening hours', () => {
  it('24-hour categories are open all day', () => {
    const hours = defaultAutoHours('Hospital & Clinic');
    for (const slot of hours) {
      expect(parseMinutes(slot.open)).toBe(0);
      expect(parseMinutes(slot.close)).toBe(1440);
    }
    expect(autoStatusForTime(hours, nineAM)).toBe('open');
    expect(autoStatusForTime(hours, elevenPM)).toBe('open');
  });

  it('default category closes on Sunday and opens during weekday hours', () => {
    const hours = defaultAutoHours('Tailor');
    expect(hours[0].closed).toBe(true);
    expect(autoStatusForTime(hours, nineAM)).toBe('open');
    // 7:00 AM — before the 8:00 AM default opening.
    expect(autoStatusForTime(hours, new Date(2026, 7, 4, 7, 0, 0))).toBe('closed');
  });
});

describe('businessStatus — effective status', () => {
  it('resolves open during scheduled hours', () => {
    const config = defaultClockConfig(biz);
    expect(resolveBusinessStatus(biz, config, nineAM)).not.toBe('closed');
  });

  it('manual override beats the schedule', () => {
    const config = { ...defaultClockConfig(biz), manualOverride: 'closed' as const };
    expect(resolveBusinessStatus(biz, config, nineAM)).toBe('closed');
    const open = { ...defaultClockConfig(hotel), manualOverride: 'open' as const };
    expect(resolveBusinessStatus(hotel, open, elevenPM)).toBe('open');
  });

  it('live wins over everything', () => {
    const config = { ...defaultClockConfig(biz), manualOverride: 'closed' as const, liveNow: true };
    expect(resolveBusinessStatus(biz, config, nineAM)).toBe('live');
  });

  it('appointment and delivery flags refine an open status', () => {
    const config = { ...defaultClockConfig(biz), appointmentOnly: true, deliveryActive: true };
    expect(resolveBusinessStatus(biz, config, nineAM)).toBe('appointment');
    const delivery = { ...defaultClockConfig(biz), deliveryActive: true };
    expect(resolveBusinessStatus(biz, delivery, nineAM)).toBe('delivery');
  });

  it('status is deterministic across repeated calls', () => {
    const config = defaultClockConfig(biz);
    const a = resolveBusinessStatus(biz, config, nineAM);
    const b = resolveBusinessStatus(biz, config, nineAM);
    expect(a).toBe(b);
  });
});

describe('businessStatus — timeline', () => {
  it('builds a deterministic timeline with the now marker when open', () => {
    const config = defaultClockConfig(biz);
    const a = buildBusinessTimeline(biz, config, nineAM);
    const b = buildBusinessTimeline(biz, config, nineAM);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a[0].kind).toBe('opened');
    expect(a[a.length - 1].kind).toBe('now');
  });

  it('only includes events up to the current minute', () => {
    const config = defaultClockConfig(biz);
    for (const e of buildBusinessTimeline(biz, config, nineAM)) {
      const mins = parseMinutes(e.time);
      expect(mins).not.toBeNull();
      expect((mins as number)).toBeLessThanOrEqual(9 * 60);
    }
  });

  it('persists timeline events to localStorage', () => {
    saveTimelineEvents(biz.id, [{ time: '8:00 AM', label: 'Opened', emoji: '🟢', kind: 'opened' }]);
    const loaded = loadTimelineEvents(biz.id);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].label).toBe('Opened');
  });

  it('toggleBusinessStatus flips the clock and records an event', () => {
    // 5:00 AM — before the restaurant's 7:00 AM default opening, so it is closed.
    const preOpen = new Date(2026, 7, 4, 5, 0, 0);
    const next = toggleBusinessStatus(biz, preOpen);
    expect(next.manualOverride).toBe('open');
    expect(next.streakDays).toBe(1);
    const events = loadTimelineEvents(biz.id);
    expect(events.some((e) => e.kind === 'opened')).toBe(true);
  });
});

describe('businessStatus — honest public status', () => {
  // 2026-08-04 is a Tuesday. 12:00 UTC is 13:00 in Lagos and 02:00 in Honolulu.
  const tuesdayNoonUtc = new Date('2026-08-04T12:00:00Z');

  const lagosShop: Business = {
    ...biz,
    opening_hours: 'Mon–Sat: 9AM–7PM',
    timezone: 'Africa/Lagos',
  };

  it('derives open/closed from the business own hours in its own timezone', () => {
    expect(resolvePublicStatus(lagosShop, tuesdayNoonUtc)).toBe('open'); // Tue 13:00 Lagos
  });

  it('honours the business zone, not the viewer location', () => {
    // Same instant, Honolulu timezone: 02:00 Tuesday — before the 9AM opening.
    expect(resolvePublicStatus({ ...lagosShop, timezone: 'Pacific/Honolulu' }, tuesdayNoonUtc)).toBe('closed');
  });

  it('returns null when the hours cannot be parsed', () => {
    expect(resolvePublicStatus({ ...biz, opening_hours: 'Call ahead for an appointment' }, tuesdayNoonUtc)).toBeNull();
    expect(resolvePublicStatus(biz, tuesdayNoonUtc)).toBeNull();
  });

  it('an owner DB override wins over the schedule', () => {
    const closedEarly = { ...lagosShop, open_status: 'closed' as const };
    expect(resolvePublicStatus(closedEarly, tuesdayNoonUtc)).toBe('closed');
    // Lagos 03:00 — before the 9AM opening, but the owner says open.
    const openEarly = { ...lagosShop, open_status: 'open' as const };
    expect(resolvePublicStatus(openEarly, new Date('2026-08-04T02:00:00Z'))).toBe('open');
  });

  it('businessTimezone falls back to the platform default', () => {
    expect(businessTimezone(lagosShop)).toBe('Africa/Lagos');
    expect(businessTimezone(biz)).toBe('Africa/Lagos');
  });
});

describe('businessStatus — pulse', () => {
  it('rolls up an honest pulse that accounts for every business', () => {
    const pulse = buildBusinessPulse([biz, hotel], nineAM);
    expect(pulse.total).toBe(2);
    const accounted = pulse.open + pulse.closed + pulse.unconfirmed;
    expect(accounted).toBe(2);
  });

  it('counts real opens and never invents them from a category', () => {
    // 2026-08-04 is a Tuesday. 12:00 UTC = 13:00 Lagos.
    const tuesdayNoonUtc = new Date('2026-08-04T12:00:00Z');
    const shop = { ...biz, opening_hours: 'Mon–Sat: 9AM–7PM', timezone: 'Africa/Lagos' as const };
    // Only open on Monday, so this Tuesday it is closed.
    const closedTuesday = { ...hotel, opening_hours: 'Mon: 9AM–5PM', timezone: 'Africa/Lagos' as const };
    // No stored hours — cannot be confirmed either way.
    const unconfirmed = biz;
    const pulse = buildBusinessPulse([shop, closedTuesday, unconfirmed], tuesdayNoonUtc);
    expect(pulse.open).toBe(1);
    expect(pulse.closed).toBe(1);
    expect(pulse.unconfirmed).toBe(1);
    expect(pulse.total).toBe(3);
  });

  it('restaurants count as taking orders when open', () => {
    expect(isOrderingCategory('Restaurant')).toBe(true);
    expect(isOrderingCategory('Hotel & Lodging')).toBe(false);
  });
});

describe('businessStatus — scores', () => {
  it('returns bounded streak and reliability scores', () => {
    const config = defaultClockConfig(biz);
    expect(getOpenStreak(biz, config)).toBeGreaterThanOrEqual(0);
    const rel = getOpeningReliability(biz, config);
    expect(rel).toBeGreaterThanOrEqual(0);
    expect(rel).toBeLessThanOrEqual(100);
  });

  it('respects stored reliability and zeroed opened days', () => {
    expect(getOpeningReliability(biz, { ...defaultClockConfig(biz), reliabilityScore: 98 })).toBe(98);
    expect(getOpenStreak(biz, { ...defaultClockConfig(biz), openedDays: 0 })).toBe(0);
  });

  it('computes health with weighted parts', () => {
    const health = getBusinessHealth(biz, defaultClockConfig(biz));
    expect(health.parts.length).toBeGreaterThan(0);
    expect(health.score).toBeGreaterThanOrEqual(0);
    expect(health.score).toBeLessThanOrEqual(100);
    expect(['Excellent', 'Good', 'Needs attention', 'Critical']).toContain(healthLabel(health.score));
  });
});

describe('businessStatus — reminders and coach', () => {
  it('returns a smart reminder after the scheduled opening passes while closed', () => {
    const config = { ...defaultClockConfig(biz), manualOverride: 'closed' as const };
    const reminder = getSmartReminder(biz, config, nineAM);
    expect(reminder).not.toBeNull();
    expect(reminder?.options.map((o) => o.value)).toEqual(['open', 'later', 'closed']);
  });

  it('suppresses the smart reminder when the business is open', () => {
    const config = { ...defaultClockConfig(biz), manualOverride: 'open' as const };
    expect(getSmartReminder(biz, config, nineAM)).toBeNull();
  });

  it('later option schedules an opening and pauses the reminder', () => {
    const base = { ...defaultClockConfig(biz), manualOverride: 'closed' as const };
    const next = applyReminderOption(biz, base, 'later', nineAM);
    expect(next.laterReminderAt).not.toBeNull();
    expect(pendingScheduledOpen(next, nineAM)).not.toBeNull();
    expect(getSmartReminder(biz, next, nineAM)).toBeNull();
    // 31 minutes later the scheduled window has passed.
    const later = new Date(2026, 7, 4, 9, 31, 0);
    expect(pendingScheduledOpen(next, later)).toBeNull();
  });

  it('yes option opens the business and clears any scheduled opening', () => {
    const base = { ...defaultClockConfig(biz), manualOverride: 'closed' as const, laterReminderAt: new Date(2026, 7, 4, 9, 30, 0).toISOString() };
    const next = applyReminderOption(biz, base, 'open', nineAM);
    expect(next.manualOverride).toBe('open');
    expect(next.laterReminderAt).toBeNull();
    expect(next.streakDays).toBe(1);
    expect(resolveBusinessStatus(biz, next, nineAM)).toBe('open');
  });

  it('coach nudges a closed business but not an open one', () => {
    const closed = { ...defaultClockConfig(biz), manualOverride: 'closed' as const, openedDays: 0 };
    const coach = getCoachReminder(biz, closed, nineAM);
    expect(coach).not.toBeNull();
    expect(coach?.message).toContain('3.8x');
    expect(getCoachReminder(biz, { ...defaultClockConfig(biz), manualOverride: 'open' as const }, nineAM)).toBeNull();
  });
});

describe('businessStatus — staff, opening assistant and notifications', () => {
  it('staff state is bounded and clock-in aware', () => {
    const state = getStaffState(biz, defaultClockConfig(biz));
    expect(state.total).toBeGreaterThanOrEqual(2);
    expect(state.available).toBeGreaterThanOrEqual(0);
    expect(state.available).toBeLessThanOrEqual(state.total);
  });

  it('AI opening pack is deterministic and references the business', () => {
    const a = getAIOpeningAssistant(biz, nineAM);
    const b = getAIOpeningAssistant(biz, nineAM);
    expect(a).toEqual(b);
    expect(a.greeting).toContain('Meat Club');
    expect(a.offer.length).toBeGreaterThan(0);
    expect(a.hashtags).toContain('#NowOpenAfrica');
    expect(a.sms).toContain('OPEN');
  });

  it('one-click campaign includes an open headline and hashtags', () => {
    const campaign = getOpeningCampaign(biz);
    expect(campaign.title).toContain('Meat Club');
    expect(campaign.flyerHeadline).toContain('OPEN');
    expect(campaign.hashtags.length).toBeGreaterThan(0);
  });

  it('notification copy is kind and business aware', () => {
    expect(getNotificationCopy('open', biz)).toContain('OPEN');
    expect(getNotificationCopy('live', biz)).toContain('LIVE');
    expect(getNotificationCopy('flash', biz)).toContain('FLASH');
  });
});

describe('businessStatus — persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save/load round-trips a config with overrides', () => {
    const config = { ...defaultClockConfig(biz), manualOverride: 'closed' as const, streakDays: 12 };
    saveClockConfig(biz.id, config);
    const loaded = loadClockConfig(biz);
    expect(loaded.manualOverride).toBe('closed');
    expect(loaded.streakDays).toBe(12);
  });

  it('falls back to defaults when storage is empty', () => {
    const loaded = loadClockConfig(biz);
    expect(loaded.manualOverride).toBeNull();
    expect(loaded.autoHours.length).toBe(7);
  });
});
