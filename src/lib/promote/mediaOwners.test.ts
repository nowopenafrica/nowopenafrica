import { describe, it, vi, expect, expectTypeOf, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('../supabase', () => ({ supabase: { from: (...a: unknown[]) => from(...a), rpc: (...a: unknown[]) => rpc(...a) } }));

import { verifyOwner, addContact, setLifecycle, recordConfirmation, type Lifecycle, type SettableLifecycle } from './mediaOwners';

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

describe('mediaOwners validation happens before any call', () => {
  it('verifyOwner needs a note', async () => {
    expect(await verifyOwner('o1', '  ')).toMatchObject({ ok: false });
    expect(from).not.toHaveBeenCalled();
  });
  it('addContact needs an absolute http(s) source URL', async () => {
    const c = { kind: 'email', value: 'a@b.co', confidence: 'high', isPublicBusinessContact: false } as const;
    expect(await addContact('o1', { ...c, sourceUrl: '' })).toMatchObject({ ok: false });
    expect(await addContact('o1', { ...c, sourceUrl: 'lagosboards.example' })).toMatchObject({ ok: false });
    expect(await addContact('o1', { ...c, sourceUrl: 'javascript:alert(1)' })).toMatchObject({ ok: false });
    expect(from).not.toHaveBeenCalled();
  });
  it('setLifecycle needs a reason', async () => {
    expect(await setLifecycle('p1', 'archived', ' ')).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
  it('recordConfirmation needs a from-date', async () => {
    expect(await recordConfirmation('p1', { status: 'available', periodFrom: '', method: 'email' })).toMatchObject({ ok: false });
    expect(from).not.toHaveBeenCalled();
  });
  it('never throws when the client does', async () => {
    rpc.mockRejectedValue(new Error('network down'));
    expect(await setLifecycle('p1', 'archived', 'why')).toEqual({ ok: false, error: 'network down' });
  });
});

describe('Lifecycle', () => {
  it('includes pending_review, which set_placement_lifecycle refuses, so setLifecycle cannot send it', () => {
    expectTypeOf<'pending_review'>().toMatchTypeOf<Lifecycle>();
    expectTypeOf<'pending_review'>().not.toMatchTypeOf<SettableLifecycle>();
    expectTypeOf<Parameters<typeof setLifecycle>[1]>().toEqualTypeOf<SettableLifecycle>();
  });
});
