import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";
import { resolveWelcomeTemplate } from "../_shared/whatsappTemplate.ts";
import { waChatLink } from "../_shared/waLink.ts";
import {
  sendEmail,
  sendInstagramText,
  sendWhatsAppTemplate,
  sendWhatsAppText,
  waNumber,
} from "../_shared/notify.ts";
import {
  businessWelcomeText,
  businessWelcomeTemplateParams,
  DRAIN_MAX,
  instagramGate,
  instagramWelcomeText,
  RETRYABLE_STATUSES,
  toE164,
  toHandle,
  whatsAppGate,
} from "../_shared/onboarding.ts";

// send-onboarding
// ----------------
// Fires the NowOpen Africa welcome pack when a new business/creative signs up:
//   1. a branded onboarding EMAIL (via Resend) that covers the entire brand
//      kit — brand guidelines, digital card, smart QR, social, flyers,
//      posters, banners, promotions, reels, AI copywriter, media library and
//      export centre — with direct deep links into Studio, plus downloadable
//      materials (welcome guide PDF, social starter image), and
//   2. a follow-up WhatsApp message (via Meta's WhatsApp Cloud API) pointing
//      to the same pack, and/or an Instagram DM welcome for businesses whose
//      owner kicks off an Instagram conversation.
//
// It also drains `onboarding_messages` — the guaranteed queue (a row is
// inserted by the businesses INSERT trigger the moment a business is
// registered). User-mode (authenticated via JWT) drains the caller's own
// businesses and sends the per-user brand pack. Drain-all mode (called by the
// 15-minute pg_cron tick with a shared secret) processes every pending row.
// Manual mode (admin JWT) sends a one-off welcome for a business name + a
// WhatsApp number and/or an Instagram recipient typed into the console;
// preview mode (admin JWT) returns the exact rendered messages so the console
// can show what will be sent.
//
// Every outcome is a status on the row — sent / no_phone / blocked /
// suppressed / needs_provider / needs_template / needs_conversation / failed —
// never silently nothing. A missing provider is the truth, not a failure.
// Instagram has no cold-DM path: an instagram row without an open conversation
// is refused with needs_conversation, exactly as Meta's API rules require.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Onboarding-Key",
};

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const BRAND_ORIGIN = Deno.env.get("BRAND_ORIGIN") ?? "https://nowopenafrica.com";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ONBOARDING_SECRET = Deno.env.get("ONBOARDING_SECRET") ?? "";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "NowOpen Africa <hello@nowopenafrica.com>";

const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID");
/*
 * The number owners can WRITE to, in international form — not the Meta phone
 * id above. Used only to build wa.me links. Unset means no button is
 * rendered: a dead "Message us on WhatsApp" is worse than none, because it
 * reads as a broken channel rather than an absent one.
 */
const PUBLIC_WHATSAPP_NUMBER = Deno.env.get("NOWOPEN_WHATSAPP_NUMBER") ?? "";
const WHATSAPP_TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE");
/*
 * Resolved per request, not read once at module load.
 *
 * An approved template is the only thing that makes an out-of-session welcome
 * sendable, and approval arrives hours later with no notification. Reading an
 * env var here meant a person had to notice the approval and set it; until
 * they did, every queued welcome recorded needs_template for a reason that had
 * already stopped being true.
 *
 * resolveWelcomeTemplate() honours the env var when it is set and otherwise
 * asks Meta which of our templates is APPROVED — so approval switches welcomes
 * on by itself. It refuses to pick a MARKETING template or one of Meta's
 * samples; see the notes in _shared/whatsappTemplate.ts.
 */
let WHATSAPP_WELCOME_TEMPLATE: string | undefined = Deno.env.get("WHATSAPP_WELCOME_TEMPLATE");
/** Why no template is available, when none is — shown instead of a bare flag. */
let WHATSAPP_TEMPLATE_NOTE: string | null = null;

async function refreshWelcomeTemplate(): Promise<void> {
  const choice = await resolveWelcomeTemplate();
  WHATSAPP_WELCOME_TEMPLATE = choice.ok ? choice.name : undefined;
  WHATSAPP_TEMPLATE_NOTE = choice.ok ? null : choice.message;
}
const WHATSAPP_TEMPLATE_LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "en";

const INSTAGRAM_TOKEN = Deno.env.get("INSTAGRAM_TOKEN");
const INSTAGRAM_BUSINESS_ID = Deno.env.get("INSTAGRAM_BUSINESS_ID");

const PACK_GUIDE_PDF = Deno.env.get("WELCOME_PACK_GUIDE_PDF") ?? `${BRAND_ORIGIN}/brand/nowopen-welcome-guide.pdf`;
const PACK_SOCIAL_IMG = Deno.env.get("WELCOME_PACK_SOCIAL_IMG") ?? `${BRAND_ORIGIN}/brand/nowopen-social-starter.png`;
const PACK_LOGO_IMG = Deno.env.get("WELCOME_PACK_LOGO") ?? `${BRAND_ORIGIN}/brand/nowopen-mark.png`;

interface OnboardingRequest {
  userId?: string;
  email?: string;
  phone?: string;
  name?: string;
  businessName?: string;
  username?: string;
  role?: string;
  mode?: "drain_all" | "manual" | "preview";
  // manual + preview mode
  ownerName?: string;
  profileUrl?: string;
  channel?: "whatsapp" | "instagram" | "email";
  channels?: string[];
  handle?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveJwtUser(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token === SUPABASE_ANON_KEY) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : (data.user?.id ?? null);
}

