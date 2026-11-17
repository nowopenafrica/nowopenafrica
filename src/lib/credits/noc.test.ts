import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ supabase: {} }));

import {
  formatNoc, nocValue, packForShortfall, parseQuote, parseWalletSummary, perNocMinor, topUpClosedMessage,
  type NocPack,
} from './noc';

const PACKS: NocPack[] = [
  { slug: 'pack.starter', name: 'Starter', credits: 100, priceMinor: 500000, currency: 'NGN' },
  { slug: 'pack.growth', name: 'Growth', credits: 550, priceMinor: 2000000, currency: 'NGN' },
  { slug: 'pack.business', name: 'Business', credits: 6000, priceMinor: 15000000, currency: 'NGN' },
];

describe('parseWalletSummary', () => {
  it('reads every class, defaulting the missing ones to 0, and bigint strings as numbers', () => {
    const s = parseWalletSummary({
      balance: '120', held: 15, available: 105,
      classes: { purchased: '100', included: 20 },
      market: { code: 'NG', currency: 'NGN', minor_per_noc: '5000', purchase_mode: 'off' },
      can_top_up: false,
    });
    expect(s.balance).toBe(120);
    expect(s.classes).toEqual({ purchased: 100, included: 20, promotional: 0, reward: 0, sandbox: 0 });
    expect(s.market.minorPerNoc).toBe(5000);
    expect(s.canTopUp).toBe(false);
  });

  it('never reports top-ups open unless the database said so', () => {
    expect(parseWalletSummary({ can_top_up: 'true' }).canTopUp).toBe(false);
    expect(parseWalletSummary({}).market.purchaseMode).toBe('off');
  });
});

describe('parseQuote', () => {
  it('keeps an unpriced or unknown action as not available, with no numbers', () => {
    const q = parseQuote({ ok: false, reason: 'not_available', action: 'ai.video_clip', name: 'AI video clip' });
    expect(q.ok).toBe(false);
    expect(q.noc).toBeUndefined();
    expect(q.reason).toBe('not_available');
  });

  it('carries the shortfall and the suggested pack from the database', () => {
    const q = parseQuote({
      ok: true, action: 'ai.image', name: 'AI image', noc: 5, currency: 'NGN', minor_per_noc: 5000,
      value_minor: 25000, available: 2, shortfall: 3, signed_in: true,
      packs: [{ slug: 'pack.starter', name: 'Starter', credits: 100, price_minor: '500000', currency: 'NGN' }],
      suggested_pack: { slug: 'pack.starter', name: 'Starter', credits: 100, price_minor: '500000', currency: 'NGN' },
      purchase_mode: 'off', can_top_up: false,
    });
    expect(q.shortfall).toBe(3);
    expect(q.suggestedPack?.priceMinor).toBe(500000);
    expect(q.packs?.[0].priceMinor).toBe(500000);
  });
});

describe('packForShortfall', () => {
  it('picks the smallest pack that covers the shortfall', () => {
    expect(packForShortfall(PACKS, 101)?.slug).toBe('pack.growth');
    expect(packForShortfall(PACKS, 100)?.slug).toBe('pack.starter');
  });
  it('falls back to the largest pack when none covers it', () => {
    expect(packForShortfall(PACKS, 10_000)?.slug).toBe('pack.business');
  });
  it('suggests nothing when there is no shortfall or nothing on sale', () => {
    expect(packForShortfall(PACKS, 0)).toBeNull();
    expect(packForShortfall([], 5)).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats NOC and its face value', () => {
    expect(formatNoc(1500)).toBe('1,500 NOC');
    expect(nocValue(5, 5000, 'NGN')).toBe('₦250');
  });
  it('shows the price per NOC a pack works out at', () => {
    expect(perNocMinor(PACKS[2])).toBe(2500);
    expect(perNocMinor({ ...PACKS[0], credits: 0 })).toBeNull();
  });
  it('says top-ups are closed without promising a date', () => {
    expect(topUpClosedMessage('off', false)).toBe('Top-ups are not open yet.');
    expect(topUpClosedMessage('sandbox', false)).toMatch(/being tested/);
    expect(topUpClosedMessage('live', true)).toBeNull();
  });
});
