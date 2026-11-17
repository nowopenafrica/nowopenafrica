// brand-social-publish
// --------------------
// Publishes APPROVED brand posts straight to Meta at their planned time, for
// channels whose publish_route is 'meta_direct' (Facebook today). Everything
// else keeps going to Zoho.
//
// Actions:
//   tick    (pg_cron, x-automation-key) — settle uncertain attempts, then
//           publish what is due. Does nothing while direct publishing is off.
//   run     (admin)  — the same, on demand.
//   status  (admin)  — switch, last tick, and what the Meta token can do.
//   test    (admin)  — create an UNPUBLISHED post on the Page, read it back,
//           delete it. Proves the write path without anything going public.
//
// Safety, in the order a post meets it:
//   * Only content that is 'approved' with approved_by set, re-read here from
//     the database. Planned time must have passed, but by no more than the
//     grace window: a stale post is left for a person, never posted late.
//   * The shared checks run again; a blocked post is refused.
//   * The daily per-channel ceiling counts what went out and what the team
//     entered from Zoho by hand.
//   * Claim-then-post: a conditional update moves the channel to 'sending',
//     so two ticks cannot publish the same post twice.
//   * A timeout is UNCERTAIN, never retried blindly. The next tick looks on the
//     Page for the post and settles the record from what is actually there.
//   * After a 2xx the post is read back from Meta. "Published" in the record
//     means Meta returned the post and its permalink, not just "request OK".
//   * Token or permission errors stop at once and say "reconnect"; rate limits
//     and Meta outages back off 5, 20, 80 minutes, then give up.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CHANNEL_RULES, checkVariant, isBlocked, lagosDay, mediaKind, trackedUrl, type ChannelId } from "../_shared/brandSocial.ts";
import {
  backoffMinutes, classifyGraphError, facebookRequest, formatProblem, isDue, looksLikeOurPost, MAX_PUBLISH_ATTEMPTS, PUBLISH_BATCH,
  type PostFormat,
} from "../_shared/brandPublish.ts";
import { providerFor } from "../_shared/social.ts";
import { decryptToken, encryptToken } from "../_shared/tokenCrypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name, x-automation-key",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const META_TOKEN = Deno.env.get("META_PAGE_ACCESS_TOKEN") ?? "";
const GRAPH = "https://graph.facebook.com/v20.0";
const THREADS_GRAPH = "https://graph.threads.net/v1.0";
const THREADS_TOKEN = Deno.env.get("THREADS_ACCESS_TOKEN") ?? "";
const THREADS_USER_ID = Deno.env.get("THREADS_USER_ID") ?? "";
const GRAPH_TIMEOUT_MS = 25_000;
const UNCERTAIN_SETTLE_MINUTES = 30;

const db = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function callerIsAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return false;
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await asCaller.auth.getUser();
  if (ue || !u.user) return false;
  const { data, error } = await asCaller.rpc("is_admin");
  return !error && data === true;
}

// ── Graph ────────────────────────────────────────────────────────────────────

type GraphResult = { ok: true; status: number; body: any } | { ok: false; status: number; body: any; timeout?: boolean };

async function graph(method: "GET" | "POST" | "DELETE", path: string, token: string, params: Record<string, string> = {}, base = GRAPH): Promise<GraphResult> {
  const url = new URL(`${base}${path}`);
  const init: RequestInit = { method, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) };
  if (method === "GET" || method === "DELETE") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", token);
  } else {
    init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    init.body = new URLSearchParams({ ...params, access_token: token }).toString();
  }
  try {
    const res = await fetch(url, init);
    let body: any = null;
    try { body = await res.json(); } catch { body = null; }
    return res.ok && !body?.error ? { ok: true, status: res.status, body } : { ok: false, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { error: { message: String((e as Error).name) } }, timeout: true };
  }
}

const pageTokens = new Map<string, string>();
async function pageToken(pageId: string): Promise<string | { error: string }> {
  if (pageTokens.has(pageId)) return pageTokens.get(pageId)!;
  if (!META_TOKEN) return { error: "META_PAGE_ACCESS_TOKEN is not set." };
  const r = await graph("GET", "/me/accounts", META_TOKEN, { fields: "id,access_token", limit: "100" });
  if (!r.ok) return { error: `Could not read the Page token: ${r.body?.error?.message ?? r.status}` };
  const page = (r.body?.data ?? []).find((p: any) => p.id === pageId);
  if (!page?.access_token) return { error: `The Meta token cannot manage Page ${pageId}.` };
  pageTokens.set(pageId, page.access_token);
  return page.access_token;
}

// ── Publishing one channel ───────────────────────────────────────────────────

interface Published { externalId: string; url: string | null; verified: boolean }

