/**
 * Instagram adapter — what it must refuse, and what it must not invent.
 *
 * The brief these tests belong to asks for discovery by location and category.
 * Meta's business_discovery endpoint is lookup-by-username only (verified
 * against their documentation 2026-10-06), so the most important assertions
 * here are about the adapter being honest when it cannot do something, rather
 * than about it succeeding.
 */

import { describe, it, expect, vi } from 'vitest';
import { normalizeHandle, readCredentials, lookupInstagramBusiness, evidenceFrom } from './instagram.ts';

const NO_ENV = () => undefined;
const FULL_ENV = (k: string) =>
  ({ META_PAGE_ACCESS_TOKEN: 'tok', INSTAGRAM_BUSINESS_ACCOUNT_ID: '17841400000000000' }[k]);

describe('handle normalisation', () => {
  it('resolves every way a business writes its own handle to one identity', () => {
    for (const v of [
      '@Business_Name', 'Business_Name', 'business_name',
      'instagram.com/business_name', 'https://www.instagram.com/business_name/',
      'https://instagram.com/Business_Name?igsh=abc123',
    ]) {
      expect(normalizeHandle(v), v).toBe('business_name');
    }
  });

  it('rejects things that are not accounts', () => {
    // Post and reel URLs are the common paste mistake.
    expect(normalizeHandle('https://instagram.com/p/Cxyz123/')).toBeNull();
    expect(normalizeHandle('https://instagram.com/reel/Cxyz/')).toBeNull();
    expect(normalizeHandle('')).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
    // Over 30 characters is not a handle.
    expect(normalizeHandle('a'.repeat(31))).toBeNull();
  });

  it('rejects anything outside the character set Instagram allows', () => {
    /*
     * This is also the injection guard. The handle is interpolated into a
     * Graph field expression — `business_discovery.username(X){...}` — where
     * URL-encoding would not help, so the character set IS the defence.
     */
    for (const v of ['bad name', 'bad){evil}', 'a/b', 'a&b=c', 'drop)table']) {
      expect(normalizeHandle(v), v).toBeNull();
    }
  });
});

describe('it refuses rather than pretending', () => {
  it('reports not_configured, naming what is missing', async () => {
    const r = await lookupInstagramBusiness('somebusiness', NO_ENV);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('not_configured');
    expect(r).toHaveProperty('missing');
    // Both halves named: a token alone cannot query business_discovery.
    expect((r as { missing: string[] }).missing).toEqual(
      expect.arrayContaining(['META_PAGE_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID']),
    );
    // And it says what else is required beyond the secrets.
    expect(r.message).toMatch(/App Review/i);
  });

  it('makes no network call at all when unconfigured', async () => {
    /*
     * The point of a "not configured" state: it must not reach Meta with an
     * empty token and burn an error against the app's rate limit.
     */
    const spy = vi.fn();
    await lookupInstagramBusiness('somebusiness', NO_ENV, spy as unknown as typeof fetch);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports only one missing key when only one is absent', async () => {
    const half = (k: string) => (k === 'META_PAGE_ACCESS_TOKEN' ? 'tok' : undefined);
    const r = await lookupInstagramBusiness('somebusiness', half);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r as { missing: string[] }).missing).toEqual(['INSTAGRAM_BUSINESS_ACCOUNT_ID']);
  });
});

describe('credential reading', () => {
  it('finds both halves when present', () => {
    const c = readCredentials(FULL_ENV);
    expect('missing' in c).toBe(false);
  });
  it('lists what is absent when neither is set', () => {
    const c = readCredentials(NO_ENV);
    expect('missing' in c && c.missing.length).toBe(2);
  });
});

