// Where to send someone after they sign in or register.
//
// This was written inline in Login.tsx and nowhere else, which is why Register
// dropped it: a person who arrived at /add-business, filled in three steps, hit
// Submit and chose "create an account" was returned to /login and then to the
// home page, having lost the destination that brought them. The rule is the
// same on both pages, so it lives in one place now.

/**
 * A `?next=` value, if it is safe to navigate to.
 *
 * ONLY same-site absolute paths. An absolute URL would make the sign-in page an
 * open redirect — a NowOpen link that forwards to an attacker's copy of it is a
 * credible phishing hop, and the page a user trusts most with a password is the
 * one they will follow.
 *
 * `/\/(?!\/)/` is the whole guard: it must start with a single slash, so `/x`
 * passes while `//evil.com` (protocol-relative) and `https://evil.com` do not.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!/^\/(?!\/)/.test(next)) return null;
  // A backslash is treated as a slash by some browsers when resolving URLs, so
  // `/\evil.com` can escape the origin on those. Refuse rather than normalise.
  if (next.includes('\\')) return null;
  return next;
}

/**
 * The destination after authentication, from every way it can be expressed.
 *
 * `state.from` is what ProtectedRoute sets. `?next=` is what a plain link sets,
 * because an <a href> cannot carry router state. Both have to work, and the
 * explicit parameter wins: it was put there by the page that sent the user.
 */
export function authRedirectTarget(
  search: string,
  state: { from?: { pathname?: string; search?: string } } | null | undefined,
  fallback = '/',
): string {
  const next = safeNextPath(new URLSearchParams(search).get('next'));
  if (next) return next;
  const from = state?.from;
  if (from?.pathname) return (from.pathname || '') + (from.search || '');
  return fallback;
}

/** Build a sign-in link that comes back here. */
export function signInLinkTo(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

/** Build a register link that comes back here. */
export function registerLinkTo(path: string): string {
  return `/register?next=${encodeURIComponent(path)}`;
}
