// Real publishing for the Studio's Schedule & Publish queue.
//
// Called from the browser with the user's JWT. For every channel on a job it
// finds the stored OAuth connection, refreshes the token if near expiry,
// stages the attached media to a public bucket, and posts via the provider's
// API. When a provider isn't wired up yet (no developer-app credentials) or
// has no connection, it returns a *simulated* success so the queue behaves
// exactly as it did before — nothing is ever sent in those cases.
//
// Real attempts are recorded in `social_publish_log` keyed by (job_id, channel),
// which makes publishing idempotent: re-publishing a job never double-posts.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor, PROVIDER_LABELS, PublishMedia } from "../_shared/social.ts";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

interface PublishMediaInput {
  name: string;
  url: string;
  type: "image" | "video";
}

interface JobInput {
  id: string;
  title?: string;
  caption?: string;
  hashtags?: string;
  channels: string[];
  media?: PublishMediaInput | null;
}

interface PublishRequest {
  business_id: string;
  job: JobInput;
}

interface ChannelResult {
  channel: string;
  ok: boolean;
  simulated?: boolean;
  externalId?: string;
  message?: string;
  error?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function currentUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

function composeText(job: JobInput): string {
  const parts = [job.caption?.trim(), job.hashtags?.trim()].filter(Boolean);
  return parts.join("\n\n") || job.title?.trim() || "New post from NowOpen Studio";
}

// Data URLs (the browser's media format) are staged to the public
// `social-media` bucket so each platform gets a fetchable image_url/video_url.
async function stageMedia(jobId: string, media: PublishMediaInput): Promise<PublishMedia | null> {
  if (/^https?:\/\//i.test(media.url)) return { ...media, url: media.url };
  const match = /^data:([^;]+);base64,(.+)$/.exec(media.url);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const ext = (media.name.split(".").pop() || (media.type === "video" ? "mp4" : "png")).replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const safeName = (media.name.replace(/[^a-z0-9.\-_]/gi, "_") || "media").slice(0, 60);
  const path = `jobs/${jobId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("social-media").upload(path, bytes, { contentType: mime, upsert: true });
  if (uploadError) throw new Error(`Could not stage media: ${uploadError.message}`);
  const { data } = supabase.storage.from("social-media").getPublicUrl(path);
  return { name: media.name, url: data.publicUrl, type: media.type };
}

async function ensureFreshToken(channel: string, conn: {
  id: string; access_token: string; refresh_token: string | null; token_expires_at: string | null;
}) {
  const provider = providerFor(channel);
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const nearExpiry = expiresAt > 0 && expiresAt - Date.now() < 24 * 60 * 60 * 1000;
  if (!nearExpiry || !conn.refresh_token) return conn.access_token;

  try {
    const fresh = await provider.refresh({ accessToken: conn.access_token, refreshToken: conn.refresh_token, expiresAt: new Date(expiresAt) });
    await supabase.from("social_connections").update({
      access_token: fresh.accessToken,
      refresh_token: fresh.refreshToken ?? conn.refresh_token,
      token_expires_at: fresh.expiresAt?.toISOString() ?? null,
    }).eq("id", conn.id);
    return fresh.accessToken;
  } catch (e) {
    console.error(`Token refresh failed for ${channel}:`, e);
    return conn.access_token; // best effort — the publish will surface the real error
  }
}

async function logPublish(businessId: string, userId: string, jobId: string, channel: string, entry: {
  status: "ok" | "error";
  externalId?: string;
  message?: string;
  error?: string;
  simulated?: boolean;
}) {
  const { error } = await supabase.from("social_publish_log").upsert({
    business_id: businessId,
    user_id: userId,
    job_id: jobId,
    channel,
    status: entry.status,
    external_id: entry.externalId ?? null,
    message: entry.message ?? null,
    error: entry.error ?? null,
    simulated: entry.simulated ?? false,
  }, { onConflict: "job_id,channel" });
  if (error) console.error("Could not write publish log:", error.message);
}

async function publishChannel(businessId: string, userId: string, job: JobInput, channel: string): Promise<ChannelResult> {
  const label = PROVIDER_LABELS[channel as keyof typeof PROVIDER_LABELS] ?? channel;

  // Channels with no real provider (GMB, Pinterest, Threads, ...) or a
  // provider with no credentials configured fall back to simulated delivery.
  let provider;
  try {
    provider = providerFor(channel);
  } catch {
    return { channel, ok: true, simulated: true, message: `${label} publishing is coming soon — post marked published (simulated).` };
  }
  if (!provider.configured()) {
    return { channel, ok: true, simulated: true, message: `${label} isn't wired up yet — post marked published (simulated). Connect it once developer credentials are set.` };
  }

  const { data: conn, error: connError } = await supabase
    .from("social_connections")
    .select("id, account_id, account_name, access_token, refresh_token, token_expires_at")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .eq("provider", channel)
    .maybeSingle();
  if (connError) return { channel, ok: false, error: `Could not read your ${label} connection.` };
  if (!conn) {
    return { channel, ok: true, simulated: true, message: `${label} isn't connected — post marked published (simulated).` };
  }

  // Idempotency: never post the same (job, channel) twice.
  const { data: existing } = await supabase.from("social_publish_log")
    .select("status, external_id, error")
    .eq("job_id", job.id)
    .eq("channel", channel)
    .maybeSingle();
  if (existing?.status === "ok") {
    return { channel, ok: true, externalId: existing.external_id ?? undefined, message: "Already published." };
  }

  const accessToken = await ensureFreshToken(channel, conn);

  let media: PublishMedia | null = null;
  if (job.media) {
    try {
      media = await stageMedia(job.id, job.media);
    } catch (e) {
      return { channel, ok: false, error: e instanceof Error ? e.message : "Could not stage your media." };
    }
  }

  const result = await provider.publish({
    provider: provider.key,
    text: composeText(job),
    accountId: conn.account_id,
    accessToken,
    media: media ?? undefined,
  });

  if (result.ok) {
    await logPublish(businessId, userId, job.id, channel, {
      status: "ok",
      externalId: result.externalId,
      message: result.externalId ? `Posted to ${label}.` : `Posted to ${label}.`,
    });
    return { channel, ok: true, externalId: result.externalId, message: `Posted to ${label}.` };
  }

  await logPublish(businessId, userId, job.id, channel, {
    status: "error",
    error: result.error ?? "Unknown error",
  });
  return { channel, ok: false, error: result.error ?? `Could not post to ${label}.` };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return jsonResponse({ results: [], error: "Too many requests — please wait a moment." }, 429);
  }

  const user = await currentUser(req);
  if (!user) return jsonResponse({ results: [], error: "Not signed in." }, 401);

  let body: PublishRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ results: [], error: "Invalid JSON body." }, 400);
  }

  const { business_id: businessId, job } = body;
  if (!businessId || !job?.id || !Array.isArray(job.channels)) {
    return jsonResponse({ results: [], error: "Missing business_id or job." }, 400);
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!business) return jsonResponse({ results: [], error: "You don't own that business." }, 403);

  const results: ChannelResult[] = [];
  for (const channel of job.channels) {
    try {
      results.push(await publishChannel(businessId, user.id, job, channel));
    } catch (e) {
      console.error(`Publish to ${channel} threw:`, e);
      results.push({ channel, ok: false, error: e instanceof Error ? e.message : "Unexpected error." });
    }
  }

  const allOk = results.every((r) => r.ok);
  const anyReal = results.some((r) => !r.simulated);
  return jsonResponse({ results, ok: allOk, anyReal, simulated: !anyReal });
});
