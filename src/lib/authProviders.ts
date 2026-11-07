/**
 * Which social sign-ins this project can actually perform.
 *
 * ── WHY THIS IS A LIVE CHECK AND NOT A CONSTANT ──────────────────────────
 *
 * Enabling a provider is a Supabase dashboard action, not a code change. A
 * hardcoded list would therefore be a claim about configuration that the code
 * cannot see — and this codebase has repeatedly shipped exactly that: a
 * hardcoded `ok={false}` for email config, category chrome asserting services
 * a business never offered. A button that cannot sign anybody in is the same
 * bug wearing a different hat.
 *
 * So the button asks. It appears when the provider works and stays hidden
 * when it does not, with no deploy either way.
 *
 * ── WHAT THE SERVER ACTUALLY ANSWERS ─────────────────────────────────────
 *
 * MEASURED 2026-10-10 against this project:
 *
 *   google     302 -> accounts.google.com
 *   github     302 -> github.com
 *   facebook   400 {"msg":"Unsupported provider: provider is not enabled"}
 *   instagram  400 {"msg":"Unsupported provider: Provider instagram could not be found"}
 *
 * INSTAGRAM IS NOT A SUPABASE AUTH PROVIDER AT ALL. Supabase supports 19
 * social providers and Instagram is not among them, so "Sign in with
 * Instagram" cannot be built here however the button is labelled. An Instagram
 * business account belongs to a Facebook Page, so Facebook is the Meta-family
 * identity that an Instagram business owner actually holds — and the route
 * for them is /instagram, which finds their listing without any login.
 */

/** Providers this app knows how to start. Instagram is deliberately absent. */
export type SocialProvider = 'google' | 'github' | 'facebook';

/**
 * Read a fetch response to the authorize endpoint as enabled / not enabled.
 *
 * Split out from the request so the interpretation is testable: the browser
 * reports an enabled provider as an opaque redirect (it bounced to another
 * origin) and a disabled one as a readable 400 from Supabase itself.
 */
export function enabledFromResponse(res: { type?: string; status: number }): boolean {
  if (res.type === 'opaqueredirect') return true;
  return res.status >= 300 && res.status < 400;
}

/**
 * Does this project have `provider` configured?
 *
 * Returns FALSE on any network failure. Hiding a button we could not verify is
 * the safe direction: the cost is a sign-in option that is missing for a
 * moment, against an option that fails in front of somebody trying to log in.
 */
export async function providerEnabled(
  supabaseUrl: string,
  provider: SocialProvider,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!supabaseUrl) return false;
  try {
    const res = await fetchImpl(
      `${supabaseUrl.replace(/\/$/, '')}/auth/v1/authorize?provider=${encodeURIComponent(provider)}`,
      { redirect: 'manual' },
    );
    return enabledFromResponse(res as { type?: string; status: number });
  } catch {
    return false;
  }
}
