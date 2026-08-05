// Shared plumbing for real social publishing (Instagram + Facebook via Meta's
// Graph API, LinkedIn, X, TikTok). Used by the `social-auth` and
// `social-publish` edge functions.
//
// Nothing here talks to a database; callers supply the tokens/ids. Every
// provider implements the same four hooks so the edge functions stay thin:
//
//   configured()          are the app credentials present in this project?
//   authorizeUrl(state)   the consent screen URL for the OAuth popup
//   exchangeCode(...)     swap the callback `code` for tokens + account info
//   refresh(...)          rotate an expired access token
//   publish(...)          actually post content on behalf of the account
//
// Where a provider needs a step that isn't possible via its public API (e.g.
// TikTok cannot take image posts), publish() returns ok:false with a clear
// message and the caller simulates the delivery instead.

export type ProviderKey = "instagram" | "facebook" | "linkedin" | "x" | "tiktok";

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
  tiktok: "TikTok",
};

export interface ProviderAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface ProviderAccount {
  provider: ProviderKey;
  accountId: string;
  accountName?: string;
  meta?: Record<string, unknown>;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface PublishMedia {
  name: string;
  url: string; // public http(s) URL after the function stages it
  type: "image" | "video";
}

export interface PublishInput {
  provider: ProviderKey;
  text: string;
  accountId: string;
  accessToken: string;
  media?: PublishMedia;
}

export interface PublishResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

export interface ExchangeResult {
  account: ProviderAccount;
  /** Additional accounts granted in the same flow (e.g. every Meta page). */
  extraAccounts?: ProviderAccount[];
}

const META_VERSION = "v20.0";
const META_GRAPH = `https://graph.facebook.com/${META_VERSION}`;

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function env(name: string): string {
  return Deno.env.get(name) ?? "";
}

const isConfigured = (name: string) => env(name).length > 0;

// ---------------------------------------------------------------------------
// OAuth state signing (state param can be forged by an attacker, so the
// callback only trusts a signed round-trip).
// ---------------------------------------------------------------------------

function signingSecret(): string {
  const secret = Deno.env.get("SUPABASE_JWT_SECRET") ?? Deno.env.get("SOCIAL_STATE_SECRET") ?? "";
  if (!secret) throw new Error("No SUPABASE_JWT_SECRET set — cannot sign OAuth state.");
  return secret;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

export interface OAuthState {
  provider: ProviderKey;
  businessId: string;
  userId: string;
  nonce: string;
  /** Frontend origin, so the callback's self-closing page knows where to post back to. */
  origin?: string;
}

export async function signState(state: OAuthState): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify(state)));
  return `${payload}.${await hmac(signingSecret(), payload)}`;
}

export async function verifyState(state: string): Promise<OAuthState | null> {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(signingSecret(), payload);
  if (expected !== sig) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (!parsed.provider || !parsed.businessId || !parsed.userId || !parsed.nonce) return null;
    return parsed as OAuthState;
  } catch {
    return null;
  }
}

export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return b64url(bytes);
}

export function pkcePair(): { verifier: string; challenge: Promise<string> } {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(43)));
  return { verifier, challenge: pkceChallenge(verifier) };
}

async function pkceChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
}

// ---------------------------------------------------------------------------
// Tiny fetch helpers
// ---------------------------------------------------------------------------

async function formPost(url: string, body: Record<string, string>): Promise<{ ok: boolean; status: number; json: any }> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) if (v) form.append(k, v);
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

