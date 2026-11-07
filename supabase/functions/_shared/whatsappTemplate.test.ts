/**
 * Which template gets sent — decided by asking Meta.
 *
 * This chooses the wording a real business owner receives, so the assertions
 * that matter are about what it REFUSES to pick.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveWelcomeTemplate, clearTemplateCache } from './whatsappTemplate.ts';

const ENV = (over: Record<string, string | undefined> = {}) => (k: string) =>
  ({ WHATSAPP_TOKEN: 'tok', WHATSAPP_WABA_ID: '123', ...over }[k]);

const listing = (templates: unknown[], ok = true) =>
  (async () => ({
    ok, status: ok ? 200 : 400,
    json: async () => (ok ? { data: templates } : { error: { message: 'nope' } }),
  })) as unknown as typeof fetch;

const APPROVED_UTILITY = { name: 'nowopen_listing_live_v2', status: 'APPROVED', category: 'UTILITY' };
const APPROVED_MARKETING = { name: 'nowopen_welcome_v1', status: 'APPROVED', category: 'MARKETING' };
const SAMPLE = { name: 'hello_world', status: 'APPROVED', category: 'UTILITY' };

beforeEach(() => clearTemplateCache());

describe('what it refuses to send', () => {
  it('never picks one of Meta\'s samples', async () => {
    /*
     * hello_world is APPROVED and UTILITY on every new WhatsApp account, so a
     * naive "first approved utility template" would send "Hello World" to a
     * business owner who just signed up.
     */
    const r = await resolveWelcomeTemplate(ENV(), listing([SAMPLE]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('none_approved');
  });

  it('never auto-selects a MARKETING template, even our own', async () => {
    /*
     * Marketing messages may only go to people who opted in to marketing.
     * Creating a listing is consent to be told the listing exists, not consent
     * to be sold to — so this must stay unsent rather than become convenient.
     */
    const r = await resolveWelcomeTemplate(ENV(), listing([APPROVED_MARKETING, SAMPLE]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('marketing_only');
    expect(r.message).toMatch(/opted in to marketing/);
  });

  it('does not treat a PENDING template as sendable', async () => {
    const r = await resolveWelcomeTemplate(ENV(), listing([
      { ...APPROVED_UTILITY, status: 'PENDING' },
    ]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('none_approved');
    expect(r.message).toMatch(/not approved it yet/);
  });

  it('does not pick a template belonging to somebody else', async () => {
    const r = await resolveWelcomeTemplate(ENV(), listing([
      { name: 'someone_elses_promo', status: 'APPROVED', category: 'UTILITY' },
    ]));
    expect(r.ok).toBe(false);
  });
});

describe('what it does pick', () => {
  it('uses an approved UTILITY template of ours', async () => {
    const r = await resolveWelcomeTemplate(ENV(), listing([SAMPLE, APPROVED_UTILITY]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe('nowopen_listing_live_v2');
    expect(r.source).toBe('meta');
  });

  it('prefers the highest version, numerically', async () => {
    // v10 must beat v9; a string sort would get this wrong.
    const r = await resolveWelcomeTemplate(ENV(), listing([
      { name: 'nowopen_x_v9', status: 'APPROVED', category: 'UTILITY' },
      { name: 'nowopen_x_v10', status: 'APPROVED', category: 'UTILITY' },
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe('nowopen_x_v10');
  });

  it('lets an explicit env var choose among APPROVED templates', async () => {
    /*
     * Somebody who sets the name has made a decision; discovery must not
     * overrule it — including back to a template they deliberately left.
     */
    const chosen = { name: 'chosen_by_hand', status: 'APPROVED', category: 'UTILITY' };
    const r = await resolveWelcomeTemplate(
      ENV({ WHATSAPP_WELCOME_TEMPLATE: 'chosen_by_hand' }),
      listing([APPROVED_UTILITY, chosen]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe('chosen_by_hand');
    expect(r.source).toBe('env');
  });
});

describe('failure is reported, never guessed around', () => {
  it('says so when credentials are missing, and does not cache it', async () => {
    const r = await resolveWelcomeTemplate(() => undefined, listing([APPROVED_UTILITY]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('unconfigured');

    // Configuration can change between invocations, so a miss must not stick.
    const r2 = await resolveWelcomeTemplate(ENV(), listing([APPROVED_UTILITY]));
    expect(r2.ok).toBe(true);
  });

  it('reports a refused lookup rather than falling back to a sample', async () => {
    const r = await resolveWelcomeTemplate(ENV(), listing([], false));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('lookup_failed');
  });

  it('does not pin a network blip for the whole cache window', async () => {
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const r = await resolveWelcomeTemplate(ENV(), boom);
    expect(r.ok).toBe(false);

    const r2 = await resolveWelcomeTemplate(ENV(), listing([APPROVED_UTILITY]));
    expect(r2.ok, 'a transient failure must not stick for 60s').toBe(true);
  });
});

describe('caching', () => {
  it('serves a burst of sends from one Graph call', async () => {
    let calls = 0;
    const counted = (async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ data: [APPROVED_UTILITY] }) };
    }) as unknown as typeof fetch;

    await resolveWelcomeTemplate(ENV(), counted);
    await resolveWelcomeTemplate(ENV(), counted);
    await resolveWelcomeTemplate(ENV(), counted);
    expect(calls).toBe(1);
  });

  it('picks up an approval within the cache window', async () => {
    const pending = listing([{ ...APPROVED_UTILITY, status: 'PENDING' }]);
    const now = { t: 1_000_000 };
    const r1 = await resolveWelcomeTemplate(ENV(), pending, () => now.t);
    expect(r1.ok).toBe(false);

    // Meta approves it; a minute later the next send must find it.
    now.t += 61_000;
    const r2 = await resolveWelcomeTemplate(ENV(), listing([APPROVED_UTILITY]), () => now.t);
    expect(r2.ok).toBe(true);
  });
});

describe('naming a template does not bypass approval', () => {
  beforeEach(() => clearTemplateCache());

  it('refuses a named template Meta has not approved', async () => {
    /*
     * The trap this closes: naming a PENDING template makes the gate pass, so
     * every queued welcome attempts a real send, Meta rejects it, and the row
     * lands in `failed` — which is TERMINAL, unlike the retryable
     * `needs_template` it replaced. Those welcomes would never go out, even
     * after approval. "Explicit wins" means choosing among approved
     * templates, not skipping the approval.
     */
    const r = await resolveWelcomeTemplate(
      ENV({ WHATSAPP_WELCOME_TEMPLATE: 'nowopen_listing_live_v2' }),
      listing([{ name: 'nowopen_listing_live_v2', status: 'PENDING', category: 'UTILITY' }]),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('named_not_approved');
    expect(r.message).toMatch(/PENDING/);
    expect(r.message).toMatch(/once Meta approves/i);
  });

  it('says so when the named template does not exist at all', async () => {
    const r = await resolveWelcomeTemplate(
      ENV({ WHATSAPP_WELCOME_TEMPLATE: 'typo_in_the_name' }),
      listing([APPROVED_UTILITY]),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toMatch(/does not exist/);
  });

  it('starts sending by itself the moment Meta approves the named one', async () => {
    const now = { t: 5_000_000 };
    const pending = await resolveWelcomeTemplate(
      ENV({ WHATSAPP_WELCOME_TEMPLATE: 'nowopen_listing_live_v2' }),
      listing([{ name: 'nowopen_listing_live_v2', status: 'PENDING', category: 'UTILITY' }]),
      () => now.t,
    );
    expect(pending.ok).toBe(false);

    now.t += 61_000;
    const approved = await resolveWelcomeTemplate(
      ENV({ WHATSAPP_WELCOME_TEMPLATE: 'nowopen_listing_live_v2' }),
      listing([APPROVED_UTILITY]),
      () => now.t,
    );
    expect(approved.ok).toBe(true);
  });

  it('trusts a named template when Meta cannot be reached', async () => {
    /*
     * An outage must not block every welcome. The name was set deliberately,
     * and an unapproved one is rejected by Meta anyway — so fail towards the
     * human's decision rather than towards silence, and mark it unverified.
     */
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const r = await resolveWelcomeTemplate(ENV({ WHATSAPP_WELCOME_TEMPLATE: 'chosen_by_hand' }), boom);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe('env_unverified');
  });
});