async function publishFacebook(pageId: string, caption: string, link: string | null, mediaUrl: string | null, published = true):
  Promise<{ ok: true; post: Published } | { ok: false; error: string; cls: "auth" | "retry" | "permanent" | "uncertain" }> {
  const tok = await pageToken(pageId);
  if (typeof tok !== "string") return { ok: false, error: tok.error, cls: "auth" };
  const req = facebookRequest(caption, link, mediaUrl, mediaKind(mediaUrl), published);
  const r = await graph("POST", `/${pageId}/${req.edge}`, tok, req.params);
  if (!r.ok) {
    if ((r as any).timeout) return { ok: false, error: "UNCERTAIN: no answer from Meta in time. It may have posted; the next run checks the Page before trying again.", cls: "uncertain" };
    const e = r.body?.error ?? {};
    return { ok: false, error: `Meta refused it (${r.status}${e.code ? `, code ${e.code}` : ""}): ${String(e.message ?? "unknown").slice(0, 240)}`, cls: classifyGraphError(r.status, e) };
  }
  const id = String(r.body?.post_id ?? r.body?.id ?? "");
  if (!id) return { ok: false, error: "UNCERTAIN: Meta answered without a post id.", cls: "uncertain" };
  const v = await graph("GET", `/${id}`, tok, { fields: req.edge === "videos" ? "permalink_url,published" : "permalink_url,is_published" });
  const url = v.ok ? (v.body?.permalink_url ? (String(v.body.permalink_url).startsWith("http") ? v.body.permalink_url : `https://www.facebook.com${v.body.permalink_url}`) : null) : null;
  const isPub = v.ok && (v.body?.is_published === true || v.body?.published === true);
  return { ok: true, post: { externalId: id, url, verified: published ? isPub : v.ok } };
}

type Outcome =
  | { ok: true; post: Published }
  | { ok: false; error: string; cls: "auth" | "retry" | "permanent" | "uncertain" }
  /** The platform is still processing a video; finish on a later tick. */
  | { ok: false; processing: string; error: string; cls: "processing" };

function refused(where: string, r: GraphResult): Outcome {
  if ((r as any).timeout) return { ok: false, error: `UNCERTAIN: no answer from ${where} in time. It may have posted; the next run checks before trying again.`, cls: "uncertain" };
  const e = r.body?.error ?? {};
  return { ok: false, error: `${where} refused it (${r.status}${e.code ? `, code ${e.code}` : ""}): ${String(e.message ?? "unknown").slice(0, 240)}`, cls: classifyGraphError(r.status, e) };
}

const fbPermalink = (p: any) => p?.permalink_url ? (String(p.permalink_url).startsWith("http") ? p.permalink_url : `https://www.facebook.com${p.permalink_url}`) : null;

