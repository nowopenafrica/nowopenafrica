import { describe, it, expect } from 'vitest';
import type { Business } from '../types';
import {
  LIVE_TOKENS,
  liveTokenByKey,
  liveTokenGroups,
  hasLiveTokens,
  listTokens,
  resolveToken,
  resolveLiveText,
  resolveLiveSlots,
  insertToken,
  tokenText,
  liveCanvasSummary,
  LiveCanvasContext,
} from './liveCanvas';

const BUSINESS: Business = {
  id: 'b1',
  name: 'Prime Cuts Butchery',
  description: 'Fresh meat, cut to order.',
  category: 'Grocery / Mini-Mart',
  location: 'Surulere, Lagos',
  phone: '+234 800 111 2050',
  website: 'https://primecuts.example.com/',
  rating: 4.75,
  hours: 'Mon–Sat: 8AM–8PM',
};

// A fixed Thursday so weekday-dependent tokens are deterministic.
const NOW = new Date('2026-08-06T10:30:00');

function ctx(over: Partial<LiveCanvasContext> = {}): LiveCanvasContext {
  return {
    business: BUSINESS,
    now: NOW,
    status: 'open',
    todayHours: { open: '08:00', close: '20:00', closed: false },
    promo: { title: 'Weekend Meat Deal', offer: '20% off all cuts', endsAt: '2026-08-09' },
    products: [{ name: 'Fresh Beef (per kg)', price: '₦4,500/kg' }, { name: 'Goat Meat', price: '₦5,000/kg' }],
    reviewCount: 57,
    ...over,
  };
}

describe('token registry', () => {
  it('has unique keys and a fallback for every token', () => {
    const keys = LIVE_TOKENS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of LIVE_TOKENS) {
      expect(t.fallback.trim()).not.toBe('');
      expect(t.label.trim()).not.toBe('');
    }
  });

  it('looks tokens up case-insensitively and ignoring padding', () => {
    expect(liveTokenByKey('business.name')?.key).toBe('business.name');
    expect(liveTokenByKey('  BUSINESS.NAME ')?.key).toBe('business.name');
    expect(liveTokenByKey('nope.nope')).toBeUndefined();
  });

  it('groups every token for the insert menu', () => {
    const grouped = liveTokenGroups().flatMap((g) => g.tokens);
    expect(grouped).toHaveLength(LIVE_TOKENS.length);
  });

  it('resolves every registered token without throwing', () => {
    for (const t of LIVE_TOKENS) {
      expect(resolveToken(t.key, ctx()), t.key).not.toBeNull();
    }
  });
});

describe('detection', () => {
  it('detects tokens and tolerates inner whitespace', () => {
    expect(hasLiveTokens('Visit {{business.name}}')).toBe(true);
    expect(hasLiveTokens('Visit {{ business.name }}')).toBe(true);
    expect(hasLiveTokens('No tokens here')).toBe(false);
  });

  it('does not treat ordinary braces as tokens', () => {
    expect(hasLiveTokens('Big { sale } today')).toBe(false);
    expect(hasLiveTokens('{{ }}')).toBe(false);
  });

  it('lists tokens in order including duplicates', () => {
    expect(listTokens('{{business.name}} — {{promo.title}} at {{business.name}}')).toEqual([
      'business.name',
      'promo.title',
      'business.name',
    ]);
  });
});

