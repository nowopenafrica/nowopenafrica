import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeProps, normalizePath, shortStack, sessionId,
  track, flush, reportError, setTelemetryUser, __resetTelemetry,
} from './telemetry';

const inserted: any[] = [];

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      insert: (rows: any[]) => { inserted.push(...rows); return Promise.resolve({ error: null }); },
    }),
  },
}));

beforeEach(() => {
  inserted.length = 0;
  __resetTelemetry();
  sessionStorage.clear();
});

// The privacy boundary. If these ever pass something through, the platform is
// shipping user data to a table with public INSERT.
describe('sanitizeProps — privacy', () => {
  it('drops anything that looks sensitive, however it is spelled', () => {
    const out = sanitizeProps({
      email: 'a@b.com', userEmail: 'a@b.com', phone: '+234', phoneNumber: '+234',
      password: 'x', apiKey: 'k', access_token: 't', secret: 's',
      addressLine: 'street', businessName: 'Mama Put', customerName: 'Ada',
      lat: 6.5, lng: 3.3, dob: '1990', cardLast4: '4242',
      plan: 'growth',
    });
    expect(out).toEqual({ plan: 'growth' });
  });

  it('keeps only primitives, never nested data', () => {
    const out = sanitizeProps({
      ok: 'yes', n: 4, flag: true, nothing: null,
      nested: { a: 1 }, list: [1, 2], fn: () => {}, undef: undefined, nan: NaN,
    });
    expect(out).toEqual({ ok: 'yes', n: 4, flag: true, nothing: null });
  });

  it('caps long strings, so free text cannot be exfiltrated whole', () => {
    const out = sanitizeProps({ note: 'x'.repeat(500) });
    expect((out.note as string).length).toBe(120);
  });

  it('caps how many props are sent', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 40; i++) many[`k${i}`] = i;
    expect(Object.keys(sanitizeProps(many)).length).toBe(12);
  });

  it('returns an empty object for junk instead of throwing', () => {
    for (const bad of [null, undefined, 'str', 7, [1, 2], true]) {
      expect(sanitizeProps(bad)).toEqual({});
    }
  });
});

describe('normalizePath', () => {
  it('replaces uuids and numeric ids so rows group per page', () => {
    expect(normalizePath('/business/6e52c66a-b9ba-46a4-803a-b51b66cff317')).toBe('/business/:id');
    expect(normalizePath('/adverts/1234')).toBe('/adverts/:n');
  });

  it('leaves plain routes alone and never returns empty', () => {
    expect(normalizePath('/businesses')).toBe('/businesses');
    expect(normalizePath('')).toBe('/');
  });
});

describe('sessionId', () => {
  it('is stable within a tab', () => {
    expect(sessionId()).toBe(sessionId());
  });

  it('does not persist to localStorage — that would be a device identifier', () => {
    sessionId();
    expect(Object.keys(localStorage)).not.toContain('nowopen-telemetry-session');
    expect(sessionStorage.getItem('nowopen-telemetry-session')).toBeTruthy();
  });
});

describe('track / flush', () => {
  it('batches events and sends them together', async () => {
    track('business_viewed', { category: 'restaurant' }, 'biz-1');
    track('search_performed', { term: 'jollof' });
    expect(inserted.length).toBe(0); // still queued

    await flush();
    expect(inserted.length).toBe(2);
    expect(inserted[0]).toMatchObject({
      name: 'business_viewed',
      business_id: 'biz-1',
      props: { category: 'restaurant' },
    });
  });

  it('attributes to the signed-in user once set', async () => {
    setTelemetryUser('user-9');
    track('signin');
    await flush();
    expect(inserted[0].user_id).toBe('user-9');
  });

  it('sends a null user when signed out, rather than omitting the column', async () => {
    track('plan_viewed');
    await flush();
    expect(inserted[0].user_id).toBeNull();
  });

  it('flushing an empty queue is a no-op', async () => {
    await flush();
    expect(inserted.length).toBe(0);
  });

  it('auto-flushes a burst instead of queueing without bound', async () => {
    for (let i = 0; i < 45; i++) track('business_viewed', { i });
    // The 40th push triggers a flush synchronously.
    await Promise.resolve();
    expect(inserted.length).toBeGreaterThanOrEqual(40);
  });

  // Rule 2: telemetry must never be able to break a page.
  it('never throws, even when the transport fails', async () => {
    const mod = await import('./supabase');
    const original = (mod as any).supabase.from;
    (mod as any).supabase.from = () => ({ insert: () => Promise.reject(new Error('offline')) });
    track('signup');
    await expect(flush()).resolves.toBeUndefined();
    (mod as any).supabase.from = original;
  });
});

describe('reportError', () => {
  it('records the message and a trimmed stack, and sends immediately', async () => {
    reportError('boundary', new Error('boom'));
    await Promise.resolve();
    await flush();
    const row = inserted.find(r => r.name === 'client_error');
    expect(row).toBeTruthy();
    expect(row.props.source).toBe('boundary');
    expect(row.props.message).toBe('boom');
  });

  it('survives a non-Error being thrown', async () => {
    reportError('weird', 'just a string');
    await flush();
    const row = inserted.find(r => r.name === 'client_error');
    expect(row.props.message).toBe('just a string');
  });

  it('trims a long stack rather than storing all of it', () => {
    const stack = Array.from({ length: 50 }, (_, i) => `at frame${i}`).join('\n');
    const out = shortStack(stack);
    expect(out.split(' | ').length).toBe(4);
    expect(out.length).toBeLessThanOrEqual(600);
  });

  it('returns empty for a missing stack', () => {
    expect(shortStack(undefined)).toBe('');
  });
});
