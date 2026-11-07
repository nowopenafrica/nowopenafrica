import { describe, it, expect, vi, afterEach } from 'vitest';
import { PROVIDERS, type ProviderKey } from './social.ts';

/**
 * Every provider's `refresh` must accept the CONNECTION, not a bare token.
 *
 * THE DEFECT, FOUND 2026-09-15 BY TYPECHECKING supabase/functions FOR THE
 * FIRST TIME
 *
 * publishJob.ts has always called:
 *
 *     provider.refresh({ accessToken, refreshToken, expiresAt })
 *
 * and the Provider interface has always declared that shape. But
 * linkedinRefresh, xRefresh and tiktokRefresh were each written as
 * `(refreshToken: string)`. Three plain type errors, and nothing ran a
 * typechecker over this directory — tsconfig.app.json covers `src`,
 * tsconfig.server.json covers `api`, and Supabase deploys with esbuild, which
 * strips types rather than checking them.
 *
 * At runtime those three interpolated the object into a form body, so the POST
 * carried `refresh_token=[object Object]`. The provider rejected it, `refresh`
 * threw, and publishJob caught the exception and returned the stale access
 * token — so LinkedIn, X and TikTok publishing would begin failing silently
 * once a token passed its expiry, with the cause swallowed.
 *
 * Meta was correct throughout: metaRefresh reads `conn.accessToken`.
 */

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; vi.unstubAllEnvs(); });

/** Capture what each provider actually puts on the wire. */
function captureFetch() {
  const seen: { url: string; body: string }[] = [];
  globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === 'string'
      ? init.body
      : init?.body instanceof URLSearchParams ? init.body.toString() : '';
    seen.push({ url: String(input), body });
    // Enough of a token response to get past the success check.
    return {
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }),
      text: async () => '{}',
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return seen;
}

/** The exact object publishJob.ts passes. */
const CONNECTION = {
  accessToken: 'stored-access-token',
  refreshToken: 'stored-refresh-token',
  expiresAt: new Date('2026-10-01T00:00:00Z'),
};

const TOKEN_REFRESHERS: ProviderKey[] = ['linkedin', 'x', 'tiktok'];

describe('refresh takes the connection object', () => {
  it.each(TOKEN_REFRESHERS)('%s sends the real refresh token, not an object', async (key) => {
    vi.stubEnv('LINKEDIN_CLIENT_ID', 'id');
    vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'secret');
    vi.stubEnv('X_CLIENT_ID', 'id');
    vi.stubEnv('X_CLIENT_SECRET', 'secret');
    vi.stubEnv('TIKTOK_CLIENT_KEY', 'key');
    vi.stubEnv('TIKTOK_CLIENT_SECRET', 'secret');

    const seen = captureFetch();
    try {
      await PROVIDERS[key].refresh(CONNECTION);
    } catch {
      // Configuration may be absent in this environment; the assertion below
      // only cares about what was sent IF a request went out.
    }
    for (const call of seen) {
      // The exact string the bug produced.
      expect(call.body, `${key} body`).not.toContain('[object Object]');
      if (call.body.includes('refresh_token')) {
        expect(call.body, `${key} body`).toContain('stored-refresh-token');
      }
    }
  });

  it.each(TOKEN_REFRESHERS)('%s refuses a connection with no refresh token', async (key) => {
    // Better than posting "undefined" and reporting whatever the provider says.
    await expect(PROVIDERS[key].refresh({ accessToken: 'a' }))
      .rejects.toThrow(/refresh token/i);
  });
});

describe('the registry is complete and consistent', () => {
  it('every provider exposes the same surface', () => {
    for (const [key, p] of Object.entries(PROVIDERS)) {
      expect(p.key, key).toBe(key);
      expect(typeof p.refresh, key).toBe('function');
      expect(typeof p.publish, key).toBe('function');
      expect(typeof p.configured, key).toBe('function');
      // One argument: the connection. A two-arg or zero-arg refresh would mean
      // the contract has drifted again.
      expect(p.refresh.length, `${key} refresh arity`).toBe(1);
    }
  });
});
