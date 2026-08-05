// Real OAuth linking for the Studio's Schedule & Publish channels.
//
// The browser never sees or stores provider tokens — it only triggers the
// authorize step (in a popup), then receives a success message when the
// provider redirects back here. Tokens are written to `social_connections`
// with the service role, and everything else flows through this function.
//
// Routes (all under /functions/v1/social-auth):
//   GET  ?action=authorize&provider=&business_id=   -> { url } for the consent popup
//   GET  ?action=callback&provider=&code=&state=    <- provider redirect, returns
//                                                        self-closing HTML page
//   POST ?action=disconnect&provider=&business_id=  -> { ok }
//   GET  ?action=capabilities                       -> which channels are wired up
//
// JWT verification is off for this function because provider redirects can't
// attach our token; authorize/disconnect validate the user JWT manually, and
// callback trusts only the signed `state` issued by authorize.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  PROVIDERS, PROVIDER_LABELS, providerFor,
  signState, verifyState, randomNonce, pkcePair, metaConfigured,
  linkedinConfigured, xConfigured, tiktokConfigured, ProviderAccount,
} from "../_shared/social.ts";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function redirectUri(provider: string): string {
  return `${supabaseUrl}/functions/v1/social-auth?action=callback&provider=${encodeURIComponent(provider)}`;
}

function appOrigin(): string {
  return (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/$/, "");
}

