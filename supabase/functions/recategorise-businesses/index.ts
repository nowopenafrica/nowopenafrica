/**
 * Propose a real category for listings stuck in "Other".
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * MEASURED 2026-10-10: 151 listable businesses sit in "Other" or with no
 * category at all, every one of them unclaimed, and 140 carry a description
 * that says what they do. "Other" is not a neutral absence — it is a
 * classification, it is almost always wrong, and it keeps a business out of
 * the category pages its customers actually browse.
 *
 * ── WHAT IT IS ALLOWED TO READ ───────────────────────────────────────────
 *
 * The business's own name and description, matched against NowOpen's category
 * list by `selfCategory.ts`. Nothing is inferred from a photograph, a
 * location, or a similar business. The reader refuses when two trades are
 * named equally, and refuses a trade word inside a street name — both learned
 * from real listings.
 *
 * ── IT PROPOSES, IT DOES NOT OVERWRITE ───────────────────────────────────
 *
 * The first version of this wrote straight to `businesses.category`. A dry
 * run over the real 151 rows killed that design: of the two changes it would
 * have made, one was "Fintech Association Of Nigeria" → Fintech & Payments,
 * which a human had already reviewed and REVERTED earlier the same day (it is
 * an industry association, not a fintech company).
 *
 * A sweep that re-applies a reverted decision every thirty minutes does not
 * improve the directory, it argues with the reviewer — and it wins, because
 * it never gets tired.
 *
 * So it writes to `business_change_proposals`, the mechanism this platform
 * already has, with its own admin panel and auto-apply job. It skips any
 * business that already has a category proposal in ANY state, which is what
 * makes a rejection stick and what makes repeat runs idempotent.
 *
 * It never touches a CLAIMED listing: that category belongs to the owner.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

import { categoryFromSelfDescription } from "../_shared/selfCategory.ts";
import {
  allowedCategories, buildCategoryPrompt, CATEGORY_SYSTEM_PROMPT,
  parseCategoryAnswer, worthAsking,
} from "../_shared/categoryModel.ts";
import { runAgent } from "../_shared/llm.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-automation-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const automationSecret = Deno.env.get("AUTOMATION_SECRET") ?? "";

/**
 * Rows examined per run.
 *
 * The whole backlog is 151, so one pass clears it and later runs have almost
 * nothing to do. The cap exists so a future import of fifty thousand
 * uncategorised rows cannot turn one scheduled run into a very long one.
 */
const BATCH = 500;

/** Businesses per `.in()` when checking for existing proposals. */
const CHUNK = 200;

/*
 * How many businesses a single run may ASK A MODEL about.
 *
 * The deterministic reader is free and runs on everything. This is the paid
 * fallback, and the sweep runs every thirty minutes, so an uncapped run would
 * turn a backlog into a bill. At 20 a run the current 223 clear in about six
 * hours and the steady state is nearly zero.
 */
