import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";

// send-onboarding
// ----------------
// Fires the NowOpen Africa welcome pack when a new business/creative signs up:
//   1. a branded onboarding EMAIL (via Resend) that covers the entire brand
//      kit — brand guidelines, digital card, smart QR, social, flyers,
//      posters, banners, promotions, reels, AI copywriter, media library and
//      export centre — with direct deep links into Studio, plus downloadable
//      materials (welcome guide PDF, social starter image), and
//   2. a follow-up WhatsApp message (via Meta's WhatsApp Cloud API) pointing
//      to the same pack.
//
// Everything is best-effort and provider-gated: if RESEND_API_KEY or the
// WhatsApp env isn't configured, that channel is simply skipped (200 with a
// per-channel status) rather than failing signup. Sends are de-duplicated per
// user via the onboarding_deliveries table so repeated calls are no-ops — the
// client can safely call this on every signup / first sign-in.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Service role: reads the auth-linked profile (email/phone) by id and writes
// the onboarding_deliveries ledger, both of which are admin-only under RLS.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const BRAND_ORIGIN = Deno.env.get("BRAND_ORIGIN") ?? "https://nowopenafrica.com";

// Email (Resend). Skipped if unset.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "NowOpen Africa <hello@nowopenafrica.com>";

// WhatsApp (Meta Cloud API). Both required, else skipped.
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
// Optional pre-approved template name for the first (out-of-session) message.
// If unset we fall back to a plain text message (only delivered inside the
// 24h customer-service window, which a brand-new signup won't have — so a
// template is recommended for production).
const WHATSAPP_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE");
const WHATSAPP_TEMPLATE_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "en";

// Welcome-pack asset URLs. Override via env; defaults point at the brand
// domain (place the files in the web app's /public/brand folder or storage).
const PACK_GUIDE_PDF = Deno.env.get("WELCOME_PACK_GUIDE_PDF") ?? `${BRAND_ORIGIN}/brand/nowopen-welcome-guide.pdf`;
const PACK_SOCIAL_IMG = Deno.env.get("WELCOME_PACK_SOCIAL_IMG") ?? `${BRAND_ORIGIN}/brand/nowopen-social-starter.png`;
const PACK_LOGO_IMG = Deno.env.get("WELCOME_PACK_LOGO") ?? `${BRAND_ORIGIN}/brand/nowopen-mark.png`;

interface OnboardingRequest {
  userId?: string;
  // Optional overrides; when omitted we look them up from the profile row.
  email?: string;
  phone?: string;
  name?: string;
  businessName?: string;
  username?: string;
  role?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function firstName(name?: string | null): string {
  const n = (name || "").trim();
  return n ? n.split(/\s+/)[0] : "there";
}

// E.164-ish for the WhatsApp API (digits only, no +).
function waNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length >= 8 ? digits : null;
}

function studioUrl(): string {
  // Everyone lands on the Studio to generate their Live Brand Kit.
  return `${BRAND_ORIGIN}/studio`;
}

// Deep link into a specific Studio module, e.g. kitUrl('card') → /studio?module=card.
function kitUrl(module: string): string {
  return `${BRAND_ORIGIN}/studio?module=${encodeURIComponent(module)}`;
}

// Every asset the onboarding brand kit covers, with its Studio deep link.
// Kept in one place so the email and WhatsApp pack always stay in sync.
interface KitItem { icon: string; label: string; url: string; desc: string }

