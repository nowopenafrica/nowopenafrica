import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail, sendWhatsAppText, createNotification, emailShell, BRAND_ORIGIN } from "../_shared/notify.ts";

// run-automations
// ---------------
// The merchant automation engine. Meant to be invoked on a schedule (Supabase
// Cron, a GitHub Action, or any external cron) — e.g. hourly. Each run does the
// recurring busywork for business owners and de-duplicates via automation_log
// so nothing is ever sent twice:
//   1. booking reminders      — a booking is tomorrow → remind the customer + notify the owner
//   2. review requests        — a booking's date has passed → ask the customer for a review
//   3. trial-ending nudges     — a trial ends within 3 days → notify + email the owner to upgrade
//   4. low-stock alerts        — a product dips to/below the threshold → alert the owner
// Every send is best-effort and env-gated (see _shared/notify.ts); the in-app
// notification is the always-available channel.
//
// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Automation-Key",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Shared secret so only the scheduler can trigger the sends. Optional in dev.
const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET");
const LOW_STOCK_THRESHOLD = Number(Deno.env.get("LOW_STOCK_THRESHOLD") ?? "3");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Claim an automation for a target — true if newly claimed, false if it was
 *  already done (unique index on (kind, ref_id) makes this atomic). */
async function claim(kind: string, refId: string, businessId?: string | null): Promise<boolean> {
  const { error } = await supabase.from("automation_log").insert({ kind, ref_id: refId, business_id: businessId ?? null });
  return !error; // a unique-violation means it's already been handled
}

