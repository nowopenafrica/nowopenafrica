/**
 * The clock the AI workforce runs on.
 *
 * Called by cron. Finds the agents whose interval has elapsed, runs each one
 * against counted facts, records the run, and raises a notification only for
 * findings a person must see today.
 *
 * WHAT AN UNATTENDED AGENT MAY DO, stated here because it is the whole safety
 * model: read anything, write to its own run log, and create an internal
 * notification. Nothing else. It may not publish a listing, message a customer,
 * change a business, approve a claim, or alter anybody's status. Every one of
 * those is outward-facing or authority-bearing, and an automated system that
 * can do them will eventually do them wrongly at 3am with nobody watching.
 *
 * That boundary is not a limitation on the value here. The expensive failure at
 * this stage is not "the platform did not act" — it is "a report sat unread for
 * a week", "an owner waited three days for a page nobody approved". Continuous
 * measurement plus a short, honest list of what needs a decision is what stops
 * that, and it needs no authority at all.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { AGENTS, notifiable, runStatus, type RawFacts } from "../_shared/agents.ts";
import { buildDailyDigest, type DigestRun } from "../_shared/digest.ts";
import { sendEmail, sendWhatsAppText, emailShell } from "../_shared/notify.ts";

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

/*
 * The founder reads the digest against Lagos time ("Saturday 12 September"),
 * so "today" means the day that started at midnight there. Africa/Lagos is
 * UTC+1 year-round (no DST), so local midnight is 23:00Z the UTC day before.
 */
function digestWindow(): { ref: string; startISO: string; label: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  const midnightLagos = new Date(Date.UTC(y, m - 1, d) - 3_600_000);
  return {
    ref: `${y}-${m}-${d}`,
    startISO: midnightLagos.toISOString(),
    label: new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long",
    }).format(new Date()),
  };
}

/*
 * Push today's brief once, not once per run. The claim insert in automation_log
 * is the atomic guard: the unique (kind, ref_id) index means a second call the
 * same day fails as a duplicate and sends nothing.
 */
