/**
 * What Meta tells us AFTER a message is accepted.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * `onboarding_messages.status = 'sent'` only ever meant "the Cloud API
 * accepted the request". It is terminal in the UI, so the screen reported a
 * delivered message when nothing had reached a handset.
 *
 * MEASURED 2026-10-10: a manual send to `07081547726` — a local number with
 * no country code at all — was recorded `sent`. Meta accepts such a request
 * and drops it silently. A green row for a message nobody can receive is
 * worse than a red one, because nobody goes looking.
 *
 * The Cloud API has NO endpoint that returns a message's status: statuses
 * arrive only as webhook events. So correlating them is the only way this
 * platform can ever know, and that correlation needs Meta's own message id,
 * which the sender used to discard.
 */

/** Our own vocabulary, deliberately not Meta's. */
export type DeliveryStatus = "accepted" | "delivered" | "read" | "failed";

export interface StatusEvent {
  messageId: string;
  status: DeliveryStatus;
  /** Meta's millisecond-free unix seconds, as a string. */
  at: string | null;
  errorCode: number | null;
  errorDetail: string | null;
}

/**
 * Progress, so an out-of-order webhook cannot walk a message backwards.
 *
 * Meta does not promise ordering, and `read` routinely arrives before
 * `delivered` on a busy line. Without a rank, the later-arriving `delivered`
 * would overwrite `read` and the screen would lose the better news. `failed`
 * ranks highest: it is the one status that must never be hidden by a
 * late-arriving optimistic event.
 */
const RANK: Record<DeliveryStatus, number> = {
  accepted: 0,
  delivered: 1,
  read: 2,
  failed: 3,
};

export function ranks(status: DeliveryStatus): number {
  return RANK[status];
}

/** True when `incoming` is news worth writing over `current`. */
export function isProgress(current: DeliveryStatus | null | undefined, incoming: DeliveryStatus): boolean {
  if (!current) return true;
  return RANK[incoming] > RANK[current];
}

/**
 * Meta's words to ours.
 *
 * `sent` from Meta means the same thing our row already said, so it maps to
 * `accepted` rather than inventing progress. Anything unrecognised returns
 * null and is ignored: a status we cannot read is not a status we should act
 * on.
 */
export function mapStatus(metaStatus: unknown): DeliveryStatus | null {
  switch (String(metaStatus ?? "").toLowerCase()) {
    case "sent": return "accepted";
    case "delivered": return "delivered";
    case "read": return "read";
    case "failed": return "failed";
    // "deleted" and anything new Meta adds later.
    default: return null;
  }
}

/**
 * Pull every status event out of a webhook body.
 *
 * The payload is deeply nested and every level is optional. This is untrusted
 * input from a public endpoint, so nothing is assumed to exist and nothing
 * throws — a malformed body yields an empty list rather than a 500 that makes
 * Meta retry it forever.
 */
export function parseStatusEvents(body: unknown): StatusEvent[] {
  const out: StatusEvent[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as { value?: { statuses?: unknown[] } })?.value;
      const statuses = value?.statuses;
      if (!Array.isArray(statuses)) continue;

      for (const raw of statuses) {
        const s = raw as {
          id?: unknown;
          status?: unknown;
          timestamp?: unknown;
          errors?: Array<{ code?: unknown; title?: unknown; message?: unknown }>;
        };
        const messageId = typeof s.id === "string" ? s.id : "";
        const status = mapStatus(s.status);
        if (!messageId || !status) continue;

        const firstError = Array.isArray(s.errors) ? s.errors[0] : undefined;
        out.push({
          messageId,
          status,
          at: s.timestamp == null ? null : String(s.timestamp),
          errorCode: typeof firstError?.code === "number" ? firstError.code : null,
          /*
           * Meta's own sentence, kept verbatim. "failed" with no reason sends
           * an operator hunting; "Message undeliverable" ends the hunt.
           */
          /*
           * Meta often sends the SAME sentence as both title and message, and
           * joining them produced "Business eligibility payment issue —
           * Business eligibility payment issue" on a real failure. Dedupe
           * before joining.
           */
          errorDetail: Array.from(new Set(
            [firstError?.title, firstError?.message]
              .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
              .map((x) => x.trim()),
          )).join(" — ") || null,
        });
      }
    }
  }
  return out;
}