describe('reading a real reply', () => {
  const reply = (body: unknown, status = 200) =>
    (async () => ({ ok: status === 200, status, json: async () => body })) as unknown as typeof fetch;

  it('maps a profile without inventing anything absent', async () => {
    const r = await lookupInstagramBusiness('somebusiness', FULL_ENV, reply({
      business_discovery: {
        username: 'somebusiness', name: 'Some Business',
        biography: 'Bespoke tailoring in Lagos.', website: 'https://somebusiness.ng',
        followers_count: 4210, media_count: 88,
      },
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.website).toBe('https://somebusiness.ng');
    expect(r.profile.followersCount).toBe(4210);
    // Absent fields stay null. Never a guess, never an empty string.
    expect(r.profile.profilePictureUrl).toBeNull();
  });

  it('calls a rate limit a rate limit, not a failure', async () => {
    const r = await lookupInstagramBusiness('x', FULL_ENV,
      reply({ error: { code: 4, message: 'Application request limit reached' } }, 400));
    expect(r.ok).toBe(false);
    if (!r.ok) return;
    // Retryable later; distinct from a handle that does not exist.
    expect(r.reason).toBe('rate_limited');
  });

  it('calls an expired token an auth problem', async () => {
    const r = await lookupInstagramBusiness('x', FULL_ENV,
      reply({ error: { code: 190, message: 'Error validating access token' } }, 400));
    expect(r.ok).toBe(false);
    if (!r.ok) return;
    expect(r.reason).toBe('auth');
  });

  it("treats Meta's \"Invalid user id\" as not_found", async () => {
    /*
     * Measured 2026-10-08 against real handles: konga, shoprite_ng and a
     * nonsense handle all returned exactly "Invalid user id". They fell
     * through to the generic branch and the screen said "Instagram could not
     * be reached just now" — a network fault, for what is the NORMAL case in
     * a directory where most handles belong to personal accounts.
     */
    const r = await lookupInstagramBusiness('x', FULL_ENV,
      reply({ error: { message: 'Invalid user id', code: 110 } }, 400));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('not_found');
  });

  it('calls the App Review gate a permission problem, not a dead token', async () => {
    /*
     * Measured 2026-10-08 against a real Page token that HELD instagram_basic
     * and reached a linked Business account: business_discovery still answered
     * "(#10) Application does not have permission for this action", because
     * instagram_manage_insights and pages_read_engagement were not granted.
     *
     * Before this branch it fell through to `error`, whose message points at
     * the network — sending somebody to debug connectivity when the real
     * blocker was Meta's review queue.
     */
    const r = await lookupInstagramBusiness('x', FULL_ENV,
      reply({ error: { code: 10, message: '(#10) Application does not have permission for this action' } }, 400));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('permission');
    // Distinct from `auth`: the credentials are fine, the grant is missing.
    expect(r.reason).not.toBe('auth');
  });

  it('treats a personal account as not_found, not an error', async () => {
    // Most handles on a business listing belong to personal accounts. That is
    // a normal outcome for a directory and must not read as a fault.
    const r = await lookupInstagramBusiness('x', FULL_ENV,
      reply({ error: { message: 'User does not exist or is not a business' } }, 400));
    expect(r.ok).toBe(false);
    if (!r.ok) return;
    expect(r.reason).toBe('not_found');
  });
});

describe('what it will assert as evidence', () => {
  const profile = {
    username: 'b', name: 'Some Business', biography: 'Tailoring.',
    website: 'https://b.ng', followersCount: 10, mediaCount: 2,
    profilePictureUrl: 'https://scontent.example/pic.jpg',
    retrievedAt: new Date().toISOString(),
  };

  it('offers the website, name and description', () => {
    const fields = evidenceFrom(profile).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['website', 'description', 'name']));
  });

  it('never offers the profile picture as evidence', () => {
    /*
     * radar_sources marks image_reuse_allowed = prohibited for this source.
     * The URL is Meta Platform Data, it expires, and it is not ours to put on
     * a listing.
     */
    const fields = evidenceFrom(profile).map((e) => e.field);
    expect(fields).not.toContain('profile_picture_url');
    expect(fields).not.toContain('image_url');
  });

  it('never offers follower counts as a fact about the business', () => {
    // An activity signal, not an attribute of the business.
    const fields = evidenceFrom(profile).map((e) => e.field);
    expect(fields).not.toContain('followers_count');
  });

  it('asserts nothing from an empty profile', () => {
    expect(evidenceFrom({ ...profile, website: null, biography: null, name: null })).toEqual([]);
  });
});