const MODEL_BUDGET = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  /*
   * Fail CLOSED. This writes proposals about real businesses, so an
   * automation endpoint without its secret must refuse rather than run
   * unauthenticated.
   */
  if (!automationSecret) return json({ ok: false, reason: "AUTOMATION_SECRET is not set." }, 503);
  if ((req.headers.get("x-automation-key") ?? "") !== automationSecret) {
    return json({ ok: false, reason: "Not authorised." }, 403);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  /*
   * Unclaimed, listable, and uncategorised.
   *
   * `neq('claim_status','claimed')` alone would drop rows where claim_status
   * is NULL, so the filter names that case explicitly — a listing nobody has
   * claimed is exactly the population this is for. Verified against the live
   * table before deploying: 151 rows, all "Other", none claimed.
   */
  const { data: rows, error } = await db
    .from("businesses")
    .select("id,name,description,category,claim_status")
    .eq("is_listable", true)
    .eq("profile_state", "published")
    .or("category.is.null,category.eq.Other,category.eq.")
    .or("claim_status.is.null,claim_status.neq.claimed")
    .limit(BATCH);

  if (error) return json({ ok: false, reason: `read failed: ${error.message}` }, 500);

  const considered = rows?.length ?? 0;
  const candidates: Array<{
    id: string; name: string; from: string; to: string; matched: string[];
    readBy: "vocabulary" | "model";
  }> = [];
  /** No trade word found, but enough words to be worth asking a model about. */
  const unread: Array<{ id: string; name: string; from: string; description: string }> = [];

  for (const b of rows ?? []) {
    // Belt and braces: the query filters this, but a filter mistake here
    // would propose against a listing whose owner already chose a category.
    if (String(b.claim_status ?? "") === "claimed") continue;

    const current = String(b.category ?? "").trim();
    if (current && current !== "Other") continue;

    const match = categoryFromSelfDescription(b.description as string | null, b.name as string | null);
    if (match) {
      candidates.push({
        id: b.id as string,
        name: String(b.name ?? ""),
        from: current || "(none)",
        to: match.category,
        matched: match.matched,
        readBy: "vocabulary",
      });
      continue;
    }

    /*
     * The reader found no trade word. That is usually correct — and it is
     * also how "we bake bespoke cakes for Lagos weddings" gets left in
     * "Other", because it names no term in a fixed vocabulary.
     *
     * MEASURED 2026-10-12: 223 listable unclaimed businesses sit
     * uncategorised, 211 of them with a description. Queue them for the
     * model, up to the budget.
     */
    if (worthAsking(b.description as string | null)) {
      unread.push({
        id: b.id as string,
        name: String(b.name ?? ""),
        from: current || "(none)",
        description: String(b.description ?? ""),
      });
    }
  }

  /*
   * The model pass, for the ones the vocabulary could not read.
   *
   * Every answer is checked against OUR category list before it is allowed
   * anywhere near a proposal — a model that replies "Luxury Real Estate
   * Group" is discarded, not accommodated. NONE, silence and anything
   * unparseable all mean "leave it alone".
   *
   * A model failure is not a sweep failure: the deterministic proposals
   * above are already correct and must still be written. So this logs and
   * moves on rather than aborting.
   */
  const categories = allowedCategories();
  let asked = 0;
  let modelRefused = 0;
  let modelUnavailable: string | null = null;

  for (const row of unread.slice(0, MODEL_BUDGET)) {
    let outcome;
    try {
      outcome = await runAgent(
        CATEGORY_SYSTEM_PROMPT,
        [{ role: "user", content: buildCategoryPrompt(row.name, row.description, categories) }],
        [],
        async () => ({ error: "no tools" }),
        // One line of output. A long answer is a wrong answer here.
        { maxTokens: 24 },
      );
    } catch (e) {
      modelUnavailable = String(e);
      break;
    }

    if (!outcome.ok) {
      /*
       * No provider configured, or every provider refused. Stop asking — the
       * next 19 calls would fail the same way — and say so in the result
       * rather than reporting a quiet zero.
       */
      /*
       * Keep the provider's own words. "error" alone sent me looking at the
       * wrong thing; a 404 model_not_found and an expired key need different
       * actions, and the reason code cannot tell them apart.
       */
      modelUnavailable = [outcome.reason, outcome.status, outcome.detail]
        .filter(Boolean).join(" · ").slice(0, 300);
      break;
    }

    asked += 1;
    const picked = parseCategoryAnswer(outcome.text, categories);
    if (!picked) { modelRefused += 1; continue; }

    candidates.push({
      id: row.id,
      name: row.name,
      from: row.from,
      to: picked,
      matched: [],
      readBy: "model",
    });
  }

  /*
   * Anything already proposed, in ANY state.
   *
   * This is the rule that stops the sweep arguing with a reviewer: a
   * rejection is a decision, and re-proposing the same change every half hour
   * would overturn it by attrition. Skipping on any state also makes repeat
   * runs idempotent, so a pending proposal is never duplicated.
   */
  const ids = candidates.map((c) => c.id);
  const alreadyProposed = new Set<string>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data: existing, error: pErr } = await db
      .from("business_change_proposals")
      .select("business_id")
      .eq("field_name", "category")
      .in("business_id", ids.slice(i, i + CHUNK));
    /*
     * A failed read here must NOT be treated as "nothing proposed yet" — that
     * would re-propose everything a reviewer has already rejected, which is
     * the one outcome this guard exists to prevent.
     */
    if (pErr) return json({ ok: false, reason: `proposal check failed: ${pErr.message}` }, 500);
    for (const p of existing ?? []) alreadyProposed.add(p.business_id as string);
  }

  const fresh = candidates.filter((c) => !alreadyProposed.has(c.id));

  let proposed = 0;
  const failures: string[] = [];

  for (const change of fresh) {
    const { error: insErr } = await db.from("business_change_proposals").insert({
      business_id: change.id,
      field_name: "category",
      current_value: change.from,
      proposed_value: change.to,
      // FK to radar_sources. The business's own published words are the source.
      source_id: "public_instagram",
      extraction_method: change.readBy === "model" ? "self_description_model" : "self_description_vocabulary",
      /*
       * Not a probability. The reader either found an unambiguous match or
       * returned nothing, so every proposal carries the same weight — the
       * phrases in `reason` are the part a reviewer can actually check.
       */
      /*
       * The vocabulary reader either matched an unambiguous term or returned
       * nothing, so its proposals all carry the same weight. A model reading
       * is a judgement about prose and is recorded as weaker, so a reviewer
       * sorting by confidence sees the checkable ones first.
       */
      confidence: change.readBy === "model" ? 55 : 70,
      status: "pending",
      reason: change.readBy === "model"
        ? `A language model read this business's own description and placed it in ${change.to}. `
          + "The answer was checked against NowOpen's category list before being proposed, and "
          + "nothing was inferred from location, popularity or similar businesses. "
          + "Model-derived: worth a glance at the description before approving."
        : `The business describes itself using ${change.matched.map((m) => `"${m}"`).join(", ")}, `
          + `which NowOpen files under ${change.to}. Read from its own name and description; `
          + "nothing was inferred from location, category or similar businesses.",
    });
    if (insErr) failures.push(`${change.name}: ${insErr.message}`);
    else proposed += 1;
  }

  return json({
    ok: true,
    considered,
    /** Rows the reader was confident about. */
    matched: candidates.length,
    /** Already decided once, so deliberately left alone. */
    skippedAlreadyProposed: candidates.length - fresh.length,
    proposed,
    failures,
    /* The model pass, reported separately so a quiet zero is explainable. */
    model: {
      queued: unread.length,
      asked,
      refused: modelRefused,
      accepted: candidates.filter((c) => c.readBy === "model").length,
      unavailable: modelUnavailable,
    },
    /*
     * The evidence travels with the result: each line names the phrases the
     * business itself wrote, so a wrong proposal can be understood rather
     * than merely undone.
     */
    changes: fresh.slice(0, 50).map((c) => `${c.name} → ${c.to} (${c.matched.join(", ")})`),
  });
});
