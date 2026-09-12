import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import {
  businessInsights, channelLabel, type InsightEvent,
} from './businessInsights';

/**
 * The numbers a business owner is shown about their own listing.
 *
 * Before this there were none: nothing read `business_viewed` or
 * `business_contact_clicked` for an owner, so a business could complete a
 * profile, publish it and pay for a plan without learning whether one person
 * had looked.
 *
 * Most of these tests protect honesty rather than arithmetic. The platform saw
 * 114 sessions in a fortnight, so this panel will usually show single digits —
 * and a panel that dresses single digits up with trend arrows teaches the
 * owner that the numbers are theatre, which destroys the one metric that could
 * ever justify a subscription.
 */

const NOW = new Date('2026-09-30T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const view = (over: Partial<InsightEvent> = {}): InsightEvent => ({
  name: 'business_viewed',
  created_at: daysAgo(5),
  session_id: 's1',
  ...over,
});

const contact = (channel: string, over: Partial<InsightEvent> = {}): InsightEvent => ({
  name: 'business_contact_clicked',
  props: { channel },
  created_at: daysAgo(5),
  session_id: 's1',
  ...over,
});

const run = (events: InsightEvent[], opts = {}) =>
  businessInsights(events, { now: NOW, days: 30, ...opts });

describe('it counts people, not hits', () => {
  it('treats one person refreshing as one viewer', () => {
    /*
     * The easiest lie to tell an owner. Six opens from one session is one
     * human being, and an owner deciding whether NowOpen works needs to know
     * how many humans.
     */
    const r = run(Array.from({ length: 6 }, () => view({ session_id: 'same' })));
    expect(r.viewers).toBe(1);
    expect(r.views).toBe(6);
  });

  it('counts distinct sessions as distinct people', () => {
    const r = run([view({ session_id: 'a' }), view({ session_id: 'b' }), view({ session_id: 'c' })]);
    expect(r.viewers).toBe(3);
  });

  it('counts a view with no session but does not invent a viewer', () => {
    const r = run([view({ session_id: null })]);
    expect(r.views).toBe(1);
    expect(r.viewers).toBe(0);
  });
});

describe("it excludes the owner's own visits", () => {
  it('does not count the owner as an audience', () => {
    // An owner checking their page all day would otherwise see traffic that is
    // entirely themselves — the most demoralising possible bug, because it
    // looks like success.
    const r = run(
      [view({ session_id: 'a', user_id: 'owner' }), view({ session_id: 'b', user_id: 'visitor' })],
      { ownerUserId: 'owner' },
    );
    expect(r.viewers).toBe(1);
    expect(r.views).toBe(1);
  });

  it('counts everyone when no owner is supplied', () => {
    const r = run([view({ session_id: 'a', user_id: 'owner' })]);
    expect(r.viewers).toBe(1);
  });
});

describe('it refuses to draw a trend from noise', () => {
  it('shows no trend below the threshold', () => {
    // 1 → 2 is not "+100% growth".
    const r = run([
      view({ session_id: 'a', created_at: daysAgo(5) }),
      view({ session_id: 'b', created_at: daysAgo(6) }),
      view({ session_id: 'c', created_at: daysAgo(40) }),
    ]);
    expect(r.trend).toBeNull();
  });

  it('shows a trend once both windows are substantial', () => {
    const recent = Array.from({ length: 20 }, (_, i) =>
      view({ session_id: `r${i}`, created_at: daysAgo(5) }));
    const prior = Array.from({ length: 10 }, (_, i) =>
      view({ session_id: `p${i}`, created_at: daysAgo(40) }));
    const r = run([...recent, ...prior]);
    expect(r.trend).toBe(100);
  });

  it('shows a fall as readily as a rise', () => {
    const recent = Array.from({ length: 10 }, (_, i) =>
      view({ session_id: `r${i}`, created_at: daysAgo(5) }));
    const prior = Array.from({ length: 20 }, (_, i) =>
      view({ session_id: `p${i}`, created_at: daysAgo(40) }));
    expect(run([...recent, ...prior]).trend).toBe(-50);
  });

  it('shows no contact rate off a handful of viewers', () => {
    // "100% of visitors contacted you" off one visitor is not a statistic.
    const r = run([view({ session_id: 'a' }), contact('phone', { session_id: 'a' })]);
    expect(r.contactRate).toBeNull();
    expect(r.contacts).toBe(1);
  });

  it('shows a contact rate once there are enough viewers', () => {
    const views = Array.from({ length: 20 }, (_, i) => view({ session_id: `v${i}` }));
    const contacts = Array.from({ length: 5 }, (_, i) => contact('phone', { session_id: `v${i}` }));
    expect(run([...views, ...contacts]).contactRate).toBe(25);
  });
});