/** Unix seconds (Meta's format) to an ISO timestamp, or null. */
export function toIso(at: string | null): string | null {
  if (!at) return null;
  const n = Number(at);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

/**
 * Is this request really from Meta?
 *
 * The webhook endpoint is public and unauthenticated by necessity — Meta will
 * not present a JWT. Without this check anyone who learns the URL could POST
 * `{"status":"delivered"}` for any message id and make the console assert a
 * delivery that never happened. That is the exact failure this whole feature
 * exists to end, so an unverified body is never applied.
 *
 * Meta signs the RAW body with the app secret: `X-Hub-Signature-256:
 * sha256=<hex>`. The body must be hashed exactly as received — parsing and
 * re-serialising changes bytes and breaks the comparison.
 */
export async function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  // Fail CLOSED. No secret configured means we cannot tell Meta from anyone
  // else, and "cannot tell" must never read as "trusted".
  if (!appSecret || !header) return false;

  const expectedPrefix = "sha256=";
  if (!header.startsWith(expectedPrefix)) return false;
  const given = header.slice(expectedPrefix.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  /*
   * Constant-time comparison. A byte-by-byte early exit leaks how much of a
   * forged signature was right, which is enough to find the rest one byte at
   * a time.
   */
  if (computed.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i += 1) diff |= computed.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/**
 * What to actually DO about a delivery failure.
 *
 * Meta's own sentence is kept and shown regardless — this only adds a next
 * step for codes whose wording does not imply one. MEASURED 2026-10-10: three
 * real sends failed with 131042 "Business eligibility payment issue", which
 * reads like an account suspension and is in fact a missing payment method.
 *
 * Deliberately short. A code that is not listed returns null and the screen
 * shows Meta's text alone: inventing guidance for an unfamiliar code is how a
 * screen starts confidently misdirecting the person reading it.
 */
export function failureAdvice(code: number | null): string | null {
  switch (code) {
    case 131042:
      return "Add or fix a payment method on the WhatsApp Business Account "
        + "(Meta Business Settings → Billing & payments). Meta accepts messages and refuses to deliver them until billing is valid.";
    case 131026:
      return "Meta could not deliver to this number. The commonest causes are that it is not registered on WhatsApp, or it is not in full international form.";
    case 131047:
      return "The 24-hour service window has closed for this recipient, so only an approved template can reach them.";
    case 133010:
      return "The sending phone number is not registered with the Cloud API.";
    default:
      return null;
  }
}

/** An inbound message from an owner, as the webhook needs it. */
export interface InboundMessage {
  messageId: string;
  from: string;
  name: string | null;
  body: string | null;
  at: string | null;
}

/**
 * Pull inbound messages out of the same webhook body.
 *
 * `statuses` and `messages` arrive through one subscription, so the endpoint
 * handles both. Only text is read: an image or a voice note from an owner is
 * still a real reply, so it is recorded with a null body rather than dropped,
 * because "they wrote in and we ignored it" is the worse failure.
 */
export function parseInboundMessages(body: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const value = (change as {
        value?: {
          messages?: unknown[];
          contacts?: Array<{ wa_id?: unknown; profile?: { name?: unknown } }>;
        };
      })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;

      /* Meta sends the sender's display name alongside, not inside, the message. */
      const names = new Map<string, string>();
      for (const c of value?.contacts ?? []) {
        if (typeof c?.wa_id === "string" && typeof c?.profile?.name === "string") {
          names.set(c.wa_id, c.profile.name);
        }
      }

      for (const raw of messages) {
        const m = raw as {
          id?: unknown; from?: unknown; timestamp?: unknown;
          type?: unknown; text?: { body?: unknown };
        };
        const messageId = typeof m.id === "string" ? m.id : "";
        const from = typeof m.from === "string" ? m.from : "";
        if (!messageId || !from) continue;

        out.push({
          messageId,
          from,
          name: names.get(from) ?? null,
          body: typeof m.text?.body === "string" ? m.text.body : null,
          at: m.timestamp == null ? null : String(m.timestamp),
        });
      }
    }
  }
  return out;
}