type AdminAuth = { userId: null; reason: "unauth" | "forbidden" } | { userId: string; reason: "ok" };

async function authorizeAdmin(req: Request): Promise<AdminAuth> {
  const userId = await resolveJwtUser(req);
  if (!userId) return { userId: null, reason: "unauth" };
  const { data: actor } = await supabase.from("users").select("role").eq("id", userId).maybeSingle();
  if ((actor as { role?: string } | null)?.role !== "admin") return { userId: null, reason: "forbidden" };
  return { userId, reason: "ok" };
}

async function flagEnabled(key: string): Promise<boolean> {
  const { data } = await supabase.from("feature_flags").select("enabled").eq("key", key).maybeSingle();
  return (data as { enabled?: boolean } | null)?.enabled ?? false;
}

function firstName(name?: string | null): string {
  const n = (name || "").trim();
  return n ? n.split(/\s+/)[0] : "there";
}

function profileUrl(username?: string | null, id?: string): string {
  if (username) return `${BRAND_ORIGIN}/${username}`;
  if (id) return `${BRAND_ORIGIN}/businesses/${id}`;
  return BRAND_ORIGIN;
}

function studioUrl(): string {
  return `${BRAND_ORIGIN}/studio`;
}

function kitUrl(module: string): string {
  return `${BRAND_ORIGIN}/studio?module=${encodeURIComponent(module)}`;
}

// ── pack copy (email + brand-kit WhatsApp) — kept unchanged ────────────────

interface KitItem { icon: string; label: string; url: string; desc: string }

function kitCatalog(): { group: string; items: KitItem[] }[] {
  return [
    { group: "Identity", items: [{ icon: "🎨", label: "Brand Kit & Guidelines", url: kitUrl("brand-kit"), desc: "Your colours, fonts, logo pack and a printable brand guidelines PDF" }] },
    { group: "Cards & QR", items: [
      { icon: "💳", label: "Digital Business Card", url: kitUrl("card"), desc: "A professional card with a live QR that points to your profile" },
      { icon: "🔳", label: "Smart QR Codes", url: kitUrl("qr"), desc: "QRs for your profile, website, WhatsApp, calls, email & directions" },
    ] },
    { group: "Content Studio", items: [
      { icon: "🎛️", label: "Design Studio & Layout Samples", url: kitUrl("design"), desc: "20 ready layouts for flyers, posters, banners, stories & social — export PNG, PDF or MP4" },
      { icon: "📱", label: "Social Posts", url: kitUrl("social"), desc: "Instagram, Facebook, LinkedIn, TikTok, X, Pinterest, YouTube & Stories" },
      { icon: "📄", label: "Flyers", url: kitUrl("flyer"), desc: "A4 print-ready for grand openings, sales, hiring & holidays" },
      { icon: "🖼️", label: "Posters", url: kitUrl("poster"), desc: "Industry posters for events, launches & campaigns" },
      { icon: "🧾", label: "Banners", url: kitUrl("banner"), desc: "Website hero, billboard, LED, roll-up, backdrops & social covers" },
      { icon: "🏷️", label: "Promotions", url: kitUrl("promotions"), desc: "BOGO, discounts, referral & loyalty designs — ready to share" },
      { icon: "🎬", label: "Reels & Video", url: kitUrl("video"), desc: "15s reels, product showcases & promo videos with motion backgrounds" },
      { icon: "✍️", label: "AI Copywriter", url: kitUrl("copywriter"), desc: "Captions, ads, emails, SMS, SEO copy & hashtags from your profile" },
    ] },
    { group: "Sell & Get Paid", items: [
      { icon: "🧾", label: "Invoice Sample & Payments", url: kitUrl("invoices"), desc: "A ready-to-fill invoice, receipts and payment reminders for your first customer" },
      { icon: "📋", label: "Quotes & Proposals", url: kitUrl("quotations"), desc: "Professional quotes customers can approve in one tap" },
      { icon: "🛍️", label: "Product Catalogue", url: kitUrl("catalogues"), desc: "Turn your products or menu into a shareable digital catalogue" },
    ] },
    { group: "Manage", items: [
      { icon: "🗂️", label: "Media Library", url: kitUrl("media"), desc: "Your logo, cover & brand files — cloud synced for every Studio export" },
      { icon: "📦", label: "Export Centre", url: kitUrl("export"), desc: "Download every asset Studio has created for you, all in one place" },
    ] },
  ];
}

/*
 * Everything interpolated into the email is escaped.
 *
 * `name` and `businessName` come from a form and from listing data, and they
 * were being dropped straight into markup. A business legitimately called
 * "Mama & Sons <Lagos>" would have broken the document, and anything worse
 * would have travelled to a real inbox.
 */
function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The plain-text alternative.
 *
 * WRITTEN, not stripped from the HTML. A regex-stripped document leaves the
 * reader a column of orphaned link text with no sentences around it, which is
 * worse than nothing. Filters also score a multipart message better than HTML
 * alone, and some corporate clients render only this part.
 */
