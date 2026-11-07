import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The data-access half of Business Updates, against a recording supabase.
 *
 * What matters here is ORDER and RESTRAINT: a draft row before any upload, no
 * .select() after an insert, never publishing from the upload step, and never
 * deleting a row whose files could not be removed.
 */

type Call = { target: string; op: string; args: unknown[] };
const calls: Call[] = [];
let results: Record<string, { data?: unknown; error?: unknown }> = {};

const resultFor = (key: string) => results[key] ?? { data: null, error: null };

vi.mock('./supabase', () => {
  const table = (name: string) => {
    let op = 'select';
    const chain: Record<string, unknown> = {};
    const record = (m: string) => (...args: unknown[]) => {
      if (['insert', 'update', 'delete', 'select'].includes(m) && op === 'select') op = m;
      calls.push({ target: name, op: m, args });
      return chain;
    };
    for (const m of ['insert', 'update', 'delete', 'select', 'eq', 'order', 'limit', 'in']) chain[m] = record(m);
    chain.then = (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(resultFor(`${name}.${op}`)).then(onF, onR);
    return chain;
  };
  const bucket = (name: string) => ({
    upload: vi.fn(async (...args: unknown[]) => {
      calls.push({ target: `storage:${name}`, op: 'upload', args });
      const path = String(args[0]);
      return results[`upload:${path.split('/').pop()}`] ?? { data: { path }, error: null };
    }),
    remove: vi.fn(async (...args: unknown[]) => {
      calls.push({ target: `storage:${name}`, op: 'remove', args });
      return resultFor('storage.remove');
    }),
    createSignedUrls: vi.fn(async (...args: unknown[]) => {
      calls.push({ target: `storage:${name}`, op: 'createSignedUrls', args });
      const paths = args[0] as string[];
      return { data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}`, error: null })), error: null };
    }),
  });
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    calls.push({ target: 'rpc', op: fn, args: [args] });
    return resultFor(`rpc.${fn}`);
  });
  return { supabase: { from: vi.fn(table), storage: { from: vi.fn(bucket) }, rpc } };
});

vi.mock('./imageCompression', () => ({
  compressImage: vi.fn(async (f: File) => new File([f], 'compressed.webp', { type: 'image/webp' })),
}));

import {
  createDraftUpdate, uploadUpdateMedia, deleteUpdate, readableError, listOwnerUpdates, publishUpdate,
  loadKeeperReach, type OwnerUpdate,
} from './businessUpdatesApi';

const BIZ = '11111111-1111-4111-8111-111111111111';
const file = (name: string, type: string) => new File(['x'], name, { type });

beforeEach(() => { calls.length = 0; results = {}; });

describe('createDraftUpdate', () => {
  it('inserts a draft with a client id and never selects it back', async () => {
    const r = await createDraftUpdate({
      businessId: BIZ, type: 'announcement', title: '  Hi  ', body: ' Open late ', offerId: null,
      ctaLabel: null, ctaUrl: null, notifyKeepers: true,
    });
    expect(r.ok).toBe(true);
    const insert = calls.find((c) => c.op === 'insert');
    const row = insert?.args[0] as Record<string, unknown>;
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.title).toBe('Hi');
    expect(row.body).toBe('Open late');
    expect(row).not.toHaveProperty('published_at');
    expect(calls.some((c) => c.op === 'select')).toBe(false);
    if (r.ok) expect(r.value).toBe(row.id);
  });
});

describe('uploadUpdateMedia', () => {
  it('a failed upload leaves a draft, never a live update', async () => {
    results['upload:'] = { error: null };
    const files = [
      { file: file('a.jpg', 'image/jpeg'), durationMs: null, alt: 'Front' },
      { file: file('b.mp4', 'video/mp4'), durationMs: 5000, alt: '' },
      { file: file('c.png', 'image/png'), durationMs: null, alt: '' },
    ];
    // Make the second upload fail, whatever its generated name.
    let n = 0;
    const { supabase } = await import('./supabase');
    const bucketFrom = supabase.storage.from as unknown as ReturnType<typeof vi.fn>;
    bucketFrom.mockImplementationOnce(() => ({
      upload: vi.fn(async (...args: unknown[]) => {
        n += 1;
        calls.push({ target: 'storage:business-updates', op: 'upload', args });
        return n === 2 ? { data: null, error: { message: 'Payload too large' } } : { data: {}, error: null };
      }),
    }));

    const r = await uploadUpdateMedia(BIZ, 'u-1', files);
    expect(r.uploaded).toBe(2);
    expect(r.failed).toEqual([{ name: 'b.mp4', message: 'Payload too large' }]);

    const uploads = calls.filter((c) => c.op === 'upload');
    for (const u of uploads) {
      expect(String(u.args[0])).toMatch(new RegExp(`^${BIZ}/u-1/[0-9a-f-]{36}\\.[a-z0-9]+$`));
      expect(u.args[2]).toMatchObject({ upsert: false });
    }
    // Images are compressed to WebP before upload.
    expect(String(uploads[0].args[0])).toMatch(/\.webp$/);
    expect(calls.some((c) => c.op === 'update')).toBe(false);
    const mediaRows = calls.filter((c) => c.target === 'business_update_media' && c.op === 'insert');
    expect(mediaRows).toHaveLength(2);
    expect((mediaRows[1].args[0] as Record<string, unknown>).position).toBe(2);
  });
});

describe('publishUpdate', () => {
  it('schedules through the server and passes the guard\'s refusal through', async () => {
    results['rpc.publish_business_update'] = { error: { code: 'P0001', message: 'That time has already passed.' } };
    const r = await publishUpdate('u-1', new Date('2026-11-01T10:00:00Z'));
    expect(calls.find((c) => c.target === 'rpc')).toMatchObject({
      op: 'publish_business_update', args: [{ p_id: 'u-1', p_at: '2026-11-01T10:00:00.000Z' }],
    });
    expect(r).toEqual({ ok: false, message: 'That time has already passed.' });
  });

  it('lets the server stamp "now", never this device\'s clock', async () => {
    const r = await publishUpdate('u-1', null);
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.target === 'rpc')?.args[0]).toEqual({ p_id: 'u-1', p_at: null });
    expect(calls.some((c) => c.op === 'update')).toBe(false);
  });
});

describe('deleteUpdate', () => {
  const live: OwnerUpdate = {
    id: 'u-9', business_id: BIZ, type: 'announcement', title: '', body: 'x', offer_id: null, event_starts_at: null,
    cta_label: null, cta_url: null, notify_keepers: false,
    published_at: new Date(Date.now() - 3_600_000).toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    ended_at: null, notified_at: null, moderation_status: 'ok', moderation_note: null,
    created_at: new Date().toISOString(), author_id: null,
    media: [{ id: 'm1', storage_path: `${BIZ}/u-9/a.webp`, kind: 'image', position: 0, alt_text: null, url: null }],
  };

  it('ends a live update, removes its files, then deletes the row', async () => {
    results['storage.remove'] = { data: [{ name: 'a.webp' }], error: null };
    const r = await deleteUpdate(live);
    expect(r.ok).toBe(true);
    const order = calls.filter((c) => ['update', 'remove', 'delete'].includes(c.op)).map((c) => c.op);
    expect(order).toEqual(['update', 'remove', 'delete']);
  });

  it('keeps the row when its files could not be removed', async () => {
    results['storage.remove'] = { error: { message: 'nope' } };
    const r = await deleteUpdate(live);
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });
});

describe('readableError', () => {
  it('turns permission errors into words', () => {
    expect(readableError({ code: '42501', message: 'new row violates row-level security policy' }))
      .toBe("You don't have permission to post for this business.");
  });
  it('passes the guard\'s own messages through', () => {
    expect(readableError({ code: 'P0001', message: 'A live update cannot be edited. End it and post again.' }))
      .toBe('A live update cannot be edited. End it and post again.');
  });
  it('hides anything else', () => {
    expect(readableError({ code: 'XX000', message: 'internal' })).toBe('Something went wrong. Please try again.');
    expect(readableError(null)).toBe('Something went wrong. Please try again.');
  });
});

describe('listOwnerUpdates', () => {
  it('says when the table is missing rather than calling it empty', async () => {
    results['business_updates.select'] = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
    const r = await listOwnerUpdates(BIZ);
    expect(r).toMatchObject({ ok: false, missing: true });
  });

  it('signs every media path once, for ten minutes', async () => {
    results['business_updates.select'] = {
      data: [{ id: 'u1', media: [{ id: 'm', storage_path: `${BIZ}/u1/a.webp`, position: 0, kind: 'image', alt_text: null }] }],
      error: null,
    };
    const r = await listOwnerUpdates(BIZ);
    const sign = calls.find((c) => c.op === 'createSignedUrls');
    expect(sign?.args).toEqual([[`${BIZ}/u1/a.webp`], 600]);
    expect(r.ok && r.value[0].media[0].url).toBe(`https://signed/${BIZ}/u1/a.webp`);
  });
});

describe('loadKeeperReach', () => {
  it('counts real keepers per topic, and says nothing when the read fails', async () => {
    results['business_keeps.select'] = { data: [{ topics: ['promotions', 'events'] }, { topics: ['promotions'] }], error: null };
    const reach = await loadKeeperReach(BIZ);
    expect(reach?.promotions).toBe(2);
    expect(reach?.events).toBe(1);
    expect(reach?.products).toBe(0);

    results['business_keeps.select'] = { data: null, error: { message: 'down' } };
    expect(await loadKeeperReach(BIZ)).toBeNull();
  });
});

describe('fix pass after the whole-change review', () => {
  const BIZ2 = '22222222-2222-4222-8222-222222222222';
  const base: OwnerUpdate = {
    id: 'u-5', business_id: BIZ2, type: 'announcement', title: '', body: 'x', offer_id: null, event_starts_at: null,
    cta_label: null, cta_url: null, notify_keepers: false, published_at: null, expires_at: null,
    ended_at: null, notified_at: null, moderation_status: 'ok', moderation_note: null,
    created_at: new Date().toISOString(), author_id: null,
    media: [{ id: 'm1', storage_path: `${BIZ2}/u-5/a.webp`, kind: 'image', position: 0, alt_text: null, url: null }],
  };

  it('keeps the row when storage silently removed fewer files than asked', async () => {
    results['storage.remove'] = { data: [], error: null };
    const r = await deleteUpdate(base);
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.op === 'delete')).toBe(false);
  });

  it('ends any published, unended update before deleting, whatever this device\'s clock says', async () => {
    results['storage.remove'] = { data: [{ name: 'a.webp' }], error: null };
    // Looks ended to a fast clock; the server may still count it live.
    const r = await deleteUpdate({ ...base, published_at: new Date(Date.now() - 30 * 3_600_000).toISOString(),
      expires_at: new Date(Date.now() - 6 * 3_600_000).toISOString() });
    expect(r.ok).toBe(true);
    expect(calls.filter((c) => ['update', 'remove', 'delete'].includes(c.op)).map((c) => c.op))
      .toEqual(['update', 'remove', 'delete']);
  });

  it('removes an uploaded file when its media row is refused, so nothing is orphaned', async () => {
    results['business_update_media.insert'] = { error: { code: 'P0001', message: 'Up to 10 photos or videos.' } };
    const r = await uploadUpdateMedia(BIZ, 'u-1', [{ file: file('a.jpg', 'image/jpeg'), durationMs: null, alt: '' }]);
    expect(r.failed).toEqual([{ name: 'a.jpg', message: 'Up to 10 photos or videos.' }]);
    const upload = calls.find((c) => c.op === 'upload');
    const remove = calls.find((c) => c.op === 'remove');
    expect(remove?.args[0]).toEqual([upload?.args[0]]);
  });

  it('does not count the owner, whom notify_keepers never messages', async () => {
    results['businesses.select'] = { data: [{ user_id: 'owner-1' }], error: null };
    results['business_keeps.select'] = {
      data: [{ user_id: 'owner-1', topics: ['announcements'] }, { user_id: 'k-2', topics: ['announcements'] }], error: null,
    };
    expect((await loadKeeperReach(BIZ))?.announcements).toBe(1);
  });
});

describe('listOwnerUpdates when signing fails', () => {
  it('still lists the updates, with no thumbnails rather than broken ones', async () => {
    results['business_updates.select'] = {
      data: [{ id: 'u1', media: [{ id: 'm', storage_path: `${BIZ}/u1/a.webp`, position: 0, kind: 'image', alt_text: null }] }],
      error: null,
    };
    const { supabase } = await import('./supabase');
    (supabase.storage.from as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      createSignedUrls: vi.fn(async () => ({ data: null, error: { message: 'storage down' } })),
    }));
    const r = await listOwnerUpdates(BIZ);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value[0].media[0].url).toBeNull();
  });
});