function kitCatalog(): { group: string; items: KitItem[] }[] {
  return [
    {
      group: 'Identity',
      items: [
        { icon: '🎨', label: 'Brand Kit & Guidelines', url: kitUrl('brand-kit'), desc: 'Your colours, fonts, logo pack and a printable brand guidelines PDF' },
      ],
    },
    {
      group: 'Cards & QR',
      items: [
        { icon: '💳', label: 'Digital Business Card', url: kitUrl('card'), desc: 'A professional card with a live QR that points to your profile' },
        { icon: '🔳', label: 'Smart QR Codes', url: kitUrl('qr'), desc: 'QRs for your profile, website, WhatsApp, calls, email & directions' },
      ],
    },
    {
      group: 'Content Studio',
      items: [
        { icon: '🎛️', label: 'Design Studio & Layout Samples', url: kitUrl('design'), desc: '20 ready layouts for flyers, posters, banners, stories & social — export PNG, PDF or MP4' },
        { icon: '📱', label: 'Social Posts', url: kitUrl('social'), desc: 'Instagram, Facebook, LinkedIn, TikTok, X, Pinterest, YouTube & Stories' },
        { icon: '📄', label: 'Flyers', url: kitUrl('flyer'), desc: 'A4 print-ready for grand openings, sales, hiring & holidays' },
        { icon: '🖼️', label: 'Posters', url: kitUrl('poster'), desc: 'Industry posters for events, launches & campaigns' },
        { icon: '🧾', label: 'Banners', url: kitUrl('banner'), desc: 'Website hero, billboard, LED, roll-up, backdrops & social covers' },
        { icon: '🏷️', label: 'Promotions', url: kitUrl('promotions'), desc: 'BOGO, discounts, referral & loyalty designs — ready to share' },
        { icon: '🎬', label: 'Reels & Video', url: kitUrl('video'), desc: '15s reels, product showcases & promo videos with motion backgrounds' },
        { icon: '✍️', label: 'AI Copywriter', url: kitUrl('copywriter'), desc: 'Captions, ads, emails, SMS, SEO copy & hashtags from your profile' },
      ],
    },
    {
      group: 'Sell & Get Paid',
      items: [
        { icon: '🧾', label: 'Invoice Sample & Payments', url: kitUrl('invoices'), desc: 'A ready-to-fill invoice, receipts and payment reminders for your first customer' },
        { icon: '📋', label: 'Quotes & Proposals', url: kitUrl('quotations'), desc: 'Professional quotes customers can approve in one tap' },
        { icon: '🛍️', label: 'Product Catalogue', url: kitUrl('catalogues'), desc: 'Turn your products or menu into a shareable digital catalogue' },
      ],
    },
    {
      group: 'Manage',
      items: [
        { icon: '🗂️', label: 'Media Library', url: kitUrl('media'), desc: 'Your logo, cover & brand files — cloud synced for every Studio export' },
        { icon: '📦', label: 'Export Centre', url: kitUrl('export'), desc: 'Download every asset Studio has created for you, all in one place' },
      ],
    },
  ];
}

function profileUrl(username?: string | null, id?: string): string {
  if (username) return `${BRAND_ORIGIN}/${username}`;
  if (id) return `${BRAND_ORIGIN}/businesses/${id}`;
  return BRAND_ORIGIN;
}

