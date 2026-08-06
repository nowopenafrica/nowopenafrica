import { describe, it, expect } from 'vitest';
import { demoTrustFor, withDemoTrust, withDemoTrustAll } from './demoTrust';
import { deriveTier } from '../lib/trust';

describe('demo trust signals', () => {
  it('is deterministic — a demo always renders the same tier', () => {
    expect(demoTrustFor('business_37')).toEqual(demoTrustFor('business_37'));
  });

  it('produces signals that actually earn the tier it claims', () => {
    // The whole point: the badge must be derivable from the signals, or the
    // panel and the header disagree again.
    for (let i = 1; i <= 120; i++) {
      const id = `business_${i}`;
      const t = demoTrustFor(id);
      expect(deriveTier(t), id).toBe(t.verification_tier);
    }
  });

  it('never leaves a demo unverified', () => {
    for (let i = 1; i <= 120; i++) {
      expect(deriveTier(demoTrustFor(`business_${i}`))).not.toBe('none');
    }
  });

  it('spreads across tiers instead of making everything platinum', () => {
    const tiers = new Set<string>();
    for (let i = 1; i <= 200; i++) tiers.add(demoTrustFor(`business_${i}`).verification_tier);
    expect(tiers.size).toBeGreaterThanOrEqual(3);
    // and platinum is the minority
    let platinum = 0;
    for (let i = 1; i <= 200; i++) if (demoTrustFor(`business_${i}`).verification_tier === 'platinum') platinum++;
    expect(platinum).toBeLessThan(100);
  });

  it('does not overwrite signals a record already sets', () => {
    const pinned = withDemoTrust({ id: 'business_1', verification_tier: 'bronze' as const, onsite_verified: false });
    expect(pinned.verification_tier).toBe('bronze');
    expect(pinned.onsite_verified).toBe(false);
  });

  it('leaves a record with no id alone', () => {
    const r: { id?: string; name: string } = { name: 'x' };
    expect(withDemoTrust(r)).toBe(r);
  });

  it('maps a whole dictionary and preserves keys', () => {
    const out = withDemoTrustAll({
      a: { id: 'business_37', name: 'A' },
      b: { id: 'business_38', name: 'B' },
    });
    expect(Object.keys(out)).toEqual(['a', 'b']);
    expect(out.a.name).toBe('A');
    expect(deriveTier(out.a as never)).not.toBe('none');
  });
});
