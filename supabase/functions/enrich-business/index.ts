/**
 * The enrichment executor.
 *
 * Called by cron (and runnable manually with ?limit=N&dry=1). It claims due
 * jobs from business_enrichment_jobs, runs the pure Phase-3 engine against the
 * job's payload, and writes the deliverables. The safety boundary is drawn
 * exactly as in run-workforce and restated in the job migration:
 *
 *   WHAT IT MAY WRITE: business_evidence rows, business_change_proposals rows,
 *   business_media_assets rows, and its own job row (via
 *   finish_enrichment_job). NOTHING ELSE.
 *
 *   WHAT IT MAY NOT DO: change a business directly. A business changes only
 *   through an approved change proposal (apply_business_change_proposal), and
 *   THAT is authority a person — or an owner's explicit sync preference —
 *   holds. No amount of source confidence lets an unattended machine edit a
 *   listing, and the autonomy policy lives in business_sync_preferences, not
 *   in an unguarded `update businesses`.
 *
 *   SHUTOFFS, so a misconfigured run cannot spend money:
 *     - ran in DRY-RUN by default (?dry=1): returns what it WOULD write.
 *     - a job with a run_cost_budget that one run would exceed is marked
 *       failed instead of running past its bound.
 *     - source fetches are rate-limited per source key.
 *
 *   THE QUEUE IS REFILLED BY THE SCHEDULER, not by this function: a live tick
 *   (?refill=1) calls queue_due_enrichment_businesses() first, then drains.
 *   Dry runs never queue. The owner's sync_enabled preference is honoured here
 *   too — belt and braces on top of the scheduler's own filter.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { runEnrichment, type SourceReport } from "../_shared/enrichment/index.ts";
import { parseOsmHours, type SourceHoursEntry } from "../_shared/enrichment/osmHours.ts";
import { EXTRACTION_PROMPT } from "../_shared/enrichment/text.ts";
import { runAgent, type AgentTurn } from "../_shared/llm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-automation-key",
};

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** How many LLM calls / source fetches a run "costs" for budget maths. */
function costUnits(payload: { sources?: unknown; ai_resolver?: unknown }, usedOsm: boolean, aiCalls: number): number {
  const sources = Array.isArray(payload.sources) ? payload.sources.length : 1;
  return sources + (payload.ai_resolver ? aiCalls + 1 : 0) + (usedOsm ? 1 : 0);
}

/** A very small per-source in-flight throttle so a burst of jobs doesn't hit a
 *  rate limit on all of them at once — honesty about shared infrastructure. */
const sourceLocks = new Map<string, number>();
function waitOnSourceLock(key: string): Promise<void> {
  const next = new Date((sourceLocks.get(key) ?? 0) + 1100 > Date.now() ? (sourceLocks.get(key) ?? 0) + 1100 : Date.now());
  sourceLocks.set(key, next.getTime());
  return new Promise((r) => setTimeout(r, Math.max(0, next.getTime() - Date.now())));
}

interface BusinessRow {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  domain: string | null;
  claim_status: string | null;
  data_confidence: string | null;
  availability_mode: string | null;
  opening_hours: string | null;
  hours: string | null;
  social_links: Record<string, string> | null;
}

async function loadBusiness(db: any, id: string): Promise<BusinessRow | null> {
  const { data, error } = await db
    .from("businesses")
    .select("id, name, website, phone, domain, claim_status, data_confidence, availability_mode, opening_hours, hours, social_links")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as BusinessRow;
}

