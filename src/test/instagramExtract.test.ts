/**
 * Instagram manual extraction — wiring and honesty.
 *
 * The lookup itself is tested in
 * supabase/functions/_shared/discovery/instagram.test.ts (16 assertions,
 * including that it makes no network call when unconfigured). These are about
 * the parts that could mislead an operator.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PANEL = 'src/components/admin/businessIntelligence/InstagramExtract.tsx';
const TAB = 'src/components/admin/businessIntelligence/ManualExtractTab.tsx';
const FN = 'supabase/functions/extract-instagram/index.ts';

const panel = readFileSync(PANEL, 'utf8');
const tab = readFileSync(TAB, 'utf8');
const fn = readFileSync(FN, 'utf8');

describe('it is reachable from Manual Extract', () => {
  it('is wired into the existing tab, not a separate screen', () => {
    expect(tab).toMatch(/import InstagramExtract from/);
    expect(tab).toMatch(/source === 'instagram'/);
  });

  it('files into the shared queue, never straight into the directory', () => {
    /*
     * The invariant is the DESTINATION, not which file holds the insert.
     *
     * This used to assert the panel contained no radar_candidates insert at
     * all — a proxy for "one staging path" that stopped being true the moment
     * Instagram results could be filed. What must hold is that both sources
     * land in radar_candidates under the same source_key, and that neither
     * creates a business: approval in the Review queue is the only thing that
     * publishes.
     */
    expect(panel).toMatch(/from\('radar_candidates'\)/);
    expect(panel).not.toMatch(/from\('businesses'\)[\s\S]{0,160}\.(insert|upsert)\(/);
    expect(panel).toMatch(/'source_key', 'manual_extraction'/);
  });

  it('re-reading a handle updates rather than filing a second row', () => {
    /*
     * Unique index on (source_key, source_record_id): a plain insert fails the
     * second time. A blind upsert would be worse — it would rewrite `status`
     * and drag a published or rejected candidate back to pending, undoing a
     * human judgement.
     */
    expect(panel).toMatch(/\.update\(row\)/);
    expect(panel).toMatch(/'published', 'merged', 'rejected'/);
  });

  it('does not .select() after the insert', () => {
    /*
     * On these tables a .select() after .insert() makes RLS evaluate a read
     * the writer may not have, which kills the WRITE — and the error blames
     * the insert.
     */
    expect(panel).not.toMatch(/\.insert\(row\)[\s\S]{0,40}\.select\(/);
  });
});

describe('it never fabricates a result', () => {
  it('contains no sample or mock profile', () => {
    /*
     * §32. The provider is unconfigured today, so the temptation to ship a
     * plausible-looking example is at its strongest exactly when it would be
     * most misleading.
     */
    for (const word of ['SAMPLE_', 'MOCK_', 'DEMO_', 'FIXTURE_', '_SEED']) {
      expect(panel, `${word} appears in the panel`).not.toContain(word);
    }
    // No invented follower counts or handles sitting in the source.
    expect(panel).not.toMatch(/followersCount:\s*\d+/);
  });

  it('shows the real configuration state, naming what is missing', () => {
    expect(panel).toMatch(/not configured/i);
    expect(panel).toMatch(/App Review/);
    // The missing secrets come from the SERVER's answer, not a hardcoded list
    // that would go stale the moment one is set.
    expect(panel).toMatch(/result\.missing/);
  });
});