function profileLink(biz: any): string {
  if (biz?.username) return `${BRAND_ORIGIN}/${biz.username}`;
  if (biz?.id) return `${BRAND_ORIGIN}/businesses/${biz.id}`;
  return BRAND_ORIGIN;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (AUTOMATION_SECRET && req.headers.get("x-automation-key") !== AUTOMATION_SECRET) {
    return json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!Deno.env.get("SUPABASE_URL") || !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return json({ ok: false, message: "Server not configured" }, 500);
  }

  const now = new Date();
  const today = isoDate(now);
  const tomorrow = isoDate(new Date(now.getTime() + 86_400_000));
  const in3Days = new Date(now.getTime() + 3 * 86_400_000).toISOString();

  const summary = { bookingReminders: 0, reviewRequests: 0, trialNudges: 0, lowStock: 0, errors: [] as string[] };

  // 1. Booking reminders — bookings happening tomorrow ------------------------
  try {
    const { data: bookings } = await supabase
      .from("business_bookings")
      .select("id, business_id, customer_name, customer_email, customer_phone, item_name, requested_time, businesses!inner(id, name, username, user_id)")
      .in("status", ["pending", "confirmed"])
      .eq("requested_date", tomorrow);

    for (const b of bookings ?? []) {
      if (!(await claim("booking_reminder", b.id, b.business_id))) continue;
      const biz = (b as any).businesses;
      const when = b.requested_time ? ` at ${String(b.requested_time).slice(0, 5)}` : "";
      const what = b.item_name ? ` for ${b.item_name}` : "";
      await sendEmail(
        b.customer_email,
        `Reminder: your booking with ${biz.name} is tomorrow`,
        emailShell("See you tomorrow 👋", `<p>Hi ${b.customer_name.split(" ")[0]},</p><p>This is a friendly reminder of your booking with <strong>${biz.name}</strong> tomorrow${when}${what}.</p><p><a href="${profileLink(biz)}" style="color:#4f46e5">View ${biz.name} →</a></p>`),
      );
      if (b.customer_phone) {
        await sendWhatsAppText(b.customer_phone, `Reminder: your booking with ${biz.name} is tomorrow${when}${what}. See you then!`);
      }
      await createNotification(supabase, {
        userId: biz.user_id,
        title: `Booking tomorrow: ${b.customer_name}`,
        body: `${b.item_name || "Booking"}${when} — reminder sent to the customer.`,
        type: "booking",
        link: "/dashboard",
      });
      summary.bookingReminders++;
    }
  } catch (e) {
    summary.errors.push(`bookingReminders: ${e}`);
  }

  // 2. Review requests — confirmed bookings whose date has passed --------------
  try {
    const { data: past } = await supabase
      .from("business_bookings")
      .select("id, business_id, customer_name, customer_email, businesses!inner(id, name, username)")
      .eq("status", "confirmed")
      .lt("requested_date", today);

    for (const b of past ?? []) {
      if (!(await claim("review_request", b.id, b.business_id))) continue;
      const biz = (b as any).businesses;
      await sendEmail(
        b.customer_email,
        `How was ${biz.name}?`,
        emailShell("Tell others how it went ⭐", `<p>Hi ${b.customer_name.split(" ")[0]},</p><p>Thanks for choosing <strong>${biz.name}</strong>. A quick review helps other customers — and the business — a lot.</p><p><a href="${profileLink(biz)}" style="color:#4f46e5">Leave a review →</a></p>`),
      );
      summary.reviewRequests++;
    }
  } catch (e) {
    summary.errors.push(`reviewRequests: ${e}`);
  }

  // 3. Trial-ending nudges — trials ending within 3 days ----------------------
  try {
    const { data: trials } = await supabase
      .from("users")
      .select("id, email, full_name, plan_renews_at")
      .eq("plan_status", "trialing")
      .gt("plan_renews_at", now.toISOString())
      .lte("plan_renews_at", in3Days);

    for (const u of trials ?? []) {
      if (!(await claim("trial_ending", u.id))) continue;
      const ends = u.plan_renews_at ? new Date(u.plan_renews_at).toLocaleDateString() : "soon";
      await createNotification(supabase, {
        userId: u.id,
        title: "Your free trial ends soon",
        body: `Your all-access trial ends on ${ends}. Upgrade to keep your premium features.`,
        type: "plan",
        link: "/pricing",
      });
      if (u.email) {
        await sendEmail(
          u.email,
          "Your NowOpen trial ends soon — keep your features",
          emailShell("Don't lose your momentum 🚀", `<p>Hi ${(u.full_name || "there").split(" ")[0]},</p><p>Your all-access trial ends on <strong>${ends}</strong>. Upgrade now to keep bookings, analytics, Live and everything you've set up.</p><p><a href="${BRAND_ORIGIN}/pricing" style="color:#4f46e5">Choose a plan →</a></p>`),
        );
      }
      summary.trialNudges++;
    }
  } catch (e) {
    summary.errors.push(`trialNudges: ${e}`);
  }

  // 4. Low-stock alerts -------------------------------------------------------
  try {
    const { data: low } = await supabase
      .from("business_products")
      .select("id, name, stock_quantity, business_id, businesses!inner(name, user_id)")
      .not("stock_quantity", "is", null)
      .lte("stock_quantity", LOW_STOCK_THRESHOLD);

    const lowIds = (low ?? []).map((p: any) => p.id);
    // Reset alerts for products that have since been restocked, so they can
    // alert again if they dip a second time.
    if (lowIds.length > 0) {
      await supabase.from("automation_log").delete().eq("kind", "low_stock").not("ref_id", "in", `(${lowIds.map((i: string) => `"${i}"`).join(",")})`);
    } else {
      await supabase.from("automation_log").delete().eq("kind", "low_stock");
    }

    for (const p of low ?? []) {
      if (!(await claim("low_stock", p.id, p.business_id))) continue;
      const biz = (p as any).businesses;
      await createNotification(supabase, {
        userId: biz.user_id,
        title: `Low stock: ${p.name}`,
        body: `Only ${p.stock_quantity} left. Restock to keep selling.`,
        type: "warning",
        link: "/dashboard",
      });
      summary.lowStock++;
    }
  } catch (e) {
    summary.errors.push(`lowStock: ${e}`);
  }

  return json({ ok: true, ran_at: now.toISOString(), ...summary });
});