describe('the window is respected', () => {
  it('ignores events older than the window', () => {
    const r = run([view({ created_at: daysAgo(45), session_id: 'old' })]);
    expect(r.views).toBe(0);
    expect(r.empty).toBe(true);
  });

  it('ignores an unparseable timestamp rather than counting it', () => {
    expect(run([view({ created_at: 'not a date' })]).views).toBe(0);
  });
});

describe('contact channels', () => {
  it('breaks down by channel, busiest first', () => {
    const r = run([
      contact('phone', { session_id: 'a' }),
      contact('phone', { session_id: 'b' }),
      contact('whatsapp', { session_id: 'c' }),
    ]);
    expect(r.byChannel).toEqual([
      { channel: 'phone', clicks: 2 },
      { channel: 'whatsapp', clicks: 1 },
    ]);
  });

  it('does not lose a click with no channel recorded', () => {
    expect(run([contact('', { session_id: 'a', props: {} })]).byChannel)
      .toEqual([{ channel: 'other', clicks: 1 }]);
  });

  it('names channels the way an owner would', () => {
    expect(channelLabel('phone')).toBe('Called');
    expect(channelLabel('whatsapp')).toBe('WhatsApp');
    expect(channelLabel('website')).toBe('Visited website');
    // An unknown channel is still shown, just capitalised.
    expect(channelLabel('carrier-pigeon')).toBe('Carrier-pigeon');
  });
});

describe('nothing yet is stated as nothing yet', () => {
  it('reports empty when there is genuinely no activity', () => {
    const r = run([]);
    expect(r.empty).toBe(true);
    expect(r.viewers).toBe(0);
    expect(r.trend).toBeNull();
  });

  it('is not empty when somebody made contact without a recorded view', () => {
    // A WhatsApp click from a shared link is real activity even if the profile
    // view was never recorded, and hiding it would understate the owner's
    // results.
    expect(run([contact('whatsapp', { session_id: 'a' })]).empty).toBe(false);
  });
});

describe('the panel presents it honestly', () => {
  const ui = readFileSync('src/components/dashboard/BusinessInsights.tsx', 'utf8');

  it('says the empty state means "not yet", not "nobody wants you"', () => {
    expect(ui).toMatch(/Nobody has opened your profile yet/);
    expect(ui).toMatch(/expected while the directory is still filling up/);
  });

  it('explains a missing trend instead of drawing a meaningless one', () => {
    expect(ui).toMatch(/Too few visits so far to show a reliable change/);
    expect(ui).toMatch(/MIN_FOR_TREND/);
  });

  it('tells the owner their own visits are excluded', () => {
    expect(ui).toMatch(/Your own visits are not counted/);
  });

  it('has a recovery path when the load fails', () => {
    expect(ui).toMatch(/Try again/);
  });

  it('reads only its own business, leaning on RLS as well', () => {
    expect(ui).toMatch(/\.eq\('business_id', businessId\)/);
  });

  it('is placed above profile completeness in the dashboard', () => {
    // Results before homework: a business pays for customers, not for tools.
    const dash = readFileSync('src/pages/Dashboard.tsx', 'utf8');
    expect(dash.indexOf('<BusinessInsights')).toBeGreaterThan(-1);
    expect(dash.indexOf('<BusinessInsights')).toBeLessThan(dash.indexOf('<ProfileCompleteness'));
  });
});