describe('the endpoint is gated and honest', () => {
  it('requires a signed-in staff member', () => {
    expect(fn).toMatch(/auth\.getUser\(\)/);
    expect(fn).toMatch(/STAFF\.has/);
    expect(fn).toMatch(/Staff only/);
  });

  it('does not use the automation secret', () => {
    /*
     * A secret that unlocks automated sending or bulk work must not be the
     * key to an interactive admin tool reachable from a browser.
     */
    expect(fn).not.toMatch(/x-automation-key/);
    expect(fn).not.toMatch(/AUTOMATION_SECRET/);
  });

  it('normalises the handle before it reaches the API', () => {
    // normalizeHandle is the injection guard: the handle is interpolated into
    // a Graph field expression where URL-encoding does not help.
    expect(fn).toMatch(/normalizeHandle\(/);
    const normIdx = fn.indexOf('normalizeHandle(');
    const lookupIdx = fn.indexOf('lookupInstagramBusiness(');
    expect(normIdx).toBeGreaterThan(-1);
    expect(normIdx).toBeLessThan(lookupIdx);
  });

  it('distinguishes the failure kinds an operator must act on differently', () => {
    // A missing credential is a setup task; a rate limit is "later"; a
    // personal account will never be extractable. One generic error would
    // send somebody to fix the wrong thing.
    for (const kind of ['not_configured', 'not_found', 'rate_limited', 'auth', 'permission']) {
      expect(fn, `${kind} not handled`).toContain(kind);
    }
  });

  it('allows the CORS header supabase-js actually sends', () => {
    /*
     * Measured: omitting x-application-name failed the preflight, so the
     * request never left the browser, the server logged nothing, and the
     * button looked dead.
     */
    expect(fn).toMatch(/x-application-name/);
  });
});

describe('the duplicate check actually runs', () => {
  it('queries the jsonb PATH, not the whole column', () => {
    /*
     * Measured 2026-10-08: this ILIKE'd the `social_links` jsonb column
     * itself, which Postgres answers with "operator does not exist:
     * jsonb ~~* unknown". The error was discarded — only `data` was
     * destructured — so the result was always undefined and the duplicate
     * hint NEVER fired. An operator could file a business already on the
     * directory and be told nothing.
     */
    expect(fn).toMatch(/ilike\("social_links->>instagram"/);
    expect(fn).not.toMatch(/ilike\("social_links",/);
  });

  it('reports a failed check instead of implying there was no duplicate', () => {
    // Absence of a warning must not be manufactured by a broken query.
    expect(fn).toMatch(/error: dupErr/);
    expect(fn).toMatch(/duplicateCheckFailed/);
  });
});

describe('copying a logo is narrow, staff-only and pinned to Meta', () => {
  const logoFn = readFileSync('supabase/functions/instagram-logo/index.ts', 'utf8');

  it('is staff-gated and has no automation path', () => {
    /*
     * radar_sources records image_reuse_allowed = 'prohibited' for this
     * source. Copying a business's mark is a judgement a person makes per
     * account, so there is no batch mode and no scheduler route to it.
     */
    expect(logoFn).toMatch(/STAFF\.has/);
    expect(logoFn).not.toMatch(/AUTOMATION_SECRET/);
    expect(logoFn).not.toMatch(/handles\s*:|for \(const h of/);
  });

  it('re-reads the profile instead of trusting a URL from the caller', () => {
    // Accepting an image address from a request body makes this a general
    // purpose fetcher pointed at anything.
    expect(logoFn).toMatch(/lookupInstagramBusiness\(handle\)/);
    expect(logoFn).not.toMatch(/body\?\.(imageUrl|pictureUrl|url)/);
  });

  it('only fetches from Meta\'s own CDN', () => {
    /*
     * The address comes from the Graph reply rather than the caller, so this
     * is belt and braces — but an image fetcher that will retrieve any host
     * is an SSRF tool, and pinning it costs nothing.
     */
    expect(logoFn).toContain('fbcdn\\.net|cdninstagram\\.com');
  });

  it('caps the size and the content types it will store', () => {
    expect(logoFn).toMatch(/MAX_BYTES/);
    expect(logoFn).toMatch(/image\/jpeg/);
  });

  it('keys the file on the handle so re-reading replaces rather than litters', () => {
    expect(logoFn).toMatch(/instagram-logos\/\$\{handle\}/);
    expect(logoFn).toMatch(/upsert: true/);
  });

  it('records where the image came from', () => {
    expect(logoFn).toMatch(/sourceUrl/);
    expect(logoFn).toMatch(/copiedAt/);
  });
});

describe('what it refuses to treat as a fact', () => {
  it('never offers the profile picture for reuse', () => {
    // radar_sources records image_reuse_allowed = 'prohibited' for this
    // source; the URL is Meta Platform Data and it expires.
    expect(fn).toMatch(/NOT copied onto a listing|image_reuse_allowed/);
    expect(panel).toMatch(/not copied onto a listing/i);
  });

  it('labels follower counts as activity, not business facts', () => {
    expect(panel).toMatch(/Activity signals/i);
  });
});
