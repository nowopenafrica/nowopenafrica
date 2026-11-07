/**
 * Instagram setup — telling two different features apart, and not claiming
 * either works on scopes alone.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PROBE = readFileSync('supabase/functions/selftest-instagram/index.ts', 'utf8');
const PANEL = readFileSync('src/components/admin/OnboardingMessagingPanel.tsx', 'utf8');

describe('it cannot message anyone', () => {
  it('makes no DM call and says so', () => {
    expect(PROBE).not.toMatch(/\/messages/);
    expect(PROBE).toMatch(/sentAnything: false/);
  });

  it('is staff-only and does not use the automation secret', () => {
    expect(PROBE).toMatch(/STAFF\.has/);
    expect(PROBE).not.toMatch(/AUTOMATION_SECRET/);
  });
});

describe('it asks the right question for the token type', () => {
  it('handles a PAGE token, where /me IS the page', () => {
    /*
     * Measured: on the supplied PAGE token, /me/accounts returned
     * "(#100) Tried accessing nonexisting field (accounts)" — which reads
     * exactly like "this token reaches nothing" and is not. Reporting that as
     * a finding would have sent somebody to re-link an account that was fine.
     */
    expect(PROBE).toMatch(/isPageToken/);
    expect(PROBE).toMatch(/nonexisting field \(accounts\)/);
  });
});

describe('it proves the extractor rather than inferring it', () => {
  it('performs a real business_discovery lookup', () => {
    // A scope is permission to attempt a call, not evidence it succeeds:
    // App Review, account type and Page linkage all sit in between.
    expect(PROBE).toMatch(/business_discovery\.username/);
    expect(PROBE).toMatch(/extractorProof/);
  });

  it('uses our own account as the subject', () => {
    // The least intrusive possible test of a read path.
    expect(PROBE).toMatch(/selfIg/);
  });

  it('only suggests secrets when the lookup actually worked', () => {
    expect(PROBE).toMatch(/suggestedSecrets: extractorProof\.works/);
    expect(PROBE).toMatch(/thisTokenCouldPowerIt: extractorProof\.works/);
  });
});

describe('it states the permanent limit, not just the current one', () => {
  it('says cold Instagram DMs are never possible', () => {
    /*
     * A property of Meta's platform, not of this configuration — so it is
     * pushed unconditionally rather than as a "missing" item somebody might
     * expect to fix. See the 24-hour conversation window.
     */
    expect(PROBE).toMatch(/Cold DMs to a handle are never possible/);
    const idx = PROBE.indexOf('Cold DMs to a handle are never possible');
    const guarded = PROBE.slice(Math.max(0, idx - 400), idx).includes('if (');
    expect(guarded, 'the permanent limit must not be conditional').toBe(false);
  });

  it('separates DM scopes from extractor scopes', () => {
    expect(PROBE).toMatch(/EXTRACTOR_SCOPES/);
    expect(PROBE).toMatch(/DM_SCOPES/);
    expect(PROBE).toMatch(/instagram_manage_insights/);
    expect(PROBE).toMatch(/instagram_manage_messages/);
  });
});

describe('it names the next step, not the end state', () => {
  it('points at regenerating the token before App Review', () => {
    /*
     * Measured 2026-10-08: the token held instagram_basic and reached a
     * linked Business account, and the two missing scopes were simply never
     * ticked when it was generated. Saying "needs App Review" was true of the
     * end state and wrong about the next move — it sent an operator to a
     * process of weeks instead of a two-minute regeneration. Meta grants
     * these to the app's own admins without review (Standard Access).
     */
    expect(PROBE).toMatch(/Regenerate the token with/);
    expect(PROBE).toMatch(/without App Review/);
  });

  it('says nothing when the scopes are already present', () => {
    // A next step that fires in the healthy state is noise.
    expect(PROBE).toMatch(/missingExtractorScopes\.length === 0/);
  });
});

describe('a zero expiry is not a promise', () => {
  it('warns that a PAGE token with no expiry can still die with its session', () => {
    /*
     * Measured the hard way, 2026-10-08: debug_token returned expires_at = 0,
     * this probe reported neverExpires: true, and hours later every call
     * failed with "Session has expired". A page token inherits the lifetime
     * of the user session it came from; one minted in the Graph API Explorer
     * dies with it whatever expires_at says.
     */
    expect(PROBE).toMatch(/neverExpires && d\.type === "PAGE"/);
    expect(PROBE).toMatch(/does not mean it is permanent/);
    expect(PROBE).toMatch(/System User/);
  });
});

describe('the admin screen shows it', () => {
  it('renders what Meta reported about the token', () => {
    expect(PANEL).toMatch(/igProbe/);
    expect(PANEL).toMatch(/needs App Review/);
  });
});