/** Facebook's resumable upload, told to fetch the file from our public URL itself. */
async function fbUploadByUrl(uploadUrl: string, token: string, fileUrl: string): Promise<boolean> {
  try {
    const r = await fetch(uploadUrl, { method: "POST", headers: { Authorization: `OAuth ${token}`, file_url: fileUrl }, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
    const b = await r.json().catch(() => null);
    return r.ok && b?.success !== false;
  } catch { return false; }
}

async function publishFacebookReel(pageId: string, caption: string, videoUrl: string): Promise<Outcome> {
  const tok = await pageToken(pageId);
  if (typeof tok !== "string") return { ok: false, error: tok.error, cls: "auth" };
  const s = await graph("POST", `/${pageId}/video_reels`, tok, { upload_phase: "start" });
  if (!s.ok) return refused("Facebook (reel start)", s);
  const videoId = String(s.body.video_id);
  if (!(await fbUploadByUrl(String(s.body.upload_url), tok, videoUrl))) return { ok: false, error: "Facebook could not fetch the reel video from its link.", cls: "retry" };
  const f = await graph("POST", `/${pageId}/video_reels`, tok, { upload_phase: "finish", video_id: videoId, video_state: "PUBLISHED", description: caption });
  if (!f.ok) return refused("Facebook (reel finish)", f);
  const v = await graph("GET", `/${videoId}`, tok, { fields: "permalink_url,status" });
  return { ok: true, post: { externalId: videoId, url: v.ok ? fbPermalink(v.body) : null, verified: v.ok } };
}

async function publishFacebookStory(pageId: string, mediaUrl: string): Promise<Outcome> {
  const tok = await pageToken(pageId);
  if (typeof tok !== "string") return { ok: false, error: tok.error, cls: "auth" };
  if (mediaKind(mediaUrl) === "image") {
    const p = await graph("POST", `/${pageId}/photos`, tok, { url: mediaUrl, published: "false" });
    if (!p.ok) return refused("Facebook (story photo)", p);
    const st = await graph("POST", `/${pageId}/photo_stories`, tok, { photo_id: String(p.body.id) });
    if (!st.ok) return refused("Facebook (photo story)", st);
    return { ok: true, post: { externalId: String(st.body.post_id ?? p.body.id), url: null, verified: st.body?.success !== false } };
  }
  const s = await graph("POST", `/${pageId}/video_stories`, tok, { upload_phase: "start" });
  if (!s.ok) return refused("Facebook (video story start)", s);
  const videoId = String(s.body.video_id);
  if (!(await fbUploadByUrl(String(s.body.upload_url), tok, mediaUrl))) return { ok: false, error: "Facebook could not fetch the story video from its link.", cls: "retry" };
  const f = await graph("POST", `/${pageId}/video_stories`, tok, { upload_phase: "finish", video_id: videoId });
  if (!f.ok) return refused("Facebook (video story finish)", f);
  return { ok: true, post: { externalId: String(f.body.post_id ?? videoId), url: null, verified: f.body?.success !== false } };
}

/**
 * Instagram and Threads both work in two steps: make a container, wait until
 * the platform has processed it, publish it. A container that is still
 * processing is handed back so the next tick can finish it.
 */
async function waitForContainer(id: string, token: string, field: "status_code" | "status", base = GRAPH, seconds = 40): Promise<"FINISHED" | "IN_PROGRESS" | string> {
  const until = Date.now() + seconds * 1000;
  while (true) {
    const r = await graph("GET", `/${id}`, token, { fields: field }, base);
    const st = r.ok ? String(r.body?.[field] ?? "") : "";
    if (st === "FINISHED" || st === "PUBLISHED") return "FINISHED";
    if (st === "ERROR" || st === "EXPIRED") return st;
    if (Date.now() > until) return "IN_PROGRESS";
    await new Promise((res) => setTimeout(res, 4000));
  }
}

async function publishInstagram(igId: string, format: PostFormat, caption: string, media: string[], pending: string | null): Promise<Outcome> {
  if (!META_TOKEN) return { ok: false, error: "META_PAGE_ACCESS_TOKEN is not set.", cls: "auth" };
  let container = pending;
  if (!container) {
    const item = (url: string, carouselItem: boolean): Record<string, string> => {
      const video = mediaKind(url) === "video";
      const p: Record<string, string> = video ? { media_type: carouselItem ? "VIDEO" : "REELS", video_url: url } : { image_url: url };
      if (carouselItem) p.is_carousel_item = "true";
      return p;
    };
    let params: Record<string, string>;
    if (format === "carousel") {
      const children: string[] = [];
      for (const url of media) {
        const c = await graph("POST", `/${igId}/media`, META_TOKEN, item(url, true));
        if (!c.ok) return refused("Instagram (carousel item)", c);
        children.push(String(c.body.id));
      }
      params = { media_type: "CAROUSEL", children: children.join(","), caption };
    } else if (format === "reel") {
      params = { media_type: "REELS", video_url: media[0], caption, share_to_feed: "true" };
    } else if (format === "story") {
      params = mediaKind(media[0]) === "video" ? { media_type: "STORIES", video_url: media[0] } : { media_type: "STORIES", image_url: media[0] };
    } else {
      params = { image_url: media[0], caption };
    }
    const c = await graph("POST", `/${igId}/media`, META_TOKEN, params);
    if (!c.ok) return refused("Instagram", c);
    container = String(c.body.id);
  }
  const st = await waitForContainer(container, META_TOKEN, "status_code");
  if (st === "IN_PROGRESS") return { ok: false, processing: container, error: "PROCESSING: Instagram is still processing the video; the next run publishes it.", cls: "processing" };
  if (st !== "FINISHED") return { ok: false, error: `Instagram could not process the media (${st}).`, cls: "permanent" };
  const p = await graph("POST", `/${igId}/media_publish`, META_TOKEN, { creation_id: container });
  if (!p.ok) return refused("Instagram (publish)", p);
  const id = String(p.body.id);
  const v = await graph("GET", `/${id}`, META_TOKEN, { fields: "permalink" });
  return { ok: true, post: { externalId: id, url: v.ok ? v.body?.permalink ?? null : null, verified: v.ok } };
}

async function publishThreads(format: PostFormat, text: string, media: string[], pending: string | null): Promise<Outcome> {
  if (!THREADS_TOKEN || !THREADS_USER_ID) return { ok: false, error: "Threads is not connected (THREADS_ACCESS_TOKEN / THREADS_USER_ID unset).", cls: "auth" };
  let container = pending;
  if (!container) {
    const one = (url: string | undefined, carouselItem: boolean): Record<string, string> => {
      const p: Record<string, string> = !url ? { media_type: "TEXT" } : mediaKind(url) === "video" ? { media_type: "VIDEO", video_url: url } : { media_type: "IMAGE", image_url: url };
      if (carouselItem) p.is_carousel_item = "true";
      return p;
    };
    let params: Record<string, string>;
    if (format === "carousel") {
      const children: string[] = [];
      for (const url of media) {
        const c = await graph("POST", `/${THREADS_USER_ID}/threads`, THREADS_TOKEN, one(url, true), THREADS_GRAPH);
        if (!c.ok) return refused("Threads (carousel item)", c);
        children.push(String(c.body.id));
      }
      params = { media_type: "CAROUSEL", children: children.join(","), text };
    } else {
      params = { ...one(media[0], false), text };
    }
    const c = await graph("POST", `/${THREADS_USER_ID}/threads`, THREADS_TOKEN, params, THREADS_GRAPH);
    if (!c.ok) return refused("Threads", c);
    container = String(c.body.id);
  }
  const st = await waitForContainer(container, THREADS_TOKEN, "status", THREADS_GRAPH, 30);
  if (st === "IN_PROGRESS") return { ok: false, processing: container, error: "PROCESSING: Threads is still processing the media; the next run publishes it.", cls: "processing" };
  if (st !== "FINISHED") return { ok: false, error: `Threads could not process the media (${st}).`, cls: "permanent" };
  const p = await graph("POST", `/${THREADS_USER_ID}/threads_publish`, THREADS_TOKEN, { creation_id: container }, THREADS_GRAPH);
  if (!p.ok) return refused("Threads (publish)", p);
  const id = String(p.body.id);
  const v = await graph("GET", `/${id}`, THREADS_TOKEN, { fields: "permalink" }, THREADS_GRAPH);
  return { ok: true, post: { externalId: id, url: v.ok ? v.body?.permalink ?? null : null, verified: v.ok } };
}

// ── OAuth channels: X, LinkedIn, TikTok, YouTube ─────────────────────────────

/** Decrypted, refreshed-if-needed token for a brand connection. */
async function brandToken(provider: string): Promise<{ token: string; accountId: string } | { error: string }> {
  const { data: c } = await db.from("brand_social_connections").select("*").eq("provider", provider).maybeSingle();
  if (!c) return { error: `RECONNECT: ${provider} is not connected.` };
  try {
    let token = (await decryptToken(c.access_token)) ?? "";
    const expires = c.token_expires_at ? new Date(c.token_expires_at).getTime() : null;
    if (expires && expires - Date.now() < 5 * 60_000) {
      const refreshToken = (await decryptToken(c.refresh_token)) ?? undefined;
      const fresh = await providerFor(provider).refresh({ accessToken: token, refreshToken, expiresAt: new Date(expires) });
      token = fresh.accessToken;
      await db.from("brand_social_connections").update({
        access_token: await encryptToken(fresh.accessToken),
        refresh_token: await encryptToken(fresh.refreshToken ?? refreshToken ?? null),
        token_expires_at: fresh.expiresAt?.toISOString() ?? null,
        refreshed_at: new Date().toISOString(), last_error: null,
      }).eq("provider", provider);
    }
    return { token, accountId: c.account_id };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await db.from("brand_social_connections").update({ last_error: msg }).eq("provider", provider);
    return { error: `RECONNECT: ${msg}` };
  }
}

async function fetchBytes(url: string, maxBytes: number): Promise<Uint8Array | string> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return `Could not download the media (${r.status}).`;
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len && len > maxBytes) return `The media is too large to upload from here (${Math.round(len / 1e6)} MB; limit ${Math.round(maxBytes / 1e6)} MB).`;
    const b = new Uint8Array(await r.arrayBuffer());
    return b.byteLength > maxBytes ? `The media is too large to upload from here (limit ${Math.round(maxBytes / 1e6)} MB).` : b;
  } catch (e) { return `Could not download the media (${(e as Error).name}).`; }
}