function welcomeEmailHtml(opts: { name: string; brand: string; studio: string; profile: string }): string {
  const { name, brand, studio, profile } = opts;
  const kitSections = kitCatalog().map((section) => `
    <div style="margin:0 0 16px">
      <div style="font-size:11px;font-weight:700;color:#8b5cf6;text-transform:uppercase;letter-spacing:.06em;margin:0 0 4px">${section.group}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${section.items.map((item) => `
          <tr>
            <td width="36" style="padding:5px 0;vertical-align:top;font-size:16px">${item.icon}</td>
            <td style="padding:5px 0;vertical-align:top">
              <a href="${item.url}" style="color:#4f46e5;font-weight:600;text-decoration:none;font-size:14px">${item.label} →</a>
              <div style="font-size:12px;color:#64748b;line-height:1.5">${item.desc}</div>
            </td>
          </tr>`).join('')}
      </table>
    </div>`).join("");

  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="background:linear-gradient(120deg,#3b82f6,#8b5cf6,#ec4899);padding:28px 32px">
          <img src="${PACK_LOGO_IMG}" alt="NowOpen Africa" width="44" height="44" style="display:block;border-radius:10px;margin-bottom:10px" />
          <div style="color:#ffffff;font-size:22px;font-weight:700">Welcome to NowOpen Africa 🎉</div>
          <div style="color:#eef2ff;font-size:14px;margin-top:4px">Your business is now open to the whole continent.</div>
        </td></tr>
        <tr><td style="padding:28px 32px">
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Hi ${name},</p>
          <p style="font-size:15px;line-height:1.6;margin:0 0 14px">
            Thanks for joining <strong>NowOpen Africa</strong> — Africa's Business Operating System.
            Here's your free <strong>onboarding brand kit</strong>, ready to generate in Studio.
            Every asset below points straight to your live profile:
          </p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 20px">
            <a href="${profile}" style="color:#4f46e5;font-weight:600">${profile.replace(/^https?:\/\//, "")}</a>
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px">
            <tr><td style="padding:4px 0">
              <a href="${studio}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">Open NowOpen Studio →</a>
            </td></tr>
          </table>
          <div style="border-top:1px solid #eef2f7;padding-top:18px">
            <div style="font-size:13px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px">Your starter pack</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" style="padding:0 6px 12px 0;vertical-align:top">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                    <tr><td style="padding:14px;background:#faf5ff">
                      <div style="font-size:20px">🎨</div>
                      <a href="${kitUrl('brand-kit')}" style="display:block;margin-top:6px;font-weight:700;color:#4f46e5;text-decoration:none;font-size:14px">Your Brand Kit →</a>
                      <div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.5">Colours, fonts & brand guidelines — download as PDF</div>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding:0 0 12px 6px;vertical-align:top">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                    <tr><td style="padding:14px;background:#f0f9ff">
                      <div style="font-size:20px">💳</div>
                      <a href="${kitUrl('card')}" style="display:block;margin-top:6px;font-weight:700;color:#4f46e5;text-decoration:none;font-size:14px">Digital Card + QR →</a>
                      <div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.5">Your business card and smart QR — download as images</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td width="50%" style="padding:0 6px 0 0;vertical-align:top">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                    <tr><td style="padding:14px;background:#fefce8">
                      <div style="font-size:20px">🧾</div>
                      <a href="${kitUrl('invoices')}" style="display:block;margin-top:6px;font-weight:700;color:#4f46e5;text-decoration:none;font-size:14px">Invoice Sample →</a>
                      <div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.5">A ready-to-fill invoice for your first customer</div>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding:0 0 0 6px;vertical-align:top">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                    <tr><td style="padding:14px;background:#f0fdf4">
                      <div style="font-size:20px">🎛️</div>
                      <a href="${kitUrl('design')}" style="display:block;margin-top:6px;font-weight:700;color:#4f46e5;text-decoration:none;font-size:14px">Layout Samples →</a>
                      <div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.5">20 Design Studio layouts — export PNG, PDF or MP4</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>
          <div style="border-top:1px solid #eef2f7;padding-top:18px">
            <div style="font-size:13px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px">Your onboarding brand kit</div>
            ${kitSections}
          </div>
          <div style="border-top:1px solid #eef2f7;padding-top:16px">
            <div style="font-size:13px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">Downloadables</div>
            <p style="font-size:14px;line-height:1.7;margin:0">
              📘 <a href="${PACK_GUIDE_PDF}" style="color:#4f46e5">Welcome & Quick-Start Guide (PDF)</a><br />
              🎨 <a href="${PACK_SOCIAL_IMG}" style="color:#4f46e5">Social starter graphic (image)</a><br />
              🧾 <a href="${kitUrl('invoices')}" style="color:#4f46e5">Sample invoice & receipt (generated for you)</a><br />
              🎛️ <a href="${kitUrl('design')}" style="color:#4f46e5">Design Studio layout samples (PNG, PDF, MP4)</a><br />
              📦 <a href="${kitUrl('export')}" style="color:#4f46e5">Export Centre — re-download every asset any time</a>
            </p>
          </div>
          <p style="font-size:13px;line-height:1.6;color:#64748b;margin:22px 0 0">
            Need a hand? Just reply to this email — we read every message.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#0f172a;color:#94a3b8;font-size:12px">
          NowOpen Africa · <a href="${brand}" style="color:#c7d2fe">${brand.replace(/^https?:\/\//, "")}</a> · @nowopenafrica
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function welcomeWhatsAppText(opts: { name: string; studio: string; profile: string; guide: string }): string {
  const { name, studio, profile, guide } = opts;
  const kitLines = kitCatalog()
    .flatMap((s) => s.items)
    .map((item) => `${item.icon} ${item.label} -> ${item.url}`);
  return (
    `Hi ${name}, welcome to NowOpen Africa! 🎉\n\n` +
    `Your business is live at ${profile.replace(/^https?:\/\//, "")}\n\n` +
    `Here's your free onboarding brand kit — everything points to your live profile:\n` +
    kitLines.join("\n") +
    `\n\n📘 Welcome guide (PDF) -> ${guide}\n` +
    `Explore all your tools -> ${studio}\n\n` +
    `Reply here anytime if you need a hand getting set up.`
  );
}

async function sendEmail(to: string, html: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, skipped: true };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [to],
        subject: "Welcome to NowOpen Africa — your onboarding brand kit 🎉",
        html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Resend send failed:", res.status, body);
      return { ok: false, error: `resend ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("Resend error:", e);
    return { ok: false, error: String(e) };
  }
}

async function sendWhatsApp(
  to: string,
  text: string,
  vars: { name: string; studio: string },
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) return { ok: false, skipped: true };
  const url = `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`;

  // Prefer a pre-approved template (required to open a conversation with a
  // brand-new contact); otherwise fall back to a plain text message.
  const payload = WHATSAPP_TEMPLATE
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: WHATSAPP_TEMPLATE,
          language: { code: WHATSAPP_TEMPLATE_LANG },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: vars.name },
                { type: "text", text: vars.studio },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text, preview_url: true },
      };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("WhatsApp send failed:", res.status, body);
      return { ok: false, error: `whatsapp ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("WhatsApp error:", e);
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return jsonResponse({ ok: false, message: "Too many requests — please wait a moment." }, 429);
  }

  try {
    const body = (await req.json()) as OnboardingRequest;

    // Resolve recipient details. Prefer a server-side lookup by userId so the
    // caller can't be used to spam arbitrary addresses.
    let email = body.email?.trim() || "";
    let phone = body.phone?.trim() || "";
    let name = body.name?.trim() || body.businessName?.trim() || "";
    let username = body.username?.trim() || "";
    const userId = body.userId?.trim() || "";

    if (userId) {
      // De-dupe: if we've already delivered to this user, no-op.
      const { data: existing } = await supabase
        .from("onboarding_deliveries")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (existing) {
        return jsonResponse({ ok: true, alreadySent: true });
      }

      const { data: profile } = await supabase
        .from("users")
        .select("email, phone, full_name, username")
        .eq("id", userId)
        .maybeSingle();
      if (profile) {
        email = email || (profile as Record<string, string>).email || "";
        phone = phone || (profile as Record<string, string>).phone || "";
        name = name || (profile as Record<string, string>).full_name || "";
        username = username || (profile as Record<string, string>).username || "";
      }
    }

    if (!email && !phone) {
      return jsonResponse({ ok: false, message: "No email or phone to deliver the welcome pack to." }, 400);
    }

    const fname = firstName(name);
    const profile = profileUrl(username, userId);
    const studio = studioUrl();

    const html = welcomeEmailHtml({ name: fname, brand: BRAND_ORIGIN, studio, profile });
    const waText = welcomeWhatsAppText({ name: fname, studio, profile, guide: PACK_GUIDE_PDF });

    const emailResult = email
      ? await sendEmail(email, html)
      : { ok: false, skipped: true as const };

    const wa = waNumber(phone);
    const whatsappResult = wa
      ? await sendWhatsApp(wa, waText, { name: fname, studio })
      : { ok: false, skipped: true as const };

    // Record the delivery (best-effort) so we don't re-send. Only ledger when
    // we actually have a userId to key on.
    if (userId && (emailResult.ok || whatsappResult.ok)) {
      await supabase.from("onboarding_deliveries").insert({
        user_id: userId,
        email: email || null,
        phone: phone || null,
        email_status: emailResult.ok ? "sent" : emailResult.skipped ? "skipped" : "failed",
        whatsapp_status: whatsappResult.ok ? "sent" : whatsappResult.skipped ? "skipped" : "failed",
      });
    }

    return jsonResponse({
      ok: emailResult.ok || whatsappResult.ok,
      email: emailResult.ok ? "sent" : emailResult.skipped ? "skipped" : "failed",
      whatsapp: whatsappResult.ok ? "sent" : whatsappResult.skipped ? "skipped" : "failed",
    });
  } catch (error) {
    console.error("send-onboarding error:", error);
    return jsonResponse({ ok: false, message: "Could not send the welcome pack." }, 500);
  }
});