describe('resolution', () => {
  it('fills business fields from the profile', () => {
    expect(resolveLiveText('{{business.name}}', ctx()).text).toBe('Prime Cuts Butchery');
    expect(resolveLiveText('{{business.address}}', ctx()).text).toBe('Surulere, Lagos');
    expect(resolveLiveText('{{business.category}}', ctx()).text).toBe('Grocery / Mini-Mart');
  });

  it('says "Open Now" rather than the bare chip label', () => {
    expect(resolveLiveText('{{business.status}}', ctx()).text).toBe('Open Now');
    expect(resolveLiveText('{{business.status}}', ctx({ status: 'closed' })).text).toBe('Closed');
    expect(resolveLiveText('{{business.status}}', ctx({ status: 'delivery' })).text).toBe('Delivery Active');
  });

  it("formats today's hours, and handles a closed day", () => {
    expect(resolveLiveText('{{business.hours}}', ctx()).text).toBe('8:00 AM – 8:00 PM');
    const closed = ctx({ todayHours: { open: '', close: '', closed: true } });
    expect(resolveLiveText('{{business.hours}}', closed).text).toBe('Closed today');
  });

  it('falls back to the profile hours string when no clock config is supplied', () => {
    const r = resolveLiveText('{{business.hours}}', ctx({ todayHours: null }));
    expect(r.text).toBe('Mon–Sat: 8AM–8PM');
  });

  it('strips the protocol and trailing slash from the website', () => {
    expect(resolveLiveText('{{business.website}}', ctx()).text).toBe('primecuts.example.com');
  });

  it('rounds the rating and builds a rating line', () => {
    expect(resolveLiveText('{{business.rating}}', ctx()).text).toBe('4.8');
    expect(resolveLiveText('{{business.ratingLine}}', ctx()).text).toBe('4.8★ · 57 reviews');
  });

  it('singularises a lone review', () => {
    expect(resolveLiveText('{{business.ratingLine}}', ctx({ reviewCount: 1 })).text).toBe('4.8★ · 1 review');
  });

  it('drops the review count when there are none', () => {
    expect(resolveLiveText('{{business.ratingLine}}', ctx({ reviewCount: 0 })).text).toBe('4.8★');
  });

  it('uses the current weekday', () => {
    expect(resolveLiveText('{{business.day}}', ctx()).text).toBe('Thursday');
  });

  it('resolves the active promotion', () => {
    expect(resolveLiveText('{{promo.title}}', ctx()).text).toBe('Weekend Meat Deal');
    expect(resolveLiveText('{{promo.offer}}', ctx()).text).toBe('20% off all cuts');
    expect(resolveLiveText('{{promo.ends}}', ctx()).text).toBe('Ends Sunday 9 August');
    expect(resolveLiveText('{{promo.daysLeft}}', ctx()).text).toBe('3 days left');
  });

  it('says "Ends today" on the final day', () => {
    const r = resolveLiveText('{{promo.daysLeft}}', ctx({ promo: { title: 'x', offer: 'y', endsAt: '2026-08-06' } }));
    expect(r.text).toBe('Ends today');
  });

  it('singularises the last day', () => {
    const r = resolveLiveText('{{promo.daysLeft}}', ctx({ promo: { title: 'x', offer: 'y', endsAt: '2026-08-07' } }));
    expect(r.text).toBe('1 day left');
  });

  it('resolves the featured product and catalogue size', () => {
    expect(resolveLiveText('{{product.top}}', ctx()).text).toBe('Fresh Beef (per kg)');
    expect(resolveLiveText('{{product.topPrice}}', ctx()).text).toBe('₦4,500/kg');
    expect(resolveLiveText('{{product.count}}', ctx()).text).toBe('2 items');
  });
});