function welcomeEmailText(opts: { name: string; studio: string; profile: string }): string {
  const { name, studio, profile } = opts;
  return [
    `Hi ${name},`,
    "",
    "Welcome to NowOpen Africa - Africa's Business Operating System.",
    "Your business is now open to the whole continent.",
    "",
    `Your live profile: ${profile}`,
    "",
    "Your free onboarding brand kit is ready in Studio. Every asset points at",
    "your live profile: brand kit, business card, Smart QR code, digital",
    "catalogue and more.",
    "",
    `Open NowOpen Studio: ${studio}`,
    "",
    "Questions? Reply to this email, or message us on WhatsApp.",
    "",
    "- NowOpen Africa",
    "nowopenafrica.com | @nowopenafrica",
    "",
    "You are receiving this because a NowOpen Africa business profile was",
    "created with this email address. If that was not you, reply and we will",
    "remove it.",
  ].join("\n");
}

/** Matches the heading inside the email, so inbox and body agree. */
const WELCOME_EMAIL_SUBJECT = "Welcome to NowOpen Africa — your brand kit is ready 🎉";

function welcomeEmailHtml(opts: { name: string; brand: string; studio: string; profile: string }): string {
  const { brand, studio } = opts;
  const name = esc(opts.name);
  const profile = esc(opts.profile);
  /*
   * Click-to-chat, the free direction.
   *
   * Outbound templates are gated behind billing — every one this platform has
   * sent failed with code 131042. A message the OWNER sends costs nothing and
   * opens a service window we can answer inside. So the email invites a reply
   * rather than relying on a channel that cannot currently deliver.
   */
  const waLink = waChatLink({
    phone: PUBLIC_WHATSAPP_NUMBER,
    text: `Hi NowOpen Africa — this is ${name}. I just joined and I have a question about my listing.`,
  });
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
          </tr>`).join("")}
      </table>
    </div>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Welcome to NowOpen Africa</title>
  <style>
    /*
     * The starter-pack cards sit in a two-column table. On a 360px phone that
     * is two 150px columns of 12px text, legible to nobody. Stack them.
     * Gmail and Apple Mail honour this; Outlook ignores it and keeps the
     * desktop table, which is the correct fallback rather than a broken one.
     */
    @media only screen and (max-width: 520px) {
      .np-col { display:block !important; width:100% !important; max-width:100% !important; padding:0 0 12px 0 !important; }
      .np-pad { padding-left:20px !important; padding-right:20px !important; }
      .np-h1 { font-size:20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased">
  <!--
    Preheader: the grey line an inbox shows beside the subject. Left unset it
    scrapes the first words of the document, which here is the logo's alt
    text. Hidden in the body, then padded so no later content leaks into it.
  -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">
    Your free brand kit is ready &mdash; business card, Smart QR, catalogue and more, all pointing at your live profile.
    &#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;&#8203;&#847;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td class="np-pad" bgcolor="#6d28d9" style="background-color:#6d28d9;background:linear-gradient(120deg,#3b82f6,#8b5cf6,#ec4899);padding:28px 32px">
          <img src="${PACK_LOGO_IMG}" alt="NowOpen Africa" width="44" height="44" style="display:block;border-radius:10px;margin-bottom:10px" />
          <div class="np-h1" style="color:#ffffff;font-size:22px;font-weight:700;line-height:1.3">Welcome to NowOpen Africa 🎉</div>
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
            ${waLink ? `<tr><td style="padding:10px 0 0">
              <a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">Message us on WhatsApp →</a>
              <div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.5">Opens WhatsApp with your message ready — just press send.</div>
            </td></tr>` : ""}
          </table>
          <div style="border-top:1px solid #eef2f7;padding-top:18px">
            <div style="font-size:13px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px">Your starter pack</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td class="np-col" width="50%" style="padding:0 6px 12px 0;vertical-align:top">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                    <tr><td style="padding:14px;background:#faf5ff">
                      <div style="font-size:20px">🎨</div>
                      <a href="${kitUrl("brand-kit")}" style="display:block;margin-top:6px;font-weight:700;color:#4f46e5;text-decoration:none;font-size:14px">Your Brand Kit →</a>
                      <div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.5">Colours, fonts & brand guidelines — download as PDF</div>
                    </td></tr>
                  </table>
                </td>
                <td class="np-col" width="50%" style="padding:0 0 12px 6px;vertical-align:top">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                    <tr><td style="padding:14px;background:#f0f9ff">
                      <div style="font-size:20px">💳</div>
                      <a href="${kitUrl("card")}" style="display:block;margin-top:6px;font-weight:700;color:#4f46e5;text-decoration:none;font-size:14px">Digital Card + QR →</a>
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
                      <a href="${kitUrl("invoices")}" style="display:block;margin-top:6px;font-weight:700;color:#4f46e5;text-decoration:none;font-size:14px">Invoice Sample →</a>
                      <div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.5">A ready-to-fill invoice for your first customer</div>
                    </td></tr>
                  </table>
                </td>
                <td width="50%" style="padding:0 0 0 6px;vertical-align:top">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
                    <tr><td style="padding:14px;background:#f0fdf4">
                      <div style="font-size:20px">🎛️</div>
                      <a href="${kitUrl("design")}" style="display:block;margin-top:6px;font-weight:700;color:#4f46e5;text-decoration:none;font-size:14px">Layout Samples →</a>
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
              🧾 <a href="${kitUrl("invoices")}" style="color:#4f46e5">Sample invoice & receipt (generated for you)</a><br />
              🎛️ <a href="${kitUrl("design")}" style="color:#4f46e5">Design Studio layout samples (PNG, PDF, MP4)</a><br />
              📦 <a href="${kitUrl("export")}" style="color:#4f46e5">Export Centre — re-download every asset any time</a>
            </p>
          </div>
          <p style="font-size:13px;line-height:1.6;color:#64748b;margin:22px 0 0">
            Need a hand? Just reply to this email — we read every message.
          </p>
        </td></tr>
        <tr><td class="np-pad" style="padding:20px 32px;background:#0f172a;color:#94a3b8;font-size:12px;line-height:1.6">
          <div style="color:#e2e8f0;font-weight:700;font-size:13px">NowOpen Africa</div>
          <div style="margin-top:2px">Africa&rsquo;s Business Operating System</div>
          <div style="margin-top:10px">
            <a href="${brand}" style="color:#c7d2fe">${brand.replace(/^https?:\/\//, "")}</a>
            &nbsp;&middot;&nbsp;<a href="https://instagram.com/nowopenafrica" style="color:#c7d2fe;text-decoration:none">@nowopenafrica</a>
          </div>
          <!--
            Why it arrived. A transactional email with no explanation reads
            as unsolicited, and "is this spam?" is the one question a welcome
            must not raise. No unsubscribe link: this is sent once, on
            signup, and offering to unsubscribe from a one-off is a promise
            we cannot keep.
          -->
          <div style="margin-top:12px;color:#64748b;font-size:11px">
            You are receiving this because a NowOpen Africa business profile was created with this email address.
            If that was not you, reply to this message and we will remove it.
          </div>
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

// ── profile education per-business welcome (the NEW message) ────────────────

async function resolveUserPhone(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase.from("users").select("phone").eq("id", userId).maybeSingle();
  return (data as Record<string, string> | null)?.phone ?? null;
}

interface DrainRow {
  id: string;
  business_id: string;
  user_id: string | null;
  phone: string | null;
  handle: string | null;
  channel: string;
  status: string;
  attempts: number;
}

interface FlagSet { whatsapp: boolean; instagram: boolean }

/** The wait-for-all resolution of the row's recipient contact + profile copy,
 *  shared by both channels so a never-sent row resolves exactly once. */
async function resolveWelcomeContext(row: DrainRow) {
  let phone = row.phone ? waNumber(row.phone) : null;
  let handle = row.handle ? toHandle(row.handle) : null;

  let businessName = "your business";
  let username: string | null = null;

  const { data: biz } = await supabase
    .from("businesses").select("phone, whatsapp, name, username").eq("id", row.business_id).maybeSingle();
  if (biz) {
    const b = biz as Record<string, string>;
    if (!phone) phone = waNumber(b.phone) || waNumber(b.whatsapp);
    businessName = b.name || businessName;
    username = b.username ?? null;
  }
  if (!phone && row.user_id) {
    const up = await resolveUserPhone(row.user_id);
    if (up) phone = waNumber(up);
  }

  let uname = "there";
  if (row.user_id) {
    const { data: u } = await supabase.from("users").select("full_name").eq("id", row.user_id).maybeSingle();
    uname = firstName((u as Record<string, string> | null)?.full_name);
  }

  const profile = profileUrl(username, row.business_id);
  return { phone, handle, businessName, uname, profile };
}

async function processRow(row: DrainRow, flags: FlagSet): Promise<{ status: string; attempts: number }> {
  // ── instagram ─────────────────────────────────────────────────────────────
  if (row.channel === "instagram") {
    let handle = row.handle ? toHandle(row.handle) : null;
    let status = "needs_conversation";
    let reason: string | null = null;
    let error: string | null = null;
    let provider: string | null = null;
    const now = new Date().toISOString();

    if (!handle) {
      reason = "No Instagram recipient — the welcome needs a conversation contact (IG user ID or @handle).";
    } else {
      const { data: suppressed } = await supabase.rpc("claimreach_is_suppressed", {
        p_contact: handle,
        p_channel: "instagram",
      });
      const gate = instagramGate({
        killSwitchOn: flags.instagram,
        suppressed: Boolean(suppressed),
        providerConfigured: Boolean(INSTAGRAM_TOKEN && INSTAGRAM_BUSINESS_ID),
        conversationOpen: /^\d+$/.test(handle),
      });
      if (gate) {
        status = gate.status;
        reason = gate.reason;
      } else {
        const ctx = await resolveWelcomeContext(row);
        const sendRes = await sendInstagramText(handle, instagramWelcomeText({
          firstName: ctx.uname, businessName: ctx.businessName, profileUrl: ctx.profile,
        }));
        const attempts = row.attempts + 1;
        if (sendRes.ok) {
          status = "sent";
          provider = "metal_messaging";
        } else if (sendRes.skipped) {
          status = "needs_provider";
          reason = "Instagram provider not configured (INSTAGRAM_TOKEN/INSTAGRAM_BUSINESS_ID).";
        } else {
          status = attempts >= 3 ? "failed" : "queued";
          error = sendRes.error ?? "Instagram API rejected the message.";
        }
        await supabase.from("onboarding_messages").update({
          status, reason: reason ?? null, error: error ?? null, provider, attempts,
          sent_at: status === "sent" ? now : null, updated_at: now,
        }).eq("id", row.id);
        return { status, attempts };
      }
    }

    await supabase.from("onboarding_messages").update({
      status, reason, error: null, updated_at: now,
    }).eq("id", row.id);
    return { status, attempts: row.attempts };
  }

  // ── whatsapp (the default channel) ────────────────────────────────────────
  let phone = row.phone ? waNumber(row.phone) : null;

  // Re-resolve from business / user when the captured phone is missing.
  if (!phone) {
    const { data: biz } = await supabase
      .from("businesses").select("phone, whatsapp").eq("id", row.business_id).maybeSingle();
    const b = biz as Record<string, string> | null;
    if (b) phone = waNumber(b.phone) || waNumber(b.whatsapp);
  }
  if (!phone && row.user_id) {
    const up = await resolveUserPhone(row.user_id);
    if (up) phone = waNumber(up);
  }

  if (!phone) {
    await supabase.from("onboarding_messages").update({ status: "no_phone", reason: "No valid phone number.", updated_at: new Date().toISOString() }).eq("id", row.id);
    return { status: "no_phone", attempts: row.attempts };
  }

  // ClaimReach §22 — suppression check (opt-out table stores E.164 with plus).
  const { data: suppressed } = await supabase.rpc("claimreach_is_suppressed", {
    p_contact: toE164(phone) ?? phone,
    p_channel: "whatsapp",
  });

  const gate = whatsAppGate({
    killSwitchOn: flags.whatsapp,
    suppressed: Boolean(suppressed),
    providerConfigured: Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_ID),
    templateConfigured: Boolean(WHATSAPP_WELCOME_TEMPLATE),
    templateNote: WHATSAPP_TEMPLATE_NOTE,
  });
  if (gate) {
    await supabase.from("onboarding_messages").update({
      status: gate.status, reason: gate.reason, updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    return { status: gate.status, attempts: row.attempts };
  }

  // Build message and params from the business profile.
  let businessName = "your business";
  let username: string | null = null;
  const { data: biz } = await supabase.from("businesses").select("name, username").eq("id", row.business_id).maybeSingle();
  if (biz) {
    const b = biz as Record<string, string>;
    businessName = b.name || businessName;
    username = b.username ?? null;
  }
  let uname = "there";
  if (row.user_id) {
    const { data: u } = await supabase.from("users").select("full_name").eq("id", row.user_id).maybeSingle();
    uname = firstName((u as Record<string, string> | null)?.full_name);
  }

  const profile = profileUrl(username, row.business_id);
  const params = businessWelcomeTemplateParams({ firstName: uname, businessName, profileUrl: profile });

  const sendRes = await sendWhatsAppTemplate(phone, {
    template: WHATSAPP_WELCOME_TEMPLATE,
    lang: WHATSAPP_TEMPLATE_LANG,
    params,
  });

  const now = new Date().toISOString();
  const attempts = row.attempts + 1;

  if (sendRes.ok) {
    await supabase.from("onboarding_messages").update({
      status: "sent", provider: "meta_cloud_api", attempts, sent_at: now, updated_at: now, error: null,
      /*
       * Meta's wamid, and the only key the delivery webhook can match on.
       * `status: "sent"` means the API accepted the request; whether it ever
       * reached a handset arrives later, on `delivery_status`.
       */
      provider_message_id: sendRes.messageId ?? null,
      // Deliberately NOT pre-set to "accepted": let Meta's own event say so.
      delivery_status: null,
    }).eq("id", row.id);
    return { status: "sent", attempts };
  }

  const finalStatus = attempts >= 3 ? "failed" : "queued";
  await supabase.from("onboarding_messages").update({
    status: finalStatus,
    error: [sendRes.error, sendRes.providerMessage].filter(Boolean).join(" — ") || null,
    attempts, updated_at: now,
  }).eq("id", row.id);
  return { status: finalStatus, attempts };
}

// ── edge function ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  /*
   * Before anything reads the template name. Cached for a minute inside the
   * resolver, so a burst of queued welcomes costs one Graph call, and a fresh
   * approval is picked up within a minute of landing.
   */
  await refreshWelcomeTemplate();

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return jsonResponse({ ok: false, message: "Too many requests — please wait a moment." }, 429);
  }

  try {
    const body = (await req.json()) as OnboardingRequest;
    const isDrainAll = body.mode === "drain_all";

    // ── drain-all mode (cron / admin): must present the shared secret ─────
    if (isDrainAll) {
      if (!ONBOARDING_SECRET || req.headers.get("x-onboarding-key") !== ONBOARDING_SECRET) {
        return jsonResponse({ ok: false, message: "Unauthorized" }, 401);
      }

      const flags: FlagSet = {
        whatsapp: await flagEnabled("outbound_whatsapp"),
        instagram: await flagEnabled("outbound_instagram"),
      };

      const { data: rows } = await supabase
        .from("onboarding_messages")
        .select("id, business_id, user_id, phone, handle, channel, status, attempts")
        .in("status", RETRYABLE_STATUSES as unknown as string[])
        .order("created_at")
        .limit(DRAIN_MAX);

      const summary: Record<string, number> = {};
      for (const row of rows ?? []) {
        const r = await processRow(row as DrainRow, flags);
        summary[r.status] = (summary[r.status] ?? 0) + 1;
      }
      return jsonResponse({ ok: true, mode: "drain_all", drained: rows?.length ?? 0, byStatus: summary });
    }

    // ── preview mode (admin console: show exactly what will be sent) ──────────
    if (body.mode === "preview") {
      const authz = await authorizeAdmin(req);
      if (authz.reason !== "ok") {
        return jsonResponse(
          { ok: false, message: authz.reason === "unauth" ? "Authentication required." : "Admins only." },
          authz.reason === "unauth" ? 401 : 403,
        );
      }

      const businessName = body.businessName?.trim() || "your business";
      const firstName = body.ownerName?.trim() || "there";
      const profileUrl = body.profileUrl?.trim() || BRAND_ORIGIN;

      return jsonResponse({
        ok: true,
        mode: "preview",
        whatsapp: {
          text: businessWelcomeText({ firstName, businessName, profileUrl }),
          params: businessWelcomeTemplateParams({ firstName, businessName, profileUrl }),
          template: WHATSAPP_WELCOME_TEMPLATE ?? null,
          templateLang: WHATSAPP_TEMPLATE_LANG,
          providerConfigured: Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_ID),
          templateConfigured: Boolean(WHATSAPP_WELCOME_TEMPLATE),
          templateNote: WHATSAPP_TEMPLATE_NOTE,
        },
        instagram: {
          text: instagramWelcomeText({ firstName, businessName, profileUrl }),
          providerConfigured: Boolean(INSTAGRAM_TOKEN && INSTAGRAM_BUSINESS_ID),
        },
        /*
         * The brand-kit email was missing from this entirely, so the console
         * said "exactly what this recipient receives" and showed nothing for
         * the one channel that can currently deliver.
         *
         * The real document, rendered by the same function that sends it —
         * a preview built from a second copy would eventually stop matching
         * what goes out, which is worse than no preview at all.
         */
        email: {
          subject: WELCOME_EMAIL_SUBJECT,
          html: welcomeEmailHtml({
            name: firstName,
            brand: BRAND_ORIGIN,
            studio: studioUrl(),
            profile: profileUrl,
          }),
          providerConfigured: Boolean(Deno.env.get("RESEND_API_KEY")),
        },
      });
    }

    // ── manual mode (admin console: business name + WhatsApp number and/or
//    Instagram recipient — WhatsApp-only, Instagram-only, or both) ─────────
    if (body.mode === "manual") {
      const authz = await authorizeAdmin(req);
      if (authz.reason !== "ok") {
        return jsonResponse(
          { ok: false, message: authz.reason === "unauth" ? "Authentication required." : "Admins only." },
          authz.reason === "unauth" ? 401 : 403,
        );
      }
      const manualAdminId = authz.userId;

      // Validate the form.
      const businessName = body.businessName?.trim() || "";
      const rawPhone = body.phone?.trim() || "";
      const ownerName = body.ownerName?.trim() || "";
      const profileUrl = body.profileUrl?.trim() || BRAND_ORIGIN;
      const rawHandle = toHandle(body.handle ?? "");
      const rawEmail = (body.email ?? "").trim();

      // The admin picks a channel per send. Default to what the form supplied.
      const requested = (body.channels?.length ? body.channels : [body.channel || "whatsapp"])
        .filter((c): c is "whatsapp" | "instagram" | "email" =>
          c === "whatsapp" || c === "instagram" || c === "email");
      const channels = [...new Set(requested)];
      if (channels.length === 0) {
        return jsonResponse({ ok: false, message: "At least one channel (email, whatsapp and/or instagram) is required." }, 400);
      }

      if (!businessName) {
        return jsonResponse({ ok: false, message: "businessName is required." }, 400);
      }

      const flags: FlagSet = {
        whatsapp: await flagEnabled("outbound_whatsapp"),
        instagram: await flagEnabled("outbound_instagram"),
      };

      const firstName = (ownerName || businessName).split(/\s+/)[0] || "there";
      const now = new Date().toISOString();
      const results: Array<{
        channel: string, ok: boolean, status: string, reason: string | null, error: string | null, id: string | null,
      }> = [];

      for (const channel of channels) {
        let status = "sent";
        let reason: string | null = null;
        let error: string | null = null;
        let provider: string | null = null;
        let providerMessageId: string | null = null;
        let id: string | null = null;

        if (channel === "email") {
          /*
           * The brand-kit email, on demand.
           *
           * Until now this document only went out automatically on signup, so
           * there was no way to send it to a chosen address — and with
           * WhatsApp unable to deliver at all (Meta 131042, no payment method
           * on the account), email is the only channel that currently reaches
           * anybody.
           *
           * Exactly the same HTML and subject as the automatic path, so what
           * an admin sends by hand is the document owners actually receive,
           * not a second version that drifts.
           */
          if (!rawEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
            status = "no_phone";
            reason = "A valid email address is required.";
          } else {
            const html = welcomeEmailHtml({
              name: firstName,
              brand: BRAND_ORIGIN,
              studio: studioUrl(),
              profile: profileUrl,
            });
            const res = await sendEmail(
              rawEmail,
              WELCOME_EMAIL_SUBJECT,
              html,
              welcomeEmailText({ name: firstName, studio: studioUrl(), profile: profileUrl }),
            );
            if (res.ok) {
              provider = "resend";
            } else if (res.skipped) {
              status = "needs_provider";
              reason = "No email provider is configured (RESEND_API_KEY).";
            } else {
              status = "failed";
              /* Resend says exactly what is wrong; repeating it saves a hunt. */
              error = [res.error, res.providerMessage].filter(Boolean).join(" — ")
                || "The email provider rejected the message.";
            }
          }
        } else if (channel === "whatsapp") {
          const phone = rawPhone ? waNumber(rawPhone) : null;
          if (!phone) {
            status = "no_phone";
            /*
             * Name the actual defect. A local number such as 0803 000 0000
             * carries no country code, and this platform spans more than one
             * country, so the sender refuses it rather than guessing Nigeria
             * and messaging a stranger. "No valid phone number" sent an admin
             * looking for a typo that was not there.
             */
            reason = /^0/.test(rawPhone.replace(/[^\d]/g, ""))
              ? "That number has no country code. Enter it in full international form, e.g. +234 803 000 0000."
              : "No valid phone number.";
          } else {
            const { data: suppressed } = await supabase.rpc("claimreach_is_suppressed", {
              p_contact: toE164(phone) ?? phone,
              p_channel: "whatsapp",
            });
            const gate = whatsAppGate({
              killSwitchOn: flags.whatsapp,
              suppressed: Boolean(suppressed),
              providerConfigured: Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_ID),
              templateConfigured: Boolean(WHATSAPP_WELCOME_TEMPLATE),
              templateNote: WHATSAPP_TEMPLATE_NOTE,
            });
            if (gate) {
              status = gate.status;
              reason = gate.reason;
            } else {
              const params = businessWelcomeTemplateParams({ firstName, businessName, profileUrl });
              const res = await sendWhatsAppTemplate(phone, {
                template: WHATSAPP_WELCOME_TEMPLATE as string,
                lang: WHATSAPP_TEMPLATE_LANG,
                params,
              });
              if (res.ok) {
                provider = "meta_cloud_api";
                /*
                 * Keep Meta's wamid: without it this send can never be
                 * matched to the delivery webhook, and the row would sit on
                 * "sent" forever regardless of what actually happened.
                 */
                providerMessageId = res.messageId ?? null;
              } else {
                status = "failed";
                error = [res.error, res.providerMessage].filter(Boolean).join(" — ")
                  || "WhatsApp API rejected the message.";
              }
            }
          }

          const { data: ledgerRow } = await supabase.from("onboarding_manual_sends").insert({
            business_name: businessName,
            phone: rawPhone || null,
            owner_name: ownerName || null,
            profile_url: profileUrl === BRAND_ORIGIN ? null : profileUrl,
            status,
            reason,
            error,
            provider,
            attempts: status === "failed" || status === "sent" ? 1 : 0,
            created_by: manualAdminId,
            sent_at: status === "sent" ? now : null,
            email: channel === "email" ? rawEmail || null : null,
            provider_message_id: providerMessageId,
            // Meta's event decides this, not us.
            delivery_status: null,
          }).select("id").single();
          id = (ledgerRow as { id?: string } | null)?.id ?? null;
        }

        if (channel === "instagram") {
          if (!rawHandle) {
            status = "needs_conversation";
            reason = "No Instagram recipient — add the IG user ID from your business inbox, or the @handle.";
          } else {
            const { data: suppressed } = await supabase.rpc("claimreach_is_suppressed", {
              p_contact: rawHandle,
              p_channel: "instagram",
            });
            const gate = instagramGate({
              killSwitchOn: flags.instagram,
              suppressed: Boolean(suppressed),
              providerConfigured: Boolean(INSTAGRAM_TOKEN && INSTAGRAM_BUSINESS_ID),
              conversationOpen: /^\d+$/.test(rawHandle),
            });
            if (gate) {
              status = gate.status;
              reason = gate.reason;
            } else {
              const res = await sendInstagramText(rawHandle, instagramWelcomeText({
                firstName, businessName, profileUrl,
              }));
              if (res.ok) {
                provider = "metal_messaging";
              } else if (res.skipped) {
                status = "needs_provider";
                reason = "Instagram provider not configured (INSTAGRAM_TOKEN/INSTAGRAM_BUSINESS_ID).";
              } else {
                status = "failed";
                error = res.error ?? "Instagram API rejected the message.";
              }
            }
          }

          const { data: ledgerRow } = await supabase.from("onboarding_manual_sends").insert({
            business_name: businessName,
            channel: "instagram",
            handle: rawHandle ?? null,
            owner_name: ownerName || null,
            profile_url: profileUrl === BRAND_ORIGIN ? null : profileUrl,
            status,
            reason,
            error,
            provider,
            attempts: status === "failed" || status === "sent" ? 1 : 0,
            created_by: manualAdminId,
            sent_at: status === "sent" ? now : null,
          }).select("id").single();
          id = (ledgerRow as { id?: string } | null)?.id ?? null;
        }

        results.push({ channel, ok: status === "sent", status, reason, error, id });
      }

      const ok = results.some((r) => r.ok);
      const statuses = channels.length === 1 ? results[0].status : results.map((r) => `${r.channel}:${r.status}`).join(", ");
      return jsonResponse({
        ok,
        mode: "manual",
        status: statuses,
        results,
      });
    }

    /*
     * ── user mode ────────────────────────────────────────────────────────
     *
     * Two ways in, and the second exists because the first cannot work at
     * signup.
     *
     * MEASURED 2026-09-23: 15 accounts, 10 created in the last sixty days,
     * and ZERO onboarding deliveries — ever. The cause is here.
     * `resolveJwtUser` rejects the anon key by design, and with email
     * confirmation enabled `signUp` returns NO SESSION. So the browser called
     * this with the anon key, got "Authentication required", swallowed the
     * error by design (the welcome pack must never block signup), and nobody
     * was ever welcomed. It failed exactly as quietly as it was built to.
     *
     * The fix is not to loosen the JWT check — an endpoint that mails whoever
     * a caller names is worse. It is to let the SERVER ask on the user's
     * behalf, with the shared secret, which is how a database trigger can
     * welcome someone who has no session yet.
     */
    let userId = await resolveJwtUser(req);

    const serverAuthorised = Boolean(ONBOARDING_SECRET)
      && req.headers.get("x-onboarding-key") === ONBOARDING_SECRET;

    if (!userId && serverAuthorised && body.userId) {
      /*
       * The id is trusted ONLY because the caller proved it holds the shared
       * secret, which never reaches a browser. The recipient's contact details
       * are still resolved from the database below — never from the request —
       * so even this path cannot be used to mail an arbitrary address.
       */
      userId = String(body.userId);
    }

    if (!userId) {
      return jsonResponse({ ok: false, message: "Authentication required." }, 401);
    }

    // Resolve recipient details from the authenticated user's profile (server-
    // side only — the caller cannot specify an arbitrary email/phone).
    let email = body.email?.trim() || "";
    let phone = body.phone?.trim() || "";
    let name = body.name?.trim() || body.businessName?.trim() || "";
    let username = body.username?.trim() || "";

    // De-dupe: if the brand pack was already delivered to this user, skip the
    // pack but still drain their onboarding_messages.
    let packSkipped = false;
    const { data: existing } = await supabase
      .from("onboarding_deliveries").select("id").eq("user_id", userId).maybeSingle();
    if (existing) {
      packSkipped = true;
    } else {
      const { data: profile } = await supabase
        .from("users").select("email, phone, full_name, username").eq("id", userId).maybeSingle();
      if (profile) {
        email = email || (profile as Record<string, string>).email || "";
        phone = phone || (profile as Record<string, string>).phone || "";
        name = name || (profile as Record<string, string>).full_name || "";
        username = username || (profile as Record<string, string>).username || "";
      }
    }

    // ── brand pack: email + brand-kit WhatsApp (existing per-user path) ───
    const fname = firstName(name);
    const profile = profileUrl(username, userId);
    const studio = studioUrl();

    const html = welcomeEmailHtml({ name: fname, brand: BRAND_ORIGIN, studio, profile });
    const waText = welcomeWhatsAppText({ name: fname, studio, profile, guide: PACK_GUIDE_PDF });

    /*
     * sendEmail is (to, subject, html).
     *
     * This read `sendEmail(email, html)` — two arguments — so the entire
     * rendered document went into the SUBJECT and the body was left
     * undefined. The branded welcome above (gradient header, logo, starter
     * pack) has therefore never arrived as designed.
     *
     * A plain arity error, invisible because `tsconfig.edge.json` includes
     * only `_shared`: function entrypoints are deployed by esbuild, which
     * strips types rather than checking them. That file already records the
     * same gap costing robots.txt enforcement in September.
     */
    const emailResult = email
      ? await sendEmail(
        email,
        WELCOME_EMAIL_SUBJECT,
        html,
        welcomeEmailText({ name: fname, studio, profile }),
      )
      : { ok: false, skipped: true as const };

    const wa = waNumber(phone);
    const whatsappResult = wa
      ? WHATSAPP_TEMPLATE
        ? await sendWhatsAppTemplate(wa, { template: WHATSAPP_TEMPLATE, lang: WHATSAPP_TEMPLATE_LANG, params: [fname, studio] })
        : await sendWhatsAppText(wa, waText)
      : { ok: false, skipped: true as const };

    if (!packSkipped && userId && (emailResult.ok || whatsappResult.ok)) {
      await supabase.from("onboarding_deliveries").insert({
        user_id: userId,
        email: email || null,
        phone: phone || null,
        email_status: emailResult.ok ? "sent" : emailResult.skipped ? "skipped" : "failed",
        whatsapp_status: whatsappResult.ok ? "sent" : whatsappResult.skipped ? "skipped" : "failed",
      });
    }

    // ── drain this user's onboarding_messages (business-level welcome) ────
    const flags: FlagSet = {
      whatsapp: await flagEnabled("outbound_whatsapp"),
      instagram: await flagEnabled("outbound_instagram"),
    };

    const { data: rows } = await supabase
      .from("onboarding_messages")
      .select("id, business_id, user_id, phone, handle, channel, status, attempts")
      .in("status", RETRYABLE_STATUSES as unknown as string[])
      .eq("user_id", userId)
      .order("created_at")
      .limit(DRAIN_MAX);

    const summary: Record<string, number> = {};
    for (const row of rows ?? []) {
      const r = await processRow(row as DrainRow, flags);
      summary[r.status] = (summary[r.status] ?? 0) + 1;
    }

    return jsonResponse({
      ok: emailResult.ok || whatsappResult.ok || (rows?.length ?? 0) > 0,
      email: packSkipped ? "skipped" : emailResult.ok ? "sent" : emailResult.skipped ? "skipped" : "failed",
      whatsapp: packSkipped ? "skipped" : whatsappResult.ok ? "sent" : whatsappResult.skipped ? "skipped" : "failed",
      drained: rows?.length ?? 0,
      byStatus: summary,
    });
  } catch (error) {
    console.error("send-onboarding error:", error);
    return jsonResponse({ ok: false, message: "Could not send the welcome pack." }, 500);
  }
});
