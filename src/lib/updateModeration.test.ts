import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Staff moderation of Business Updates. What matters: hiding records the
 * reason, closes the reports and tells the owner; nothing reads a row back
 * after an insert; and a failed read is a failure, not an empty queue.
 */

type Call = { target: string; op: string; args: unknown[] };
const calls: Call[] = [];
let results: Record<string, { data?: unknown; error?: unknown }> = {};

vi.mock('./supabase', () => {
  const table = (name: string) => {
    let op = 'select';
    const chain: Record<string, unknown> = {};
    const record = (m: string) => (...args: unknown[]) => {
      if (['insert', 'update', 'delete'].includes(m)) op = m;
      calls.push({ target: name, op: m, args });
      return chain;
    };
    for (const m of ['insert', 'update', 'select', 'eq', 'in', 'is', 'not', 'lte', 'gt', 'order', 'limit']) chain[m] = record(m);
    chain.then = (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(results[`${name}.${op}`] ?? { data: [], error: null }).then(onF, onR);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(table),
      storage: { from: vi.fn(() => ({ createSignedUrls: vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://s/${p}`, error: null })), error: null })) })) },
    },
  };
});

import { dismissReports, hideUpdate, listModeration, unhideUpdate, type ModItem } from './updateModeration';

beforeEach(() => { calls.length = 0; results = {}; });

const item: ModItem = {
  update: {
    id: 'u1', type: 'offer', title: 'Big sale', body: '', published_at: '2026-11-15T10:00:00Z',
    expires_at: '2026-11-16T10:00:00Z', ended_at: null, moderation_status: 'ok', moderation_note: null,
    media: [],
  },
  business: { id: 'b1', name: 'Mama Put', username: 'mama-put', user_id: 'owner-1' },
  reports: [],
  thumb: null,
};

describe('listModeration', () => {
  it('says the read failed rather than showing an empty queue', async () => {
    results['business_update_reports.select'] = { data: null, error: { message: 'down' } };
    expect((await listModeration()).ok).toBe(false);
  });

  it('groups open reports under their update, oldest report first', async () => {
    results['business_update_reports.select'] = {
      data: [
        { id: 'r1', update_id: 'u1', reason: 'scam', detail: 'fake', created_at: '2026-11-15T10:05:00Z' },
        { id: 'r2', update_id: 'u1', reason: 'scam', detail: null, created_at: '2026-11-15T10:06:00Z' },
      ], error: null,
    };
    results['business_updates.select'] = {
      data: [{ ...item.update, business: item.business }], error: null,
    };
    const r = await listModeration();
    expect(r.ok && r.value.reported).toHaveLength(1);
    expect(r.ok && r.value.reported[0].reports.map((x) => x.reason)).toEqual(['scam', 'scam']);
    const statusFilter = calls.find((c) => c.target === 'business_update_reports' && c.op === 'eq');
    expect(statusFilter?.args).toEqual(['status', 'open']);
  });
});

describe('hideUpdate', () => {
  it('hides with the reason, closes the reports, and tells the owner without reading back', async () => {
    const r = await hideUpdate(item, '  Misleading price  ');
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.target === 'business_updates' && c.op === 'update')?.args[0])
      .toEqual({ moderation_status: 'hidden', moderation_note: 'Misleading price' });
    const reports = calls.find((c) => c.target === 'business_update_reports' && c.op === 'update');
    expect(reports?.args[0]).toMatchObject({ status: 'actioned' });
    const note = calls.find((c) => c.target === 'notifications' && c.op === 'insert');
    expect(note?.args[0]).toMatchObject({ user_id: 'owner-1', type: 'moderation', body: 'Misleading price' });
    expect(calls.filter((c) => c.op === 'select')).toHaveLength(0);
  });

  it('refuses a reason shorter than five characters', async () => {
    const r = await hideUpdate(item, ' bad ');
    expect(r).toEqual({ ok: false, message: 'Give the owner a reason (at least 5 characters).' });
    expect(calls).toHaveLength(0);
  });

  it('stops if the update could not be hidden', async () => {
    results['business_updates.update'] = { error: { code: '42501', message: 'denied' } };
    const r = await hideUpdate(item, 'Misleading price');
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.target === 'notifications')).toBe(false);
  });
});

describe('unhideUpdate and dismissReports', () => {
  it('makes the update visible again and tells the owner', async () => {
    const r = await unhideUpdate({ ...item, update: { ...item.update, moderation_status: 'hidden', moderation_note: 'x' } });
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.target === 'business_updates' && c.op === 'update')?.args[0])
      .toEqual({ moderation_status: 'ok', moderation_note: null });
    expect(calls.find((c) => c.target === 'notifications')?.args[0]).toMatchObject({ user_id: 'owner-1' });
  });

  it('dismisses only the open reports of that update, and tells nobody', async () => {
    await dismissReports('u1');
    const upd = calls.find((c) => c.target === 'business_update_reports' && c.op === 'update');
    expect(upd?.args[0]).toMatchObject({ status: 'rejected' });
    const eqs = calls.filter((c) => c.target === 'business_update_reports' && c.op === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['update_id', 'u1']);
    expect(eqs).toContainEqual(['status', 'open']);
    expect(calls.some((c) => c.target === 'notifications')).toBe(false);
  });

  it('tells the owner the truth when the update has already ended', async () => {
    const ended = {
      ...item,
      update: { ...item.update, moderation_status: 'hidden' as const, published_at: '2026-01-01T10:00:00Z', expires_at: '2026-01-02T10:00:00Z' },
    };
    const r = await unhideUpdate(ended);
    expect(r.ok && r.value.stillLive).toBe(false);
    const note = calls.find((c) => c.target === 'notifications')?.args[0] as { title: string; body: string };
    expect(note.title).toBe('NowOpen reviewed your update again');
    expect(note.body).toMatch(/24 hours had already ended/);
    expect(note.body).not.toMatch(/visible again/);
  });
});
