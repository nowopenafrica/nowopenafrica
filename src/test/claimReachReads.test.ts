import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * ClaimReach has to see the whole directory before it decides who to contact.
 *
 * ── THE BUG THIS PINS ────────────────────────────────────────────────────
 *
 * MEASURED 2026-09-23:
 *
 *   unclaimed businesses                              3,168
 *   evidence rows matching the console's filter       3,487
 *   rows PostgREST actually returned                  1,000
 *
 * The console asked for `.limit(20000)` and received 1,000, silently and with
 * no error — PostgREST caps every response and a larger limit does not raise
 * the ceiling, it hides it. So roughly 2,500 businesses that DO hold a sourced
 * phone number appeared to the send gate as though they held none, and were
 * refused with `contact_no_provenance`.
 *
 * That is the worst shape this failure can take. The gate was working
 * perfectly; it was fed a truncated view, and its refusal read as careful
 * compliance rather than as a bug. "ClaimReach contacts nobody" looked like a
 * policy outcome.
 */

const SRC = readFileSync('src/components/admin/ClaimReachConsole.tsx', 'utf8');

/** The three reads that decide who is contactable. */
const READS = ['businesses', 'business_evidence', 'claimreach_outreach'];

describe('every read pages past the 1,000-row ceiling', () => {
  it.each(READS)('%s is fetched with .range(), not a bare .limit()', (table) => {
    const at = SRC.indexOf(`.from('${table}')`);
    expect(at, `no read of ${table} found — has it moved?`).toBeGreaterThan(-1);
    // The chain for this read: from the table name to the end of the statement.
    const chain = SRC.slice(at, SRC.indexOf(';', at));
    expect(chain, `${table} still uses .limit()`).not.toMatch(/\.limit\(/);
    expect(chain, `${table} does not page`).toMatch(/\.range\(/);
  });

  it('stops on a short page rather than looping for ever', () => {
    // A page smaller than PAGE is the last one; without this the loop runs to
    // the safety stop on every load.
    expect(SRC).toMatch(/if \(batch\.length < PAGE\) break;/);
  });

  it('carries a safety stop for each read', () => {
    for (const c of ['MAX_BUSINESSES', 'MAX_EVIDENCE', 'MAX_OUTREACH']) {
      expect(SRC, `${c} missing`).toMatch(new RegExp(`const ${c} = \\d+`));
    }
  });

  it('pages at the real ceiling, not a number somebody hoped for', () => {
    const m = SRC.match(/const PAGE = (\d+)/);
    expect(m, 'PAGE not found').toBeTruthy();
    // Above 1,000 the last page never looks short, so the loop stops early and
    // silently drops the remainder — the original bug with extra steps.
    expect(Number(m![1])).toBeLessThanOrEqual(1000);
  });
});

describe('it asks only for what it will use', () => {
  it('excludes claimed businesses in the query', () => {
    /*
     * A claimed business is blocked by the gate moments later, so fetching it
     * is work done to throw away — and with a row cap, work that displaces a
     * business the console actually needed to see.
     */
    const at = SRC.indexOf("from('businesses')");
    const chain = SRC.slice(at, SRC.indexOf(';', at));
    expect(chain).toMatch(/neq\('claim_status',\s*'claimed'\)/);
  });
});

describe('under-reading prior attempts is the dangerous direction', () => {
  it('pages the outreach history too', () => {
    /*
     * Missing businesses understates who is reachable — annoying. Missing
     * ATTEMPTS makes the frequency rules pass when they should not, and
     * somebody gets contacted twice. The second is the one that reaches a
     * person, so it gets its own test.
     */
    const at = SRC.indexOf("from('claimreach_outreach')");
    const chain = SRC.slice(at, SRC.indexOf(';', at));
    expect(chain).toMatch(/\.range\(/);
    expect(chain).not.toMatch(/\.limit\(/);
  });
});

/*
 * ── THE SENTENCE MUST BE READ, NOT ASSERTED ──────────────────────────────
 *
 * `SENDING_NOT_IMPLEMENTED` was a constant ending "...and no email provider
 * key is configured". A RESEND_API_KEY was set on 2026-10-06 and the sentence
 * carried on asserting the opposite, because nothing in the system could
 * notice — a browser cannot read an edge-function secret.
 *
 * That is the third hardcoded claim on this platform to outlive its fact (the
 * pricing page's AI credits and Launch Control's "migration isn't applied"
 * were the others). These assertions are about the shape that prevents a
 * fourth: the note is composed from state.
 */
describe('the sender note describes the actual state', () => {
  it('names every missing prerequisite, not a fixed list', async () => {
    const { senderStatusNote } = await import('../lib/claimreach/dryRun');
    const note = senderStatusNote({
      providerConfigured: false, claimOutreach: false, emailOutreachEnabled: false,
    });
    expect(note).toMatch(/provider key/i);
    expect(note).toMatch(/claim_outreach/);
    expect(note).toMatch(/email_outreach_enabled/);
    expect(note).toMatch(/Nothing leaves this screen/);
  });

  it('stops claiming the key is missing once it is set', async () => {
    const { senderStatusNote } = await import('../lib/claimreach/dryRun');
    const note = senderStatusNote({
      providerConfigured: true, claimOutreach: false, emailOutreachEnabled: false,
    });
    // The exact regression: a key exists and the banner still said it did not.
    expect(note).not.toMatch(/provider key/i);
    expect(note).toMatch(/claim_outreach/);
  });

  it('reads as a warning, not a reassurance, when everything is on', async () => {
    const { senderStatusNote } = await import('../lib/claimreach/dryRun');
    const note = senderStatusNote({
      providerConfigured: true, claimOutreach: true, emailOutreachEnabled: true,
    });
    /*
     * The state this screen has never been in. Somebody arriving at it must
     * learn that pressing send now reaches real businesses — a banner still
     * saying "nothing leaves this screen" would be the most expensive stale
     * sentence of the three.
     */
    expect(note).toMatch(/WILL attempt real email to real businesses/i);
    expect(note).not.toMatch(/Nothing leaves this screen/);

    /*
     * ...and it must still not promise DELIVERY. Measured 2026-10-08: with a
     * valid key set, a real send returned `resend 403 - the nowopenafrica.com
     * domain is not verified`. Everything this screen can see was green and
     * mail would still have gone nowhere, because the sending domain is
     * verified at the provider, where this screen cannot look.
     */
    expect(note).toMatch(/domain verified at the provider/i);
    expect(note).not.toMatch(/The sender is ready/i);
  });

  it('says it is checking rather than guessing before the answer arrives', async () => {
    const { SENDING_STATUS_UNKNOWN } = await import('../lib/claimreach/dryRun');
    expect(SENDING_STATUS_UNKNOWN).toMatch(/checking which/i);
    // It must not assert which switch is off — that is the part that goes stale.
    expect(SENDING_STATUS_UNKNOWN).not.toMatch(/no email provider key is configured/i);
  });

  it('uses singular grammar for a single missing item', async () => {
    const { senderStatusNote } = await import('../lib/claimreach/dryRun');
    const note = senderStatusNote({
      providerConfigured: true, claimOutreach: true, emailOutreachEnabled: false,
    });
    expect(note).toMatch(/email_outreach_enabled flag is still missing/);
  });
});
