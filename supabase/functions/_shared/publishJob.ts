// One implementation of "post this job to these channels".
//
// Two callers need it and must behave identically: `social-publish` (a person
// pressing Publish now) and `publish-due-posts` (the cron posting on their
// behalf while nobody is watching). Keeping the logic here is what stops the
// scheduled path quietly drifting from the manual one — a scheduled post that
// behaves differently from the same post published by hand is the kind of bug
// nobody notices until a customer's campaign goes out wrong.

// deno-lint-ignore-file no-explicit-any
import { providerFor, PROVIDER_LABELS, PublishMedia } from "./social.ts";

export interface PublishMediaInput {
  name: string;
  url: string;
  type: "image" | "video";
}

export interface JobInput {
  id: string;
  title?: string;
  caption?: string;
  hashtags?: string;
  channels: string[];
  media?: PublishMediaInput | null;
}

export interface ChannelResult {
  channel: string;
  ok: boolean;
  simulated?: boolean;
  externalId?: string;
  message?: string;
  error?: string;
}

export function composeText(job: JobInput): string {
  const parts = [job.caption?.trim(), job.hashtags?.trim()].filter(Boolean);
  return parts.join("\n\n") || job.title?.trim() || "New post from NowOpen Studio";
}

/**
 * Data URLs (what the browser hands us) become fetchable https URLs, because
 * every provider wants a URL it can pull the media from itself.
 */
async function stageMedia(supabase: any, jobId: string, media: PublishMediaInput): Promise<PublishMedia | null> {
  if (/^https?:\/\//i.test(media.url)) return { ...media, url: media.url };
  const match = /^data:([^;]+);base64,(.+)$/.exec(media.url);
  if (!match) return null;
  const mime = match[1];
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const safeName = (media.name.replace(/[^a-z0-9.\-_]/gi, "_") || "media").slice(0, 60);
  const path = `jobs/${jobId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("social-media").upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new Error(`Could not stage media: ${error.message}`);
  const { data } = supabase.storage.from("social-media").getPublicUrl(path);
  return { name: media.name, url: data.publicUrl, type: media.type };
}

async function ensureFreshToken(supabase: any, channel: string, conn: {
  id: string; access_token: string; refresh_token: string | null; token_expires_at: string | null;
}): Promise<string> {
  const provider = providerFor(channel);
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const nearExpiry = expiresAt > 0 && expiresAt - Date.now() < 24 * 60 * 60 * 1000;
  if (!nearExpiry || !conn.refresh_token) return conn.access_token;

  try {
    const fresh = await provider.refresh({
      accessToken: conn.access_token,
      refreshToken: conn.refresh_token,
      expiresAt: new Date(expiresAt),
    });
    await supabase.from("social_connections").update({
      access_token: fresh.accessToken,
      refresh_token: fresh.refreshToken ?? conn.refresh_token,
      token_expires_at: fresh.expiresAt?.toISOString() ?? null,
    }).eq("id", conn.id);
    return fresh.accessToken;
  } catch (e) {
    console.error(`Token refresh failed for ${channel}:`, e);
    return conn.access_token; // best effort — the publish surfaces the real error
  }
}

async function logPublish(supabase: any, businessId: string, userId: string | null, jobId: string, channel: string, entry: {
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

export async function publishChannel(
  supabase: any,
  businessId: string,
  userId: string | null,
  job: JobInput,
  channel: string,
): Promise<ChannelResult> {
  const label = PROVIDER_LABELS[channel as keyof typeof PROVIDER_LABELS] ?? channel;

  let provider;
  try {
    provider = providerFor(channel);
  } catch {
    return { channel, ok: true, simulated: true, message: `${label} publishing is coming soon — post marked published (simulated).` };
  }
  if (!provider.configured()) {
    return { channel, ok: true, simulated: true, message: `${label} isn't wired up yet — post marked published (simulated). Connect it once developer credentials are set.` };
  }

  // The connection belongs to the BUSINESS, not to whoever happened to click
  // Connect. Scoping this to user_id meant a manager could not publish through
  // the account the owner had linked, and the cron — which has no user at all —
  // could never publish anything.
  const { data: conn, error: connError } = await supabase
    .from("social_connections")
    .select("id, account_id, account_name, access_token, refresh_token, token_expires_at")
    .eq("business_id", businessId)
    .eq("provider", channel)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connError) return { channel, ok: false, error: `Could not read the ${label} connection.` };
  if (!conn) {
    return { channel, ok: true, simulated: true, message: `${label} isn't connected — post marked published (simulated).` };
  }

  // Idempotency: never post the same (job, channel) twice, however many times
  // the cron retries or a person presses the button.
  const { data: existing } = await supabase.from("social_publish_log")
    .select("status, external_id")
    .eq("job_id", job.id)
    .eq("channel", channel)
    .maybeSingle();
  if (existing?.status === "ok") {
    return { channel, ok: true, externalId: existing.external_id ?? undefined, message: "Already published." };
  }

  const accessToken = await ensureFreshToken(supabase, channel, conn);

  let media: PublishMedia | null = null;
  if (job.media) {
    try {
      media = await stageMedia(supabase, job.id, job.media);
    } catch (e) {
      return { channel, ok: false, error: e instanceof Error ? e.message : "Could not stage the media." };
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
    await logPublish(supabase, businessId, userId, job.id, channel, {
      status: "ok",
      externalId: result.externalId,
      message: `Posted to ${label}.`,
    });
    return { channel, ok: true, externalId: result.externalId, message: `Posted to ${label}.` };
  }

  await logPublish(supabase, businessId, userId, job.id, channel, {
    status: "error",
    error: result.error ?? "Unknown error",
  });
  return { channel, ok: false, error: result.error ?? `Could not post to ${label}.` };
}

/** Publish every channel on a job, never throwing for one bad channel. */
export async function publishJob(
  supabase: any,
  businessId: string,
  userId: string | null,
  job: JobInput,
): Promise<ChannelResult[]> {
  const results: ChannelResult[] = [];
  for (const channel of job.channels) {
    try {
      results.push(await publishChannel(supabase, businessId, userId, job, channel));
    } catch (e) {
      console.error(`Publish to ${channel} threw:`, e);
      results.push({ channel, ok: false, error: e instanceof Error ? e.message : "Unexpected error." });
    }
  }
  return results;
}