async function jsonPost(url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

async function jsonGet(url: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(url, { headers });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

// Stack-safe binary → base64 (a spread on a big Uint8Array can overflow the
// call stack).
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// ---------------------------------------------------------------------------
// Meta (Instagram + Facebook) — one app, one token, many pages.
// ---------------------------------------------------------------------------

function metaConfig() {
  const clientId = env("META_APP_ID");
  const clientSecret = env("META_APP_SECRET");
  return { clientId, clientSecret, graph: META_GRAPH };
}

export function metaConfigured(): boolean {
  return isConfigured("META_APP_ID") && isConfigured("META_APP_SECRET");
}

export function metaAuthorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = metaConfig();
  const scope = [
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
    "business_management",
  ].join(",");
  return `https://www.facebook.com/${META_VERSION}/dialog/oauth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}&response_type=code`;
}

async function metaLongLived(shortLived: string): Promise<string> {
  const { clientId, clientSecret } = metaConfig();
  const { ok, json } = await jsonGet(
    `${META_GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&fb_exchange_token=${encodeURIComponent(shortLived)}`
  );
  if (!ok || !json.access_token) {
    throw new Error(`Meta token exchange failed (${json.error?.message ?? "unknown error"})`);
  }
  return json.access_token as string;
}

/** Refreshes/extends a Meta long-lived user token before it lapses (60 days). */
export async function metaRefresh(conn: { accessToken: string }): Promise<ProviderAuth> {
  const refreshed = await metaLongLived(conn.accessToken);
  // Long-lived tokens are valid ~60 days; ask again shortly before they lapse.
  const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);
  return { accessToken: refreshed, expiresAt };
}

