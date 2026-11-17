// brand-social-generate
// ---------------------
// Drafts ONE post for NowOpen Africa's own accounts from a brief, using
// whichever model provider is configured (see _shared/llm.ts).
//
// Two actions:
//   status   (admin) — is drafting on, what is the monthly ceiling, how much
//                      has been used, and which provider would answer.
//   generate (admin) — brief in, one DRAFT post out.
//
// What this function can and cannot do:
//   * It can only create drafts. The post is inserted with the ADMIN'S OWN
//     token, so the guard trigger on brand_social_content forces status =
//     'draft' and stamps created_by. There is no code path here that sets
//     approved, sending or sent, and the service role is used only to write
//     the run ledger.
//   * It refuses unless the founder has switched drafting on AND set a monthly
//     token ceiling. An unset ceiling means no calls.
//   * Every call is written to brand_social_ai_runs before the model is asked,
//     and closed afterwards with the provider, model and reported tokens, so a
//     call that fails or times out still leaves a row.
//   * The model's answer is parsed strictly and run through the same checks a
//     hand-written post gets. Problems are saved on the draft, not hidden.
//
// A week of posts is the screen calling this once per slot. Each call is short
// enough for an edge function and is logged on its own.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { CHANNEL_RULES, checkVariant, isSensitive, similarity, type ChannelId } from "../_shared/brandSocial.ts";
import {
  budgetVerdict, buildSystemPrompt, buildUserPrompt, GENERATION_MAX_TOKENS, lagosMonthStartUtc,
  parseGeneration, validateBrief,
  type AutopilotBrief, type AutopilotChannel, type AutopilotProfile,
} from "../_shared/brandAutopilot.ts";
import { resolveProvider, runAgent } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const service = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function caller(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;
  const db = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await db.auth.getUser();
  if (ue || !u.user) return null;
  const { data, error } = await db.rpc("is_admin");
  if (error || data !== true) return null;
  return { db, userId: u.user.id };
}

async function budget() {
  const [{ data: settings, error: se }, { data: usage, error: ue }] = await Promise.all([
    service.from("brand_social_settings").select("ai_generation_enabled, ai_monthly_token_limit").eq("id", true).maybeSingle(),
    service.rpc("brand_social_ai_usage", { p_since: lagosMonthStartUtc() }),
  ]);
  if (se || ue || !settings) return null;
  const row = Array.isArray(usage) ? usage[0] : usage;
  return {
    enabled: settings.ai_generation_enabled === true,
    monthlyTokenLimit: Number(settings.ai_monthly_token_limit ?? 0),
    usedTokens: Number(row?.tokens ?? 0),
    runs: Number(row?.runs ?? 0),
    unreportedRuns: Number(row?.unreported_runs ?? 0),
  };
}

