import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { isStaleChunkError } from '../lib/lazyRoute';
import { shouldReport } from '../lib/telemetry';
import { shouldRenderProfile } from '../../middleware';

/**
 * Phase 1 — production integrity.
 *
 * Four defects that were live on production, each verified before the fix and
 * each locked here. They have one thing in common: every one of them was
 * invisible from inside the app. The site looked fine, the tests passed, and
 * the damage showed up only in the production database.
 */

const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const auth = stripComments(readFileSync('src/contexts/AuthContext.tsx', 'utf8'));
const app = stripComments(readFileSync('src/App.tsx', 'utf8'));
const configurator = stripComments(
  readFileSync('src/components/create/CreateConfigurator.tsx', 'utf8'),
);

// ─────────────────────────────────────────────────────────────────────────────

describe('demo profiles can no longer be indexed', () => {
  /*
   * The worst SEO hole on the site, and the audit had marked it UNVERIFIED.
   * Measured on production before the fix:
   *
   *   curl -A Googlebot https://www.nowopenafrica.com/business/lagos-prime-realty
   *     → robots = index, follow, max-image-preview:large
   *
   * All 45 curated demo profiles were indexable, for a directory with two real
   * businesses. BusinessDetail sets robots: 'noindex, nofollow' — but it does
   * that CLIENT-side, and /business/<slug> was not server-rendered, so a
   * crawler never saw it.
   */
  it('routes /business/<slug> through the profile renderer', () => {
    expect(shouldRenderProfile('/business/lagos-prime-realty', 'Googlebot/2.1'))
      .toBe('lagos-prime-realty');
  });

  it('still routes the id-addressed form', () => {
    expect(shouldRenderProfile('/businesses/some-uuid', 'Googlebot/2.1')).toBe('some-uuid');
  });

  it('still routes a bare username', () => {
    expect(shouldRenderProfile('/yemzoarts', 'Googlebot/2.1')).toBe('yemzoarts');
  });

  it('leaves real humans to the SPA', () => {
    // The renderer is for crawlers only; a person gets the app.
    expect(shouldRenderProfile('/business/lagos-prime-realty', 'Mozilla/5.0')).toBeNull();
  });

  it('does not mistake the directory index for a business', () => {
    expect(shouldRenderProfile('/businesses', 'Googlebot/2.1')).toBeNull();
    expect(shouldRenderProfile('/platform', 'Googlebot/2.1')).toBeNull();
  });

  it('does not swallow the discovery landing pages', () => {
    // /businesses/in/lagos is 3 segments and belongs to shouldRenderDiscovery.
    expect(shouldRenderProfile('/businesses/in/lagos', 'Googlebot/2.1')).toBeNull();
    expect(shouldRenderProfile('/businesses/restaurant/in/lagos', 'Googlebot/2.1')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('development stops writing to the production table', () => {
  /*
   * Production `client_error` rows carried stack traces reading
   *   at Discover (http://localhost:5175/src/pages/Discover.tsx…)
   * for ReferenceErrors — placeInput, useEffect, PRIMARY_NAV, fromUrl,
   * capabilityFrom — all development typos, unreachable in production and
   * already fixed. Real incidents were buried underneath them.
   */
  it('reports from the real host', () => {
    expect(shouldReport('www.nowopenafrica.com')).toBe(true);
    expect(shouldReport('nowopenafrica.com')).toBe(true);
    expect(shouldReport('nowopenafrica-abc123.vercel.app')).toBe(true);
  });

  it('stays silent on a development host', () => {
    for (const host of ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', 'macbook.local']) {
      expect(shouldReport(host), host).toBe(false);
    }
  });

  it('stays silent when there is no host at all', () => {
    // SSR, a worker, a test runner — none of which should be emitting events.
    expect(shouldReport('')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('signin means somebody signed in', () => {
  /*
   * Measured on production: 42,910 `signin` events across 64 sessions — about
   * 670 each, and 99.4% of every row in the telemetry table. The event was
   * emitted for every SIGNED_IN callback, and Supabase raises that for a
   * restored session and for a tab regaining focus, not only for an actual
   * authentication.
   */
  it('requires a transition from nobody to somebody, after the first event', () => {
    expect(auth).toContain("event === 'SIGNED_IN' &&");
    expect(auth).toContain('seenFirstAuthEvent.current &&');
    expect(auth).toContain('!previousUserId.current &&');
  });

  it('records the previous user so the transition can be seen', () => {
    expect(auth).toMatch(/previousUserId\.current = userId;/);
    expect(auth).toMatch(/seenFirstAuthEvent\.current = true;/);
  });

  it('no longer fires on a bare SIGNED_IN', () => {
    // The exact line that produced 42,910 events.
    expect(auth).not.toMatch(/if \(event === 'SIGNED_IN'\) track\('signin'\);/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('a deploy no longer breaks an open session', () => {
  /*
   * Two production failures, one cause:
   *   Failed to fetch dynamically imported module: .../BusinessDetail-*.js
   *   'text/html' is not a valid JavaScript MIME type.
   * A browser holding a pre-deploy index.html asks for a content-hashed chunk
   * the new build does not have; the SPA fallback answers with index.html,
   * which the browser refuses as JavaScript.
   */
  it('recognises the stale-chunk signatures seen in production', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/assets/BusinessDetail-D6o_2ziK.js',
      "'text/html' is not a valid JavaScript MIME type.",
      'error loading dynamically imported module',
      'Importing a module script failed.',
    ]) {
      expect(isStaleChunkError(new Error(message)), message).toBe(true);
    }
  });

  it('does not swallow a genuine bug in the component', () => {
    /*
     * The important negative. A component that throws while evaluating is a
     * real defect and must reach the error boundary — reloading the page over
     * it would hide the bug and loop the user through it.
     */
    for (const message of [
      'x is not a function',
      "Cannot read properties of undefined (reading 'map')",
      'ReferenceError: PRIMARY_NAV is not defined',
    ]) {
      expect(isStaleChunkError(new Error(message)), message).toBe(false);
    }
  });

  it('applies to every lazy route, not a hand-picked few', () => {
    // 40 routes were wrapped; a bare lazy() would silently opt one out.
    expect(app).not.toMatch(/[^e]lazy\(\(\) => import\(/);
    expect((app.match(/lazyRoute\(\(\) => import\(/g) ?? []).length).toBeGreaterThanOrEqual(40);
  });

  it('can only ever reload once', () => {
    // A reload loop is far worse than an error screen.
    const src = readFileSync('src/lib/lazyRoute.ts', 'utf8');
    expect(src).toContain('reloadAlreadyAttempted()');
    expect(src).toContain('markReloadAttempted()');
    expect(src).toMatch(/sessionStorage/);
  });

  it('does not reload while offline', () => {
    // Nothing to fetch — a reload would turn a recoverable error into a blank
    // page, on exactly the flaky connections this audience uses.
    expect(readFileSync('src/lib/lazyRoute.ts', 'utf8')).toContain('!isOffline()');
  });
});

describe('lazyRoute storage guard fails closed', () => {
  const original = globalThis.sessionStorage;
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('storage disabled'); },
    });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true, writable: true, value: original,
    });
  });

  it('treats unavailable storage as "reload already spent"', async () => {
    // Private mode or blocked site data: we cannot detect a loop, so we must
    // not start one.
    const { reloadAlreadyAttempted } = await import('../lib/lazyRoute');
    expect(reloadAlreadyAttempted()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('an order is only reported once it has persisted', () => {
  /*
   * The audit flagged `create_orders` = 0 rows against 3 recorded order
   * events, and suspected a silently failing write. Tracing it showed the code
   * is correct — so this test pins the properties that make it correct, rather
   * than "fixing" something that works.
   *
   * The real cause was environmental: development and production share one
   * Supabase project, so the events came from localhost and the rows were
   * later cleaned up by hand. See the remediation report.
   */
  it('does not chain .select() onto the insert', () => {
    // The trap this codebase has hit before: on a table the public may only
    // insert into, asking for the row back makes RLS refuse the whole
    // statement — and the error blames the insert.
    expect(configurator).toMatch(/from\('create_orders'\)\s*\.insert\(/);
    expect(configurator).not.toMatch(/from\('create_orders'\)[\s\S]{0,400}\.select\(/);
  });

  it('aborts before claiming success when the insert fails', () => {
    expect(configurator).toMatch(/if \(error\) \{[^}]*setBusy\(false\)[^}]*return;/);
  });

  it('tracks and shows success only after the write returned clean', () => {
    const errorGuard = configurator.indexOf('if (error) {');
    const tracked = configurator.indexOf("track('create_order_requested'");
    const doneShown = configurator.indexOf('setDone(true)');
    expect(errorGuard).toBeGreaterThan(-1);
    expect(tracked).toBeGreaterThan(errorGuard);
    expect(doneShown).toBeGreaterThan(errorGuard);
  });

  it('keeps the order when only the artwork upload fails', () => {
    // Losing a paid enquiry because a file did not upload would be worse than
    // asking for the file again.
    expect(configurator).toMatch(/Order placed, but the artwork did not upload/);
  });
});
