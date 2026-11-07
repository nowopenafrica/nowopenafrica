/**
 * WhatsApp setup — the checks that stop a green tick from lying.
 *
 * Configuring WhatsApp is unusually easy to fake: naming any approved template
 * clears the error, and Meta hands every new app an approved "hello_world".
 * So the assertions here are about refusing to call a sandbox a business line.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PROBE = readFileSync('supabase/functions/selftest-whatsapp/index.ts', 'utf8');
const SETUP = readFileSync('supabase/functions/whatsapp-template-setup/index.ts', 'utf8');
const PANEL = readFileSync('src/components/admin/OnboardingMessagingPanel.tsx', 'utf8');

const PROBE_SEND = readFileSync('supabase/functions/send-onboarding/index.ts', 'utf8');

describe('the probe cannot message anyone', () => {
  it('makes no send call', () => {
    /*
     * The email self-test can send safely because a JWT carries a verified
     * email address, so it can only reach the caller. A JWT carries no
     * verified phone number, so there is no equivalent guarantee — any send
     * would be aimed at a number somebody typed. It stays read-only.
     */
    expect(PROBE).not.toMatch(/\/messages/);
    expect(PROBE).toMatch(/sentAnything: false/);
  });

  it('is staff-only', () => {
    expect(PROBE).toMatch(/STAFF\.has/);
    expect(PROBE).not.toMatch(/AUTOMATION_SECRET/);
  });

  it('never returns the token', () => {
    // It is sent to Meta and reported on, never echoed back to a browser.
    expect(PROBE).not.toMatch(/token:\s*TOKEN|accessToken:\s*TOKEN/);
  });
});

describe('it separates "the API will work" from "this is fit for real people"', () => {
  it('warns about a short-lived token', () => {
    // Measured: the supplied token was a USER token with ~1 hour left.
    expect(PROBE).toMatch(/hoursLeft <= 48/);
    expect(PROBE).toMatch(/System User token/);
  });

  it('warns that a Meta test account is not a business line', () => {
    expect(PROBE).toMatch(/TEST WhatsApp account/);
  });

  it('refuses to accept Meta sample templates as a welcome message', () => {
    /*
     * The decisive one. hello_world and jaspers_market_* are APPROVED on every
     * new account, so pointing WHATSAPP_WELCOME_TEMPLATE at one would clear
     * the check and send "Hello World" to a business owner who just signed up.
     */
    expect(PROBE).toMatch(/hello_world\|jaspers_market_/);
  });

  it('keeps productionReady stricter than readyToSend', () => {
    expect(PROBE).toMatch(/productionReady: missing\.length === 0 && warnings\.length === 0/);
  });

  /*
   * A pending business verification caps the messaging tier. It does not stop
   * a send: the number is verified, the template is approved, and Meta
   * accepted a real welcome on 2026-10-09 while verification was outstanding.
   *
   * Filed as a warning it flipped productionReady false, so the panel
   * announced the setup was "not ready for real businesses" immediately above
   * its own sentence saying "nothing to do but wait". The verdict has to
   * follow the facts, so the pending states are advisories.
   */
  it('files a pending business verification as an advisory, not a warning', () => {
    const pending = PROBE.slice(PROBE.indexOf('pending_need_more_info'));
    const block = pending.slice(0, pending.indexOf('rejected'));
    expect(block).toMatch(/advisories\.push/);
    expect(block).not.toMatch(/warnings\.push/);
  });

  it('still escalates a REJECTED verification to a warning', () => {
    const rejected = PROBE.slice(PROBE.indexOf('v === "rejected"'));
    expect(rejected.slice(0, 400)).toMatch(/warnings\.push/);
  });

  it('returns advisories so the panel cannot silently drop the tier cap', () => {
    expect(PROBE).toContain('advisories,');
    expect(PANEL).toMatch(/advisories\?\.length/);
    expect(PANEL).toMatch(/Sending works/);
  });
});

