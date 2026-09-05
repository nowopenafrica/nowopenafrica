import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import {
  activationFunnel, connectionKind, isConnection, verdict,
  weekOnWeek, weekStart, weeklyConnections,
  type FunnelBusiness, type RawEvent,
} from './northStar';

const ev = (name: string, over: Partial<RawEvent> = {}): RawEvent => ({
  name, created_at: '2026-09-02T10:00:00', business_id: 'b1', ...over,
});

describe('what counts as a connection', () => {
  it('counts every way a visitor reaches a business', () => {
    expect(connectionKind(ev('business_contact_clicked', { props: { channel: 'phone' } }))).toBe('call');
    expect(connectionKind(ev('business_contact_clicked', { props: { channel: 'whatsapp' } }))).toBe('whatsapp');
    expect(connectionKind(ev('directions_opened'))).toBe('directions');
    expect(connectionKind(ev('enquiry_sent'))).toBe('enquiry');
    expect(connectionKind(ev('booking_started'))).toBe('booking');
    expect(connectionKind(ev('business_kept'))).toBe('keep');
  });

  it('refuses to count attention or accounts as connections', () => {
    // The whole value of the metric is that it can report a bad week. If any of
    // these ever counts, it cannot.
    for (const name of ['business_viewed', 'search_performed', 'signup', 'signin', 'plan_viewed', 'studio_export']) {
      expect(isConnection(ev(name)), name).toBe(false);
    }
  });

  it('ignores event names it has never heard of', () => {
    expect(connectionKind(ev('some_future_event'))).toBeNull();
    expect(connectionKind(ev('business_contact_clicked', { props: null }))).toBe('call');
  });
});

describe('weekly aggregation', () => {
  it('buckets to the Monday of the week', () => {
    expect(weekStart('2026-09-02T10:00:00')).toBe('2026-08-31'); // a Wednesday
    expect(weekStart('2026-08-31T00:00:00')).toBe('2026-08-31'); // the Monday
    expect(weekStart('2026-09-06T23:59:00')).toBe('2026-08-31'); // the Sunday
    expect(weekStart('2026-09-07T00:01:00')).toBe('2026-09-07'); // next Monday
  });

  it('survives a malformed timestamp instead of throwing', () => {
    expect(weekStart('not a date')).toBe('');
    expect(weeklyConnections([ev('enquiry_sent', { created_at: 'nonsense' })])).toEqual([]);
  });

  it('reports breadth as well as volume', () => {
    // 4 connections, but only 2 businesses earned anything.
    const events = [
      ev('directions_opened', { business_id: 'a' }),
      ev('directions_opened', { business_id: 'a' }),
      ev('business_kept', { business_id: 'a' }),
      ev('enquiry_sent', { business_id: 'b' }),
      ev('business_viewed', { business_id: 'c' }),
    ];
    const [week] = weeklyConnections(events);
    expect(week.total).toBe(4);
    expect(week.businesses).toBe(2);
    expect(week.byKind.directions).toBe(2);
    expect(week.byKind.keep).toBe(1);
    expect(week.byKind.enquiry).toBe(1);
  });

  it('compares against the previous week', () => {
    const series = weeklyConnections([
      ev('enquiry_sent', { created_at: '2026-08-25T10:00:00' }),
      ev('enquiry_sent', { created_at: '2026-08-25T11:00:00' }),
      ev('enquiry_sent', { created_at: '2026-09-02T10:00:00' }),
      ev('enquiry_sent', { created_at: '2026-09-02T11:00:00' }),
      ev('enquiry_sent', { created_at: '2026-09-02T12:00:00' }),
    ]);
    expect(series).toHaveLength(2);
    expect(weekOnWeek(series)).toBe(50);
    expect(weekOnWeek(series.slice(0, 1))).toBeNull();
  });
});

