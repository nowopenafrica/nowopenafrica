/**
 * Meta's delivery statuses for WhatsApp messages we sent.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * `status = 'sent'` only ever meant "the Cloud API accepted the request", and
 * the admin console treats it as terminal. MEASURED 2026-10-10: a manual send
 * to `07081547726` — a local number with no country code — was recorded
 * `sent`. Meta accepts such a request and drops it silently.
 *
 * The Cloud API has no endpoint that returns a message's status. Statuses
 * exist only as webhook events, so this is the only way the platform can ever
 * replace an assumption with a fact.
 *
 * ── THIS ENDPOINT IS PUBLIC, AND THAT IS THE RISK ────────────────────────
 *
 * Meta will not present a JWT, so the function runs with verify_jwt off. The
 * signature IS the authentication: without it, anyone who learned the URL
 * could POST a `delivered` for any message id and make the console assert a
 * delivery that never happened — the exact failure this feature exists to
 * end. An unverified body is never applied, and a missing app secret means
 * nothing is applied at all.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  failureAdvice, isProgress, parseInboundMessages, parseStatusEvents, toIso, verifySignature,
  type DeliveryStatus,
} from "../_shared/whatsappStatus.ts";
import { extractReference } from "../_shared/waLink.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/** Meta app secret — signs every webhook body. Without it nothing is trusted. */
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
/** Our own token, echoed back during Meta's one-time subscription handshake. */
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";

/** Both tables that record a WhatsApp send, newest schema first. */
const LEDGERS = ["onboarding_messages", "onboarding_manual_sends"] as const;

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function column(status: DeliveryStatus, iso: string | null): Record<string, unknown> {
  if (status === "delivered") return { delivered_at: iso };
  if (status === "read") return { read_at: iso };
  return {};
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  /*
   * Subscription handshake. Meta GETs once with a challenge and will not
   * deliver events until the exact challenge value comes back as plain text.
   */
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (!VERIFY_TOKEN) return new Response("WHATSAPP_VERIFY_TOKEN is not set.", { status: 503 });
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Verification failed.", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed.", { status: 405 });

  /*
   * Read the body as TEXT first. The signature covers the exact bytes Meta
   * sent; parsing and re-serialising changes them and the check would fail
   * for every honest request.
   */
  const raw = await req.text();

  if (!APP_SECRET) {
    /*
     * Fail CLOSED and say so. Returning 200 here would tell Meta the event
     * was handled and it would never be resent, quietly losing every status
     * until somebody noticed the column was always null.
     */
    console.error("whatsapp-webhook: META_APP_SECRET is not set; refusing to trust any event.");
    return new Response("Not configured.", { status: 503 });
  }

  if (!(await verifySignature(raw, req.headers.get("x-hub-signature-256"), APP_SECRET))) {
    return new Response("Bad signature.", { status: 403 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // A body we cannot read is not a body we should retry. 200 ends it.
    return new Response("ok", { status: 200 });
  }

  const events = parseStatusEvents(body);
  let applied = 0;

  for (const event of events) {
    const iso = toIso(event.at) ?? new Date().toISOString();

    for (const table of LEDGERS) {
      const { data: rows } = await db
        .from(table)
        .select("id, delivery_status")
        .eq("provider_message_id", event.messageId)
        .limit(1);

      const row = (rows ?? [])[0] as { id: string; delivery_status: DeliveryStatus | null } | undefined;
      if (!row) continue;

      /*
       * Meta does not promise ordering, and `read` routinely arrives before
       * `delivered`. Without this guard the later event would overwrite the
       * better one, and a late optimistic event could hide a failure.
       */
      if (!isProgress(row.delivery_status, event.status)) break;

      await db.from(table).update({
        delivery_status: event.status,
        delivery_updated_at: new Date().toISOString(),
        failure_code: event.status === "failed" ? event.errorCode : null,
        failure_detail: event.status === "failed" ? event.errorDetail : null,
        // Meta's words stay above; the next step is ours and kept separate.
        failure_advice: event.status === "failed" ? failureAdvice(event.errorCode) : null,
        ...column(event.status, iso),
      }).eq("id", row.id);

      applied += 1;
      break; // a wamid lives in exactly one ledger
    }
  }

  /*
   * Inbound replies — the whole point of the wa.me route.
   *
   * Outbound templates are gated behind billing (code 131042 on every send
   * this platform has made). A message the owner sends US costs nothing, and
   * without this it exists only on somebody's phone.
   */
  let inboundStored = 0;
  for (const msg of parseInboundMessages(body)) {
    const reference = extractReference(msg.body);

    /*
     * Resolve the reference to a listing. The phone number is deliberately
     * NOT used as a fallback: numbers are shared, reused and mistyped across
     * thousands of listings, and a wrong match would attach a stranger's
     * words to somebody's business.
     */
    let businessId: string | null = null;
    if (reference) {
      /*
       * Resolved in SQL, not here.
       *
       * The first version filtered `ilike('id', '7b73a46e%')` through
       * PostgREST. `businesses.id` is a uuid, the pattern never matched, and
       * the message was stored with business_id NULL and NO ERROR — the
       * reference had parsed perfectly, only the lookup failed, and nothing
       * on the row said so. The cast belongs where casts work.
       *
       * The RPC returns NULL when the prefix is unknown OR matches more than
       * one listing: attaching an owner's message to the wrong business is
       * not a recoverable mistake.
       */
      const { data: resolved } = await db.rpc("business_by_reference", { p_reference: reference });
      if (typeof resolved === "string") businessId = resolved;
    }

    const { error } = await db.from("whatsapp_inbound").insert({
      provider_message_id: msg.messageId,
      from_phone: msg.from,
      sender_name: msg.name,
      body: msg.body,
      reference,
      business_id: businessId,
      received_at: toIso(msg.at) ?? new Date().toISOString(),
    });
    // A retry of an event we already stored hits the unique index. Expected.
    if (!error) inboundStored += 1;
  }

  /*
   * 200 even when nothing matched. Meta retries a non-2xx for days, and a
   * status for a message this platform never sent is not an error here.
   */
  return new Response(JSON.stringify({ ok: true, received: events.length, applied, inboundStored }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
