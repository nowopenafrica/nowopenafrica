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
import { publishJob, JobInput, ChannelResult } from "../_shared/publishJob.ts";
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

interface PublishRequest {
  business_id: string;
  job: JobInput;
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

  // Publishing is a team activity. This was gated on businesses.user_id, so a
  // manager or editor hired to run the account could not post at all. The RPC
  // is evaluated as the calling user, so it answers for whoever is signed in.
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: allowed, error: roleError } = await authed.rpc("has_business_role", {
    biz: businessId,
    roles: ["owner", "manager", "editor"],
  });
  if (roleError || !allowed) {
    return jsonResponse({ results: [], error: "You do not have permission to publish for that business." }, 403);
  }

  const results: ChannelResult[] = await publishJob(supabase, businessId, user.id, job as JobInput);

  const allOk = results.every((r) => r.ok);
  const anyReal = results.some((r) => !r.simulated);
  return jsonResponse({ results, ok: allOk, anyReal, simulated: !anyReal });
});
