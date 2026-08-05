// NowOpen Studio — Customer Loyalty Hub.
//
// A loyalty programme manager: configure how members earn (spend-based points
// or a stamp card), add customers, log visits, redeem rewards and broadcast
// balances on WhatsApp. Stored per business in localStorage like the rest of
// the Studio's on-device data.

import { Business } from '../types';

export interface LoyaltyProgram {
  id: string;
  name: string;
  spendPerPoint: number;   // spend this many currency units to earn 1 point (0 = disabled)
  pointValue: number;      // 1 point = this many currency units off a future visit
  welcomePoints: number;   // bonus points on signup
  stampsForReward: number; // freebie after this many visits (0 = disabled)
  active: boolean;
  created_at: string;
}

export interface LoyaltyCustomer {
  id: string;
  name: string;
  phone: string;
  points: number;
  visits: number;
  stampsUsed: number;
  lastVisit: string | null; // ISO datetime, or null before first visit
  joinedAt: string;         // ISO datetime
  note: string;
}

export type LoyaltyTxnType = 'earn' | 'redeem' | 'bonus';

export interface LoyaltyTxn {
  id: string;
  customerId: string;
  type: LoyaltyTxnType;
  points: number;
  label: string;
  at: string; // ISO datetime
}

export interface RewardOption {
  id: string;
  label: string;
  cost: number;
  savings: number;
}

