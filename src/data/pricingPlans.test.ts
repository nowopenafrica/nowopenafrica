import { describe, it, expect } from 'vitest';
import {
  moduleLimitForPlan, getBusinessTier, nextBusinessTier,
  MODULE_LIMITS, DEFAULT_BUSINESS_PLAN, BUSINESS_TIERS,
} from './pricingPlans';

describe('pricingPlans', () => {
  it('maps each plan to its booking-module limit', () => {
    expect(moduleLimitForPlan('starter')).toBe(1);
    expect(moduleLimitForPlan('growth')).toBe(5);
    expect(moduleLimitForPlan('business-pro')).toBe(999);
    expect(moduleLimitForPlan('enterprise')).toBe(999);
  });

  it('falls back to the Free Launch limit for empty/unknown plans', () => {
    expect(moduleLimitForPlan(null)).toBe(MODULE_LIMITS[DEFAULT_BUSINESS_PLAN]);
    expect(moduleLimitForPlan(undefined)).toBe(1);
    expect(moduleLimitForPlan('not-a-real-plan')).toBe(1);
  });

  it('resolves a tier by id and defaults when missing', () => {
    expect(getBusinessTier('growth')?.name).toBe('Growth');
    expect(getBusinessTier(null)?.id).toBe(DEFAULT_BUSINESS_PLAN);
  });

  it('steps up to the next tier and caps at the top', () => {
    expect(nextBusinessTier('starter')?.id).toBe('growth');
    expect(nextBusinessTier('growth')?.id).toBe('business-pro');
    expect(nextBusinessTier('enterprise')).toBeNull();
  });

  it('exposes four business tiers with unique ids', () => {
    const ids = BUSINESS_TIERS.map((t) => t.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('starter');
  });

  it('bundles AI credits on every plan tier', () => {
    expect(getBusinessTier('starter')?.aiCredits).toBe(50);
    expect(getBusinessTier('growth')?.aiCredits).toBe(500);
    expect(getBusinessTier('business-pro')?.aiCredits).toBe(2000);
  });
});
