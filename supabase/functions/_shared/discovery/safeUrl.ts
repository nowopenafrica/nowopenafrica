/**
 * Is this URL safe for the server to fetch?
 *
 * Ported verbatim from src/lib/acquire/safeUrl.ts because the discovery worker
 * fetches URLs that came from somewhere else — a campaign's candidate pool, a
 * source listing. The browser engine and the worker must agree on what is
 * fetchable, or the same candidate would be treated differently in each.
 *
 * Every fetchable URL in the official-website adapter passes through
 * `checkFetchUrl` before the first byte leaves the server.
 *
 * WHAT THIS CANNOT DO ALONE
 *
 * It is synchronous and hostname-based, so it cannot see a hostname that
 * resolves to an internal address (DNS rebinding) and cannot follow redirects.
 * Both are handled at the fetch boundary in the worker: manual redirects are
 * re-checked hop by hop; literal private/loopback/metadata addresses and
 * internal names are refused here. The worker does not re-resolve DNS — noted
 * in the adapter's header as the one remaining gap, rather than pretending it
 * is closed.
 */

const ALLOWED_SCHEME = new Set(['http:', 'https:']);

/**
 * Ports we will connect to. An allowlist, because SSRF is often port-scanning
 * by proxy: `:6379` probes Redis, `:9200` Elasticsearch, `:5432` Postgres.
 */
const ALLOWED_PORT = new Set(['', '80', '443', '8080', '8443']);

export type UrlRejection =
  | 'not_a_url' | 'scheme' | 'port' | 'credentials'
  | 'private_ip' | 'loopback' | 'link_local' | 'metadata'
  | 'internal_name' | 'no_public_suffix' | 'blocked_host';

export interface UrlVerdict {
  safe: boolean;
  /** The normalised URL, only when safe. */
  url: string | null;
  reason: UrlRejection | null;
  /** Human wording, for an operator looking at a rejected candidate. */
  detail: string;
}

/** Decimal-dotted IPv4, or null. */
function asIPv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

/**
 * Ranges that must never be fetched. Not only RFC1918 — the range that gets
 * exploited is 169.254.169.254 (cloud metadata, instance credentials).
 */
function ipv4Rejection(parts: number[]): UrlRejection | null {
  const [a, b] = parts;
  if (a === 127 || a === 0) return 'loopback';
  if (a === 169 && b === 254) return 'metadata';
  if (a === 10) return 'private_ip';
  if (a === 172 && b >= 16 && b <= 31) return 'private_ip';
  if (a === 192 && b === 168) return 'private_ip';
  if (a === 100 && b >= 64 && b <= 127) return 'private_ip';
  if (a === 192 && b === 0) return 'private_ip';
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return 'private_ip';
  if (a === 203 && b === 0) return 'private_ip';
  if (a >= 224) return 'private_ip';
  return null;
}

/** IPv6 forms that must never be fetched. */
function ipv6Rejection(host: string): UrlRejection | null {
  const inner = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!inner.includes(':')) return null;

  if (inner === '::1' || inner === '::') return 'loopback';
  if (inner.startsWith('fe80')) return 'link_local';
  if (/^f[cd]/.test(inner)) return 'private_ip';

  /*
   * IPv4-mapped addresses smuggle a v4 address through a v6 host. Two forms,
   * and only one is obvious: `::ffff:127.0.0.1` is what an attacker types;
   * `new URL()` NORMALISES it to the hex form `::ffff:7f00:1`, so a
   * decimal-only regex never matches what actually arrives.
   */
  const dotted = /::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(inner);
  if (dotted) {
    const parts = asIPv4(dotted[1]);
    return parts ? (ipv4Rejection(parts) ?? null) : 'private_ip';
  }

  const hex = /::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(inner);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    const parts = [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
    return ipv4Rejection(parts) ?? null;
  }

  return 'private_ip';
}

/**
 * Internal by name rather than by address. `metadata.google.internal` needs
 * no IP literal at all.
 */
const INTERNAL_NAME =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.intranet|.*\.lan|.*\.home|.*\.corp|metadata|instance-data.*|kubernetes.*|.*\.svc|.*\.svc\.cluster\.local)$/i;

const BLOCKED_HOST = /^(169\.254\.169\.254|169\.254\.170\.2|metadata\.googleapis\.com)$/i;

