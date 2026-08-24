// publish-due-posts
// -----------------
// The piece that makes "scheduled" mean something. Invoke it on a schedule
// (Supabase Cron, a GitHub Action, any external cron — every 5 minutes is a
// sensible cadence) and it publishes everything in social_scheduled_posts that
// has come due, with nobody's browser open.
//
// Before this existed the queue lived in localStorage and only drained while
// the Studio tab happened to be on screen, so a post scheduled for 7am went out
// whenever the owner next opened their laptop — if at all.
//
// Safety properties:
//   * Claim-then-publish. A row is flipped to 'publishing' with a conditional
//     update before any network call, so two overlapping cron runs cannot both
//     take the same row.
//   * Idempotent per channel. social_publish_log is keyed (job_id, channel), so
//     a retry after a partial failure re-posts only the channels that failed.
//   * Bounded retries. MAX_ATTEMPTS stops a permanently broken post from being
//     retried forever against a provider's rate limit.
//   * Stale claims recovered. A run that dies mid-flight leaves a row in
//     'publishing'; anything stuck there longer than STALE_CLAIM_MINUTES is
//     picked up again rather than stranded.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { publishJob, JobInput } from "../_shared/publishJob.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Automation-Key",
};

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const MAX_ATTEMPTS = 3;
const STALE_CLAIM_MINUTES = 15;
const BATCH = 25;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface DuePost {
  id: string;
  business_id: string;
  created_by: string | null;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  channels: string[];
  media: any;
  attempts: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  // Same gate as run-automations. Without a secret set anyone who knows the
  // URL could trigger a publish run, so refuse rather than run wide open.
  if (!AUTOMATION_SECRET) {
    return json({ ok: false, message: "AUTOMATION_SECRET is not set — refusing to run unauthenticated." }, 500);
  }
  if (req.headers.get("x-automation-key") !== AUTOMATION_SECRET) {
    return json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!Deno.env.get("SUPABASE_URL") || !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return json({ ok: false, message: "Server not configured" }, 500);
  }

  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();

  // Due and waiting, plus anything left claimed by a run that never finished.
  const { data: due, error: dueError } = await supabase
    .from("social_scheduled_posts")
    .select("id, business_id, created_by, title, caption, hashtags, channels, media, attempts")
    .lte("scheduled_at", nowIso)
    .lt("attempts", MAX_ATTEMPTS)
    .or(`status.eq.scheduled,and(status.eq.publishing,updated_at.lt.${staleBefore})`)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH);

  if (dueError) {
    console.error("Could not read the queue:", dueError.message);
    return json({ ok: false, message: dueError.message }, 500);
  }
  if (!due || due.length === 0) return json({ ok: true, claimed: 0, published: 0, failed: 0 });

  let published = 0;
  let failed = 0;
  let claimed = 0;

  for (const post of due as DuePost[]) {
    // Claim it. The status filter is the lock: if another run got here first
    // the row no longer matches and this update touches nothing.
    const { data: lock } = await supabase
      .from("social_scheduled_posts")
      .update({ status: "publishing", attempts: post.attempts + 1 })
      .eq("id", post.id)
      .in("status", ["scheduled", "publishing"])
      .select("id")
      .maybeSingle();
    if (!lock) continue;
    claimed++;

    const job: JobInput = {
      id: post.id,
      title: post.title ?? undefined,
      caption: post.caption ?? undefined,
      hashtags: post.hashtags ?? undefined,
      channels: Array.isArray(post.channels) ? post.channels : [],
      media: post.media ?? null,
    };

    try {
      const results = await publishJob(supabase, post.business_id, post.created_by, job);
      const allOk = results.length > 0 && results.every((r) => r.ok);
      const attemptsUsed = post.attempts + 1;

      if (allOk) {
        published++;
        await supabase.from("social_scheduled_posts").update({
          status: "published",
          published_at: new Date().toISOString(),
          results,
          last_error: null,
        }).eq("id", post.id);
      } else {
        failed++;
        const firstError = results.find((r) => !r.ok)?.error ?? "Publishing failed.";
        // Back to 'scheduled' while retries remain, so the next run picks it
        // up; only the last attempt is recorded as a terminal failure.
        await supabase.from("social_scheduled_posts").update({
          status: attemptsUsed >= MAX_ATTEMPTS ? "failed" : "scheduled",
          results,
          last_error: firstError,
        }).eq("id", post.id);
      }
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : "Unexpected error.";
      console.error(`Scheduled post ${post.id} threw:`, message);
      await supabase.from("social_scheduled_posts").update({
        status: post.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "scheduled",
        last_error: message,
      }).eq("id", post.id);
    }
  }

  return json({ ok: true, claimed, published, failed });
});
