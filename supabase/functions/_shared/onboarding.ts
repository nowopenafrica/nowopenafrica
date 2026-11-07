// Onboarding welcome helpers shared by the sender edge function and its unit
// tests. Pure and side-effect free: the WhatsApp + Instagram copy, template
// parameter order, and the retry/terminal status classification all live here
// so the drain loop in send-onboarding stays declarative.

export const DRAIN_MAX = 25;

/** Statuses the drainer re-examines on every run. Anything not here is final
 *  (sent, or terminal like blocked/suppressed/no_phone/failed). */
export const RETRYABLE_STATUSES = ["queued", "needs_provider", "needs_template"] as const;

export function retryable(status: string): boolean {
  return (RETRYABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * The suppression table stores "E.164 for a phone" with the plus — e.g.
 * +2348012345678 — so the §22 lookup must be asked in that shape or a stored
 * opt-out silently fails to match. Nigeria is the product's home market, so a
 * local-format number (0… / 080…) is nationalised to +234. Falls back to the
 * international form when the country code is already present.
 */
export function toE164(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * The immediate summary welcome: greets the owner, confirms the business is
 * live, and educates on using the business profile. Deliberately short —
 * WhatsApp, not email.
 */
export function businessWelcomeText(opts: { firstName: string; businessName: string; profileUrl: string }): string {
  const { firstName, businessName, profileUrl } = opts;
  const shortProfile = profileUrl.replace(/^https?:\/\//, "");
  return (
    `Hi ${firstName}, welcome to NowOpen Africa! 🎉\n\n` +
    `Your business — ${businessName} — is now live at ${shortProfile}\n\n` +
    `Here's how to get the most out of your business profile:\n` +
    `• Open now — mark your business open from the dashboard and appear on the map\n` +
    `• Make it yours — add your photos, services, hours, prices and contact details\n` +
    `• Catch every lead — enquiries and booking requests land straight in your dashboard\n` +
    `• Share it — send your link or Smart QR so customers can find you anywhere\n` +
    `• Grow in Studio — turn your profile into business cards, flyers and reels\n\n` +
    `Tap to open your business: ${shortProfile}\n\n` +
    `Reply here anytime if you need a hand — a real person reads it. 💬`
  );
}

/**
 * The approved Meta template rendered with these body parameters, in EXACTLY
 * this order — the template's body must declare {{1}} = first name, {{2}} =
 * business name, {{3}} = profile URL to match. Documented, because a mismatch
 * is a template that Meta rejects.
 */
export function businessWelcomeTemplateParams(opts: { firstName: string; businessName: string; profileUrl: string }): string[] {
  const { firstName, businessName, profileUrl } = opts;
  return [firstName, businessName, profileUrl.replace(/^https?:\/\//, "")];
}

export type WelcomeSendResult =
  | { outcome: "sent" }
  | { outcome: "no_phone" }
  | { outcome: "blocked" } // outbound_whatsapp kill switch is off
  | { outcome: "suppressed" } // ClaimReach §22
  | { outcome: "needs_provider" } // WHATSAPP_TOKEN/WHATSAPP_PHONE_ID unset
  | { outcome: "needs_template" } // WHATSAPP_WELCOME_TEMPLATE unset
  | { outcome: "failed"; error: string };

/**
 * The WhatsApp gate, in order. Every sender — the automatic drain AND the
 * admin manual send — refuses on the first gate that trips, and records the
 * same reason, so a manual resend never disagrees with the pipeline about why
 * a message could not go out. Returns null when the send is allowed through.
 */
export interface WhatsAppGateInput {
  killSwitchOn: boolean; // feature_flags.outbound_whatsapp enabled
  suppressed: boolean; // ClaimReach §22 opt-out
  providerConfigured: boolean; // WHATSAPP_TOKEN + WHATSAPP_PHONE_ID present
  templateConfigured: boolean; // an APPROVED template is available to send
  /*
   * Why there is no template, in Meta's terms rather than ours.
   *
   * The reason used to be the fixed sentence "WHATSAPP_WELCOME_TEMPLATE env
   * not set", which named a cause that is usually not the real one: far more
   * often a template IS submitted and Meta has not approved it yet, or the
   * only approved one is MARKETING and must not be sent without opt-in. An
   * operator reading the old sentence would go and set an env var, which is
   * precisely the wrong thing to do while approval is pending.
   */
  templateNote?: string | null;
}

export type WhatsAppGateStatus =
  | "blocked"
  | "suppressed"
  | "needs_provider"
  | "needs_template";

export interface WhatsAppGateResult {
  status: WhatsAppGateStatus;
  reason: string;
}

export function whatsAppGate(input: WhatsAppGateInput): WhatsAppGateResult | null {
  if (!input.killSwitchOn) {
    return { status: "blocked", reason: "outbound_whatsapp kill switch is off." };
  }
  if (input.suppressed) {
    return { status: "suppressed", reason: "Contact opted out (ClaimReach §22)." };
  }
  if (!input.providerConfigured) {
    return {
      status: "needs_provider",
      reason: "WhatsApp provider not configured (WHATSAPP_TOKEN/WHATSAPP_PHONE_ID).",
    };
  }
  if (!input.templateConfigured) {
    return {
      status: "needs_template",
      reason: input.templateNote
        ?? "No approved WhatsApp template is available (required for out-of-session messages).",
    };
  }
  return null;
}

/**
 * Normalise an Instagram contact as typed by an admin. Accepts "@ada.kitchen",
 * "ada.kitchen" or a numeric IG user ID ("17841400000000000"). Lowercased,
 * leading @ stripped; returns null when nothing usable remains.
 */
export function toHandle(raw?: string | null): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@/, "").toLowerCase();
  return h.length >= 1 ? h : null;
}

/**
 * The Instagram welcome. IG is a DM, not a thread, so this is deliberately
 * shorter and more casual than the WhatsApp welcome: one crisp promise, one
 * live link, the QR as the shareable, and an invite to keep the thread going.
 * Cooler to read on a phone, faster to reply to.
 */
export function instagramWelcomeText(opts: { firstName: string; businessName: string; profileUrl: string }): string {
  const { firstName, businessName, profileUrl } = opts;
  const shortProfile = profileUrl.replace(/^https?:\/\//, "");
  return (
    `Hey ${firstName} 👋 your business ${businessName} just went live on NowOpen Africa 🎉\n\n` +
    `➡️ Tap here to open it: ${shortProfile}\n` +
    `• Appear on the map when you mark yourself Open\n` +
    `• Manage enquiries and bookings from one dashboard\n` +
    `• Share your link or Smart QR so customers find you anywhere\n\n` +
    `DM us here anytime — a real person replies. 💬`
  );
}

/**
 * The Instagram gate, in order — the mirror of whatsAppGate, minus the
 * template requirement. Instagram has no WhatsApp-style out-of-window
 * marketing template: Meta only lets a business DM a user inside an open
 * conversation (the 24h window since that user's last inbound message, or an
 * approved tag). So a missing conversation is a refusal in its own right —
 * `needs_conversation` — and cold outreach to a handle the business has never
 * heard from is never attempted.
 */
export interface InstagramGateInput {
  killSwitchOn: boolean; // feature_flags.outbound_instagram enabled
  suppressed: boolean; // ClaimReach §22 opt-out (channel 'instagram')
  providerConfigured: boolean; // INSTAGRAM_TOKEN + INSTAGRAM_BUSINESS_ID present
  conversationOpen: boolean; // a numeric IG user ID (an established thread)
}

export type InstagramGateStatus =
  | "blocked"
  | "suppressed"
  | "needs_provider"
  | "needs_conversation";

export interface InstagramGateResult {
  status: InstagramGateStatus;
  reason: string;
}

export function instagramGate(input: InstagramGateInput): InstagramGateResult | null {
  if (!input.killSwitchOn) {
    return { status: "blocked", reason: "outbound_instagram kill switch is off." };
  }
  if (input.suppressed) {
    return { status: "suppressed", reason: "Contact opted out (ClaimReach §22)." };
  }
  if (!input.providerConfigured) {
    return {
      status: "needs_provider",
      reason: "Instagram provider not configured (INSTAGRAM_TOKEN/INSTAGRAM_BUSINESS_ID).",
    };
  }
  if (!input.conversationOpen) {
    return {
      status: "needs_conversation",
      reason: "Instagram DMs are only allowed inside an open conversation. Send to a numeric IG user ID from your business inbox (@handles can't be cold-DM'd via the official API).",
    };
  }
  return null;
}