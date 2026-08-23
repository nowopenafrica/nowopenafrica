import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALWAYS_LISTEN_KEY, loadAlwaysListen, saveAlwaysListen,
  canAutoListen, shouldListen, type MicPermission,
} from './voiceWake';

describe('the always-listening preference', () => {
  beforeEach(() => localStorage.clear());

  it('is off until the user opts in', () => {
    expect(loadAlwaysListen()).toBe(false);
  });

  it('survives a reload once enabled', () => {
    saveAlwaysListen(true);
    expect(localStorage.getItem(ALWAYS_LISTEN_KEY)).toBe('1');
    expect(loadAlwaysListen()).toBe(true);
  });

  it('is cleared rather than stored as false when switched off', () => {
    saveAlwaysListen(true);
    saveAlwaysListen(false);
    expect(localStorage.getItem(ALWAYS_LISTEN_KEY)).toBeNull();
    expect(loadAlwaysListen()).toBe(false);
  });
});

describe('canAutoListen', () => {
  it('starts with no click only when opted in and permission is already held', () => {
    expect(canAutoListen(true, 'granted')).toBe(true);
  });

  it('never starts on its own without the opt-in', () => {
    expect(canAutoListen(false, 'granted')).toBe(false);
  });

  it('never provokes a permission prompt on page load', () => {
    // 'prompt' means asking would pop a dialog; 'unknown' means we cannot tell
    // (Safari). Treating either as permission would ambush the visitor.
    for (const p of ['prompt', 'unknown', 'denied'] as MicPermission[]) {
      expect(canAutoListen(true, p), p).toBe(false);
    }
  });
});

describe('shouldListen', () => {
  const base = { alwaysListen: true, permission: 'granted' as MicPermission, tabVisible: true, panelOpen: false };

  it('listens hands-free when opted in, permitted and in front', () => {
    expect(shouldListen(base)).toBe(true);
  });

  it('stops when the tab is hidden, to spare the battery and the radio', () => {
    expect(shouldListen({ ...base, tabVisible: false })).toBe(false);
  });

  it('stops the moment permission is revoked in browser settings', () => {
    expect(shouldListen({ ...base, permission: 'denied' })).toBe(false);
    // Even with the panel explicitly open.
    expect(shouldListen({ ...base, permission: 'denied', panelOpen: true })).toBe(false);
  });

  it('still listens for an explicitly opened panel when hands-free is off', () => {
    expect(shouldListen({ ...base, alwaysListen: false, panelOpen: true })).toBe(true);
  });

  it('does not listen with hands-free off and the panel closed', () => {
    expect(shouldListen({ ...base, alwaysListen: false })).toBe(false);
  });

  it('an open panel still yields to a hidden tab', () => {
    expect(shouldListen({ ...base, panelOpen: true, tabVisible: false })).toBe(false);
  });
});
