/**
 * robots.txt parsing for the official-website adapter.
 *
 * The registry row promises a robots-respecting, single-page-per-domain
 * adapter, so before any page is fetched the domain's crawl instruction is
 * read and applied. This is the subset of RFC 9309 the adapter needs:
 *
 *   - matching groups by our User-Agent, falling back to the `*` group;
 *   - within the chosen group, the rule whose path-pattern matches the URL
 *     path with the LONGEST match wins; equal length goes to allow;
 *   - patterns support only `*` and a trailing `$` (the RFC's glob).
 *
 * Everything else in the file (Crawl-delay, Sitemap) is ignored on purpose:
 * the worker already self-limits to one fetch per domain, which is a stronger
 * "delay" than the file could ask for.
 *
 * An absent robots file means no instruction — crawling is permitted (the
 * content of the business's own site is still governed by the radar_sources
 * rights row, which is a separate gate from robots.txt and stays the one that
 * actually authorises anything).
 */

export interface RobotsVerdict {
  allow: boolean;
  /** The rule text that decided the verdict, for telemetry. */
  matchedRule: string | null;
  /** Where the verdict came from: 'specific', 'star' or 'none'. */
  group: 'specific' | 'star' | 'none';
}

interface Rule {
  kind: 'allow' | 'disallow';
  /** The raw pattern from the file. */
  pattern: string;
  re: RegExp;
  /** Pattern length used for longest-match precedence. */
  len: number;
}

interface RobotsGroup {
  agents: string[];
  rules: Rule[];
}

/** Parse a robots.txt body into groups (public for the engine's own tests). */
export function parseRobots(raw: string | null | undefined): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  /*
   * Whether the previous significant line was also a user-agent.
   *
   * RFC 9309 §2.2.1: consecutive user-agent lines form ONE group, and the
   * rules that follow apply to every agent named in it.
   *
   * MEASURED AGAINST google.com/robots.txt, 2026-09-15 — its first four lines:
   *
   *     User-agent: *
   *     User-agent: Yandex
   *     Disallow: /search
   *     Allow: /search/about
   *
   * Without this flag the parser opened a second group on the Yandex line and
   * attached every rule to it, leaving `*` with an empty rule list. So
   * robotsAllowUrl found a star group, found no rules in it, and returned
   * `allow: true` for /search — a path Google explicitly disallows.
   *
   * Grouping agents this way is common on large sites, so this was not an
   * exotic edge case: it silently disabled robots.txt on exactly the sites
   * most likely to have considered their rules carefully.
   */
  let lastLineWasAgent = false;

  for (const lineRaw of String(raw ?? '').split(/\r?\n/)) {
    const line = lineRaw.split('#')[0].trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (current && lastLineWasAgent) {
        // Same group, another name for it.
        if (!current.agents.some((a) => a.toLowerCase() === value.toLowerCase())) {
          current.agents.push(value);
        }
        continue;
      }

      const existing = groups.find((g) =>
        g.agents.some((a) => a.toLowerCase() === value.toLowerCase()));
      if (existing) {
        current = existing;
        lastLineWasAgent = true;
        continue;
      }
      const g: RobotsGroup = { agents: [value], rules: [] };
      groups.push(g);
      current = g;
      lastLineWasAgent = true;
      continue;
    }

    // Any other field ends the run of user-agent lines, so the next one starts
    // a new group. Sitemap and Crawl-delay count here too, per the RFC.
    lastLineWasAgent = false;

    if (current && (field === 'allow' || field === 'disallow')) {
      // A disallow with no value ("Disallow: ") means no restriction.
      if (value === '' && field === 'disallow') {
        current.rules.push({ kind: 'allow', pattern: '', re: /^$/, len: 0 });
        continue;
      }
      current.rules.push({
        kind: field,
        pattern: value,
        re: globToPathPattern(value),
        len: value.length,
      });
    }
  }

  return groups;
}

/**
 * `*` → any run, trailing `$` → end anchor; everything else literal.
 *
 * ONE DELIBERATE DEVIATION FROM RFC 9309: an anchored directory pattern like
 * `Disallow: /forum/$` also matches `/forum`.
 *
 * Strictly the RFC compares literal strings, so `/forum` is a different path
 * and would be allowed. But a site that anchors `/forum/$` is excluding its
 * forum index, and `/forum` is that same resource one redirect away. The
 * choice is between fetching a page the operator meant to exclude and
 * skipping a page they may not have meant to exclude — and for a compliance
 * gate the second error is the one to prefer. Made explicit here rather than
 * emerging from a normalisation somewhere else, which is where it used to
 * live.
 */
function globToPathPattern(pattern: string): RegExp {
  let out = '^';
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;

  for (const ch of body) {
    if (ch === '*') out += '.*';
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // `/forum/` anchored also covers `/forum`: the final slash becomes optional.
  if (anchored) out += body.endsWith('/') ? '?$' : '$';

  return new RegExp(out);
}

/**
 * The path a rule is compared against (robots.txt only ever sees the path).
 *
 * IT IS CALLED WITH AN ABSOLUTE URL, and that was the bug. The guard is used
 * as `robotsAllowUrl(txt, 'https://example.com/admin', ua)`, and this function
 * opened with `if (!trimmed.startsWith('/')) return '/'`. An absolute URL does
 * not start with a slash, so EVERY target collapsed to the root path, no
 * `Disallow: /admin` rule could ever match, and the gate answered "allowed"
 * for everything.
 *
 * A compliance gate that fails open is worse than no gate, because it reports
 * that a fetch was checked and permitted. Six of its own tests said so; they
 * were invisible because a stray file at the repo root broke lint, and
 * `npm run verify` stops at lint before it ever reaches the tests.
 *
 * RFC 9309 compares against path AND query, so the query is kept: a
 * `Disallow: /search?` rule has to match `/search?q=x`.
 */
function pathOf(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return '/';

  try {
    const u = trimmed.startsWith('/')
      ? new URL('https://x' + trimmed)   // already a path
      : new URL(trimmed);                // absolute URL
    return (u.pathname || '/') + (u.search || '');
  } catch {
    /*
     * Unparseable. Treated as the root rather than as "unknown, therefore
     * allowed" — a target we cannot read is not evidence of permission.
     */
    return '/';
  }
}

/**
 * Can our UA fetch this path? `ua` is the exact user-agent token we send (the
 * adapter uses a single descriptive product token, so exact match is honest).
 */
export function robotsAllowUrl(
  raw: string | null | undefined,
  targetUrl: string,
  ua: string,
): RobotsVerdict {
  const groups = parseRobots(raw);
  const path = pathOf(targetUrl);

  const agent = ua.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a.toLowerCase() === agent));
  const star = groups.find((g) => g.agents.some((a) => a === '*'));

  const group = specific ?? star;
  if (!group || group.rules.length === 0) {
    return { allow: true, matchedRule: null, group: specific ? 'specific' : star ? 'star' : 'none' };
  }

  const matches = group.rules
    .map((r) => ({ rule: r, matched: r.re.test(path) }))
    .filter((m) => m.matched)
    .sort((a, b) => b.rule.len - a.rule.len || (a.rule.kind === 'allow' ? -1 : 1));

  const best = matches[0];
  if (!best) return { allow: true, matchedRule: null, group: specific ? 'specific' : 'star' };

  const allow = best.rule.kind === 'allow';
  return {
    allow,
    matchedRule: `${best.rule.kind}:${best.rule.pattern}`,
    group: specific ? 'specific' : 'star',
  };
}