const DETAIL: Record<UrlRejection, string> = {
  not_a_url: 'That is not a URL the server can parse.',
  scheme: 'Only http and https are fetched.',
  port: 'That port is not one a business website is served from; fetching it would be a port scan.',
  credentials: 'A URL carrying a username or password is refused — no public page is served that way.',
  private_ip: 'That address is on a private network the server can reach and the public cannot.',
  loopback: 'That address is the server itself.',
  link_local: 'That is a link-local address.',
  metadata: 'That is a cloud metadata endpoint. Fetching it would expose instance credentials.',
  internal_name: 'That hostname resolves inside our own network.',
  no_public_suffix: 'That hostname has no public domain, so it cannot be a business website.',
  blocked_host: 'That host is refused outright.',
};

/**
 * Check a URL before fetching it. Returns the reason rather than a boolean,
 * so a rejected candidate can say why in the review queue.
 */
export function checkFetchUrl(raw: string | null | undefined): UrlVerdict {
  const s = String(raw ?? '').trim();
  const no = (reason: UrlRejection): UrlVerdict =>
    ({ safe: false, url: null, reason, detail: DETAIL[reason] });

  if (!s) return no('not_a_url');

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return no('not_a_url');
  }

  if (!ALLOWED_SCHEME.has(u.protocol)) return no('scheme');

  if (u.username || u.password) return no('credentials');
  if (!ALLOWED_PORT.has(u.port)) return no('port');

  const host = u.hostname.toLowerCase();
  if (INTERNAL_NAME.test(host)) return no('internal_name');

  /*
   * The literal-address denylist is checked AFTER the address classifiers
   * below, not before them.
   *
   * Both refuse `169.254.169.254`, so the URL was never fetchable either way —
   * but the blunt denylist answered `blocked_host` where the classifier
   * answers `metadata`, and the reason is the whole point of returning one.
   * An operator reading "that host is refused outright" in a review queue
   * learns nothing; "that is a cloud metadata endpoint, fetching it would
   * expose instance credentials" tells them what somebody just tried to make
   * the fetcher do.
   *
   * BLOCKED_HOST still catches the NAMED endpoints (metadata.googleapis.com),
   * which are not IP literals and so fall through the classifiers untouched.
   */

  /*
   * IPv6 is decided entirely here and then returns. It must not fall through
   * to the hostname checks below: `[::ffff:808:808]` is the public address
   * 8.8.8.8, and a bracketed host contains no dot.
   */
  if (u.hostname.startsWith('[')) {
    const v6 = ipv6Rejection(u.hostname);
    return v6 ? no(v6) : { safe: true, url: u.toString(), reason: null, detail: '' };
  }

  const v4 = asIPv4(host);
  if (v4) {
    const bad = ipv4Rejection(v4);
    if (bad) return no(bad);
    return { safe: true, url: u.toString(), reason: null, detail: '' };
  }

  // Named endpoints that are not IP literals, so no classifier saw them.
  if (BLOCKED_HOST.test(host)) return no('blocked_host');

  // A name with no dot is internal or a search term. Resolving it would depend
  // on the server's search domains — which is how an internal host gets
  // reached without ever being named.
  if (!host.includes('.') || host.endsWith('.')) return no('no_public_suffix');

  return { safe: true, url: u.toString(), reason: null, detail: '' };
}

/**
 * The contract a fetching caller MUST honour. Stated explicitly because this
 * module cannot enforce it.
 */
export const FETCH_CONTRACT = {
  resolveAndRecheck: true,
  manualRedirects: true,
  maxRedirects: 3,
  /** A slow endpoint is a denial-of-service against our own workers. */
  timeoutMs: 10_000,
  /** A hostile page can be arbitrarily large. */
  maxBytes: 2_000_000,
  acceptTypes: ['text/html', 'application/xhtml+xml', 'application/json', 'application/ld+json'],
} as const;

/** Throw unless safe. Prefer `checkFetchUrl` wherever the reason can be shown. */
export function assertSafeToFetch(raw: string | null | undefined): string {
  const v = checkFetchUrl(raw);
  if (!v.safe || !v.url) {
    throw new Error(`Refused to fetch: ${v.reason ?? 'unknown'} — ${v.detail}`);
  }
  return v.url;
}