import { describe, expect, it } from 'vitest';
import { OS_SHOWCASE } from './osShowcase';
import { NEW_INDUSTRY_SPOTLIGHTS } from './sampleNewIndustries';
import { MORE_SPOTLIGHTS } from './sampleMore';
import { FASHION_SPOTLIGHTS } from './sampleFashion';

describe('OS_SHOWCASE includes the Group-10 sample profiles', () => {
  const usernames = new Set(OS_SHOWCASE.map((c) => c.username));

  it('shows the 5 new industry spotlights', () => {
    const expected = Object.values(NEW_INDUSTRY_SPOTLIGHTS).map((b) => b.username);
    for (const u of expected) expect(usernames.has(u)).toBe(true);
  });

  it('shows the second fashion brand (business_64)', () => {
    expect(usernames.has(FASHION_SPOTLIGHTS.business_64.username)).toBe(true);
  });

  it('shows every added second-sample profile', () => {
    const expected = Object.values(MORE_SPOTLIGHTS).map((b) => b.username);
    expect(expected.length).toBeGreaterThanOrEqual(8);
    for (const u of expected) expect(usernames.has(u)).toBe(true);
  });

  it('every showcase card resolves to a real spotlight record (no broken links)', () => {
    expect(OS_SHOWCASE.length).toBeGreaterThanOrEqual(44);
    for (const c of OS_SHOWCASE) {
      expect(c.username.length).toBeGreaterThan(0);
      expect(c.image).toMatch(/^https:/);
    }
  });
});
