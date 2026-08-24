import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The edge functions run on Deno, so the Vitest suite cannot execute them.
// What it CAN do is hold the provider layer to the invariants that, when
// broken, only show up as a failed OAuth handshake in production — which is
// exactly how the LinkedIn mismatch below survived: the code asked for the
// legacy r_liteprofile scope and then read the profile from the OpenID Connect
// endpoint, which returns 403 without `openid`.

const social = readFileSync(
  resolve(__dirname, '../../supabase/functions/_shared/social.ts'),
  'utf-8',
);

describe('social provider OAuth contract', () => {
  it('LinkedIn requests the scopes the endpoint it calls actually needs', () => {
    const usesOidcUserinfo = social.includes('https://api.linkedin.com/v2/userinfo');
    const scopeLine = /const scope = "([^"]*)"\.split\(" "\)\.join\("%20"\);/.exec(
      social.slice(social.indexOf('linkedinAuthorizeUrl')),
    );
    expect(scopeLine, 'LinkedIn scope string not found').toBeTruthy();
    const scopes = scopeLine![1].split(' ');

    if (usesOidcUserinfo) {
      // /v2/userinfo is the OIDC endpoint; it needs openid, and `profile` for
      // the display name we store as account_name.
      expect(scopes).toContain('openid');
      expect(scopes).toContain('profile');
      // The deprecated pair must not come back.
      expect(scopes).not.toContain('r_liteprofile');
      expect(scopes).not.toContain('r_emailaddress');
    }
    // Posting is the whole point of the connection.
    expect(scopes).toContain('w_member_social');
  });

  it('every provider that publishes asks for a write scope', () => {
    // Meta: page posting and Instagram publishing are separate permissions.
    expect(social).toContain('pages_manage_posts');
    expect(social).toContain('instagram_content_publish');
    // X needs write plus offline.access, or the token cannot be refreshed and
    // scheduled posting dies the first time it expires.
    expect(social).toContain('tweet.write');
    expect(social).toContain('offline.access');
    // TikTok Direct Post.
    expect(social).toContain('video.publish');
  });

  it('OAuth state is signed with a secret that has no fallback', () => {
    // A default would make state forgeable, which is what protects the
    // callback from being driven by someone else.
    expect(social).toContain('cannot sign OAuth state');
    expect(social).not.toMatch(/signingSecret[\s\S]{0,200}\?\?\s*"[a-zA-Z0-9]/);
  });

  it('authenticates the LinkedIn asset upload leg', () => {
    // registerUpload hands back a LinkedIn URL that still expects the bearer
    // token; without it the image is dropped and the post goes out bare.
    const uploadCall = social.slice(social.indexOf('const up = await fetch(uploadUrl'));
    expect(uploadCall.slice(0, 400)).toContain('Authorization');
  });
});
