// Shared notification senders for edge functions — email (Resend), WhatsApp
// (Meta Cloud API), Instagram DM (Meta business messaging) and in-app
// dashboard notifications. Every channel is env-gated and best-effort: a
// missing provider config just skips that channel rather than throwing, so an
// automation run never fails because (say) WhatsApp isn't configured yet.
//
// deno-lint-ignore-file no-explicit-any

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "NowOpen Africa <hello@nowopenafrica.com>";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
const INSTAGRAM_TOKEN = Deno.env.get("INSTAGRAM_TOKEN");
const INSTAGRAM_BUSINESS_ID = Deno.env.get("INSTAGRAM_BUSINESS_ID");

export const BRAND_ORIGIN = Deno.env.get("BRAND_ORIGIN") ?? "https://nowopenafrica.com";

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  /**
   * Meta's `wamid`, when the provider returned one.
   *
   * Discarded until 2026-10-10, which left the platform unable to match a
   * delivery webhook to the message it was about — so `sent` could never
   * become `delivered` or `failed`, and the console asserted deliveries it
   * had no way to know about.
   */
  messageId?: string;
  /**
   * The provider's own words, when it gave any.
   *
   * `error` used to be the whole story and it was only ever `resend 403` — a
   * status with the reason thrown away. The commonest cause by far is an
   * unverified sending domain, which is a five-minute DNS job, but nothing on
   * the status alone tells an operator that. Carried separately from `error`
   * so callers can show it without parsing.
   */
  providerMessage?: string;
}

/** Wrap a plain body in the NowOpen branded email shell. */
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="background:linear-gradient(120deg,#3b82f6,#8b5cf6,#ec4899);padding:22px 28px;color:#fff;font-size:18px;font-weight:700">${title}</td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 28px;background:#0f172a;color:#94a3b8;font-size:12px">NowOpen Africa · <a href="${BRAND_ORIGIN}" style="color:#c7d2fe">${BRAND_ORIGIN.replace(/^https?:\/\//, "")}</a></td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  if (!RESEND_API_KEY) return { ok: false, skipped: true };
  if (!to) return { ok: false, skipped: true };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      /*
       * Read the body before giving up. Resend says exactly what is wrong —
       * "The nowopenafrica.com domain is not verified", "API key is
       * restricted" — and that sentence is the difference between an operator
       * fixing a DNS record and an operator believing email is broken.
       */
      const detail = await res.text().catch(() => "");
      let providerMessage = detail.slice(0, 400);
      try {
        const parsed = JSON.parse(detail) as { message?: string; error?: string };
        providerMessage = parsed.message ?? parsed.error ?? providerMessage;
      } catch { /* not JSON — keep the raw text */ }
      return { ok: false, error: `resend ${res.status}`, providerMessage };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** E.164-ish digits (no +) for the WhatsApp API, or null if too short. */
export function waNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/[^\d]/g, "");
  if (d.length < 8 || d.length > 15) return null;

  /*
   * A leading zero means a LOCAL number with the country code left off, and
   * this function cannot know which country. It refuses rather than guesses.
   *
   * MEASURED 2026-10-10: 316 businesses store a phone in `0...` form, and the
   * admin console's own placeholder invites it ("e.g. 0803 000 0000"). The
   * digits were previously passed to Meta as-is, so `08030000000` was sent
   * with no country code at all.
   *
   * Guessing +234 was the obvious repair and is the wrong one. This directory
   * is pan-African -- the only welcome ever sent went to +254 (Kenya) -- so
   * treating every leading zero as Nigerian would take a Kenyan business's
   * 0709... and deliver a real message to a REAL DIFFERENT PERSON on a
   * Nigerian line. An undelivered message is a failure; a message delivered
   * to a stranger is a harm, and the two are not the same size.
   *
   * So it fails closed. The caller records a skip with a reason, which turns
   * 316 silent non-deliveries into a visible data-quality task.
   *
   * NOTE: `toE164` in _shared/onboarding.ts DOES map a leading zero to +234.
   * That is used for the suppression lookup, where over-matching is the safe
   * direction: it can only ever stop a send, never misdirect one.
   */
  if (d.startsWith("0")) return null;

  return d;
}

/** Plain-text WhatsApp — only delivers inside an open 24h session window
 *  (customers who just interacted). Best-effort; templates are needed for
 *  cold contacts (see send-onboarding). */
export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return { ok: false, skipped: true };
  const num = waNumber(to);
  if (!num) return { ok: false, skipped: true };
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: num, type: "text", text: { body, preview_url: true } }),
    });
    const payload = await res.json().catch(() => null) as
      { messages?: Array<{ id?: string }>; error?: { message?: string } } | null;
    if (!res.ok) {
      /*
       * Keep Meta's sentence. `whatsapp 400` alone names a status and throws
       * away the reason, which is the difference between an operator fixing a
       * template name and believing WhatsApp is down.
       */
      return {
        ok: false,
        error: `whatsapp ${res.status}`,
        providerMessage: payload?.error?.message,
      };
    }
    return { ok: true, messageId: payload?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Pre-approved template message — the only kind Meta delivers to a cold
 * contact (fresh business owner, no open 24h session). Body parameters must
 * match the {{1}}/{{2}}/... slots of the approved template.
 */
export async function sendWhatsAppTemplate(
  to: string,
  input: { template: string; lang?: string; params: string[] },
): Promise<SendResult> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return { ok: false, skipped: true };
  const num = waNumber(to);
  if (!num) return { ok: false, skipped: true };
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: num,
        type: "template",
        template: {
          name: input.template,
          language: { code: input.lang ?? "en" },
          components: [{ type: "body", parameters: input.params.map((p) => ({ type: "text", text: p })) }],
        },
      }),
    });
    const payload = await res.json().catch(() => null) as
      { messages?: Array<{ id?: string }>; error?: { message?: string } } | null;
    if (!res.ok) {
      /*
       * Keep Meta's sentence. `whatsapp 400` alone names a status and throws
       * away the reason, which is the difference between an operator fixing a
       * template name and believing WhatsApp is down.
       */
      return {
        ok: false,
        error: `whatsapp ${res.status}`,
        providerMessage: payload?.error?.message,
      };
    }
    return { ok: true, messageId: payload?.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Instagram DM — the Instagram Messaging API's send shape (graph.facebook.com
 * against the business's IG user ID, recipient id + message text). Only legal
 * inside an open conversation (the 24h window since the recipient's last
 * inbound DM, or an approved messaging tag); the caller's instagramGate is
 * what refuses cold outreach — this function never decides policy, it can
 * only send.
 */
export async function sendInstagramText(
  contactId: string,
  body: string,
): Promise<SendResult> {
  if (!INSTAGRAM_TOKEN || !INSTAGRAM_BUSINESS_ID) return { ok: false, skipped: true };
  if (!contactId) return { ok: false, skipped: true };
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${INSTAGRAM_BUSINESS_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${INSTAGRAM_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: contactId },
        message: { text: body },
      }),
    });
    if (!res.ok) return { ok: false, error: `instagram ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Insert an in-app dashboard notification (the always-available channel). */
export async function createNotification(
  supabase: any,
  input: { userId: string; title: string; body?: string; type?: string; link?: string },
): Promise<SendResult> {
  if (!input.userId) return { ok: false, skipped: true };
  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    title: input.title,
    body: input.body ?? null,
    type: input.type ?? "info",
    link: input.link ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
