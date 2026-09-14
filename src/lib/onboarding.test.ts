import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { invokeSendOnboarding } from './onboarding';
import { supabase } from './supabase';

type SessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;

const headersOf = (init: RequestInit | undefined): Record<string, string> =>
  (init?.headers as Record<string, string>) ?? {};

describe('invokeSendOnboarding', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'admin-jwt' } },
      error: null,
    } as SessionResult);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends only the session JWT — never the apikey header that trips the gateway', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, status: 'sent' }), { status: 200 }));

    const { data, error } = await invokeSendOnboarding({
      mode: 'manual',
      businessName: "Ada's Kitchen",
      phone: '0803 000 0001',
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, status: 'sent' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/functions/v1/send-onboarding');
    const headers = headersOf(init);
    expect(headers).not.toHaveProperty('apikey');
    expect(headers).not.toHaveProperty('Apikey');
    expect(headers.Authorization).toBe('Bearer admin-jwt');
    expect(JSON.parse(String(init?.body))).toMatchObject({ mode: 'manual' });
  });

  it('turns a network failure into an honest message instead of the raw SDK error', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

    const { data, error } = await invokeSendOnboarding({ mode: 'preview' });

    expect(data).toBeNull();
    expect(error).toContain('could not be reached');
    expect(error).not.toContain('Failed to send a request to the Edge Function');
  });

  it('reports the gateway/function message on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: false, message: 'Unauthorized' }), { status: 401 }),
    );

    const { data, error } = await invokeSendOnboarding({ mode: 'preview' });

    expect(data).toBeNull();
    expect(error).toBe('Unauthorized');
  });

  it('falls back to the anon key when no session is present', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: null,
    } as SessionResult);
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, mode: 'preview', text: 'x' }), { status: 200 }));

    await invokeSendOnboarding({ mode: 'preview' });

    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(headersOf(init).Authorization).toBe(`Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`);
  });
});