// Turns a *paid* subscription payment_intent into an actual plan on the
// account. Called by both verify-payment (instant, client-triggered) and
// paystack-webhook (authoritative, async) — either can run first, so this is
// written to be idempotent.
//
// Runs with the service-role client, which is the ONLY caller allowed to touch
// the plan columns on `users` (a DB trigger freezes them for everyone else).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export interface PaidIntent {
  kind?: string | null;
  item_id?: string | null;
  item_title?: string | null;
  amount_usd?: number | null;
  currency?: string | null;
  user_id?: string | null;
  reference?: string | null;
}

// Only these two kinds represent an account subscription. ai_addon / module /
// ad_boost / *_booking are one-off purchases and never change the plan.
const BUSINESS_KIND = "subscription";
const CREATIVE_KIND = "creative_subscription";

export async function activatePlanFromIntent(
  supabase: SupabaseClient,
  intent: PaidIntent,
): Promise<void> {
  const kind = intent.kind ?? "";
  if (kind !== BUSINESS_KIND && kind !== CREATIVE_KIND) return; // not a plan
  if (!intent.user_id || !intent.item_id) return; // anonymous or malformed — nothing to grant

  const isCreative = kind === CREATIVE_KIND;
  const tier = intent.item_id;
  // The checkout title carries the cycle ("… — annual" / "… — monthly").
  const billingCycle = /annual/i.test(intent.item_title ?? "") ? "annual" : "monthly";

  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === "annual") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  // Idempotency: if we already recorded an active subscription for this exact
  // payment reference, the plan is already granted — stop here.
  if (intent.reference) {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("payment_reference", intent.reference)
      .maybeSingle();
    if (existing) return;
  }

  // Retire any prior active subscription of the same kind, then record this one.
  await supabase
    .from("subscriptions")
    .update({ status: "canceled", updated_at: now.toISOString() })
    .eq("user_id", intent.user_id)
    .eq("kind", isCreative ? "creative" : "business")
    .eq("status", "active");

  await supabase.from("subscriptions").insert({
    user_id: intent.user_id,
    kind: isCreative ? "creative" : "business",
    tier,
    billing_cycle: billingCycle,
    status: "active",
    amount_usd: intent.amount_usd ?? null,
    currency: intent.currency ?? null,
    payment_reference: intent.reference ?? null,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
  });

  // Denormalise onto users for cheap reads across the app.
  const patch: Record<string, unknown> = {
    plan_status: "active",
    plan_billing_cycle: billingCycle,
    plan_renews_at: periodEnd.toISOString(),
    plan_updated_at: now.toISOString(),
  };
  patch[isCreative ? "creative_plan" : "plan"] = tier;

  await supabase.from("users").update(patch).eq("id", intent.user_id);
}