async function pushDailyDigest(db: ReturnType<typeof createClient>): Promise<Record<string, unknown>> {
  const win = digestWindow();

  const { error: claimErr } = await db.from("automation_log").insert({
    kind: "workforce_digest",
    ref_id: win.ref,
    detail: { full: "daily workforce digest" },
  });
  if (claimErr) return { sent: false, why: "already sent today" };

  const { data: runs, error: runsErr } = await db
    .from("workforce_runs")
    .select("agent_key,status,summary,findings,reason")
    .gte("created_at", win.startISO)
    .order("created_at", { ascending: false });
  if (runsErr) return { sent: false, why: runsErr.message };

  const content = buildDailyDigest((runs ?? []) as DigestRun[], win.label);

  const { data: flags } = await db.from("feature_flags").select("key,enabled").in("key", ["outbound_email", "outbound_whatsapp"]);
  const flagOn = (name: string) => (flags ?? []).find((f) => f.key === name)?.enabled === true;

  const { data: admins } = await db.from("users").select("email,phone").eq("role", "admin").limit(20);

  const out = { sent: true, email: false, whatsapp: false };
  if (flagOn("outbound_email")) {
    for (const admin of (admins ?? []) as Array<{ email?: string | null }>) {
      if (!admin.email) continue;
      const res = await sendEmail(
        admin.email,
        content.subject,
        emailShell("Daily brief", content.emailHtml),
      );
      if (res.ok) out.email = true;
    }
  }
  if (flagOn("outbound_whatsapp")) {
    for (const admin of (admins ?? []) as Array<{ phone?: string | null }>) {
      if (!admin.phone) continue;
      const res = await sendWhatsAppText(admin.phone, content.whatsappText);
      if (res.ok) out.whatsapp = true;
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  /*
   * Fail closed. An earlier version guarded with `if (AUTOMATION_SECRET && ...)`,
   * which skips the check entirely when the secret is unset — so a missing
   * configuration silently produced a public endpoint rather than a broken one.
   * Refusing to run is the safe failure; running for anybody is not.
   */
  if (!AUTOMATION_SECRET) {
    return json({ ok: false, message: "AUTOMATION_SECRET is not set — refusing to run unauthenticated." }, 500);
  }
  if (req.headers.get("x-automation-key") !== AUTOMATION_SECRET) {
    return json({ ok: false, message: "Unauthorized" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, message: "Server not configured" }, 500);

  const db = createClient(url, key, { auth: { persistSession: false } });

  /*
   * `force` runs every enabled agent regardless of cadence. It exists for the
   * console's "Run now" and for the first run after a deploy; it does not
   * bypass any rule, only the clock.
   */
  const force = new URL(req.url).searchParams.get("force") === "1";

  const { data: due, error: dueErr } = force
    ? await db.from("workforce_schedule").select("agent_key,interval_min,last_run_at").eq("enabled", true)
    : await db.rpc("workforce_due");

  if (dueErr) return json({ ok: false, message: dueErr.message }, 500);

  const ran: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  for (const row of (due ?? []) as Array<{ agent_key: string }>) {
    const agentKey = row.agent_key;
    const run = AGENTS[agentKey];
    const started = Date.now();

    if (!run) {
      /*
       * A scheduled agent with no implementation is recorded as failed rather
       * than skipped. Silence would let a roster entry look staffed forever.
       */
      await db.rpc("record_scheduled_run", {
        p_agent_key: agentKey, p_status: "failed", p_summary: "No implementation",
        p_facts: [], p_findings: [],
        p_reason: `No rules are defined for "${agentKey}".`, p_duration_ms: 0,
      });
      errors.push(`${agentKey}: no implementation`);
      continue;
    }

    try {
      const { data: facts, error: factErr } = await db.rpc("workforce_facts_for", { p_agent_key: agentKey });
      if (factErr) throw new Error(factErr.message);
      if (!facts) throw new Error("No facts returned; the agent has nothing to reason from.");

      const result = run(facts as RawFacts);
      const status = runStatus(result);

      const { error: recErr } = await db.rpc("record_scheduled_run", {
        p_agent_key: agentKey,
        p_status: status,
        p_summary: result.summary,
        p_facts: result.facts,
        p_findings: result.findings,
        p_reason: null,
        p_duration_ms: Date.now() - started,
      });
      if (recErr) throw new Error(recErr.message);

      // Only the critical ones reach a person. See notifiable().
      const urgent = notifiable(result);
      let notified = 0;
      if (urgent.length > 0) {
        const { data: admins } = await db.from("users").select("id").eq("role", "admin").limit(20);
        for (const admin of (admins ?? []) as Array<{ id: string }>) {
          for (const finding of urgent) {
            /*
             * The column is `type`, not `kind`. An earlier version used `kind`,
             * which does not exist — and because the insert error was never
             * checked, the run reported "notified: 1" while writing nothing.
             * The error is inspected now: an agent that cannot reach anybody
             * has failed at its whole purpose and should say so.
             */
            const { error: noteErr } = await db.from("notifications").insert({
              user_id: admin.id,
              title: finding.title,
              body: finding.detail,
              type: "system",
              link: "/admin",
            });
            if (noteErr) throw new Error(`could not notify: ${noteErr.message}`);
            notified++;
          }
        }
      }

      ran.push({ agent: agentKey, status, findings: result.findings.length, notified });
    } catch (e) {
      const reason = (e as Error)?.message ?? "unknown error";
      /*
       * A failing agent records the failure and the loop continues. One broken
       * agent must not stop the other three — a scheduler that dies on the
       * first error is a scheduler that stops running the day something breaks.
       */
      await db.rpc("record_scheduled_run", {
        p_agent_key: agentKey, p_status: "failed", p_summary: "Run failed",
        p_facts: [], p_findings: [], p_reason: reason, p_duration_ms: Date.now() - started,
      });
      errors.push(`${agentKey}: ${reason}`);
    }
  }

  /*
   * The daily digest rides the Chief of Staff's cadence. It runs once a day,
   * so when this tick ran it to a real outcome, the day's brief goes out by
   * email and WhatsApp. The claim-guard makes it once-per-day even if cron
   * re-fires the function within the same Lagos calendar day.
   */
  const chiefRan = ran.some(
    (r) => r.agent === "chief-of-staff" && (r.status === "ok" || r.status === "nothing-to-report"),
  );
  const digest = chiefRan ? await pushDailyDigest(db) : null;

  return json({
    ok: errors.length === 0,
    checked: (due ?? []).length,
    ran,
    digest,
    errors,
  });
});
