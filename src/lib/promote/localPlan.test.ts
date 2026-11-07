import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCAL_PLAN_KEY,
  addLocalLines,
  clearLocalPlan,
  onPlanChanged,
  readLocalPlan,
  removeLocalLine,
  replaceLocalPlan,
  setLocalDays,
  type LocalLine,
} from './localPlan';

const A: LocalLine = { kind: 'placement', advertId: 'ad-1', days: 7 };
const B: LocalLine = { kind: 'placement', advertId: 'ad-2', days: null };
const P: LocalLine = { kind: 'product', productId: 'pr-1' };

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearLocalPlan();
});
afterEach(() => vi.restoreAllMocks());

describe('localPlan', () => {
  it('round trips lines', () => {
    expect(addLocalLines([A, P])).toEqual({ added: 2, skipped: 0 });
    expect(readLocalPlan()).toEqual([A, P]);
  });

  it('dedupes on add and counts skipped', () => {
    addLocalLines([A]);
    expect(addLocalLines([A, B, B])).toEqual({ added: 1, skipped: 2 });
    expect(readLocalPlan()).toEqual([A, B]);
  });

  it('keeps placement and product ids in separate namespaces', () => {
    const r = addLocalLines([
      { kind: 'placement', advertId: 'same', days: null },
      { kind: 'product', productId: 'same' },
    ]);
    expect(r.added).toBe(2);
  });

  it('returns [] for corrupt JSON', () => {
    window.localStorage.setItem(LOCAL_PLAN_KEY, '{nope');
    expect(readLocalPlan()).toEqual([]);
  });

  it('returns [] for a different version', () => {
    window.localStorage.setItem(LOCAL_PLAN_KEY, JSON.stringify({ v: 2, lines: [A] }));
    expect(readLocalPlan()).toEqual([]);
  });

  it('drops a malformed entry alone and dedupes stored duplicates', () => {
    window.localStorage.setItem(
      LOCAL_PLAN_KEY,
      JSON.stringify({
        v: 1,
        lines: [A, { kind: 'placement', advertId: 5 }, { kind: 'x' }, null,
          { kind: 'placement', advertId: 'ad-9', days: 0 },
          { kind: 'placement', advertId: 'ad-8', days: 1.5 },
          A, P],
      }),
    );
    expect(readLocalPlan()).toEqual([A, P]);
  });

  it('falls back to memory when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(addLocalLines([A])).toEqual({ added: 1, skipped: 0 });
    expect(readLocalPlan()).toEqual([A]);
  });

  it('keeps the plan when only setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    addLocalLines([A]);
    expect(readLocalPlan()).toEqual([A]);
    expect(readLocalPlan()).toEqual([A]);
    addLocalLines([B]);
    expect(readLocalPlan()).toEqual([A, B]);
  });

  it('removes by item id and sets days', () => {
    addLocalLines([A, P]);
    setLocalDays('ad-1', 30);
    expect(readLocalPlan()[0]).toEqual({ ...A, days: 30 });
    removeLocalLine('pr-1');
    removeLocalLine('ad-1');
    expect(readLocalPlan()).toEqual([]);
  });

  it('replaces and clears', () => {
    addLocalLines([A]);
    replaceLocalPlan([B]);
    expect(readLocalPlan()).toEqual([B]);
    clearLocalPlan();
    expect(readLocalPlan()).toEqual([]);
  });

  it('notifies on add/remove/replace and unsubscribes', () => {
    const cb = vi.fn();
    const off = onPlanChanged(cb);
    addLocalLines([A]);
    removeLocalLine('ad-1');
    replaceLocalPlan([B]);
    expect(cb).toHaveBeenCalledTimes(3);
    setLocalDays('ad-2', 5);
    clearLocalPlan();
    expect(cb).toHaveBeenCalledTimes(5);
    off();
    addLocalLines([P]);
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_PLAN_KEY }));
    expect(cb).toHaveBeenCalledTimes(5);
  });

  it('reacts to storage events for the plan key only', () => {
    const cb = vi.fn();
    const off = onPlanChanged(cb);
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    expect(cb).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: LOCAL_PLAN_KEY }));
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });
});
