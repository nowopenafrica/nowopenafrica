/**
 * ClaimReach — the sender.
 *
 * ── IT IS OFF, AND THAT IS THE DEFAULT ───────────────────────────────────
 *
 * This is the first code in the repository that can deliver a message to
 * somebody who did not ask to hear from us. It refuses to run unless FOUR
 * separate things are true, and none of them is true today:
 *
 *   1. AUTOMATION_SECRET matches                     (as every automation)
 *   2. feature flag `claim_outreach`        is on    — currently OFF
 *   3. feature flag `email_outreach_enabled` is on   — currently OFF
 *   4. RESEND_API_KEY is configured                  — currently ABSENT
 *
 * Any one missing and it sends nothing and says which. A mass-mailer whose
 * default is "on" is not a thing to ship, and a kill switch that lives only in
 * the caller is not a kill switch.
 *
 * ── WHY IT DOES NOT TRUST THE CONSOLE'S PLAN ─────────────────────────────
 *
 * The §28 gate in src/lib/claimreach/sendGate.ts is thorough and well tested,
 * but it runs in a browser against data fetched seconds ago and produces a
 * DESCRIPTION. Between that description and a send, a suppression can arrive,
 * a business can be claimed, another operator can click the same button.
 *
 * So this never accepts a list of recipients. It asks the database to RESERVE
 * a batch — claimreach_claim_batch re-checks suppression, provenance,
 * frequency and the daily cap under a row lock, and writes a `queued` row in
 * the same transaction. Two runs cannot claim the same business; the unique
 * idempotency key makes the second lose.
 *
 * ── EVERY MESSAGE CARRIES A WORKING WAY OUT ──────────────────────────────
 *
 * One-click unsubscribe, no account, no login, and a List-Unsubscribe header
 * so a mail client can offer it natively. The token is the message's own
 * idempotency key: already unique, already tied to one business and channel,
 * and nothing new to mint or store.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const automationSecret = Deno.env.get("AUTOMATION_SECRET") ?? "";
const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
const resendFrom = Deno.env.get("RESEND_FROM") ?? "NowOpen Africa <hello@nowopenafrica.com>";
const siteUrl = Deno.env.get("SITE_URL") ?? "https://www.nowopenafrica.com";

/** Both must be ON. Two switches, because one is easy to leave flipped. */
const REQUIRED_FLAGS = ["claim_outreach", "email_outreach_enabled"] as const;

/** Never more than this in one invocation, whatever the caller asks for. */
const HARD_BATCH_CEILING = 50;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-automation-key",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const escape = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The message.
 *
 * Deliberately short, factual, and about THEM. It states why we hold their
 * details, what we are offering, and how to stop — because that is what a
 * cold message to a business owner has to earn its way past.
 *
 * It asserts nothing about the business that we have not recorded, and makes
 * no claim about NowOpen's size or their competitors.
 */
