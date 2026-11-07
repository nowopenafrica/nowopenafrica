import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * MEASURED 2026-10-12 against this project's /auth/v1/settings:
 *   enabled  -> google, github, email, phone (sms_provider: twilio)
 *   disabled -> facebook, apple, linkedin_oidc, twitter, azure (400)
 *
 * And the authorize endpoint answers "Provider instagram could not be found":
 * Instagram is not one of Supabase's 19 providers, so "sign in with Instagram"
 * cannot be built however the button is labelled.
 */
const RAW = readFileSync('src/components/business/ClaimBusiness.tsx', 'utf8');
const CLAIM = RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('claiming starts on the listing, not on another page', () => {
  /*
   * An owner who has just recognised their own business is the most motivated
   * visitor this platform gets. The old flow sent them to /login?next= and
   * asked them to find their way back.
   */
  it('no longer navigates away to sign in', () => {
    expect(CLAIM).not.toMatch(/\/login\?next=/);
    expect(CLAIM).toMatch(/<AuthModal/);
  });

  it('reuses the shared auth modal rather than its own sign-in', () => {
    // AuthModal already does email, phone-with-code and social, and gates
    // Facebook on a live probe. A second copy would drift from it.
    expect(CLAIM).toMatch(/from '\.\.\/auth\/AuthModal'/);
    expect(CLAIM).not.toMatch(/signInWith/);
  });

  it('carries them into the claim form once they have an account', () => {
    expect(CLAIM).toMatch(/claimAfterAuth/);
    expect(CLAIM).toMatch(/setOpen\(true\)/);
  });
});

describe('the Instagram route is evidence, not a login', () => {
  it('offers the handle as one-tap evidence', () => {
    expect(CLAIM).toMatch(/I run @\{instagramHandle\}/);
    expect(CLAIM).toMatch(/setEvidence/);
  });

  /* Claiming "sign in with Instagram" would be a button that cannot work. */
  it('never pretends Instagram is an auth provider', () => {
    expect(CLAIM).not.toMatch(/provider: 'instagram'/);
    expect(CLAIM).not.toMatch(/signInWithOAuth/);
  });

  it('does not overwrite what the owner already typed', () => {
    expect(CLAIM).toMatch(/prev\.trim\(\)\s*\?\s*prev/);
  });
});