async function generate(who: { db: any; userId: string }, brief: AutopilotBrief) {
  const b = await budget();
  if (!b) return json({ ok: false, error: "Could not read the Autopilot settings. Nothing was generated." }, 500);
  const verdict = budgetVerdict(b);
  if (!verdict.ok) return json({ ok: false, error: verdict.reason }, 409);

  const [{ data: profileRow }, { data: channelRows }, { data: recent }] = await Promise.all([
    service.from("brand_social_profile").select("profile").order("version", { ascending: false }).limit(1).maybeSingle(),
    service.from("brand_social_channels").select("id, label").eq("active", true).eq("connected", true),
    service.from("brand_social_content").select("caption").not("status", "in", "(rejected,cancelled)")
      .order("created_at", { ascending: false }).limit(60),
  ]);
  const profile = profileRow?.profile as AutopilotProfile | undefined;
  if (!profile?.pillars?.length) return json({ ok: false, error: "The brand profile is missing. Nothing was generated." }, 500);

  const activeIds = (channelRows ?? []).map((c: any) => c.id as string).filter((id: string) => id in CHANNEL_RULES);
  const problems = validateBrief(brief, profile, activeIds);
  if (problems.length) return json({ ok: false, error: problems.join(" ") }, 400);

  const channels: AutopilotChannel[] = brief.channels.map((id) => {
    const rule = CHANNEL_RULES[id as ChannelId];
    return { id, label: rule.label, maxChars: rule.maxChars, requires: rule.requires, linkNotClickable: rule.linkNotClickable };
  });
  const recentCaptions = (recent ?? []).map((r: any) => String(r.caption ?? ""));

  const { data: run, error: re } = await service.from("brand_social_ai_runs")
    .insert({ brief, requested_by: who.userId }).select("id").single();
  if (re || !run) return json({ ok: false, error: "Could not open the run ledger, so the model was not called." }, 500);

  const close = (patch: Record<string, unknown>) =>
    service.from("brand_social_ai_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", run.id);

  const outcome = await runAgent(
    buildSystemPrompt(profile),
    [{ role: "user", content: buildUserPrompt(brief, profile, channels, recentCaptions) }],
    [], undefined, { maxTokens: GENERATION_MAX_TOKENS },
  );

  if (!outcome.ok) {
    const why = outcome.reason === "no_provider" ? "No AI provider key is configured."
      : outcome.reason === "rate_limited" ? "The AI provider is rate-limited right now. Try again in a few minutes."
      : outcome.reason === "auth" ? "The AI provider rejected its key."
      : "The AI provider did not answer.";
    await close({ status: "failed", error: `${outcome.reason}${outcome.status ? ` (${outcome.status})` : ""}` });
    return json({ ok: false, error: `${why} Nothing was drafted.`, run_id: run.id }, 502);
  }

  const usage = {
    provider: outcome.provider, model: outcome.model,
    input_tokens: outcome.usage?.inputTokens ?? null,
    output_tokens: outcome.usage?.outputTokens ?? null,
    calls: outcome.usage?.calls ?? null,
  };

  const parsed = parseGeneration(outcome.text, brief.channels);
  if (!parsed.ok) {
    await close({ ...usage, status: "failed", error: parsed.errors.join(" ").slice(0, 500) });
    return json({ ok: false, error: `The model's answer could not be used: ${parsed.errors.join(" ")} Nothing was drafted.`, run_id: run.id }, 502);
  }
  const post = parsed.post;

  const variants = brief.channels.map((id) => {
    const caption = post.variants[id];
    const checks = checkVariant({ channel: id as ChannelId, caption, mediaUrl: null, destinationUrl: brief.destinationUrl ?? null });
    return { channel: id, caption, checks };
  });
  const closest = recentCaptions.reduce((m, c) => Math.max(m, similarity(c, post.caption)), 0);
  const sensitive = variants.some((v) => isSensitive(v.checks));

  // Inserted as the admin, so the guard trigger keeps this a draft whatever is sent.
  const { data: content, error: ce } = await who.db.from("brand_social_content").insert({
    campaign_id: brief.campaignId ?? null,
    pillar: brief.pillar, audience: brief.audience, objective: brief.objective,
    hook: post.hook || null, caption: post.caption,
    creative_brief: post.creativeBrief || null,
    cta: post.cta || brief.cta || null,
    destination_url: brief.destinationUrl ?? null,
    evidence: `AI draft (${outcome.provider} ${outcome.model}). No facts in it have been verified.`,
    sensitive, planned_at: brief.plannedAt ?? null,
    status: "draft", origin: "ai", ai_run_id: run.id,
  }).select("id, code").single();
  if (ce || !content) {
    await close({ ...usage, status: "failed", error: `insert: ${ce?.message ?? "no row"}`.slice(0, 500) });
    return json({ ok: false, error: `The draft could not be saved: ${ce?.message ?? "unknown error"}`, run_id: run.id }, 500);
  }

  const { error: ve } = await who.db.from("brand_social_variants")
    .insert(variants.map((v) => ({ content_id: content.id, channel: v.channel, caption: v.caption, checks: v.checks })));

  await close({ ...usage, status: "done", content_id: content.id, error: ve ? `variants: ${ve.message}`.slice(0, 500) : null });

  return json({
    ok: true, run_id: run.id, content_id: content.id, code: content.code,
    provider: outcome.provider, model: outcome.model,
    tokens: outcome.usage ? outcome.usage.inputTokens + outcome.usage.outputTokens : null,
    sensitive,
    blocked_channels: variants.filter((v) => v.checks.some((c) => c.severity === "block")).map((v) => v.channel),
    similar_to_recent: closest >= 0.8,
    variants_saved: !ve,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const who = await caller(req);
  if (!who) return json({ error: "Admins only" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (body?.action === "status") {
    const b = await budget();
    if (!b) return json({ ok: false, error: "Could not read the Autopilot settings." }, 500);
    const provider = resolveProvider();
    return json({ ok: true, ...b, provider: provider.name, providerLabel: provider.label, verdict: budgetVerdict(b) });
  }
  if (body?.action === "generate" && body.brief && typeof body.brief === "object") {
    return await generate(who, body.brief as AutopilotBrief);
  }
  return json({ error: "Unknown action" }, 400);
});