/** Nominatim: the open, no-key way to ask OSM for a business's hours record. */
async function fetchOsmHours(business: { name: string }, key: string): Promise<SourceHoursEntry[] | null> {
  await waitOnSourceLock(key);
  const q = encodeURIComponent(business.name);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&addressdetails=1&countrycodes=ng&limit=3`, {
    headers: { "User-Agent": "NowOpenAfricaBusinessIntelligence/0.1" },
  });
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ opening_hours?: string; name?: string }>;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = norm(business.name);
  for (const row of rows) {
    // Only use a result whose name plausibly IS the business we asked about.
    if (!want || !row.name) continue;
    const got = norm(row.name);
    if (!(got.includes(want) || want.includes(got))) continue;
    if (row.opening_hours) {
      const parsed = parseOsmHours(row.opening_hours);
      if (parsed?.length) return parsed;
    }
  }
  return null;
}

/** Fetch the business's website as text (approx) for the AI text resolver. */
async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "NowOpenAfricaBusinessIntelligence/0.1" } });
  if (!res.ok) return "";
  const html = await res.text();
  return (html as string)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 12000);
}

const FIELD_EXTRACT_TURNS: AgentTurn[] = [
  { role: "user", content: "Extract the facts below as strict JSON and nothing else." },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (!AUTOMATION_SECRET) return json({ ok: false, message: "AUTOMATION_SECRET is not set — refusing to run unauthenticated." }, 500);
  if (req.headers.get("x-automation-key") !== AUTOMATION_SECRET) return json({ ok: false, message: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, message: "Server not configured" }, 500);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const params = new URL(req.url).searchParams;
  const dryRun = params.get("dry") === "1";
  const limit = Math.min(Number(params.get("limit") ?? 1), 10);
  const refill = !dryRun && params.get("refill") !== "0";

  let refilled = 0;
  if (refill) {
    const { data: queuedCount } = await db.rpc("queue_due_enrichment_businesses", { p_max: Math.min(limit * 2, 20) });
    refilled = typeof queuedCount === "number" ? queuedCount : 0;
  }

  const outcomes: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  for (let i = 0; i < limit; i++) {
    let job: { id: string; business_id: string; job_type: string; payload: Record<string, unknown>; run_cost_budget: number | null } | null = null;

    try {
      const { data: jobId } = await db.rpc("claim_next_enrichment_job");
      if (typeof jobId !== "string") break; // queue empty

      const { data: jobRow, error: jobErr } = await db
        .from("business_enrichment_jobs")
        .select("id, business_id, job_type, payload, run_cost_budget")
        .eq("id", jobId)
        .maybeSingle();
      if (jobErr) throw new Error(jobErr.message);
      // claimed but gone — a manual cancel rounds this up.
      if (!jobRow) continue;
      job = jobRow as typeof job;

      const business = await loadBusiness(db, job.business_id);
      if (!business) {
        await db.rpc("finish_enrichment_job", { p_job: job.id, p_status: "failed", p_result: null, p_error: "Business row missing; requeue against a live one." });
        continue;
      }

      // The owner's autonomy switch, read once. The scheduler already filters
      // on it; this second check is the executor refusing to run a business
      // whose owner switched sync off mid-queue. Cancelled, not failed: the
      // run didn't error, it was refused.
      const { data: prefsRow } = await db
        .from("business_sync_preferences")
        .select("approval_threshold, auto_apply_hours, auto_apply_source_images, auto_apply_discovery_fields, confirm_24_hours, sync_enabled")
        .eq("business_id", job.business_id)
        .maybeSingle();
      if (prefsRow && prefsRow.sync_enabled === false) {
        await db.rpc("finish_enrichment_job", { p_job: job.id, p_status: "cancelled", p_result: null, p_error: "sync_enabled is false — the owner turned enrichment off." });
        continue;
      }

      const sources = Array.isArray(job.payload.sources) ? job.payload.sources as string[] : [];
      const aiResolver = job.payload.ai_resolver === true && Boolean(Deno.env.get("GROQ_API_KEY") || Deno.env.get("OPENROUTER_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY") || Deno.env.get("OPENCODE_API_KEY"));

      // Cost shutoff BEFORE any work: an unattended run must not blow a budget.
      const osmActive = sources.includes("openstreetmap") || job.job_type === "hours_resolution";
      const approxUnits = costUnits(job.payload, osmActive, aiResolver ? 1 : 0);
      if (job.run_cost_budget != null && approxUnits > job.run_cost_budget) {
        await db.rpc("finish_enrichment_job", { p_job: job.id, p_status: "failed", p_result: null, p_error: `Would exceed run_cost_budget ${job.run_cost_budget}.` });
        outcomes.push({ job: job.id, status: "failed", reason: "budget" });
        continue;
      }

      const report: SourceReport = { ...(job.payload.source_report as SourceReport ?? {}) };

      // Hydrate structured observations from an actual source, when asked.
      if (osmActive && !report.hours) {
        const hours = await fetchOsmHours(business, "openstreetmap");
        if (hours?.length) report.hours = hours;
      }

      // Hydrate AI text extraction when configured AND the business has a site.
      if (aiResolver && !report.observations && business.website) {
        const text = await fetchPageText(business.website);
        if (text.length > 400) {
          const outcome = await runAgent(
            `${EXTRACTION_PROMPT}\n\nPAGE TEXT:\n${text}`,
            FIELD_EXTRACT_TURNS,
            [],
            undefined,
            { maxTokens: 1200, model: job.payload.model as string | undefined },
          );
          if (outcome.ok) {
            try {
              // The model may wrap the array in markers; the validator also
              // tolerates { fields: [...] }.
              const cleaner = outcome.text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "");
              report.observations = JSON.parse(cleaner);
            } catch {
              report.observations = null;
            }
          }
        }
      }

      const { data: pendingRows } = await db
        .from("business_change_proposals")
        .select("field_name")
        .eq("business_id", job.business_id)
        .eq("status", "pending");

      const summary = runEnrichment({
        business: {
          id: business.id,
          name: business.name,
          domain: business.domain,
          phoneE164: business.phone,
          ownerConfirmed: business.claim_status === "claimed",
          claim_status: business.claim_status,
          fields: {
            opening_hours: business.opening_hours,
            hours: business.hours,
            website: business.website,
            phone: business.phone,
          },
          social_links: business.social_links ?? undefined,
        },
        source: {
          key: sources[0] ?? (osmActive ? "openstreetmap" : "website"),
          url: business.website ?? `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(business.name)}`,
          sourceType: sources[0] ?? (osmActive ? "api" : "dom_extraction"),
        },
        report,
        pendingFields: new Set((pendingRows ?? []).map((r: { field_name: string }) => r.field_name)),
        prefs: {
          approvalThreshold: Number(prefsRow?.approval_threshold ?? 30),
          confirm24Hours: Boolean(prefsRow?.confirm_24_hours),
        },
      });

      let autoApplied = 0;
      if (summary.matched && !dryRun) {
        const evidenceIdByField = new Map<string, string>();

        // 1. Evidence
        for (const draft of summary.deliverables.evidence) {
          const { data: dup } = await db
            .from("business_evidence")
            .select("id")
            .eq("business_id", job.business_id)
            .eq("field_name", draft.field_name)
            .eq("field_value", draft.field_value)
            .eq("superseded_at", null)
            .limit(1);
          if (dup && dup.length) { evidenceIdByField.set(draft.field_name, dup[0].id as string); continue; }
          const { data: ins, error: evErr } = await db
            .from("business_evidence")
            .insert({
              business_id: job.business_id,
              field_name: draft.field_name,
              field_value: draft.field_value,
              source_id: draft.source_id ?? null,
              source_url: draft.source_url ?? null,
              source_type: draft.source_type ?? null,
              confidence: draft.confidence,
              observed_at: draft.observed_at,
              extraction_method: draft.extraction_method,
              generated_by_ai: draft.generated_by_ai,
              ai_model: draft.ai_model ?? null,
              status: draft.status,
            })
            .select("id")
            .single();
          if (evErr) throw new Error(`evidence insert failed: ${evErr.message}`);
          evidenceIdByField.set(draft.field_name, (ins as { id: string }).id);
        }

        // 2. Proposals (linked to the evidence row the policy already created)
        for (const draft of summary.deliverables.proposals) {
          const evidenceId = evidenceIdByField.get(draft.field_name);
          await db.from("business_change_proposals").insert({
            business_id: job.business_id,
            field_name: draft.field_name,
            current_value: draft.current_value,
            proposed_value: draft.proposed_value,
            source_id: draft.source_id,
            source_url: draft.source_url,
            confidence: draft.confidence,
            extraction_method: draft.extraction_method,
            evidence_id: evidenceId ?? null,
            reason: draft.reason,
          });
        }

        // 3. Media (with the unique source guard catching duplicates quietly)
        for (const draft of summary.deliverables.media) {
          const { error: mediaErr } = await db.from("business_media_assets").insert({
            business_id: job.business_id,
            asset_type: draft.asset_type,
            source_id: draft.source_id,
            source_url: draft.source_url,
            source_uri: draft.source_uri,
            match_confidence: draft.match_confidence,
            matching_signal: draft.matching_signal,
            rights_decision: draft.rights_decision,
            licence: draft.licence,
            rights_owner: draft.rights_owner,
            jurisdiction: draft.jurisdiction,
            criticality: draft.criticality,
            moderation_status: draft.moderation_status,
            keep_url_only: draft.keep_url_only,
            status: draft.status,
            caption: draft.caption ?? null,
          });
          if (mediaErr && !/already exists|unique/i.test(mediaErr.message)) {
            throw new Error(`media insert failed: ${mediaErr.message}`);
          }
        }

        // 4. Owner sync preferences may apply the proposals just written. This
        // RPC is the owner-authorised applier (auto_apply_due_proposals): it
        // re-checks the owner's stored flags, confidence bar and evidence
        // inside the database, then writes through the single write core. It
        // is a defined decision path, not a raw business write.
        const { data: applied } = await db.rpc("auto_apply_due_proposals", { p_business: job.business_id });
        autoApplied = typeof applied === "number" ? applied : 0;
      }

      const result = {
        matched: summary.matched,
        evidence: summary.deliverables.evidence.length,
        proposals: summary.deliverables.proposals.length,
        media: summary.deliverables.media.length,
        auto_applied: autoApplied,
        notes: summary.notes,
        dry_run: dryRun,
      };

      await db.rpc("finish_enrichment_job", {
        p_job: job.id,
        p_status: "succeeded",
        p_result: result,
        p_error: null,
      });
      outcomes.push({ job: job.id, ...result });
    } catch (e) {
      const reason = (e as Error)?.message ?? "unknown error";
      if (job) {
        await db.rpc("finish_enrichment_job", { p_job: job.id, p_status: "failed", p_result: null, p_error: reason });
      }
      errors.push(`${job?.id ?? "?"}: ${reason}`);
    }
  }

  return json({ ok: errors.length === 0, ran: outcomes.length, refilled, outcomes, errors });
});