export async function metaExchangeCode(code: string, redirectUri: string): Promise<ExchangeResult> {
  const { clientId, clientSecret } = metaConfig();
  const shortLived = await formPost(`${META_GRAPH}/oauth/access_token`, {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  if (!shortLived.ok || !shortLived.json.access_token) {
    throw new Error(`Meta exchange failed (${shortLived.json.error?.message ?? "unknown error"})`);
  }
  const accessToken = await metaLongLived(shortLived.json.access_token);

  // Each Facebook page the app can manage becomes a "facebook" connection;
  // pages with a linked Instagram business account also become "instagram".
  const pages = await jsonGet(`${META_GRAPH}/me/accounts?fields=id,name,username,instagram_business_account{id,username}&access_token=${encodeURIComponent(accessToken)}`);
  if (!pages.ok) throw new Error(`Could not list Facebook pages (${pages.json.error?.message ?? "unknown error"})`);

  const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000);
  const accounts: ProviderAccount[] = [];
  for (const page of pages.json.data ?? []) {
    accounts.push({
      provider: "facebook",
      accountId: String(page.id),
      accountName: page.name ?? page.username,
      meta: { pageToken: accessToken, username: page.username },
      accessToken,
      expiresAt,
    });
    const ig = page.instagram_business_account;
    if (ig?.id) {
      accounts.push({
        provider: "instagram",
        accountId: String(ig.id),
        accountName: ig.username ?? ig.id,
        meta: { pageId: String(page.id) },
        accessToken,
        expiresAt,
      });
    }
  }
  if (accounts.length === 0) throw new Error("This app can't manage any Facebook pages. Make it an admin of a page first.");
  return { account: accounts[0], extraAccounts: accounts.slice(1) as ProviderAccount[] };
}

// --- Meta publishing ---------------------------------------------------------

async function instagramPublish(input: PublishInput): Promise<PublishResult> {
  const { graph } = metaConfig();
  const token = encodeURIComponent(input.accessToken);
  const caption = input.text.slice(0, 2200);

  if (!input.media) {
    const container = await jsonPost(`${graph}/${input.accountId}/media`, { caption, access_token: input.accessToken });
    if (!container.ok || !container.json.id) {
      return { ok: false, error: `Instagram: ${container.json.error?.message ?? "could not create media container"}` };
    }
    return instagramPublishContainer(graph, input.accountId, input.accessToken, container.json.id);
  }

  const media: Record<string, string> = { caption, access_token: input.accessToken };
  if (input.media.type === "video") {
    media.media_type = "VIDEO";
    media.video_url = input.media.url;
  } else {
    media.image_url = input.media.url;
  }
  const container = await jsonPost(`${graph}/${input.accountId}/media`, media);
  if (!container.ok || !container.json.id) {
    return { ok: false, error: `Instagram: ${container.json.error?.message ?? "could not create media container"}` };
  }
  return instagramPublishContainer(graph, input.accountId, input.accessToken, container.json.id);
}

async function instagramPublishContainer(graph: string, accountId: string, token: string, containerId: string): Promise<PublishResult> {
  // The container is ready once its status_code is FINISHED; poll briefly.
  for (let i = 0; i < 8; i++) {
    const status = await jsonGet(`${graph}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    if (status.json.status_code === "FINISHED") break;
    if (status.json.status_code === "ERROR") {
      return { ok: false, error: `Instagram: container failed (${status.json.status ?? "unknown"})` };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const published = await jsonPost(`${graph}/${accountId}/media_publish`, { creation_id: containerId, access_token: token });
  if (!published.ok || !published.json.id) {
    return { ok: false, error: `Instagram: ${published.json.error?.message ?? "could not publish container"}` };
  }
  return { ok: true, externalId: String(published.json.id) };
}

async function facebookPublish(input: PublishInput): Promise<PublishResult> {
  const { graph } = metaConfig();
  if (input.media && input.media.type === "image") {
    const photo = await jsonPost(`${graph}/${input.accountId}/photos`, { url: input.media.url, caption: input.text.slice(0, 63000), access_token: input.accessToken });
    if (!photo.ok) return { ok: false, error: `Facebook: ${photo.json.error?.message ?? "could not publish photo"}` };
    return { ok: true, externalId: String(photo.json.post_id ?? photo.json.id) };
  }
  const body: Record<string, string> = { message: input.text.slice(0, 63000), access_token: input.accessToken };
  if (input.media) body.link = input.media.url;
  const feed = await jsonPost(`${graph}/${input.accountId}/feed`, body);
  if (!feed.ok) return { ok: false, error: `Facebook: ${feed.json.error?.message ?? "could not publish post"}` };
  return { ok: true, externalId: String(feed.json.id) };
}

// ---------------------------------------------------------------------------
// LinkedIn
// ---------------------------------------------------------------------------

function linkedinConfig() {
  return { clientId: env("LINKEDIN_CLIENT_ID"), clientSecret: env("LINKEDIN_CLIENT_SECRET") };
}

export function linkedinConfigured(): boolean {
  return isConfigured("LINKEDIN_CLIENT_ID") && isConfigured("LINKEDIN_CLIENT_SECRET");
}

export function linkedinAuthorizeUrl(redirectUri: string, state: string): string {
  const { clientId } = linkedinConfig();
  const scope = "r_liteprofile r_emailaddress w_member_social".split(" ").join("%20");
  return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${scope}`;
}

export async function linkedinExchangeCode(code: string, redirectUri: string): Promise<ExchangeResult> {
  const { clientId, clientSecret } = linkedinConfig();
  const tok = await formPost("https://www.linkedin.com/oauth/v2/accessToken", {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (!tok.ok || !tok.json.access_token) {
    throw new Error(`LinkedIn exchange failed (${tok.json.error_description ?? tok.json.error ?? "unknown error"})`);
  }
  const me = await jsonGet("https://api.linkedin.com/v2/userinfo", { Authorization: `Bearer ${tok.json.access_token}` });
  if (!me.ok || !me.json.sub) throw new Error("LinkedIn: could not fetch your profile.");
  const expiresAt = tok.json.expires_in ? new Date(Date.now() + Number(tok.json.expires_in) * 1000) : undefined;
  return {
    account: {
      provider: "linkedin",
      accountId: String(me.json.sub),
      accountName: me.json.name ?? me.json.sub,
      accessToken: tok.json.access_token,
      refreshToken: tok.json.refresh_token,
      expiresAt,
      scope: tok.json.scope,
    },
  };
}

export async function linkedinRefresh(refreshToken: string): Promise<ProviderAuth> {
  const { clientId, clientSecret } = linkedinConfig();
  const tok = await formPost("https://www.linkedin.com/oauth/v2/accessToken", {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (!tok.ok || !tok.json.access_token) throw new Error(`LinkedIn refresh failed (${tok.json.error_description ?? "unknown error"})`);
  return {
    accessToken: tok.json.access_token,
    refreshToken: tok.json.refresh_token ?? refreshToken,
    expiresAt: tok.json.expires_in ? new Date(Date.now() + Number(tok.json.expires_in) * 1000) : undefined,
  };
}

async function linkedinPublish(input: PublishInput): Promise<PublishResult> {
  const author = `urn:li:person:${input.accountId}`;
  const shareCommentary = { text: input.text.slice(0, 3000) };

  if (input.media) {
    // Register an image upload, push the bytes, then share the asset.
    const reg = await jsonPost("https://api.linkedin.com/v2/assets?action=registerUpload", {
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: author,
        serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
      },
    }, { Authorization: `Bearer ${input.accessToken}` });
    if (!reg.ok || !reg.json.value?.uploadUrl) {
      return { ok: false, error: `LinkedIn: ${reg.json.message ?? "could not register image upload"}` };
    }
    const uploadUrl = reg.json.value.uploadUrl;
    const asset = reg.json.value.asset;
    const bytes = await fetch(input.media.url).then((r) => (r.ok ? r.arrayBuffer() : null));
    if (!bytes) return { ok: false, error: "LinkedIn: could not download the image for upload." };
    const up = await fetch(uploadUrl, { method: "POST", body: bytes, headers: { "Content-Type": "application/octet-stream" } });
    if (!up.ok && up.status !== 201) return { ok: false, error: `LinkedIn: image upload failed (${up.status})` };

    const share = await jsonPost("https://api.linkedin.com/v2/ugcPosts", {
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary,
          shareMediaCategory: "IMAGE",
          media: [{ status: "READY", description: shareCommentary, media: asset }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }, { Authorization: `Bearer ${input.accessToken}` });
    if (!share.ok) return { ok: false, error: `LinkedIn: ${share.json.message ?? "could not share post"}` };
    return { ok: true, externalId: String(share.json.id) };
  }

  const share = await jsonPost("https://api.linkedin.com/v2/ugcPosts", {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": { shareCommentary, shareMediaCategory: "NONE" },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  }, { Authorization: `Bearer ${input.accessToken}` });
  if (!share.ok) return { ok: false, error: `LinkedIn: ${share.json.message ?? "could not share post"}` };
  return { ok: true, externalId: String(share.json.id) };
}

// ---------------------------------------------------------------------------
// X
// ---------------------------------------------------------------------------

function xConfig() {
  return { clientId: env("X_CLIENT_ID"), clientSecret: env("X_CLIENT_SECRET") };
}

export function xConfigured(): boolean {
  return isConfigured("X_CLIENT_ID") && isConfigured("X_CLIENT_SECRET");
}

export function xAuthorizeUrl(redirectUri: string, state: string, extra?: { codeChallenge?: string }): string {
  const { clientId } = xConfig();
  const scope = "tweet.write users.read offline.access".split(" ").join("%20");
  const challenge = extra?.codeChallenge ?? "";
  return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`;
}

export async function xExchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<ExchangeResult> {
  const { clientId, clientSecret } = xConfig();
  const tok = await formPost("https://api.x.com/2/oauth2/token", {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: codeVerifier,
  });
  if (!tok.ok || !tok.json.access_token) {
    throw new Error(`X exchange failed (${tok.json.error_description ?? tok.json.error ?? "unknown error"})`);
  }
  const me = await jsonGet("https://api.x.com/2/users/me", { Authorization: `Bearer ${tok.json.access_token}` });
  const expiresAt = tok.json.expires_in ? new Date(Date.now() + Number(tok.json.expires_in) * 1000) : undefined;
  return {
    account: {
      provider: "x",
      accountId: me.ok ? String(me.json.data?.id ?? "") : "",
      accountName: me.ok ? me.json.data?.username : undefined,
      accessToken: tok.json.access_token,
      refreshToken: tok.json.refresh_token,
      expiresAt,
      scope: tok.json.scope,
    },
  };
}

export async function xRefresh(refreshToken: string): Promise<ProviderAuth> {
  const { clientId, clientSecret } = xConfig();
  const tok = await formPost("https://api.x.com/2/oauth2/token", {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  if (!tok.ok || !tok.json.access_token) throw new Error(`X refresh failed (${tok.json.error_description ?? "unknown error"})`);
  return {
    accessToken: tok.json.access_token,
    refreshToken: tok.json.refresh_token ?? refreshToken,
    expiresAt: tok.json.expires_in ? new Date(Date.now() + Number(tok.json.expires_in) * 1000) : undefined,
  };
}

async function xPublish(input: PublishInput): Promise<PublishResult> {
  const text = input.text.slice(0, 280);
  const body: Record<string, unknown> = { text };
  if (input.media && input.media.type === "image") {
    // v1.1 media upload accepts OAuth 2.0 user tokens for the media_data field.
    const raw = new Uint8Array(await fetch(input.media.url).then((r) => r.arrayBuffer()));
    if (raw.byteLength > 4 * 1024 * 1024) {
      return { ok: false, error: "X: images over ~4MB need the chunked upload — re-attach a smaller file." };
    }
    const form = new FormData();
    form.append("media_data", bytesToBase64(raw));
    const up = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}` },
      body: form,
    });
    const upJson = await up.json().catch(() => ({}));
    if (!up.ok || !upJson.media_id_string) {
      return { ok: false, error: `X: media upload failed (${upJson.errors?.[0]?.message ?? up.status})` };
    }
    body.media = { media_ids: [String(upJson.media_id_string)] };
  }
  const tweet = await jsonPost("https://api.x.com/2/tweets", body, { Authorization: `Bearer ${input.accessToken}` });
  if (!tweet.ok) return { ok: false, error: `X: ${tweet.json.detail ?? tweet.json.title ?? "could not post tweet"}` };
  return { ok: true, externalId: String(tweet.json.data?.id ?? "") };
}

// ---------------------------------------------------------------------------
// TikTok
// ---------------------------------------------------------------------------

function tiktokConfig() {
  return { clientKey: env("TIKTOK_CLIENT_KEY"), clientSecret: env("TIKTOK_CLIENT_SECRET") };
}

export function tiktokConfigured(): boolean {
  return isConfigured("TIKTOK_CLIENT_KEY") && isConfigured("TIKTOK_CLIENT_SECRET");
}

export function tiktokAuthorizeUrl(redirectUri: string, state: string): string {
  const { clientKey } = tiktokConfig();
  const scope = "user.info.basic video.publish".split(" ").join("%20");
  return `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(clientKey)}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
}

export async function tiktokExchangeCode(code: string, redirectUri: string): Promise<ExchangeResult> {
  const { clientKey, clientSecret } = tiktokConfig();
  const tok = await formPost("https://open.tiktokapis.com/v2/oauth/token/", {
    client_key: clientKey,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (!tok.ok || !tok.json.access_token) {
    throw new Error(`TikTok exchange failed (${tok.json.error ?? tok.json.message ?? "unknown error"})`);
  }
  const me = await jsonGet("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", {
    Authorization: `Bearer ${tok.json.access_token}`,
  });
  const user = me.ok ? me.json.data?.user ?? {} : {};
  return {
    account: {
      provider: "tiktok",
      accountId: String(user.open_id ?? ""),
      accountName: user.display_name,
      meta: { avatarUrl: user.avatar_url },
      accessToken: tok.json.access_token,
      refreshToken: tok.json.refresh_token,
      expiresAt: tok.json.expires_in ? new Date(Date.now() + Number(tok.json.expires_in) * 1000) : undefined,
      scope: tok.json.scope,
    },
  };
}

export async function tiktokRefresh(refreshToken: string): Promise<ProviderAuth> {
  const { clientKey, clientSecret } = tiktokConfig();
  const tok = await formPost("https://open.tiktokapis.com/v2/oauth/token/", {
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!tok.ok || !tok.json.access_token) throw new Error(`TikTok refresh failed (${tok.json.error ?? "unknown error"})`);
  return {
    accessToken: tok.json.access_token,
    refreshToken: tok.json.refresh_token ?? refreshToken,
    expiresAt: tok.json.expires_in ? new Date(Date.now() + Number(tok.json.expires_in) * 1000) : undefined,
  };
}

async function tiktokPublish(input: PublishInput): Promise<PublishResult> {
  // The TikTok API only accepts video uploads; image posts are simulated.
  if (!input.media || input.media.type !== "video") {
    return { ok: false, error: "TikTok requires a video — image/text posts can't be uploaded via the API yet." };
  }
  const bytes = await fetch(input.media.url).then((r) => (r.ok ? r.arrayBuffer() : null));
  if (!bytes) return { ok: false, error: "TikTok: could not download the video for upload." };
  const totalChunks = 1;
  const init = await jsonPost("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    post_info: { title: input.text.slice(0, 2200) },
    source_info: { source: "FILE_UPLOAD", video_size: bytes.byteLength, chunk_size: bytes.byteLength, total_chunk_count: totalChunks },
    access_token: input.accessToken,
  });
  if (!init.ok || !init.json.data?.upload_url) {
    return { ok: false, error: `TikTok: ${init.json.error?.message ?? init.json.message ?? "could not start upload"}` };
  }
  const uploadUrl = init.json.data.upload_url as string;
  const up = await fetch(uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "video/mp4" } });
  if (up.status !== 200 && up.status !== 201 && up.status !== 204) {
    return { ok: false, error: `TikTok: chunk upload failed (${up.status})` };
  }
  const publishId = String(init.json.data.publish_id);
  // Wait for processing, then report the publish id back.
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const status = await jsonPost("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      publish_id: publishId,
      access_token: input.accessToken,
    });
    if (status.ok && status.json.data?.status === "PUBLISH_COMPLETE") break;
  }
  return { ok: true, externalId: publishId };
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

export interface Provider {
  key: ProviderKey;
  configured(): boolean;
  authorizeUrl(redirectUri: string, state: string, extra?: { codeChallenge?: string }): string;
  needsPkce: boolean;
  exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<ExchangeResult>;
  refresh(conn: { accessToken: string; refreshToken?: string; expiresAt?: Date }): Promise<ProviderAuth>;
  publish(input: PublishInput): Promise<PublishResult>;
}

export const PROVIDERS: Record<ProviderKey, Provider> = {
  instagram: {
    key: "instagram",
    configured: metaConfigured,
    authorizeUrl: metaAuthorizeUrl,
    needsPkce: false,
    exchangeCode: metaExchangeCode,
    refresh: metaRefresh,
    publish: instagramPublish,
  },
  facebook: {
    key: "facebook",
    configured: metaConfigured,
    authorizeUrl: metaAuthorizeUrl,
    needsPkce: false,
    exchangeCode: metaExchangeCode,
    refresh: metaRefresh,
    publish: facebookPublish,
  },
  linkedin: {
    key: "linkedin",
    configured: linkedinConfigured,
    authorizeUrl: linkedinAuthorizeUrl,
    needsPkce: false,
    exchangeCode: linkedinExchangeCode,
    refresh: linkedinRefresh,
    publish: linkedinPublish,
  },
  x: {
    key: "x",
    configured: xConfigured,
    authorizeUrl: xAuthorizeUrl,
    needsPkce: true,
    exchangeCode: xExchangeCode,
    refresh: xRefresh,
    publish: xPublish,
  },
  tiktok: {
    key: "tiktok",
    configured: tiktokConfigured,
    authorizeUrl: tiktokAuthorizeUrl,
    needsPkce: false,
    exchangeCode: tiktokExchangeCode,
    refresh: tiktokRefresh,
    publish: tiktokPublish,
  },
};

export function providerFor(key: string): Provider {
  const p = PROVIDERS[key as ProviderKey];
  if (!p) throw new Error(`Unknown social provider: ${key}`);
  return p;
}