describe('it reacts to what Meta decided, not what we submitted', () => {
  it('warns when Meta re-categorises our template as MARKETING', () => {
    /*
     * Measured: nowopen_welcome_v1 was submitted as UTILITY and came back
     * MARKETING. That changes both the price and the consent required — a
     * signup is consent to be onboarded, not to be marketed at.
     */
    expect(PROBE).toMatch(/classified .*as MARKETING/);
    expect(PROBE).toMatch(/opted in to marketing/);
  });

  it('stops asking for a template once one has been submitted', () => {
    // The warning told somebody to write a template that already existed —
    // the same stale-claim bug this screen keeps producing.
    expect(PROBE).toMatch(/!haveOwnTemplate &&/);
  });

  it('looks for other business accounts even when one is configured', () => {
    // A real WABA sitting beside the sandbox is exactly what somebody needs
    // to find, and only-look-if-missing would hide it.
    expect(PROBE).not.toMatch(/if \(wabaIds\.size === 0\) \{/);
    expect(PROBE).toMatch(/Run this ALWAYS/);
  });
});

describe('it judges the number that is actually configured', () => {
  it('does not call a real line a test account because a sandbox still exists', () => {
    /*
     * Meta's sandbox number does not disappear when a real one is added, so
     * "some account here is a test account" stays true forever. The screen
     * went on calling a VERIFIED business line a test account.
     */
    expect(PROBE).toMatch(/const activeNumber = allNumbers\.find/);
    expect(PROBE).toMatch(/testish = activeNumber/);
  });

  it('checks code verification on the configured number only', () => {
    expect(PROBE).toMatch(/const cvTarget = activeNumber \?\? allNumbers\[0\]/);
  });

  it('looks up a configured number that enumeration did not return', () => {
    // The direct read used to be skipped as soon as ANY number came back, so
    // a newly added number was declared unreachable without being asked about.
    expect(PROBE).toMatch(/alreadyFound/);
    expect(PROBE).toMatch(/PHONE_ID && !alreadyFound/);
  });
});

describe('templates are tied to an account, and it says so', () => {
  it('treats "could not tell" as unknown, never as fine', () => {
    /*
     * templatesApplyToActiveNumber defaulted to TRUE whenever the owner could
     * not be read — a reassurance drawn from a failed lookup, and the owner
     * edge does not exist on the phone-number node, so it fired every time.
     */
    expect(PROBE).toMatch(/numberIsOnConfiguredWaba: boolean \| null/);
    // null when we could not tell; only a successful enumeration decides it.
    expect(PROBE).toContain('!PHONE_ID || !enumeratedOk');
    expect(PROBE).toContain('enumeratedOk');
  });

  it('warns only on a real measurement, not a missing one', () => {
    expect(PROBE).toMatch(/numberIsOnConfiguredWaba === false/);
    expect(PROBE).toContain('apply to this number');
    expect(PROBE).toContain('resubmit the template there');
  });
});

describe('business verification is reported, not hidden', () => {
  it('reports every non-verified state distinctly', () => {
    /*
     * This governs how many people can be messaged per day and is invisible
     * from the number and the templates — an account can look entirely
     * healthy and still be capped. The screen showed nothing about it until
     * an out-of-band check found "pending_need_more_info", i.e. Meta was
     * waiting on us and nobody knew.
     */
    for (const state of ['pending_need_more_info', 'pending', 'rejected']) {
      expect(PROBE, `${state} not handled`).toContain(state);
    }
    expect(PROBE).toMatch(/Security Centre/);
  });

  it('says nothing when it is verified', () => {
    // A warning that fires in the healthy state is noise, and noise is how
    // the real warnings stop being read.
    expect(PROBE).toMatch(/v === "verified"\) continue/);
  });
});

describe('a pending template is not a configured one', () => {
  it('tells the operator NOT to set the env var while Meta is deciding', () => {
    expect(PROBE).toMatch(/waiting on Meta/i);
    expect(PROBE).toMatch(/a pending template sends nothing/i);
  });

  it('distinguishes approved, pending, rejected and never-submitted', () => {
    for (const state of ['ownApproved', 'ownPending', 'ownRejected']) {
      expect(PROBE, `${state} not handled`).toContain(state);
    }
    expect(PROBE).toMatch(/no NowOpen template has been submitted/);
  });
});