describe('activation funnel', () => {
  const biz = (over: Partial<FunnelBusiness> = {}): FunnelBusiness => ({ id: 'b1', ...over });
  const stage = (stages: ReturnType<typeof activationFunnel>, key: string) =>
    stages.find((s) => s.key === key)!;

  it('reports zeros honestly for an empty platform', () => {
    const stages = activationFunnel([], [], {});
    for (const s of stages) {
      expect(s.count, s.key).toBe(0);
      expect(s.percent, s.key).toBe(0);
    }
  });

  it('does not count an unclaimed listing as claimed', () => {
    const stages = activationFunnel(
      [biz({ claim_status: 'unclaimed' }), biz({ id: 'b2', claim_status: 'claimed' })], [], {},
    );
    expect(stage(stages, 'claimed').count).toBe(1);
    expect(stage(stages, 'claimed').percent).toBe(50);
  });

  it('separates a visit from a connection', () => {
    const businesses = [biz({ id: 'seen' }), biz({ id: 'reached' })];
    const events = [
      ev('business_viewed', { business_id: 'seen' }),
      ev('business_viewed', { business_id: 'reached' }),
      ev('directions_opened', { business_id: 'reached' }),
    ];
    const stages = activationFunnel(businesses, events, {});
    expect(stage(stages, 'viewed').count).toBe(2);
    expect(stage(stages, 'connected').count).toBe(1);
  });

  it('counts an enquiry or booking separately from a contact click', () => {
    const stages = activationFunnel(
      [biz({ id: 'x' })],
      [ev('enquiry_sent', { business_id: 'x' })],
      {},
    );
    expect(stage(stages, 'enquired').count).toBe(1);
    expect(stage(stages, 'connected').count).toBe(0);
  });

  it('treats an empty string or empty array as missing', () => {
    const stages = activationFunnel(
      [biz({ description: '   ', category: 'food', image_url: '', logo_url: '' })], [], {},
    );
    expect(stage(stages, 'described').count).toBe(0);
    expect(stage(stages, 'photos').count).toBe(0);
  });

  it('requires both checks for verification', () => {
    const stages = activationFunnel(
      [biz({ email_verified: true, phone_verified: false })], [], {},
    );
    expect(stage(stages, 'verified').count).toBe(0);
  });
});

describe('the verdict states a zero as a zero', () => {
  it('says nothing is happening when nothing is', () => {
    const v = verdict([], activationFunnel([{ id: 'a' }], [], {}));
    expect(v).toMatch(/no business has claimed/i);
  });

  it('says the loop is not running when claimed businesses earn nothing', () => {
    const funnel = activationFunnel([{ id: 'a', claim_status: 'claimed' }], [], {});
    expect(verdict([], funnel)).toMatch(/loop is not running/i);
  });

  it('reports breadth when there is something to report', () => {
    const series = weeklyConnections([
      ev('enquiry_sent', { business_id: 'a' }),
      ev('business_kept', { business_id: 'b' }),
    ]);
    expect(verdict(series, activationFunnel([], [], {}))).toBe('2 connection(s) this week across 2 business(es).');
  });
});

describe('the definition cannot drift', () => {
  it('counts only events the app can actually emit', () => {
    // A connection kind mapped to an event name nothing fires is a metric
    // permanently at zero, which reads as failure rather than as absence.
    const telemetry = readFileSync('src/lib/telemetry.ts', 'utf8');
    const src = readFileSync('src/lib/northStar.ts', 'utf8');
    const counted = [...src.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]);
    expect(counted.length).toBeGreaterThan(3);
    for (const name of counted) {
      expect(telemetry.includes(`'${name}'`), `${name} is counted but not a declared event`).toBe(true);
    }
  });

  it('has a call site in the app for every counted event', () => {
    const src = readFileSync('src/lib/northStar.ts', 'utf8');
    const counted = [...src.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]);
    const app = ['src/pages/BusinessDetail.tsx', 'src/components/KeepButton.tsx',
      'src/components/PlatformEnquiryModal.tsx']
      .map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const name of counted) {
      if (name === 'enquiry_sent') continue; // fired from a form handler elsewhere
      expect(app.includes(`'${name}'`), `nothing in the app fires ${name}`).toBe(true);
    }
  });
});