function httpClass(status: number): "auth" | "retry" | "permanent" {
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || status >= 500 || status === 0) return "retry";
  return "permanent";
}

async function publishX(text: string, media: string[]): Promise<Outcome> {
  const t = await brandToken("x");
  if ("error" in t) return { ok: false, error: t.error, cls: "auth" };
  const body: Record<string, unknown> = { text: text.slice(0, 280) };
  if (media[0]) {
    const bytes = await fetchBytes(media[0], 5 * 1024 * 1024);
    if (typeof bytes === "string") return { ok: false, error: bytes, cls: "permanent" };
    const form = new FormData();
    form.append("media", new Blob([bytes]), "image");
    form.append("media_category", "tweet_image");
    const up = await fetch("https://api.x.com/2/media/upload", { method: "POST", headers: { Authorization: `Bearer ${t.token}` }, body: form });
    const uj = await up.json().catch(() => ({}));
    const id = uj?.data?.id ?? uj?.media_id_string;
    if (!up.ok || !id) return { ok: false, error: `X refused the image (${up.status}): ${JSON.stringify(uj?.errors ?? uj?.detail ?? uj).slice(0, 200)}`, cls: httpClass(up.status) };
    body.media = { media_ids: [String(id)] };
  }
  let r: Response;
  try {
    r = await fetch("https://api.x.com/2/tweets", { method: "POST", headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
  } catch { return { ok: false, error: "UNCERTAIN: no answer from X in time. Check the account before trying again.", cls: "uncertain" }; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.data?.id) return { ok: false, error: `X refused it (${r.status}): ${String(j?.detail ?? j?.title ?? "unknown").slice(0, 200)}`, cls: httpClass(r.status) };
  return { ok: true, post: { externalId: String(j.data.id), url: `https://x.com/i/web/status/${j.data.id}`, verified: true } };
}

async function publishLinkedIn(channel: string, ch: any, text: string, media: string[]): Promise<Outcome> {
  const t = await brandToken("linkedin");
  if ("error" in t) return { ok: false, error: t.error, cls: "auth" };
  const author = channel === "linkedin_company" ? `urn:li:organization:${ch.external_account_id}` : `urn:li:person:${t.accountId}`;
  if (channel === "linkedin_company" && !/^\d+$/.test(String(ch.external_account_id ?? ""))) return { ok: false, error: "The LinkedIn company page id is not set.", cls: "permanent" };
  const H = { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" };
  const commentary = { text: text.slice(0, 3000) };
  let content: Record<string, unknown> = { shareCommentary: commentary, shareMediaCategory: "NONE" };
  if (media[0]) {
    const reg = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", { method: "POST", headers: H, body: JSON.stringify({
      registerUploadRequest: { recipes: ["urn:li:digitalmediaRecipe:feedshare-image"], owner: author, serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }] },
    }) });
    const rj = await reg.json().catch(() => ({}));
    const uploadUrl = rj?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl ?? rj?.value?.uploadUrl;
    if (!reg.ok || !uploadUrl) return { ok: false, error: `LinkedIn refused the image upload (${reg.status}): ${String(rj?.message ?? "").slice(0, 200)}`, cls: httpClass(reg.status) };
    const bytes = await fetchBytes(media[0], 8 * 1024 * 1024);
    if (typeof bytes === "string") return { ok: false, error: bytes, cls: "permanent" };
    const up = await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/octet-stream" }, body: bytes });
    if (!up.ok) return { ok: false, error: `LinkedIn image upload failed (${up.status}).`, cls: httpClass(up.status) };
    content = { shareCommentary: commentary, shareMediaCategory: "IMAGE", media: [{ status: "READY", media: rj.value.asset }] };
  }
  let r: Response;
  try {
    r = await fetch("https://api.linkedin.com/v2/ugcPosts", { method: "POST", headers: H, signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS), body: JSON.stringify({
      author, lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": content },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }) });
  } catch { return { ok: false, error: "UNCERTAIN: no answer from LinkedIn in time. Check the page before trying again.", cls: "uncertain" }; }
  const j = await r.json().catch(() => ({}));
  const id = r.headers.get("x-restli-id") ?? j?.id;
  if (!r.ok || !id) return { ok: false, error: `LinkedIn refused it (${r.status}): ${String(j?.message ?? "unknown").slice(0, 200)}`, cls: httpClass(r.status) };
  return { ok: true, post: { externalId: String(id), url: `https://www.linkedin.com/feed/update/${id}`, verified: true } };
}

async function publishTikTok(text: string, videoUrl: string, pending: string | null): Promise<Outcome> {
  const t = await brandToken("tiktok");
  if ("error" in t) return { ok: false, error: t.error, cls: "auth" };
  const H = { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json; charset=UTF-8" };
  let publishId = pending;
  if (!publishId) {
    // Unaudited apps may only post privately; TikTok says which levels this account allows.
    const ci = await fetch("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { method: "POST", headers: H });
    const cj = await ci.json().catch(() => ({}));
    if (!ci.ok || cj?.error?.code && cj.error.code !== "ok") return { ok: false, error: `TikTok creator check failed: ${cj?.error?.message ?? ci.status}`, cls: httpClass(ci.status) };
    const levels: string[] = cj?.data?.privacy_level_options ?? [];
    const privacy = levels.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : levels[0] ?? "SELF_ONLY";
    const bytes = await fetchBytes(videoUrl, 60 * 1024 * 1024);
    if (typeof bytes === "string") return { ok: false, error: bytes, cls: "permanent" };
    const init = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", { method: "POST", headers: H, body: JSON.stringify({
      post_info: { title: text.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info: { source: "FILE_UPLOAD", video_size: bytes.byteLength, chunk_size: bytes.byteLength, total_chunk_count: 1 },
    }) });
    const ij = await init.json().catch(() => ({}));
    if (!init.ok || !ij?.data?.upload_url) return { ok: false, error: `TikTok refused the upload: ${ij?.error?.message ?? init.status}`, cls: httpClass(init.status) };
    const up = await fetch(ij.data.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}` }, body: bytes });
    if (!up.ok) return { ok: false, error: `TikTok video upload failed (${up.status}).`, cls: httpClass(up.status) };
    publishId = String(ij.data.publish_id);
    if (privacy !== "PUBLIC_TO_EVERYONE") console.warn(`TikTok posted as ${privacy}: the app is not audited for public posts yet.`);
  }
  for (let i = 0; i < 8; i++) {
    const s = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", { method: "POST", headers: H, body: JSON.stringify({ publish_id: publishId }) });
    const sj = await s.json().catch(() => ({}));
    const st = sj?.data?.status;
    if (st === "PUBLISH_COMPLETE") {
      const postId = sj?.data?.publicaly_available_post_id?.[0] ?? sj?.data?.publicly_available_post_id?.[0];
      return { ok: true, post: { externalId: String(postId ?? publishId), url: null, verified: true } };
    }
    if (st === "FAILED") return { ok: false, error: `TikTok could not publish it (${sj?.data?.fail_reason ?? "unknown"}).`, cls: "permanent" };
    await new Promise((r) => setTimeout(r, 4000));
  }
  return { ok: false, processing: publishId!, error: "PROCESSING: TikTok is still processing the video; the next run checks again.", cls: "processing" };
}

async function publishYouTube(format: PostFormat, title: string, description: string, videoUrl: string): Promise<Outcome> {
  const t = await brandToken("youtube");
  if ("error" in t) return { ok: false, error: t.error, cls: "auth" };
  const bytes = await fetchBytes(videoUrl, 120 * 1024 * 1024);
  if (typeof bytes === "string") return { ok: false, error: bytes, cls: "permanent" };
  // A vertical video up to three minutes is shown as a Short; #Shorts helps it be classified.
  const name = (format === "reel" && !/#shorts/i.test(title) ? `${title} #Shorts` : title).slice(0, 100);
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/*", "X-Upload-Content-Length": String(bytes.byteLength) },
    body: JSON.stringify({ snippet: { title: name, description: description.slice(0, 5000), categoryId: "22" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } }),
  });
  const loc = start.headers.get("location");
  if (!start.ok || !loc) {
    const sj = await start.json().catch(() => ({}));
    return { ok: false, error: `YouTube refused the upload (${start.status}): ${String(sj?.error?.message ?? "unknown").slice(0, 200)}`, cls: httpClass(start.status) };
  }
  let put: Response;
  try {
    put = await fetch(loc, { method: "PUT", headers: { "Content-Type": "video/*" }, body: bytes, signal: AbortSignal.timeout(90_000) });
  } catch { return { ok: false, error: "UNCERTAIN: the YouTube upload did not finish in time. Check the channel before trying again.", cls: "uncertain" }; }
  const pj = await put.json().catch(() => ({}));
  if (!put.ok || !pj?.id) return { ok: false, error: `YouTube upload failed (${put.status}): ${String(pj?.error?.message ?? "unknown").slice(0, 200)}`, cls: httpClass(put.status) };
  // Unverified Google projects have uploads forced to private; say so instead of calling it public.
  const isPublic = pj?.status?.privacyStatus === "public";
  return { ok: true, post: { externalId: String(pj.id), url: format === "reel" ? `https://youtube.com/shorts/${pj.id}` : `https://youtu.be/${pj.id}`, verified: isPublic } };
}

/** One channel version, by channel and format. */
async function publishVariant(channel: string, ch: any, format: PostFormat, caption: string, link: string | null, media: string[], pending: string | null): Promise<Outcome> {
  const problem = formatProblem(channel, format, media);
  if (problem) return { ok: false, error: problem, cls: "permanent" };
  const text = link && !caption.includes(link) && channel !== "instagram" ? `${caption}\n\n${link}` : caption;
  if (channel === "facebook") {
    if (format === "reel") return publishFacebookReel(ch.external_account_id, text, media[0]);
    if (format === "story") return publishFacebookStory(ch.external_account_id, media[0]);
    return publishFacebook(ch.external_account_id, caption, link, media[0] ?? null);
  }
  if (channel === "instagram") return publishInstagram(ch.external_account_id, format, caption, media, pending);
  if (channel === "threads") return publishThreads(format, text, media, pending);
  if (channel === "x") return publishX(text, media);
  if (channel === "linkedin_company" || channel === "linkedin_profile") return publishLinkedIn(channel, ch, text, media);
  if (channel === "tiktok") return publishTikTok(caption, media[0], pending);
  if (channel === "youtube") return publishYouTube(format, hookOrFirstLine(caption), text, media[0]);
  return { ok: false, error: `${channel} has no direct publisher yet; it goes through Zoho.`, cls: "permanent" };
}

function hookOrFirstLine(caption: string): string {
  return (caption.split(/\n/)[0] || caption).replace(/#\S+/g, "").trim().slice(0, 95) || "NowOpen Africa";
}

// ── A run ────────────────────────────────────────────────────────────────────

async function settleUncertain(channels: Map<string, any>) {
  const { data: stuck } = await db.from("brand_social_variants")
    .select("id, channel, caption, updated_at, attempts")
    .like("last_error", "UNCERTAIN%").neq("dispatch_status", "sent").limit(20);
  const out: any[] = [];
  for (const v of stuck ?? []) {
    const ch = channels.get(v.channel);
    if (!ch || ch.id !== "facebook" || !ch.external_account_id) continue;
    const tok = await pageToken(ch.external_account_id);
    if (typeof tok !== "string") continue;
    const since = Math.floor(new Date(v.updated_at).getTime() / 1000) - 600;
    const r = await graph("GET", `/${ch.external_account_id}/posts`, tok, { fields: "id,message,permalink_url,created_time", since: String(since), limit: "50" });
    if (!r.ok) continue;
    const found = (r.body?.data ?? []).find((p: any) => p.message && looksLikeOurPost(v.caption, p.message));
    if (found) {
      await db.from("brand_social_variants").update({
        dispatch_status: "sent", sent_at: found.created_time, published_at: found.created_time, external_post_id: found.id,
        published_url: found.permalink_url ?? null, verified_at: new Date().toISOString(), last_error: null, next_attempt_at: null,
      }).eq("id", v.id);
      out.push({ id: v.id, settled: "found on the Page" });
    } else if (Date.now() - new Date(v.updated_at).getTime() > UNCERTAIN_SETTLE_MINUTES * 60_000) {
      // Not there after half an hour: it did not post. Allow another attempt.
      await db.from("brand_social_variants").update({
        dispatch_status: "failed", last_error: "Not found on the Page after an uncertain attempt; will try again.",
        next_attempt_at: new Date().toISOString(),
      }).eq("id", v.id);
      out.push({ id: v.id, settled: "not on the Page, retry allowed" });
    }
  }
  return out;
}

async function run(trigger: "tick" | "run" | "publish_now", contentId: string | null = null) {
  const { data: settings } = await db.from("brand_social_settings").select("*").eq("id", true).maybeSingle();
  if (!settings) return json({ ok: false, error: "Could not read the settings." }, 500);
  if (!settings.direct_publish_enabled) return json({ ok: true, skipped: "Direct publishing is switched off." });
  if (settings.autonomy_mode === "draft") return json({ ok: true, skipped: "Draft mode is on: nothing is published." });

  const { data: chRows } = await db.from("brand_social_channels").select("*").in("publish_route", ["meta_direct", "direct"]).eq("active", true).eq("connected", true);
  const channels = new Map((chRows ?? []).map((c: any) => [c.id, c]));
  if (!channels.size) return json({ ok: true, skipped: "No channel is set to publish directly." });

  const settled = await settleUncertain(channels);

  const now = new Date();
  const graceStart = new Date(now.getTime() - settings.direct_publish_grace_minutes * 60_000).toISOString();
  let q = db.from("brand_social_variants")
    .select("*, brand_social_content!inner(id, code, status, approved_by, planned_at, media_url, media_urls, destination_url, campaign_id)")
    .in("channel", [...channels.keys()])
    .in("dispatch_status", ["pending", "failed"])
    .in("brand_social_content.status", ["approved", "sent"])
    .not("brand_social_content.approved_by", "is", null);
  // "Publish now" ignores the planned time, never the approval.
  q = contentId
    ? q.eq("content_id", contentId)
    : q.lte("brand_social_content.planned_at", now.toISOString()).gte("brand_social_content.planned_at", graceStart);
  const { data: cands, error: qe } = await q.limit(50);
  if (qe) return json({ ok: false, error: qe.message }, 500);

  const due = (cands ?? []).filter((v: any) => isDue({
    plannedAt: contentId ? now.toISOString() : v.brand_social_content.planned_at, now, graceMinutes: settings.direct_publish_grace_minutes,
    contentStatus: v.brand_social_content.status, approvedBy: v.brand_social_content.approved_by,
    dispatchStatus: v.dispatch_status, attempts: v.attempts, nextAttemptAt: v.next_attempt_at, lastError: v.last_error,
  }).due).slice(0, PUBLISH_BATCH);

  const results: any[] = [];
  for (const v of due) {
    const c = v.brand_social_content;
    const ch = channels.get(v.channel);
    const fail = async (msg: string, retry: boolean) => {
      const nextAttempt = retry && v.attempts + 1 < MAX_PUBLISH_ATTEMPTS
        ? new Date(Date.now() + backoffMinutes(v.attempts + 1) * 60_000).toISOString() : null;
      await db.from("brand_social_variants").update({ dispatch_status: "failed", last_error: msg, next_attempt_at: nextAttempt }).eq("id", v.id);
      results.push({ code: c.code, channel: v.channel, ok: false, error: msg, retry_at: nextAttempt });
    };

    const checks = checkVariant({ channel: v.channel as ChannelId, caption: v.caption, mediaUrl: c.media_url, destinationUrl: c.destination_url });
    if (isBlocked(checks)) {
      await db.from("brand_social_variants").update({ checks }).eq("id", v.id);
      await fail(`Blocked by the checks: ${checks.filter((k) => k.severity === "block").map((k) => k.message).join(" ")}`, false);
      continue;
    }

    // Daily ceiling: what went out on this channel today plus the team's own posts.
    // Stories do not count: they are not feed posts and vanish after a day.
    const day = lagosDay(contentId ? now : c.planned_at);
    const dayStart = new Date(`${day}T00:00:00+01:00`).toISOString();
    const dayEnd = new Date(new Date(dayStart).getTime() + 86_400_000).toISOString();
    const [{ count: ours }, { count: theirs }] = await Promise.all([
      db.from("brand_social_variants").select("id", { count: "exact", head: true }).eq("channel", v.channel).eq("dispatch_status", "sent").gte("published_at", dayStart).lt("published_at", dayEnd),
      db.from("brand_social_external_posts").select("id", { count: "exact", head: true }).eq("channel", v.channel).gte("posted_at", dayStart).lt("posted_at", dayEnd),
    ]);
    if (v.format !== "story" && (ours ?? 0) + (theirs ?? 0) >= settings.daily_limit_per_channel) {
      await fail(`${CHANNEL_RULES[v.channel as ChannelId].label} already has ${settings.daily_limit_per_channel} posts on ${day}.`, false);
      continue;
    }

    // Claim. If another run got here first, this matches nothing and we move on.
    // Finishing a container that was still processing is not a new attempt.
    const { data: claimed } = await db.from("brand_social_variants")
      .update({ dispatch_status: "sending", attempts: v.pending_container_id ? v.attempts : v.attempts + 1, last_error: null, checks })
      .eq("id", v.id).eq("dispatch_status", v.dispatch_status).eq("attempts", v.attempts)
      .select("id").maybeSingle();
    if (!claimed) continue;

    let slug = "always-on";
    if (c.campaign_id) {
      const { data: camp } = await db.from("brand_social_campaigns").select("slug").eq("id", c.campaign_id).maybeSingle();
      slug = camp?.slug ?? slug;
    }
    const link = trackedUrl(c.destination_url, v.channel as ChannelId, slug, c.code);

    const media = [c.media_url, ...(c.media_urls ?? [])].filter(Boolean) as string[];
    const outcome = await publishVariant(v.channel, ch, (v.format ?? "post") as PostFormat, v.caption, link, media, v.pending_container_id ?? null);

    if (outcome.ok) {
      const at = new Date().toISOString();
      await db.from("brand_social_variants").update({
        dispatch_status: "sent", sent_at: at, published_at: at, tracked_url: link,
        external_post_id: outcome.post.externalId, published_url: outcome.post.url,
        verified_at: outcome.post.verified ? at : null, next_attempt_at: null, pending_container_id: null,
      }).eq("id", v.id);
      results.push({ code: c.code, channel: v.channel, ok: true, url: outcome.post.url, verified: outcome.post.verified });

      // The post as a whole is done once every channel is.
      const { data: rest } = await db.from("brand_social_variants").select("dispatch_status").eq("content_id", c.id);
      if ((rest ?? []).every((r: any) => r.dispatch_status === "sent")) {
        await db.from("brand_social_content").update({ status: "sent" }).eq("id", c.id).eq("status", "approved");
      }
    } else if (outcome.cls === "processing") {
      // Not a failure: check again in two minutes, without uploading again.
      await db.from("brand_social_variants").update({
        dispatch_status: "failed", last_error: outcome.error, pending_container_id: (outcome as any).processing,
        next_attempt_at: new Date(Date.now() + 2 * 60_000).toISOString(),
      }).eq("id", v.id);
      results.push({ code: c.code, channel: v.channel, ok: false, processing: true, error: outcome.error });
    } else if (outcome.cls === "uncertain") {
      await db.from("brand_social_variants").update({ dispatch_status: "failed", last_error: outcome.error, next_attempt_at: null }).eq("id", v.id);
      results.push({ code: c.code, channel: v.channel, ok: false, error: outcome.error });
    } else {
      await fail(outcome.cls === "auth" ? `RECONNECT: ${outcome.error}` : outcome.error, outcome.cls === "retry");
    }
  }

  const summary = { at: now.toISOString(), trigger, considered: cands?.length ?? 0, due: due.length, settled, results };
  await db.from("brand_social_settings").update({ direct_publish_last_tick: now.toISOString(), direct_publish_last_result: summary }).eq("id", true);
  return json({ ok: true, ...summary });
}

// ── Status and test ──────────────────────────────────────────────────────────

async function status() {
  const { data: s } = await db.from("brand_social_settings")
    .select("direct_publish_enabled, direct_publish_grace_minutes, direct_publish_last_tick, direct_publish_last_result").eq("id", true).maybeSingle();
  const { data: chRows } = await db.from("brand_social_channels").select("id, label, publish_route, external_account_id");
  let token: any = { configured: Boolean(META_TOKEN) };
  if (META_TOKEN) {
    const d = await graph("GET", "/debug_token", META_TOKEN, { input_token: META_TOKEN });
    const scopes: string[] = d.ok ? d.body?.data?.scopes ?? [] : [];
    token = {
      configured: true, valid: d.ok && d.body?.data?.is_valid === true,
      expires: d.ok ? (d.body?.data?.expires_at === 0 ? "never" : new Date(d.body.data.expires_at * 1000).toISOString()) : null,
      canPostFacebook: scopes.includes("pages_manage_posts"),
      canPostInstagram: scopes.includes("instagram_content_publish"),
    };
  }
  token.canPostThreads = Boolean(THREADS_TOKEN && THREADS_USER_ID);
  // OAuth connections: metadata only, never a token.
  const { data: conns } = await db.from("brand_social_connections")
    .select("provider, account_name, token_expires_at, connected_at, refreshed_at, last_error");
  token.connections = conns ?? [];
  return json({ ok: true, settings: s, channels: chRows, token });
}

async function test() {
  const { data: fb } = await db.from("brand_social_channels").select("external_account_id").eq("id", "facebook").maybeSingle();
  if (!fb?.external_account_id) return json({ ok: false, error: "Facebook has no Page id recorded." }, 409);
  const msg = `NowOpen Autopilot connection test ${new Date().toISOString()}. Unpublished; deleted straight after.`;
  const r = await publishFacebook(fb.external_account_id, msg, null, null, false);
  if (!r.ok) return json({ ok: false, step: "create", error: r.error });
  const tok = await pageToken(fb.external_account_id);
  const del = typeof tok === "string" ? await graph("DELETE", `/${r.post.externalId}`, tok) : null;
  return json({ ok: true, created: r.post.externalId, readBack: r.post.verified, deleted: Boolean(del?.ok), public: false });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is a tick */ }

  const key = req.headers.get("x-automation-key") ?? "";
  if (key) {
    if (!AUTOMATION_SECRET || !sameSecret(key, AUTOMATION_SECRET)) return json({ error: "Forbidden." }, 403);
    if (!body?.action || body.action === "tick") return await run("tick");
    if (body.action === "status") return await status();
    if (body.action === "test") return await test();
    return json({ error: "Unknown action." }, 400);
  }

  if (!(await callerIsAdmin(req))) return json({ error: "Admins only." }, 403);
  if (body?.action === "run") return await run("run");
  if (body?.action === "publish_now") {
    const id = String(body?.content_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Missing content_id." }, 400);
    return await run("publish_now", id);
  }
  if (body?.action === "status") return await status();
  if (body?.action === "test") return await test();
  return json({ error: "Unknown action." }, 400);
});
