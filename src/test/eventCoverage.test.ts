import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Every declared event must actually be fired somewhere.
 *
 * `EventName` is a closed union, which makes a typo a compile error — good.
 * But it also makes a promise, and the promise was not being kept. Measured
 * against production on 2026-09-08:
 *
 *   declared events : 23
 *   ever observed   : 13
 *   declared with NO call site anywhere in src/ : 3
 *
 *       signup            0 call sites — while 11 accounts existed
 *       business_created  0 call sites — while businesses existed
 *       plan_viewed       0 call sites
 *
 * A declared-but-unwired event is worse than an undeclared one. The type
 * asserts the funnel is instrumented; the table quietly says otherwise; and
 * anybody reading `EventName` to find out what the platform measures is
 * misled. `signup` in particular is the top of the whole acquisition funnel,
 * so its absence meant signup → onboarding → business_created → claim had no
 * denominator at any step.
 *
 * This test makes that state impossible to reach again.
 */

const TELEMETRY = 'src/lib/telemetry.ts';

/** The events the union declares. */
function declaredEvents(): string[] {
  const src = readFileSync(TELEMETRY, 'utf8');
  const start = src.indexOf('export type EventName =');
  expect(start, 'EventName union not found').toBeGreaterThan(-1);

  /*
   * Scan line by line to the terminating member, rather than to the first
   * semicolon. The union is heavily commented and one of those comments
   * contains a semicolon — "measures attention; this measures the outcome" —
   * so `indexOf(';')` stopped four events in, and every assertion below then
   * passed against a four-item list. The "non-trivial number" guard is what
   * caught it, which is the only reason it is there.
   */
  const members: string[] = [];
  for (const line of src.slice(start).split('\n')) {
    const m = /^\s*\|\s*'([a-z0-9_]+)'/.exec(line);
    if (m) members.push(m[1]);
    if (/'\s*;\s*$/.test(line)) break;
  }
  return members;
}

/** Every `track('name'` in application code, tests excluded. */
function firedEvents(): Map<string, number> {
  const found = new Map<string, number>();

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.test\./.test(entry) || path.includes('src\\test') || path.includes('src/test')) {
        continue;
      }
      const src = readFileSync(path, 'utf8');
      for (const m of src.matchAll(/track\(\s*'([a-z0-9_]+)'/g)) {
        found.set(m[1], (found.get(m[1]) ?? 0) + 1);
      }
    }
  };

  walk('src');
  return found;
}

const declared = declaredEvents();
const fired = firedEvents();

describe('the event vocabulary', () => {
  it('declares a non-trivial number of events', () => {
    // Guards the parser above: a regex that silently matched nothing would
    // make every test below pass for the wrong reason.
    expect(declared.length).toBeGreaterThan(15);
  });

  it('has no duplicates', () => {
    expect(new Set(declared).size).toBe(declared.length);
  });
});

describe('every declared event is actually fired', () => {
  /*
   * `client_error` is the one legitimate exception: it is emitted by
   * `reportError()` inside telemetry itself rather than through `track()`,
   * because a page that is about to die cannot wait for the batch timer.
   */
  const EMITTED_ELSEWHERE = new Set(['client_error']);

  for (const name of declared) {
    if (EMITTED_ELSEWHERE.has(name)) continue;

    it(`${name} has a call site`, () => {
      expect(
        fired.get(name) ?? 0,
        `'${name}' is declared in EventName but never fired. Either wire it up, ` +
          `or remove it from the union — a declared event with no call site ` +
          `tells a reader the platform measures something it does not.`,
      ).toBeGreaterThan(0);
    });
  }
});

describe('the three that were missing are now wired', () => {
  /*
   * Named individually rather than left to the loop above, so that deleting
   * one of these call sites fails with a message that says which funnel step
   * just went dark.
   */
  it('signup — the top of the acquisition funnel', () => {
    const auth = readFileSync('src/contexts/AuthContext.tsx', 'utf8');
    // Both branches: this app supports phone-first and email-first signup,
    // and instrumenting only one would undercount by an unknown amount.
    expect(auth).toMatch(/track\('signup', \{ role, method: 'phone' \}\)/);
    expect(auth).toMatch(/track\('signup', \{ role, method: 'email' \}\)/);
  });

  it('signup carries no identifier', () => {
    /*
     * sanitizeProps would drop an email or phone by key anyway, but relying
     * on the blocklist to catch what the caller should not have passed is the
     * wrong way round. The props are role and method, nothing else.
     */
    const auth = readFileSync('src/contexts/AuthContext.tsx', 'utf8');
    const calls = [...auth.matchAll(/track\('signup',([^)]*)\)/g)].map((m) => m[1]);
    expect(calls.length).toBe(2);

    for (const call of calls) {
      /*
       * Assert on the SHAPE, not on words.
       *
       * The first version searched for /email/ and failed on `method: 'email'`
       * — a string literal naming which signup route was used, which carries
       * nothing about the person. Matching words would have forced the code to
       * be renamed to satisfy the test, which is backwards.
       *
       * What actually matters is that no VARIABLE reaches the props: a literal
       * cannot leak an identifier, a reference can.
       */
      const props = call.trim();
      expect(props).toMatch(/^\{[^}]*\}$/);

      const values = [...props.matchAll(/(\w+)\s*:\s*([^,}]+)/g)].map((m) => m[2].trim());
      for (const v of values) {
        expect(v, `signup props must pass literals, not variables (got ${v})`)
          .toMatch(/^'[a-z]+'$/);
      }

      // `role` is passed shorthand — the one permitted reference, and it is a
      // signup-type label ('personal' | 'business'), not a person.
      expect(props).toMatch(/\brole\b/);
    }
  });

  it('business_created fires only on a create, and only after the write succeeded', () => {
    const form = readFileSync('src/components/dashboard/BusinessForm.tsx', 'utf8');
    expect(form).toMatch(/const isCreate = !editingId;/);
    expect(form).toMatch(/if \(isCreate\) track\('business_created'/);

    // After the error check — a failed save must not report a business.
    expect(form.indexOf('if (error) throw error;\n      /*'))
      .toBeLessThan(form.indexOf("track('business_created'"));
  });

  it('plan_viewed fires once per visit, not per plan card', () => {
    const pricing = readFileSync('src/pages/Pricing.tsx', 'utf8');
    expect(pricing).toMatch(/track\('plan_viewed'\)/);
    // In an effect with an empty dependency array.
    expect(pricing).toMatch(/track\('plan_viewed'\);\s*\}, \[\]\);/);
  });
});
