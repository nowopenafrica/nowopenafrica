// Shared notification senders for edge functions — email (Resend), WhatsApp
// (Meta Cloud API) and in-app dashboard notifications. Every channel is
// env-gated and best-effort: a missing provider config just skips that channel
// rather than throwing, so an automation run never fails because (say) WhatsApp
// isn't configured yet.
//
// deno-lint-ignore-file no-explicit-any

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "NowOpen Africa <hello@nowopenafrica.com>";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");

export const BRAND_ORIGIN = Deno.env.get("BRAND_ORIGIN") ?? "https://nowopenafrica.com";

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
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
    if (!res.ok) return { ok: false, error: `resend ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** E.164-ish digits (no +) for the WhatsApp API, or null if too short. */
export function waNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/[^\d]/g, "");
  return d.length >= 8 ? d : null;
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
    if (!res.ok) return { ok: false, error: `whatsapp ${res.status}` };
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