describe('the transactional variant', () => {
  it('states the fact and the link and stops', () => {
    /*
     * v1 was submitted UTILITY and Meta recorded it MARKETING, because it
     * listed what else the platform can do. Meta was right. v2 therefore
     * carries no tips, no features and no invitation to buy — and Meta
     * recorded it UTILITY.
     */
    /*
     * \r?\n, not \n: this repo checks out CRLF on Windows (core.autocrlf is
     * true), so a regex anchored on a bare newline matches nothing here and
     * the assertion silently degrades to "expected '' to be truthy" — which
     * looks like the copy is missing rather than like the test is broken.
     */
    const body = SETUP.match(/const TRANSACTIONAL_BODY =([\s\S]*?);\r?\n/)?.[1] ?? '';
    expect(body, 'could not locate TRANSACTIONAL_BODY in the source').toBeTruthy();
    for (const promo of ['Studio', 'flyers', 'reels', 'Grow', 'Smart QR', 'Catch every lead']) {
      expect(body, `transactional copy mentions ${promo}`).not.toContain(promo);
    }
    expect(body).toMatch(/is now live/);
  });

  it('obeys Meta placement rules too', () => {
    const body = SETUP.match(/const TRANSACTIONAL_BODY =([\s\S]*?);\n/)?.[1] ?? '';
    const text = body.replace(/\s*\+\s*/g, '').replace(/"/g, '');
    expect(text.trimStart().startsWith('{{')).toBe(false);
    expect(text.trimEnd().endsWith('}}')).toBe(false);
    expect(text).not.toMatch(/\}\}\s*\{\{/);
  });

  it('is a new name, never an edit of v1', () => {
    // Approved templates are immutable in Meta.
    expect(SETUP).toMatch(/nowopen_listing_live_v2/);
    expect(SETUP).toMatch(/TRANSACTIONAL_NAME/);
  });

  it('does not silently switch an existing caller to the new wording', () => {
    expect(SETUP).toMatch(/body\?\.variant === "transactional"/);
  });
});

describe('the probe stops asking for work already done', () => {
  it('recommends the UTILITY template once one exists', () => {
    expect(PROBE).toMatch(/is the one to use/);
    expect(PROBE).toMatch(/marketingOwn\.length > 0 && utilityOwn\.length > 0/);
  });
});

describe('the submitted template', () => {
  it('uses the three variables the pipeline already passes', () => {
    expect(SETUP).toMatch(/\{\{1\}\}/);
    expect(SETUP).toMatch(/\{\{2\}\}/);
    expect(SETUP).toMatch(/\{\{3\}\}/);
  });

  it('obeys Meta\'s placement rules', () => {
    // \r?\n — this repo checks out CRLF on Windows; see the v2 test above.
    const body = SETUP.match(/const BODY =([\s\S]*?);\r?\n/)?.[1] ?? '';
    expect(body, 'could not locate BODY in the source').toBeTruthy();
    // Must not begin or end with a placeholder, and none may be adjacent.
    const text = body.replace(/\s*\+\s*/g, '').replace(/"/g, '');
    expect(text.trimStart().startsWith('{{')).toBe(false);
    expect(text.trimEnd().endsWith('}}')).toBe(false);
    expect(text).not.toMatch(/\}\}\s*\{\{/);
  });

  it('carries a worked example, which Meta requires for every placeholder', () => {
    expect(SETUP).toMatch(/example:\s*\{\s*body_text/);
  });

  it('is versioned, because an approved template cannot be edited', () => {
    expect(SETUP).toMatch(/nowopen_welcome_v1/);
  });

  it('does not set the env var as a side effect of submitting', () => {
    // Submitting is not configuring. Only Meta's approval makes it sendable.
    expect(SETUP).not.toMatch(/WHATSAPP_WELCOME_TEMPLATE\s*=/);
  });
});

describe('the admin screen shows this rather than hiding it', () => {
  it('renders what Meta reported, not a hardcoded verdict', () => {
    expect(PANEL).toMatch(/waProbe/);
    expect(PANEL).toMatch(/not ready for real businesses/i);
  });

  it('says the check cost nobody a message', () => {
    expect(PANEL).toMatch(/Nothing was sent to anybody/i);
  });
});

describe('the console can say whether delivery is knowable at all', () => {
  /*
   * "sent" means the Cloud API accepted the request. Until the webhook is
   * wired that is the last thing this platform ever hears, so the screen has
   * to say so rather than let a green "sent" imply an arrival.
   */
  it('reports each half of the webhook wiring separately', () => {
    expect(PROBE).toMatch(/deliveryWebhook/);
    expect(PROBE).toMatch(/appSecretSet/);
    expect(PROBE).toMatch(/verifyTokenSet/);
    expect(PROBE).toMatch(/subscribed_apps/);
  });

  it('never reports the app secret itself, only whether it is set', () => {
    expect(PROBE).toMatch(/const APP_SECRET_SET = Boolean\(/);
    expect(PROBE).not.toMatch(/appSecret:\s*Deno\.env/);
  });

  /*
   * A failed read of the subscription list is not evidence of absence — the
   * same mistake this file has already had to correct twice.
   */
  it('keeps "could not check" distinct from "not subscribed"', () => {
    expect(PROBE).toMatch(/let wabaSubscribed: boolean \| null = null/);
    expect(PANEL).toMatch(/could not check/);
  });
});

describe('a refused manual send always says why', () => {
  /*
   * The missing-business-name branch returned `results: []`, and the results
   * list is what renders the explanation. So the panel showed a status with
   * no sentence, and nothing reached either ledger because the request never
   * left the browser — indistinguishable, on screen, from a welcome that was
   * sent and vanished.
   */
  it('never returns an empty results list from a client-side refusal', () => {
    /*
     * Strip comments first. The comment documenting this bug quotes the
     * broken code, so a scanner that cannot tell code from commentary reports
     * the documentation as the defect — the third time today that exact trap
     * has fired.
     */
    const code = PANEL.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = code.indexOf('const sendManual');
    expect(start).toBeGreaterThan(-1);
    const guards = code.slice(start, start + 1600);
    expect(guards).not.toMatch(/results:\s*\[\s*\]/);
  });

  it('names the business-name requirement in the refusal', () => {
    expect(PANEL).toMatch(/Business name is required/);
  });
});

describe('replies have somewhere to land', () => {
  /*
   * whatsapp_inbound and the webhook that fills it shipped before any screen
   * read them. That is exactly how the claim funnel once looked dead: every
   * part of the chain worked and nothing rendered the result.
   */
  it('renders the inbound replies the webhook stores', () => {
    expect(PANEL).toMatch(/whatsapp_inbound_list/);
    expect(PANEL).toMatch(/Replies from owners/);
  });

  it('says "nobody has written in yet" instead of treating empty as broken', () => {
    expect(PANEL).toMatch(/Nobody has written in yet/);
    expect(PANEL).toMatch(/repliesProblem/);
  });

  /*
   * A reply nobody can attribute is the row most worth seeing — somebody
   * wrote in and the platform could not tell who they were.
   */
  it('surfaces a reply that matched no listing', () => {
    expect(PANEL).toMatch(/did not match a listing/);
    expect(PANEL).toMatch(/No listing reference in this message/);
  });
});

describe('the brand-kit email can be sent by hand', () => {
  /*
   * It only ever went out automatically on signup, so there was no way to
   * send it to a chosen address — and no screen said so, which reads as a
   * missing button rather than a missing feature. It matters more than it
   * looks: WhatsApp cannot deliver at all while the account has no payment
   * method (Meta 131042), so email is the only channel reaching anybody.
   */
  it('offers email as a manual channel', () => {
    expect(PANEL).toMatch(/'email', 'whatsapp', 'instagram', 'both'/);
    expect(PANEL).toMatch(/Send the brand kit to/);
  });

  it('refuses to send without a recipient, and says so', () => {
    expect(PANEL).toMatch(/Enter the email address to send the brand kit to/);
  });

  /*
   * The same document, not a second version that drifts from the one owners
   * actually receive.
   */
  it('sends the same html and subject as the automatic path', () => {
    const send = PROBE_SEND.slice(PROBE_SEND.indexOf('if (channel === "email")'));
    expect(send.slice(0, 1400)).toMatch(/welcomeEmailHtml\(/);
    expect(send.slice(0, 1400)).toMatch(/WELCOME_EMAIL_SUBJECT/);
  });
});

describe('the email preview shows the real document', () => {
  it('returns the email from preview mode, built by the sending function', () => {
    const preview = PROBE_SEND.slice(PROBE_SEND.indexOf('mode: "preview"'));
    expect(preview.slice(0, 2500)).toMatch(/email: \{/);
    // The same builder that sends it — a second copy would drift from what goes out.
    expect(preview.slice(0, 2500)).toMatch(/welcomeEmailHtml\(/);
    expect(preview.slice(0, 2500)).toMatch(/WELCOME_EMAIL_SUBJECT/);
  });

  /*
   * The document interpolates a name that came from a form. Rendering it in
   * the admin panel without a sandbox would execute whatever it contained.
   */
  it('renders the preview in a sandboxed iframe with no scripts', () => {
    expect(PANEL).toMatch(/srcDoc=\{preview\.email\.html\}/);
    expect(PANEL).toMatch(/sandbox=""/);
    expect(PANEL).not.toMatch(/sandbox="allow-scripts/);
  });

  /*
   * `Hi ${name}` went straight into markup. A business called
   * "Mama & Sons <Lagos>" would have broken the document, and worse would
   * have travelled to a real inbox.
   */
  it('escapes everything it interpolates into the email', () => {
    expect(PROBE_SEND).toMatch(/function esc\(value: string\)/);
    expect(PROBE_SEND).toMatch(/const name = esc\(opts\.name\)/);
    expect(PROBE_SEND).toMatch(/const profile = esc\(opts\.profile\)/);
  });
});

describe('the brand-kit email is built to survive real inboxes', () => {
  /*
   * MEASURED 2026-10-10: the document had no <head> at all — no charset, no
   * viewport, no title — and no preheader, so inboxes previewed the logo's
   * alt text beside the subject.
   */
  it('has a real document head and a written preheader', () => {
    expect(PROBE_SEND).toMatch(/<meta name="viewport"/);
    expect(PROBE_SEND).toMatch(/<title>Welcome to NowOpen Africa<\/title>/);
    expect(PROBE_SEND).toMatch(/Preheader/);
  });

  /* Outlook renders no CSS gradient; without a solid colour the header is white on white. */
  it('gives the gradient header a solid fallback colour', () => {
    expect(PROBE_SEND).toMatch(/bgcolor="#6d28d9"/);
    expect(PROBE_SEND).toMatch(/background-color:#6d28d9;background:linear-gradient/);
  });

  /* Two 150px columns of 12px text on a phone is legible to nobody. */
  it('stacks the starter-pack cards on a narrow screen', () => {
    expect(PROBE_SEND).toMatch(/@media only screen and \(max-width: 520px\)/);
    expect(PROBE_SEND).toMatch(/class="np-col"/);
  });

  /*
   * HTML-only mail scores worse with filters and leaves a text client with
   * markup. The alternative is written, not stripped from the HTML.
   */
  it('sends a plain-text alternative at both send sites', () => {
    expect(PROBE_SEND).toMatch(/function welcomeEmailText/);
    expect((PROBE_SEND.match(/welcomeEmailText\(\{/g) ?? []).length).toBe(2);
  });

  /* "Is this spam?" is the one question a welcome must not raise. */
  it('says why the email arrived', () => {
    expect(PROBE_SEND).toMatch(/receiving this because a NowOpen Africa business profile was created/);
  });
});
