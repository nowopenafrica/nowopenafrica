import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  LoyaltyProgram, LoyaltyCustomer, LoyaltyTxn,
  defaultProgram, PROGRAM_PRESETS, rewardOptions,
  pointsFor, stampsAvailable, tierFor, redeemOptionsFor,
  addCustomer, recordVisit, redeemReward, redeemStamp,
  loyaltyStats, waMessage, programShareBlurb,
  loadProgram, saveProgram, loadCustomers, saveCustomers, loadTxns, saveTxns,
} from './loyalty';

const biz = { id: '1', name: 'Meat Club', phone: '+234 800 123 4567' } as unknown as Business;

const points: LoyaltyProgram = defaultProgram('Meat Club');
const stamps: LoyaltyProgram = { ...defaultProgram('Meat Club'), spendPerPoint: 0, pointValue: 0, welcomePoints: 0, stampsForReward: 5 };

function member(over: Partial<LoyaltyCustomer> = {}): LoyaltyCustomer {
  return {
    id: 'c1', name: 'Ada', phone: '080 1234 5678', points: 100, visits: 3,
    stampsUsed: 0, lastVisit: '2026-07-20T10:00:00.000Z', joinedAt: '2026-06-01T09:00:00.000Z', note: '',
    ...over,
  };
}

beforeEach(() => localStorage.clear());

describe('loyalty — earning & redemption', () => {
  it('earns whole points per spend amount', () => {
    expect(pointsFor(250, points)).toBe(2);
    expect(pointsFor(99, points)).toBe(0);
    expect(pointsFor(1500, points)).toBe(15);
  });

  it('disables spend earning when the program is stamp-based', () => {
    expect(pointsFor(10000, stamps)).toBe(0);
  });

  it('counts available stamps as earned minus used', () => {
    expect(stampsAvailable(member({ visits: 12, stampsUsed: 2 }), stamps)).toBe(0);
    expect(stampsAvailable(member({ visits: 12, stampsUsed: 1 }), stamps)).toBe(1);
    expect(stampsAvailable(member({ visits: 2 }), stamps)).toBe(0);
  });

  it('tiers members by visits', () => {
    expect(tierFor(member({ visits: 1 }))).toBe('New');
    expect(tierFor(member({ visits: 5 }))).toBe('Regular');
    expect(tierFor(member({ visits: 20 }))).toBe('VIP');
  });

  it('scales reward options with the point value', () => {
    const opts = rewardOptions(points);
    expect(opts.length).toBe(5);
    expect(opts[0].savings).toBe(20);
    expect(opts[1].cost).toBe(20);
    expect(opts.some((o) => o.cost <= 100 && o.cost > 0)).toBe(true);
  });

  it('only offers options the member can afford plus stamp freebie', () => {
    const opts = redeemOptionsFor(points, member({ points: 25 }));
    expect(opts.every((o) => o.cost === 0 || o.cost <= 25)).toBe(true);
    const stampOpts = redeemOptionsFor(stamps, member({ visits: 6 }));
    expect(stampOpts).toContainEqual(expect.objectContaining({ id: 'stamp-freebie' }));
  });
});

describe('loyalty — events', () => {
  it('grants the welcome bonus on signup and records it', () => {
    const { customer, txn } = addCustomer('Ada', '080 1234 5678', points);
    expect(customer.points).toBe(50);
    expect(customer.visits).toBe(0);
    expect(txn?.type).toBe('bonus');
    expect(txn?.points).toBe(50);
  });

  it('adds points and a visit when a member spends', () => {
    const { customer, txn } = recordVisit(member({ points: 50, visits: 3 }), 500, points, new Date('2026-08-01T12:00:00Z'));
    expect(customer.points).toBe(55);
    expect(customer.visits).toBe(4);
    expect(customer.lastVisit).toBe('2026-08-01T12:00:00.000Z');
    expect(txn?.type).toBe('earn');
    expect(txn?.points).toBe(5);
  });

  it('records visits without points on a stamp card', () => {
    const { customer, txn } = recordVisit(member({ points: 0, visits: 4 }), 0, stamps);
    expect(customer.visits).toBe(5);
    expect(txn?.points).toBe(0);
  });

  it('redeems a reward only when enough points exist', () => {
    const reward = rewardOptions(points)[0];
    expect(redeemReward(member({ points: reward.cost - 1 }), reward)).toBeNull();
    const ok = redeemReward(member({ points: reward.cost }), reward);
    expect(ok?.customer.points).toBe(0);
    expect(ok?.txn?.type).toBe('redeem');
  });

  it('redeems a stamp when one is available', () => {
    const ready = member({ visits: 5, stampsUsed: 0 });
    expect(redeemStamp(ready, stamps)?.customer.stampsUsed).toBe(1);
    const notReady = member({ visits: 4 });
    expect(redeemStamp(notReady, stamps)).toBeNull();
  });
});

describe('loyalty — stats & copy', () => {
  it('tallies members, active, visits, points and redemptions', () => {
    const now = new Date('2026-08-01T12:00:00');
    const cs = [
      member({ id: 'a', visits: 5, points: 120, lastVisit: '2026-07-28T10:00:00.000Z' }),
      member({ id: 'b', visits: 1, points: 0, lastVisit: '2026-05-01T10:00:00.000Z' }),
    ];
    const txns = [
      { id: 't1', customerId: 'a', type: 'redeem' as const, points: 20, label: 'Free item', at: now.toISOString() },
    ];
    expect(loyaltyStats(cs, txns, now)).toEqual({ members: 2, active: 1, visits: 6, pointsOut: 120, redemptions: 1 });
  });

  it('builds a WhatsApp balance message', () => {
    const text = waMessage(biz, member({ name: 'Ada', points: 120 }), points);
    expect(text).toContain('Meat Club');
    expect(text).toContain('Ada');
    expect(text).toContain('120 points');
  });

  it('builds a share blurb for a stamp programme', () => {
    const text = programShareBlurb(biz, stamps);
    expect(text).toContain('Buy 5 times');
    expect(text).toContain('Meat Club');
  });

  it('presets are distinct and valid', () => {
    expect(new Set(PROGRAM_PRESETS.map((p) => p.key)).size).toBe(PROGRAM_PRESETS.length);
    for (const p of PROGRAM_PRESETS) {
      expect(p.values.spendPerPoint).toBeGreaterThanOrEqual(0);
      expect(p.values.pointValue).toBeGreaterThanOrEqual(0);
      expect(p.values.welcomePoints).toBeGreaterThanOrEqual(0);
      expect(p.values.stampsForReward).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('loyalty — persistence', () => {
  it('saves and reloads program, customers and activity', () => {
    saveProgram('biz1', points);
    expect(loadProgram('biz1')).toEqual(points);

    const { customer, txn } = addCustomer('Ada', '080 1234 5678', points);
    saveCustomers('biz1', [customer]);
    const txns = txn ? ([txn] as LoyaltyTxn[]) : [];
    saveTxns('biz1', txns);

    expect(loadCustomers('biz1')).toHaveLength(1);
    expect(loadCustomers('biz1')[0].name).toBe('Ada');
    expect(loadTxns('biz1')[0].type).toBe('bonus');
  });

  it('falls back to a default program when nothing is saved', () => {
    expect(loadProgram('nobody').name).toBe('My Rewards');
    expect(loadProgram('nobody', 'Meat Club').name).toBe('Meat Club Rewards');
  });
});