function callbackHtml(kind: "success" | "error", provider: string, origin: string, errorMessage?: string): Response {
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const message = escapeHtml(kind === "success"
    ? `Your ${PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider} account is connected — you can close this window.`
    : errorMessage ?? "Connection failed — you can close this window and try again.");
  const payload = JSON.stringify({ type: "nowopen-social-connected", provider, status: kind, error: errorMessage });
  const html = `<!doctype html><html><body>
  <p style="font-family:sans-serif;text-align:center;margin-top:40px">${message}</p>
  <script>
    try {
      var target = ${JSON.stringify(origin)} || '*';
      window.opener && window.opener.postMessage(${payload}, target);
      window.close();
    } catch (e) {}
  </script>
  </body></html>`;
  return new Response(html, { headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
}

async function currentUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

async function ownsBusiness(userId: string, businessId: string): Promise<boolean> {
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

async function saveAccount(userId: string, businessId: string, account: ProviderAccount) {
  const row = {
    business_id: businessId,
    user_id: userId,
    provider: account.provider,
    account_id: account.accountId,
    account_name: account.accountName ?? null,
    access_token: account.accessToken,
    refresh_token: account.refreshToken ?? null,
    token_expires_at: account.expiresAt?.toISOString() ?? null,
    scope: account.scope ?? null,
    meta: account.meta ?? null,
  };
  const { error } = await supabase.from("social_connections").upsert(row, {
    onConflict: "business_id,provider,account_id",
  });
  if (error) throw new Error(`Could not save connection: ${error.message}`);
}

async function handleAuthorize(req: Request, params: URLSearchParams): Promise<Response> {
  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return jsonResponse({ error: "Too many requests — please wait a moment." }, 429);
  }
  const provider = params.get("provider") ?? "";
  const businessId = params.get("business_id") ?? "";
  const providerDef = providerFor(provider);

  if (!providerDef.configured()) {
    return jsonResponse({ error: `${PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider} isn't wired up yet — its developer-app credentials aren't set in this project.` }, 503);
  }
  const user = await currentUser(req);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!businessId) return jsonResponse({ error: "Missing business id." }, 400);
  if (!(await ownsBusiness(user.id, businessId))) return jsonResponse({ error: "You don't own that business." }, 403);

  await supabase.rpc("prune_social_auth_pending");

  const nonce = randomNonce();
  const origin = (req.headers.get("Origin") ?? req.headers.get("Referer") ?? "").replace(/\/$/, "") || appOrigin();
  const state = await signState({ provider, businessId, userId: user.id, nonce, origin });

  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (providerDef.needsPkce) {
    const pair = pkcePair();
    codeVerifier = pair.verifier;
    codeChallenge = await pair.challenge;
  }

  const { error: pendingError } = await supabase.from("social_auth_pending").insert({
    provider,
    business_id: businessId,
    user_id: user.id,
    nonce,
    code_verifier: codeVerifier ?? null,
  });
  if (pendingError) return jsonResponse({ error: "Could not start the connection flow." }, 500);

  const url = providerDef.authorizeUrl(redirectUri(provider), state, { codeChallenge });
  return jsonResponse({ url });
}

async function handleCallback(params: URLSearchParams): Promise<Response> {
  const provider = params.get("provider") ?? "";
  const code = params.get("code") ?? "";
  const stateParam = params.get("state") ?? "";
  const error = params.get("error") ?? "";
  const origin = params.get("origin") ?? "";

  if (error || !code) {
    const providerDef = providerFor(provider);
    return callbackHtml("error", provider, origin || appOrigin(), error ? `The provider declined the connection (${error}).` : "The connection was cancelled.");
  }

  const state = await verifyState(stateParam);
  if (!state || state.provider !== provider) {
    return callbackHtml("error", provider, origin || appOrigin(), "The connection could not be verified. Please try again.");
  }

  // Consume the one-time handshake (carries the PKCE verifier for X).
  const { data: pending } = await supabase.from("social_auth_pending")
    .select("code_verifier, business_id, user_id")
    .eq("nonce", state.nonce)
    .maybeSingle();
  await supabase.from("social_auth_pending").delete().eq("nonce", state.nonce);
  if (!pending) {
    return callbackHtml("error", provider, state.origin || origin || appOrigin(), "This connection request has expired — please try again.");
  }

  const originTarget = state.origin || origin || appOrigin();
  try {
    const providerDef = providerFor(provider);
    const exchanged = await providerDef.exchangeCode(code, redirectUri(provider), pending.code_verifier ?? undefined);
    const accounts = [exchanged.account, ...(exchanged.extraAccounts ?? [])];
    for (const account of accounts) {
      await saveAccount(pending.user_id, pending.business_id, account);
    }
    return callbackHtml("success", provider, originTarget);
  } catch (e) {
    console.error("social-auth callback failed:", e);
    return callbackHtml("error", provider, originTarget, e instanceof Error ? e.message : "Something went wrong while connecting.");
  }
}

async function handleDisconnect(req: Request, params: URLSearchParams): Promise<Response> {
  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return jsonResponse({ error: "Too many requests — please wait a moment." }, 429);
  }
  const provider = params.get("provider") ?? "";
  const businessId = params.get("business_id") ?? "";
  const user = await currentUser(req);
  if (!user) return jsonResponse({ error: "Not signed in." }, 401);
  if (!businessId || !provider) return jsonResponse({ error: "Missing provider or business id." }, 400);
  if (!(await ownsBusiness(user.id, businessId))) return jsonResponse({ error: "You don't own that business." }, 403);

  const { error } = await supabase
    .from("social_connections")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("provider", provider);
  if (error) return jsonResponse({ error: "Could not disconnect." }, 500);
  return jsonResponse({ ok: true });
}

function handleCapabilities(): Response {
  const configured = {
    instagram: metaConfigured(),
    facebook: metaConfigured(),
    linkedin: linkedinConfigured(),
    x: xConfigured(),
    tiktok: tiktokConfigured(),
  };
  const supported = Object.keys(PROVIDERS);
  return jsonResponse({ configured, supported, origin: appOrigin() });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const params = url.searchParams;
  const action = params.get("action") ?? "";

  try {
    switch (action) {
      case "authorize":
        return await handleAuthorize(req, params);
      case "callback":
        return await handleCallback(params);
      case "disconnect":
        return await handleDisconnect(req, params);
      case "capabilities":
        return handleCapabilities();
      default:
        return jsonResponse({ error: "Unknown action. Use authorize, callback, disconnect or capabilities." }, 400);
    }
  } catch (e) {
    console.error("social-auth error:", e);
    return jsonResponse({ error: "An error occurred." }, 500);
  }
});
