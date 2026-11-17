import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The public half of Business Updates. The database decides what is live;
 * this module must only read what it is given, sign each photo for no longer
 * than its update lives, and file reports without reading them back.
 */

type Call = { target: string; op: string; args: unknown[] };
const calls: Call[] = [];
let results: Record<string, { data?: unknown; error?: unknown }> = {};
let session: { user: { id: string } } | null = null;
let signFails = false;

vi.mock('./supabase', () => {
  const table = (name: string) => {
    let op = 'select';
    const chain: Record<string, unknown> = {};
    const record = (m: string) => (...args: unknown[]) => {
      if (['insert', 'update', 'delete'].includes(m)) op = m;
      calls.push({ target: name, op: m, args });
      return chain;
    };
    for (const m of ['insert', 'select', 'eq', 'order', 'limit', 'in', 'not', 'is', 'lte', 'gt']) chain[m] = record(m);
    chain.then = (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(results[`${name}.${op}`] ?? { data: null, error: null }).then(onF, onR);
    return chain;
  };
  return {
    supabase: {
      from: vi.fn(table),
      auth: { getSession: vi.fn(async () => ({ data: { session }, error: null })) },
      storage: {
        from: vi.fn(() => ({
          createSignedUrls: vi.fn(async (paths: string[], ttl: number) => {
            calls.push({ target: 'storage', op: 'createSignedUrls', args: [paths, ttl] });
            if (signFails) return { data: null, error: { message: 'down' } };
            return { data: paths.map((p) => ({ path: p, signedUrl: `https://s/${p}`, error: null })), error: null };
          }),
          createSignedUrl: vi.fn(async (path: string, ttl: number) => {
            calls.push({ target: 'storage', op: 'createSignedUrl', args: [path, ttl] });
            return signFails ? { data: null, error: { message: 'down' } } : { data: { signedUrl: `https://s/${path}?again` }, error: null };
          }),
        })),
      },
    },
  };
});

import { fetchActiveUpdates, fetchHappening, happeningHref, reportUpdate, resignMedia, type HappeningItem } from './publicUpdates';

const NOW = new Date('2026-11-15T12:00:00.000Z').getTime();
const iso = (ms: number) => new Date(NOW + ms).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  calls.length = 0; results = {}; session = null; signFails = false;
});

const rows = [
  {
    id: 'u-long', type: 'announcement', title: 'A', body: '', cta_label: null, cta_url: null, offer_id: null,
    published_at: iso(-3_600_000), expires_at: iso(2 * 3_600_000),
    media: [{ id: 'm2', kind: 'image', alt_text: null, storage_path: 'b/u-long/2.webp', position: 1 },
      { id: 'm1', kind: 'image', alt_text: 'Front', storage_path: 'b/u-long/1.webp', position: 0 }],
  },
  {
    id: 'u-short', type: 'offer', title: 'B', body: 'x', cta_label: null, cta_url: null, offer_id: 'o',
    published_at: iso(-86_310_000), expires_at: iso(90_000),
    media: [{ id: 'm3', kind: 'video', alt_text: null, storage_path: 'b/u-short/v.mp4', position: 0 }],
  },
];

