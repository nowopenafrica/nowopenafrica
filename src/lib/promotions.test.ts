import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { Promo, promoStatus, daysLeft, suggestDates, dateLabel, promoBlurb, createPromo, promoCounts } from './promotions';

const biz = { id: '1', name: 'Meat Club', phone: '+234 800 123 4567' } as unknown as Business;

function promo(over: Partial<Promo> = {}): Promo {
  return { id: 'p1', title: 'Weekend Special', offer: '20% off everything', template: 'weekend-offer', startsAt: '2026-08-03', endsAt: '2026-08-05', channels: ['social'], created_at: '2026-01-01', ...over };
}

describe('promotions', () => {
  it('derives status from the dates', () => {
    const now = new Date('2026-08-04T12:00:00');
    expect(promoStatus(promo({ startsAt: '2026-08-05' }), now)).toBe('scheduled');
    expect(promoStatus(promo({ startsAt: '2026-08-03', endsAt: '2026-08-05' }), now)).toBe('live');
    expect(promoStatus(promo({ startsAt: '2026-08-01', endsAt: '2026-08-02' }), now)).toBe('ended');
  });

  it('counts whole days left', () => {
    expect(daysLeft(promo({ endsAt: '2026-08-05' }), new Date('2026-08-03T10:00:00'))).toBe(3);
    expect(daysLeft(promo({ endsAt: '2026-08-03' }), new Date('2026-08-10'))).toBe(0);
  });

  it('suggests start and end dates spanning the duration', () => {
    const from = new Date('2026-08-03');
    const { startsAt, endsAt } = suggestDates(3, from);
    expect(startsAt).toBe('2026-08-03');
    const diff = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 86400000;
    expect(diff).toBe(3);
  });

  it('labels dates in a readable format', () => {
    expect(dateLabel('2026-08-05')).toMatch(/Aug/i);
  });

  it('builds a WhatsApp-ready blurb from the business', () => {
    const text = promoBlurb(biz, promo());
    expect(text).toContain('Meat Club');
    expect(text).toContain('20% off everything');
    expect(text).toContain('WhatsApp');
  });

  it('creates promos with an id and default channels', () => {
    const p = createPromo({ title: 'BOGO', offer: '2 for 1', template: 'bogo', startsAt: '2026-08-03', endsAt: '2026-08-05' });
    expect(p.id.length).toBeGreaterThan(5);
    expect(p.channels).toContain('social');
    expect(p.channels).toContain('whatsapp');
  });

  it('tallies live, scheduled, ended and shared', () => {
    const now = new Date('2026-08-04T12:00:00');
    const c = promoCounts([
      promo({ id: 'a', startsAt: '2026-08-03', endsAt: '2026-08-05', shared: true }),
      promo({ id: 'b', startsAt: '2026-08-10', endsAt: '2026-08-12' }),
      promo({ id: 'c', startsAt: '2026-08-01', endsAt: '2026-08-02' }),
    ], now);
    expect(c).toEqual({ live: 1, scheduled: 1, ended: 1, shared: 1, total: 3 });
  });
});
