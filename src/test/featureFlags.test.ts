import { describe, it, expect } from 'vitest';

import {
  toFlagMap, isEnabled, FALLBACK, KILL_SWITCH_ORDER, CONSEQUENCE,
  type FlagKey,
} from '../lib/featureFlags';

/**
 * The point of a kill switch is that it behaves correctly at the worst moment.
 * These assert the failure modes, not the happy path.
 */

describe('reading flags', () => {
  it('reflects what the table says', () => {
    const flags = toFlagMap([{ key: 'offers', enabled: false }, { key: 'live', enabled: true }]);
    expect(isEnabled(flags, 'offers')).toBe(false);
    expect(isEnabled(flags, 'live')).toBe(true);
  });

  it('falls back for a flag the table did not return', () => {
    const flags = toFlagMap([{ key: 'offers', enabled: false }]);
    expect(isEnabled(flags, 'keeps')).toBe(true);
  });
});

describe('what happens when the flags cannot be read', () => {
  /*
   * A connectivity blip must not disable the product, and an operator reaching
   * for a kill switch has a working database by definition — they just used the
   * console to flip it.
   */
  it('leaves the product working', () => {
    for (const key of ['offers', 'keeps', 'live', 'bookings', 'ordering', 'campaigns'] as FlagKey[]) {
      expect(isEnabled(null, key), key).toBe(true);
    }
  });

  /*
   * The exception, and the reason the column exists: not sending is
   * recoverable, sending is not.
   */
  it('goes silent on anything that spends money or reaches a customer', () => {
    for (const key of ['payments', 'outbound_email', 'outbound_whatsapp'] as FlagKey[]) {
      expect(isEnabled(null, key), key).toBe(false);
      expect(FALLBACK[key], key).toBe(false);
    }
  });

  it('treats an empty response the same as no response', () => {
    expect(isEnabled(toFlagMap([]), 'payments')).toBe(false);
    expect(isEnabled(toFlagMap([]), 'offers')).toBe(true);
  });
});

describe('an unknown key is not a kill switch', () => {
  /*
   * A typo must not silently disable a working feature. The failure mode of
   * `isEnabled(flags, 'ofers')` should be a feature that stays on, not one that
   * vanishes with no error anywhere.
   */
  it('leaves an unrecognised flag on', () => {
    expect(isEnabled(toFlagMap([{ key: 'offers', enabled: true }]), 'not_a_real_flag')).toBe(true);
  });
});

describe('the operator-facing copy', () => {
  it('describes the consequence of every flag', () => {
    for (const key of Object.keys(FALLBACK) as FlagKey[]) {
      expect(CONSEQUENCE[key], key).toBeTruthy();
      // Written for somebody under pressure: what a customer will see, not
      // which module is disabled.
      expect(CONSEQUENCE[key].length, key).toBeGreaterThan(30);
    }
  });

  it('orders the switches by how much damage they stop', () => {
    expect(KILL_SWITCH_ORDER[0]).toBe('payments');
    expect(KILL_SWITCH_ORDER).toHaveLength(Object.keys(FALLBACK).length);
    // Every flag appears exactly once.
    expect(new Set(KILL_SWITCH_ORDER).size).toBe(KILL_SWITCH_ORDER.length);
  });

  it('covers every flag the database ships', () => {
    // Drift here means a flag exists that no console can turn off.
    expect(Object.keys(FALLBACK).sort()).toEqual([
      'adverts', 'ai_director', 'bookings', 'campaigns', 'keeps', 'live',
      'offers', 'ordering', 'outbound_email', 'outbound_whatsapp', 'payments', 'studio_video',
    ]);
  });
});