describe('fetchActiveUpdates', () => {
  it('says only that the read failed, never "none"', async () => {
    results['business_updates.select'] = { data: null, error: { message: 'down' } };
    expect(await fetchActiveUpdates('b')).toEqual({ ok: false });
  });

  it('signs each update\'s media for no longer than that update has left', async () => {
    results['business_updates.select'] = { data: rows, error: null };
    const r = await fetchActiveUpdates('b');
    expect(r.ok).toBe(true);
    const signs = calls.filter((c) => c.op === 'createSignedUrls');
    expect(signs).toContainEqual({ target: 'storage', op: 'createSignedUrls', args: [['b/u-long/1.webp', 'b/u-long/2.webp'], 600] });
    expect(signs).toContainEqual({ target: 'storage', op: 'createSignedUrls', args: [['b/u-short/v.mp4'], 90] });
    if (r.ok) {
      expect(r.value[0].media.map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(r.value[0].media[0]).toMatchObject({ alt: 'Front', url: 'https://s/b/u-long/1.webp' });
    }
  });

  it('keeps the text when photos cannot be signed', async () => {
    results['business_updates.select'] = { data: rows, error: null };
    signFails = true;
    const r = await fetchActiveUpdates('b');
    expect(r.ok && r.value[0].media[0].url).toBeNull();
    expect(r.ok && r.value[0].title).toBe('A');
  });
});

describe('resignMedia', () => {
  it('signs one file for the time left, and returns null once over', async () => {
    expect(await resignMedia('b/u/1.webp', iso(120_000))).toBe('https://s/b/u/1.webp?again');
    expect(calls.find((c) => c.op === 'createSignedUrl')?.args).toEqual(['b/u/1.webp', 120]);
    calls.length = 0;
    expect(await resignMedia('b/u/1.webp', iso(-1))).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('reportUpdate', () => {
  it('files the report without reading it back', async () => {
    session = { user: { id: 'me' } };
    const r = await reportUpdate('u-1', 'scam', '  fake prices  ');
    expect(r).toEqual({ ok: true });
    const insert = calls.find((c) => c.op === 'insert');
    expect(insert?.args[0]).toEqual({ update_id: 'u-1', reason: 'scam', detail: 'fake prices', user_id: 'me' });
    expect(calls.some((c) => c.op === 'select')).toBe(false);
  });

  it('files anonymously when signed out', async () => {
    await reportUpdate('u-1', 'spam', '');
    expect(calls.find((c) => c.op === 'insert')?.args[0]).toEqual({ update_id: 'u-1', reason: 'spam', detail: null, user_id: null });
  });

  it('explains a refusal on an ended update and a rate limit', async () => {
    results['business_update_reports.insert'] = { error: { code: '42501', message: 'new row violates row-level security policy' } };
    expect(await reportUpdate('u-1', 'spam', '')).toEqual({ ok: false, message: 'This update has ended, so it can no longer be reported.' });
    results['business_update_reports.insert'] = { error: { code: '53400', message: 'rate limit exceeded' } };
    expect(await reportUpdate('u-1', 'spam', '')).toEqual({ ok: false, message: 'Too many reports from this connection. Please try again later.' });
  });

  it('reuses a previous link that is still valid instead of signing again', async () => {
    results['business_updates.select'] = { data: rows, error: null };
    const first = await fetchActiveUpdates('b');
    calls.length = 0;
    vi.setSystemTime(NOW + 60_000);
    const second = await fetchActiveUpdates('b', first.ok ? first.value : []);
    // The long update's links are reused; the short one (30s left, under the
    // one-minute margin) is rightly signed again.
    expect(calls.filter((c) => c.op === 'createSignedUrls').map((c) => c.args[0])).toEqual([['b/u-short/v.mp4']]);
    expect(second.ok && second.value[0].media[0].url).toBe('https://s/b/u-long/1.webp');
  });
});

const biz = (id: string, username: string | null = `user-${id}`) => ({
  id, name: `Biz ${id}`, username, image_url: null, category: 'Bakery', location: 'Lekki, Lagos',
});
const hrows = [
  { ...rows[0], business: biz('b1') },
  { ...rows[1], business: biz('b2', null) },
];

describe('fetchHappening', () => {
  it('filters to listable, published businesses', async () => {
    results['business_updates.select'] = { data: hrows, error: null };
    await fetchHappening({});
    const eqs = calls.filter((c) => c.target === 'business_updates' && c.op === 'eq').map((c) => c.args);
    expect(eqs).toContainEqual(['business.is_listable', true]);
    expect(eqs).toContainEqual(['business.profile_state', 'published']);
    const select = calls.find((c) => c.target === 'business_updates' && c.op === 'select');
    expect(String(select?.args[0])).toContain('business:businesses!inner(');
  });

  it('asks for nothing when there are no businesses to ask about', async () => {
    expect(await fetchHappening({ businessIds: [] })).toEqual({ ok: true, value: [] });
    expect(calls).toHaveLength(0);
  });

  it('limits to the given businesses', async () => {
    results['business_updates.select'] = { data: hrows, error: null };
    await fetchHappening({ businessIds: ['b1', 'b2'] });
    expect(calls.find((c) => c.op === 'in')?.args).toEqual(['business_id', ['b1', 'b2']]);
  });

  it('signs only first photos: long-lived ones together, short-lived alone', async () => {
    results['business_updates.select'] = { data: hrows, error: null };
    const r = await fetchHappening({});
    const signs = calls.filter((c) => c.op === 'createSignedUrls').map((c) => c.args);
    expect(signs).toContainEqual([['b/u-long/1.webp'], 600]);
    // u-short's only media is a video: no image, so nothing to sign for the card.
    expect(signs).toHaveLength(1);
    expect(r.ok && r.value[0].thumb?.url).toBe('https://s/b/u-long/1.webp');
    expect(r.ok && r.value[1].thumb).toBeNull();
  });

  it('reuses a previous thumbnail that is still good', async () => {
    results['business_updates.select'] = { data: hrows, error: null };
    const first = await fetchHappening({});
    calls.length = 0;
    vi.setSystemTime(NOW + 60_000);
    await fetchHappening({}, first.ok ? first.value : []);
    expect(calls.filter((c) => c.op === 'createSignedUrls')).toHaveLength(0);
  });

  it('says only that the read failed', async () => {
    results['business_updates.select'] = { data: null, error: { message: 'down' } };
    expect(await fetchHappening({})).toEqual({ ok: false });
  });
});

describe('happeningHref', () => {
  const item = (username: string | null) => ({ update: { id: 'u1' }, business: { id: 'b9', username } }) as unknown as HappeningItem;
  it('uses the username when there is one, and the id route when not', () => {
    expect(happeningHref(item('mama-put'))).toBe('/mama-put?update=u1');
    expect(happeningHref(item(null))).toBe('/businesses/b9?update=u1');
  });
});

describe('only live updates, whoever is asking', () => {
  // Admins and a business's own team can read every state of its updates
  // (drafts, scheduled, ended early, hidden). The public reads must ask for
  // live ones explicitly instead of trusting RLS to have filtered them.
  const stateFilters = (target: string) => calls
    .filter((c) => c.target === target && ['not', 'is', 'lte', 'gt', 'eq'].includes(c.op))
    .map((c) => [c.op, c.args[0], c.op === 'lte' || c.op === 'gt' ? 'now' : c.args[1], ...(c.args.length > 2 ? [c.args[2]] : [])]);

  it('asks the profile strip for live updates only', async () => {
    results['business_updates.select'] = { data: [], error: null };
    await fetchActiveUpdates('b');
    const f = stateFilters('business_updates');
    expect(f).toContainEqual(['not', 'published_at', 'is', null]);
    expect(f).toContainEqual(['lte', 'published_at', 'now']);
    expect(f).toContainEqual(['gt', 'expires_at', 'now']);
    expect(f).toContainEqual(['is', 'ended_at', null]);
    expect(f).toContainEqual(['eq', 'moderation_status', 'ok']);
    const lte = calls.find((c) => c.op === 'lte');
    expect(lte?.args[1]).toBe(new Date(NOW).toISOString());
  });

  it('asks Discover and Keeps for live updates only', async () => {
    results['business_updates.select'] = { data: [], error: null };
    await fetchHappening({});
    const f = stateFilters('business_updates');
    expect(f).toContainEqual(['not', 'published_at', 'is', null]);
    expect(f).toContainEqual(['lte', 'published_at', 'now']);
    expect(f).toContainEqual(['gt', 'expires_at', 'now']);
    expect(f).toContainEqual(['is', 'ended_at', null]);
    expect(f).toContainEqual(['eq', 'moderation_status', 'ok']);
  });
});