describe('graceful degradation', () => {
  it('never leaves a raw token for a known key with no data', () => {
    const bare = ctx({ promo: null, products: [], reviewCount: null, status: null, todayHours: null });
    const text = LIVE_TOKENS.map((t) => tokenText(t.key)).join(' | ');
    const out = resolveLiveText(text, { ...bare, business: { ...BUSINESS, rating: undefined } }).text;
    expect(out).not.toMatch(/\{\{/);
    expect(out).not.toMatch(/\}\}/);
  });

  it('reports fallbacks as stale rather than live', () => {
    const r = resolveLiveText('{{promo.title}} — {{business.name}}', ctx({ promo: null }));
    expect(r.stale).toEqual(['promo.title']);
    expect(r.live).toEqual(['business.name']);
    expect(r.text).toBe('Special offer — Prime Cuts Butchery');
  });

  it('leaves unknown tokens verbatim so a typo stays visible', () => {
    const r = resolveLiveText('Hi {{busines.name}}', ctx());
    expect(r.text).toBe('Hi {{busines.name}}');
    expect(r.unknown).toEqual(['busines.name']);
  });

  it('ignores an invalid promo end date instead of printing NaN', () => {
    const bad = ctx({ promo: { title: 't', offer: 'o', endsAt: 'not-a-date' } });
    expect(resolveLiveText('{{promo.ends}}', bad).text).toBe('While stocks last');
    expect(resolveLiveText('{{promo.daysLeft}}', bad).text).toBe('Limited time');
  });

  it('treats an already-expired promo as having no days left', () => {
    const past = ctx({ promo: { title: 't', offer: 'o', endsAt: '2026-08-01' } });
    expect(resolveLiveText('{{promo.daysLeft}}', past).text).toBe('Limited time');
  });

  it('handles empty and undefined input', () => {
    expect(resolveLiveText('', ctx()).text).toBe('');
    expect(hasLiveTokens('')).toBe(false);
    expect(listTokens('')).toEqual([]);
  });
});

describe('resolveLiveSlots', () => {
  it('resolves every slot and merges the report', () => {
    const r = resolveLiveSlots(
      { headline: '{{business.name}} is {{business.status}}', subline: '{{promo.offer}}', badge: 'BOOK NOW' },
      ctx(),
    );
    expect(r.values.headline).toBe('Prime Cuts Butchery is Open Now');
    expect(r.values.subline).toBe('20% off all cuts');
    expect(r.values.badge).toBe('BOOK NOW');
    expect(r.live.sort()).toEqual(['business.name', 'business.status', 'promo.offer']);
    expect(r.stale).toEqual([]);
  });

  it('does not mark a token stale when another slot resolved it for real', () => {
    // business.rating resolves; promo.title does not.
    const r = resolveLiveSlots(
      { a: '{{business.rating}}', b: '{{business.rating}} {{promo.title}}' },
      ctx({ promo: null }),
    );
    expect(r.live).toContain('business.rating');
    expect(r.stale).toEqual(['promo.title']);
  });
});

describe('insertToken', () => {
  it('appends to the end by default with a separating space', () => {
    expect(insertToken('Open at', 'business.hours')).toBe('Open at {{business.hours}}');
  });

  it('does not double up whitespace', () => {
    expect(insertToken('Open at ', 'business.hours')).toBe('Open at {{business.hours}}');
  });

  it('inserts at the caret and spaces both sides', () => {
    expect(insertToken('Visit today', 'business.name', 6)).toBe('Visit {{business.name}} today');
  });

  it('inserts into an empty field without leading space', () => {
    expect(insertToken('', 'business.name')).toBe('{{business.name}}');
  });

  it('clamps an out-of-range caret to the end', () => {
    expect(insertToken('Hi', 'business.name', 99)).toBe('Hi {{business.name}}');
    expect(insertToken('Hi', 'business.name', -5)).toBe('Hi {{business.name}}');
  });
});

describe('liveCanvasSummary', () => {
  it('reports a static design', () => {
    expect(liveCanvasSummary({ live: [], stale: [], unknown: [] })).toMatchObject({ bound: 0, level: 'none' });
  });

  it('reports a fully live design', () => {
    const s = liveCanvasSummary({ live: ['business.name', 'business.status'], stale: [], unknown: [] });
    expect(s).toMatchObject({ bound: 2, level: 'live' });
    expect(s.label).toBe('2 fields linked to your profile');
  });

  it('reports partial binding', () => {
    const s = liveCanvasSummary({ live: ['business.name'], stale: ['promo.title'], unknown: [] });
    expect(s).toMatchObject({ bound: 2, level: 'partial' });
    expect(s.label).toBe('1 of 2 linked fields have live data');
  });

  it('surfaces an unknown token as an error above everything else', () => {
    const s = liveCanvasSummary({ live: ['business.name'], stale: [], unknown: ['oops'] });
    expect(s.level).toBe('error');
    expect(s.label).toContain('oops');
  });
});
