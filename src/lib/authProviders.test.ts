/**
 * Only offering a sign-in that can actually sign somebody in.
 *
 * The assertions that matter are the ones about failing CLOSED. A button that
 * appears because a probe timed out is worse than no button: it fails in front
 * of somebody trying to log in, which is the moment they leave.
 */

import { describe, it, expect, vi } from 'vitest';

import { enabledFromResponse, providerEnabled } from './authProviders';

const URL_BASE = 'https://project.supabase.co';

describe('reading the authorize endpoint', () => {
  it('treats an opaque redirect as enabled', () => {
    /*
     * MEASURED: an enabled provider answers 302 to its own domain, which the
     * browser surfaces as { type: 'opaqueredirect', status: 0 } because the
     * response came from another origin.
     */
    expect(enabledFromResponse({ type: 'opaqueredirect', status: 0 })).toBe(true);
  });

  it('treats a readable 400 as not enabled', () => {
    // Supabase answers its own 400 for a provider it will not start:
    // {"msg":"Unsupported provider: provider is not enabled"}
    expect(enabledFromResponse({ type: 'cors', status: 400 })).toBe(false);
  });

  it('accepts a plain 3xx, for a client that exposes the redirect', () => {
    expect(enabledFromResponse({ status: 302 })).toBe(true);
    expect(enabledFromResponse({ status: 303 })).toBe(true);
  });

  it('does not read a server error as working', () => {
    for (const status of [0, 200, 401, 404, 429, 500, 502]) {
      expect(enabledFromResponse({ type: 'cors', status }), String(status)).toBe(false);
    }
  });
});

describe('it fails closed', () => {
  it('reports not-enabled when the request throws', async () => {
    /*
     * THE ONE THAT MATTERS. A network blip must not light up a button that
     * then fails in front of somebody trying to sign in.
     */
    const boom = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await providerEnabled(URL_BASE, 'facebook', boom as unknown as typeof fetch)).toBe(false);
  });

  it('reports not-enabled without a project URL, rather than guessing', async () => {
    const never = vi.fn();
    expect(await providerEnabled('', 'facebook', never as unknown as typeof fetch)).toBe(false);
    expect(never).not.toHaveBeenCalled();
  });
});

describe('the request it makes', () => {
  it('asks the authorize endpoint for that provider, without following the redirect', async () => {
    const f = vi.fn().mockResolvedValue({ type: 'opaqueredirect', status: 0 });
    await providerEnabled(URL_BASE, 'facebook', f as unknown as typeof fetch);

    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`${URL_BASE}/auth/v1/authorize?provider=facebook`);
    /*
     * `redirect: 'manual'` is what makes the answer readable. Following it
     * would land on the provider's own page and tell us nothing.
     */
    expect(init).toMatchObject({ redirect: 'manual' });
  });

  it('does not double the slash on a trailing-slash project URL', async () => {
    const f = vi.fn().mockResolvedValue({ type: 'cors', status: 400 });
    await providerEnabled(`${URL_BASE}/`, 'google', f as unknown as typeof fetch);
    expect(f.mock.calls[0][0]).toBe(`${URL_BASE}/auth/v1/authorize?provider=google`);
  });
});