function buildEmail(name: string, token: string) {
  const unsub = `${siteUrl}/unsubscribe?t=${encodeURIComponent(token)}`;
  const claim = `${siteUrl}/claim?ref=${encodeURIComponent(token)}`;
  const safeName = escape(name);

  const text = [
    `Hello ${name},`,
    ``,
    `${name} is listed on NowOpen Africa, a directory of African businesses. We built the listing from publicly available information, and nobody from your business has confirmed it yet.`,
    ``,
    `You can claim it — free — to correct anything wrong, add your services and opening hours, and control what appears:`,
    claim,
    ``,
    `If you would rather we did not contact you again, this link stops it immediately:`,
    unsub,
    ``,
    `NowOpen Africa`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.55;color:#111">
<p>Hello ${safeName},</p>
<p><strong>${safeName}</strong> is listed on NowOpen Africa, a directory of African businesses.
We built the listing from publicly available information, and nobody from your business has confirmed it yet.</p>
<p>You can claim it — free — to correct anything wrong, add your services and opening hours, and control what appears.</p>
<p><a href="${claim}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Claim this listing</a></p>
<p style="color:#666;font-size:13px">If you would rather we did not contact you again,
<a href="${unsub}">this link stops it immediately</a>.</p>
<p style="color:#666;font-size:13px">NowOpen Africa</p>
</body></html>`;

  return { text, html, unsub };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  /*
   * ── READINESS, FOR THE CONSOLE TO READ ─────────────────────────────────
   *
   * `?status=1` answers "could this send, and if not what is missing" and
   * nothing else. It never sends, never reserves and never returns a secret —
   * only booleans.
   *
   * It exists because the console was asserting the answer instead of asking
   * for it. Its banner read "...and no email provider key is configured",
   * which was true when it was written and became false the moment a key was
   * set, with nothing to notice. A browser cannot read an edge secret, so the
   * function that holds it reports on itself.
   *
   * Authorised by the caller being an ADMIN, not by the automation secret: a
   * secret that unlocks sending must never be shipped to a browser so it can
   * read a status line.
   */
  if (new URL(req.url).searchParams.get("status") === "1") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, reason: "Sign in as an admin to read sender status." }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    // Verify the JWT with the service client rather than standing up a second
    // anon client just to read a status line.
    const { data: me } = await admin.auth.getUser(token);
    if (!me?.user) return json({ ok: false, reason: "Not signed in." }, 401);
    const { data: actor } = await admin.from("users").select("role").eq("id", me.user.id).maybeSingle();
    if ((actor as { role?: string } | null)?.role !== "admin") {
      return json({ ok: false, reason: "Administrators only." }, 403);
    }

    const { data: flags } = await admin
      .from("feature_flags").select("key, enabled").in("key", REQUIRED_FLAGS as unknown as string[]);
    const on = new Map((flags ?? []).map((f: { key: string; enabled: boolean }) => [f.key, f.enabled]));

    return json({
      ok: true,
      // Booleans only. Never the key, never its length, never a prefix.
      providerConfigured: Boolean(resendKey),
      automationConfigured: Boolean(automationSecret),
      flags: {
        claim_outreach: on.get("claim_outreach") === true,
        email_outreach_enabled: on.get("email_outreach_enabled") === true,
      },
    });
  }

  // 1. The automation secret, as every automation endpoint.
  if (!automationSecret) return json({ ok: false, reason: "AUTOMATION_SECRET is not set." }, 503);
  if ((req.headers.get("x-automation-key") ?? "") !== automationSecret) {
    return json({ ok: false, reason: "Not authorised." }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(HARD_BATCH_CEILING, Number(body?.limit ?? 10)));
  const dryRun = body?.dryRun !== false;   // ← sending requires asking for it

  const db = createClient(supabaseUrl, serviceKey);

  // 2. Both kill switches, read fresh from the database every invocation.
  const { data: flagRows, error: flagErr } = await db
    .from("feature_flags").select("key,enabled").in("key", REQUIRED_FLAGS as unknown as string[]);
  if (flagErr) return json({ ok: false, reason: `Could not read the kill switches: ${flagErr.message}` }, 503);
  const on = new Set((flagRows ?? []).filter((f) => (f as { enabled: boolean }).enabled)
    .map((f) => (f as { key: string }).key));
  const missingFlags = REQUIRED_FLAGS.filter((f) => !on.has(f));
  if (missingFlags.length) {
    return json({
      ok: false,
      sent: 0,
      reason: `Outreach is switched off. Enable ${missingFlags.join(" and ")} to allow sending.`,
    }, 409);
  }

  // 3. A provider. Absent means nothing can be delivered — say so rather than
  //    reserving a batch we cannot send and leaving it queued for ever.
  if (!resendKey) {
    return json({ ok: false, sent: 0, reason: "RESEND_API_KEY is not configured; no message can be delivered." }, 503);
  }

  // 4. Reserve. The database re-checks every rule that matters, under a lock.
  const { data: batch, error: claimErr } = await db.rpc("claimreach_claim_batch", {
    p_campaign: body?.campaignId ?? null,
    p_channel: "email",
    p_limit: limit,
  });
  if (claimErr) return json({ ok: false, reason: `Could not reserve a batch: ${claimErr.message}` }, 500);

  const reserved = (batch ?? []) as Array<{
    out_business_id: string; out_business_name: string; out_contact: string; out_token: string;
  }>;
  if (reserved.length === 0) {
    return json({ ok: true, sent: 0, note: "Nobody is eligible right now — cap spent, or no unsuppressed sourced contacts." });
  }

  /*
   * A dry run RELEASES what it reserved. Leaving the rows behind would count
   * against the daily cap and the frequency rules for businesses nobody
   * contacted — a rehearsal must not consume the real budget.
   */
  if (dryRun) {
    await db.from("claimreach_outreach").delete()
      .in("idempotency_key", reserved.map((r) => r.out_token));
    return json({
      ok: true,
      dryRun: true,
      sent: 0,
      wouldSend: reserved.length,
      sample: reserved.slice(0, 3).map((r) => ({ business: r.out_business_name, contact: r.out_contact })),
      note: "Reservations released. Call again with dryRun:false to actually send.",
    });
  }

  let sent = 0;
  let failed = 0;
  const notes: string[] = [];

  for (const row of reserved) {
    const { text, html, unsub } = buildEmail(row.out_business_name ?? "there", row.out_token);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: resendFrom,
          to: row.out_contact,
          subject: `Claim your ${row.out_business_name} listing on NowOpen Africa`,
          text,
          html,
          // So a mail client can offer one-click unsubscribe natively, which
          // most recipients will reach for before a link in the body.
          headers: {
            "List-Unsubscribe": `<${unsub}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        failed += 1;
        await db.from("claimreach_outreach").update({
          status: "failed", status_at: new Date().toISOString(),
          error: String(payload?.message ?? res.status).slice(0, 400),
        }).eq("idempotency_key", row.out_token);
        if (notes.length < 8) notes.push(`${row.out_business_name}: ${payload?.message ?? res.status}`);
        continue;
      }

      sent += 1;
      await db.from("claimreach_outreach").update({
        status: "sent", status_at: new Date().toISOString(),
        provider_message_id: payload?.id ?? null,
      }).eq("idempotency_key", row.out_token);
    } catch (e) {
      failed += 1;
      await db.from("claimreach_outreach").update({
        status: "failed", status_at: new Date().toISOString(),
        error: (e instanceof Error ? e.message : "send threw").slice(0, 400),
      }).eq("idempotency_key", row.out_token);
    }

    // One message a second. These are cold emails to small businesses, not a
    // transactional burst, and nothing here is urgent.
    await new Promise((r) => setTimeout(r, 1000));
  }

  return json({ ok: true, dryRun: false, reserved: reserved.length, sent, failed, notes });
});
