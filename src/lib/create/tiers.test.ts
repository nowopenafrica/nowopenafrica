import { describe, expect, it } from 'vitest';

import { badgeText, matchesTier, parseTierRows, priceText } from './tiers';

const row = (item: string, tier: unknown, cost: number | null, extra: Record<string, unknown> = {}) => ({
  slug: `create.template.${item}`,
  credit_cost: cost,
  enabled: false,
  metadata: { engine_item: item, tier, min_review_score: tier === 'premium' ? 90 : tier === 'signature' ? 95 : 85, ...extra },
});

describe('parseTierRows', () => {
  it('reads tier, price and review bar from the credit_actions rows', () => {
    const t = parseTierRows([row('menu', 'premium', 50), row('story', 'free', 0), row('billboard', 'signature', 160)]);
    expect(t.get('menu')).toEqual({ tier: 'premium', noc: 50, minScore: 90, onSale: false });
    expect(t.get('story')?.tier).toBe('free');
    expect(t.get('billboard')?.minScore).toBe(95);
  });

  it('leaves out rows it cannot read, rather than guessing them free', () => {
    const t = parseTierRows([
      row('a', 'gold', 30),
      row('b', 'premium', null),
      row('c', 'premium', 0),
      { slug: 'ai.image', credit_cost: 5, enabled: true, metadata: { tier: 'premium' } },
    ]);
    expect(t.size).toBe(0);
  });
});

describe('labels', () => {
  const menu = { tier: 'premium' as const, noc: 50, minScore: 90, onSale: false };
  it('prices in NOC with the naira face value from the market', () => {
    expect(priceText(menu, 5000, 'NGN')).toMatch(/^50 NOC \(.*2,500.*\)$/);
    expect(badgeText(menu)).toBe('Premium · 50 NOC');
    expect(badgeText({ ...menu, tier: 'free', noc: 0 })).toBe('Free');
  });

  it('filters by tier; an item with no known tier shows only under All', () => {
    expect(matchesTier('all', undefined)).toBe(true);
    expect(matchesTier('premium', undefined)).toBe(false);
    expect(matchesTier('premium', menu)).toBe(true);
    expect(matchesTier('free', menu)).toBe(false);
  });
});
