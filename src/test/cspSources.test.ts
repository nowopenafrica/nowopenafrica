import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Every source in the Content-Security-Policy has to be syntactically valid,
 * or the browser silently discards it.
 *
 * Measured on production: every page load logged six console errors —
 *
 *     The source list for the Content Security Policy directive 'connect-src'
 *     contains an invalid source: 'stun:stun.l.google.com:19302'.
 *     It will be ignored.
 *
 * `connect-src` carried `stun:stun.l.google.com:19302` and its sibling. A CSP
 * scheme-source is a scheme and a colon and nothing else; `stun:` with a host
 * and port is not one, so BOTH entries were thrown away. The policy that
 * actually shipped had no STUN allowance at all — the opposite of what the
 * line was written to express.
 *
 * It broke nothing today, because current browsers do not gate WebRTC ICE on
 * connect-src. But it was noise on every page load in every visitor's console,
 * which is exactly where a real error needs to be visible, and it left the
 * policy saying something different from what its author intended.
 *
 * The fix narrows it to `stun:` — a valid scheme-source that keeps the intent.
 * NowOpen Live genuinely uses those servers (see src/lib/liveStream.ts), so
 * deleting the allowance rather than repairing it would have been the wrong
 * correction.
 */

const csp = (() => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const header = config.headers
    ?.flatMap((h: any) => h.headers ?? [])
    .find((h: any) => h.key === 'Content-Security-Policy');
  return String(header?.value ?? '');
})();

/** Split "directive a b c; directive2 d" into its source lists. */
function directives(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (name) out[name] = sources;
  }
  return out;
}

/**
 * The subset of the CSP source grammar this policy uses.
 *
 * scheme-source  scheme ":"                        e.g. `data:` `blob:` `stun:`
 * host-source    [scheme "://"] host [":" port] [path]
 * keyword-source `'self'` and friends, quoted
 */
const KEYWORD = /^'(self|none|unsafe-inline|unsafe-eval|strict-dynamic|report-sample|wasm-unsafe-eval)'$/;
const SCHEME_SOURCE = /^[a-z][a-z0-9+\-.]*:$/i;
const HOST_SOURCE = /^([a-z][a-z0-9+\-.]*:\/\/)?(\*\.)?[a-z0-9\-.]+(:\d+|:\*)?(\/[^\s]*)?$/i;
const HASH_OR_NONCE = /^'(sha(256|384|512)-[A-Za-z0-9+/=]+|nonce-[A-Za-z0-9+/=]+)'$/;

describe('the CSP does not contain sources the browser will discard', () => {
  const all = directives();

  for (const [name, sources] of Object.entries(all)) {
    if (!sources.length) continue;

    it(`${name} has only valid sources`, () => {
      const invalid = sources.filter(
        (s) =>
          !KEYWORD.test(s) &&
          !HASH_OR_NONCE.test(s) &&
          !SCHEME_SOURCE.test(s) &&
          !HOST_SOURCE.test(s),
      );
      expect(invalid, `${name} would silently drop these`).toEqual([]);
    });
  }

  it('does not reintroduce a scheme-source with a host and port', () => {
    /*
     * The exact shape of the original defect: `stun:` followed by a host.
     * The generic check above catches it, but naming it means a future
     * reader sees WHY the rule exists rather than only that it does.
     */
    expect(csp).not.toMatch(/\bstun:[^\s;]+/);
    expect(csp).not.toMatch(/\bturns?:[^\s;]+/);
  });
});

describe('the STUN allowance still expresses its intent', () => {
  it('keeps a stun: scheme-source, because NowOpen Live uses one', () => {
    /*
     * Repaired rather than deleted. The live-stream mesh really does rely on
     * Google's public STUN servers to discover peers, so a policy that says
     * nothing about STUN would be wrong in a different way — and would break
     * if a browser ever did start gating ICE on connect-src.
     */
    expect(directives()['connect-src']).toContain('stun:');

    const live = readFileSync('src/lib/liveStream.ts', 'utf8');
    expect(live).toMatch(/stun:stun\.l\.google\.com:19302/);
  });
});