export interface LoyaltyEvent {
  customer: LoyaltyCustomer;
  txn: LoyaltyTxn | null;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Program defaults & presets --------------------------------------------

export function defaultProgram(businessName = ''): LoyaltyProgram {
  return {
    id: 'default',
    name: businessName ? `${businessName} Rewards` : 'My Rewards',
    spendPerPoint: 100,
    pointValue: 2,
    welcomePoints: 50,
    stampsForReward: 0,
    active: true,
    created_at: new Date().toISOString(),
  };
}

export const PROGRAM_PRESETS: { key: string; label: string; desc: string; values: Pick<LoyaltyProgram, 'spendPerPoint' | 'pointValue' | 'welcomePoints' | 'stampsForReward'> }[] = [
  { key: 'points-club', label: 'Points Club', desc: 'Spend ₦100 → 1 point, each worth ₦2 off. 50 bonus points on signup.', values: { spendPerPoint: 100, pointValue: 2, welcomePoints: 50, stampsForReward: 0 } },
  { key: 'premium', label: 'Premium Rewards', desc: 'Spend ₦250 → 1 point, each worth ₦5 off. 100 bonus points on signup.', values: { spendPerPoint: 250, pointValue: 5, welcomePoints: 100, stampsForReward: 0 } },
  { key: 'stamp-card', label: 'Stamp Card', desc: 'Buy 5 times → get 1 free. No points maths — perfect for fast food & retail.', values: { spendPerPoint: 0, pointValue: 0, welcomePoints: 0, stampsForReward: 5 } },
];

export function rewardOptions(program: LoyaltyProgram): RewardOption[] {
  if (program.stampsForReward > 0 || program.pointValue <= 0) {
    return [{ id: 'free-item', label: 'Free item — the classic stamp reward', cost: 0, savings: 0 }];
  }
  const costs = [10, 20, 40, 80, 160];
  return costs.map((cost) => {
    const savings = cost * program.pointValue;
    return { id: `discount-${cost}`, label: `₦${savings.toLocaleString()} off your next visit`, cost, savings };
  });
}

// --- Earning & redemption maths --------------------------------------------

export function pointsFor(spend: number, program: LoyaltyProgram): number {
  if (program.spendPerPoint <= 0) return 0;
  return Math.floor(Math.max(0, spend) / program.spendPerPoint);
}

export function stampsAvailable(c: LoyaltyCustomer, program: LoyaltyProgram): number {
  if (program.stampsForReward <= 0) return 0;
  return Math.floor(c.visits / program.stampsForReward) - c.stampsUsed;
}

export function tierFor(c: LoyaltyCustomer): 'New' | 'Regular' | 'VIP' {
  if (c.visits >= 20) return 'VIP';
  if (c.visits >= 5) return 'Regular';
  return 'New';
}

// What a member can actually spend right now, as a redeemable options list.
export function redeemOptionsFor(program: LoyaltyProgram, c: LoyaltyCustomer): RewardOption[] {
  const opts = rewardOptions(program).filter((o) => o.cost > 0 ? c.points >= o.cost : false);
  if (program.stampsForReward > 0 && stampsAvailable(c, program) >= 1) {
    opts.push({ id: 'stamp-freebie', label: 'Free item (stamp reward)', cost: 0, savings: 0 });
  }
  return opts;
}

// --- Events ----------------------------------------------------------------

export function addCustomer(name: string, phone: string, program: LoyaltyProgram, note = '', at = new Date()): LoyaltyEvent {
  const customer: LoyaltyCustomer = {
    id: uid(),
    name: name.trim(),
    phone: phone.trim(),
    points: program.welcomePoints,
    visits: 0,
    stampsUsed: 0,
    lastVisit: null,
    joinedAt: at.toISOString(),
    note: note.trim(),
  };
  return {
    customer,
    txn: program.welcomePoints > 0
      ? { id: uid(), customerId: customer.id, type: 'bonus', points: program.welcomePoints, label: 'Welcome bonus', at: at.toISOString() }
      : null,
  };
}

export function recordVisit(customer: LoyaltyCustomer, spend: number, program: LoyaltyProgram, at = new Date()): LoyaltyEvent {
  const earned = pointsFor(spend, program);
  return {
    customer: {
      ...customer,
      points: customer.points + earned,
      visits: customer.visits + 1,
      lastVisit: at.toISOString(),
    },
    txn: {
      id: uid(),
      customerId: customer.id,
      type: 'earn',
      points: earned,
      label: spend > 0 ? `Visit — ₦${spend.toLocaleString()} spend` : 'Visit',
      at: at.toISOString(),
    },
  };
}

export function redeemReward(customer: LoyaltyCustomer, reward: RewardOption, at = new Date()): LoyaltyEvent | null {
  if (customer.points < reward.cost) return null;
  return {
    customer: { ...customer, points: customer.points - reward.cost },
    txn: { id: uid(), customerId: customer.id, type: 'redeem', points: reward.cost, label: reward.label, at: at.toISOString() },
  };
}

export function redeemStamp(customer: LoyaltyCustomer, program: LoyaltyProgram, at = new Date()): LoyaltyEvent | null {
  if (stampsAvailable(customer, program) < 1) return null;
  return {
    customer: { ...customer, stampsUsed: customer.stampsUsed + 1 },
    txn: { id: uid(), customerId: customer.id, type: 'redeem', points: 0, label: 'Free item (stamp reward)', at: at.toISOString() },
  };
}

// --- Stats -----------------------------------------------------------------

export function loyaltyStats(customers: LoyaltyCustomer[], txns: LoyaltyTxn[], now = new Date()): {
  members: number; active: number; visits: number; pointsOut: number; redemptions: number;
} {
  const cutoff = now.getTime() - 30 * 86400000;
  return {
    members: customers.length,
    active: customers.filter((c) => c.lastVisit && new Date(c.lastVisit).getTime() >= cutoff).length,
    visits: customers.reduce((s, c) => s + c.visits, 0),
    pointsOut: customers.reduce((s, c) => s + c.points, 0),
    redemptions: txns.filter((t) => t.type === 'redeem').length,
  };
}

// --- WhatsApp copy ---------------------------------------------------------

export function waMessage(business: Business, c: LoyaltyCustomer, program: LoyaltyProgram): string {
  const stampNote = program.stampsForReward > 0
    ? ` · ${stampsAvailable(c, program)} stamp${stampsAvailable(c, program) === 1 ? '' : 's'} toward a free item`
    : '';
  return [
    `Hi ${c.name}! ⭐ You're part of ${program.name} at ${business.name}.`,
    `Your balance is ${c.points} point${c.points === 1 ? '' : 's'}${stampNote}.`,
    business.phone ? `Call or WhatsApp ${business.phone} to use it.` : 'Visit us soon to use it.',
  ].join('\n');
}

export function programShareBlurb(business: Business, program: LoyaltyProgram): string {
  const earn = program.stampsForReward > 0
    ? `Buy ${program.stampsForReward} times and get 1 item free.`
    : `Spend ₦${program.spendPerPoint.toLocaleString()} and earn points worth ₦${program.pointValue} each.`;
  const welcome = program.welcomePoints > 0 ? `\n🎁 New members get ${program.welcomePoints} bonus points.` : '';
  return [
    `💜 Join ${program.name} at ${business.name}!`,
    earn,
    `Rewards are waiting on every visit.${welcome}`,
    business.phone ? `Sign up on WhatsApp: ${business.phone}.` : 'Ask us in store to join.',
  ].join('\n');
}

// --- Persistence -----------------------------------------------------------

export function loyaltyProgramKey(businessId: string): string {
  return `nowopen_loyalty_program_${businessId}`;
}

export function loyaltyCustomersKey(businessId: string): string {
  return `nowopen_loyalty_customers_${businessId}`;
}

export function loyaltyTxnsKey(businessId: string): string {
  return `nowopen_loyalty_txns_${businessId}`;
}

export function loadProgram(businessId: string, businessName = ''): LoyaltyProgram {
  try {
    const raw = localStorage.getItem(loyaltyProgramKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as LoyaltyProgram) : null;
    if (parsed && typeof parsed === 'object' && parsed.id) return parsed;
  } catch { /* ignore */ }
  return defaultProgram(businessName);
}

export function saveProgram(businessId: string, program: LoyaltyProgram): void {
  try { localStorage.setItem(loyaltyProgramKey(businessId), JSON.stringify(program)); } catch { /* ignore */ }
}

export function loadCustomers(businessId: string): LoyaltyCustomer[] {
  try {
    const raw = localStorage.getItem(loyaltyCustomersKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as LoyaltyCustomer[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomers(businessId: string, customers: LoyaltyCustomer[]): void {
  try { localStorage.setItem(loyaltyCustomersKey(businessId), JSON.stringify(customers)); } catch { /* ignore */ }
}

export function loadTxns(businessId: string): LoyaltyTxn[] {
  try {
    const raw = localStorage.getItem(loyaltyTxnsKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as LoyaltyTxn[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveTxns(businessId: string, txns: LoyaltyTxn[]): void {
  try { localStorage.setItem(loyaltyTxnsKey(businessId), JSON.stringify(txns)); } catch { /* ignore */ }
}
