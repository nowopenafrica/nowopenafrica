// Which WhatsApp template to send, decided by asking Meta rather than by
// remembering to set an environment variable.
//
// ── THE PROBLEM THIS REMOVES ─────────────────────────────────────────────
//
// A template is only sendable once Meta approves it, and approval happens
// hours later with no notification. The configuration therefore had a step
// that no system performed: a person had to notice the approval and set
// WHATSAPP_WELCOME_TEMPLATE. Until they did, every queued welcome recorded
// needs_template — correctly, but for a reason that had already gone away.
//
// That is the same shape as every stale claim in this codebase: something that
// was true when written, with nothing watching for the day it stopped being.
// So the name is resolved from Meta at send time instead.
//
// ── WHAT IT WILL AND WILL NOT CHOOSE ─────────────────────────────────────
//
// It picks an APPROVED template of our own, and only a UTILITY one.
//
// It will never pick a MARKETING template, even one we wrote. Marketing
// messages may only go to people who opted in to marketing, and creating a
// listing is consent to be told the listing exists, not consent to be sold to.
// Auto-selecting one would turn a configuration convenience into a consent
// violation, so a MARKETING-only account stays "needs template" and says why.
//
// It will never pick one of Meta's samples. hello_world is APPROVED and
// UTILITY on every new account, and selecting it would send "Hello World" to a
// business owner who just signed up.

const GRAPH = "https://graph.facebook.com/v20.0";

/** Meta's demo templates, approved on every account and never ours to send. */
const SAMPLE = /^(hello_world$|jaspers_market_)/;
/** Our own templates are prefixed; anything else belongs to someone else. */
const OURS = /^nowopen_/;

export type TemplateChoice =
  | { ok: true; name: string; source: "env" | "meta" | "env_unverified" }
  | {
    ok: false;
    reason: "unconfigured" | "none_approved" | "marketing_only" | "lookup_failed" | "named_not_approved";
    message: string;
  };

interface Template {
  name: string;
  status: string;
  category?: string;
  language?: string;
}

/*
 * A small cache: an edge instance may serve a burst of sends, and Meta's
 * template list changes at most a few times a year. Short enough that an
 * approval is picked up within a minute, long enough that a hundred queued
 * welcomes do not become a hundred Graph calls.
 */
let cached: { at: number; choice: TemplateChoice } | null = null;
const TTL_MS = 60_000;

export function clearTemplateCache() { cached = null; }

export async function resolveWelcomeTemplate(
  env: (k: string) => string | undefined = (k) => Deno.env.get(k),
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<TemplateChoice> {
  /*
   * An explicit name always wins. Someone who sets it has made a decision,
   * and discovery must not quietly overrule it — including to a template they
   * deliberately moved away from.
   */
  const explicit = env("WHATSAPP_WELCOME_TEMPLATE");

  if (cached && now() - cached.at < TTL_MS) return cached.choice;

  const token = env("WHATSAPP_TOKEN");
  const waba = env("WHATSAPP_WABA_ID");
  if (!token || !waba) {
    /*
     * Nothing to check against. An explicitly named template is taken on
     * trust here rather than blocking every welcome on a lookup we cannot
     * perform. Not cached: configuration can change between invocations.
     */
    if (explicit) return { ok: true, name: explicit, source: "env_unverified" };
    return {
      ok: false, reason: "unconfigured",
      message: "WHATSAPP_WELCOME_TEMPLATE is unset and WHATSAPP_TOKEN / WHATSAPP_WABA_ID are not both set, "
        + "so the approved template could not be looked up.",
    };
  }

  let templates: Template[];
  try {
    const res = await fetchImpl(
      `${GRAPH}/${waba}/message_templates?fields=name,status,category,language&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await res.json().catch(() => null) as
      { data?: Template[]; error?: { message?: string } } | null;
    if (!res.ok) {
      return {
        ok: false, reason: "lookup_failed",
        message: `Meta refused the template list: ${body?.error?.message ?? res.status}`,
      };
    }
    templates = body?.data ?? [];
  } catch (e) {
    // Not cached either: a network blip must not pin a failure for a minute.
    if (explicit) return { ok: true, name: explicit, source: "env_unverified" };
    return { ok: false, reason: "lookup_failed", message: `Could not reach Meta: ${(e as Error).message}` };
  }

  /*
   * An explicitly named template is still CHECKED against Meta.
   *
   * "Explicit wins" means choosing among approved templates, not bypassing
   * approval. Naming a PENDING template makes the gate pass, so every queued
   * welcome attempts a real send, Meta rejects it, and the row lands in
   * `failed` — which is terminal, unlike the retryable `needs_template` it
   * replaced. The welcomes would then never go out, even after approval.
   * Checking here turns that trap into a clear refusal that heals itself.
   */
  if (explicit) {
    const named = templates.find((t) => t.name === explicit);
    if (named && named.status === "APPROVED") {
      const choice: TemplateChoice = { ok: true, name: explicit, source: "env" };
      cached = { at: now(), choice };
      return choice;
    }
    const choice: TemplateChoice = {
      ok: false, reason: "named_not_approved",
      message: named
        ? `WHATSAPP_WELCOME_TEMPLATE names ${explicit}, which Meta has not approved (${named.status}). `
          + "Nothing is sent with it: a pending template is rejected, and the refusal would be recorded as a "
          + "terminal failure instead of a retry. It will start sending by itself once Meta approves."
        : `WHATSAPP_WELCOME_TEMPLATE names ${explicit}, which does not exist on this WhatsApp Business Account.`,
    };
    cached = { at: now(), choice };
    return choice;
  }

  const ours = templates.filter((t) => OURS.test(t.name) && !SAMPLE.test(t.name));
  const approved = ours.filter((t) => t.status === "APPROVED");
  const utility = approved.filter((t) => t.category === "UTILITY");

  let choice: TemplateChoice;
  if (utility.length > 0) {
    /*
     * Highest version wins, so submitting nowopen_..._v3 supersedes v2 the
     * moment Meta approves it, without a deploy. Falls back to name order when
     * no version suffix is present.
     */
    const best = [...utility].sort((a, b) => version(b.name) - version(a.name) || a.name.localeCompare(b.name))[0];
    choice = { ok: true, name: best.name, source: "meta" };
  } else if (approved.length > 0) {
    choice = {
      ok: false, reason: "marketing_only",
      message: `The only approved NowOpen template is ${approved[0].name} (${approved[0].category}). `
        + "A marketing template may only be sent to people who opted in to marketing, so it is not used "
        + "automatically. Submit a UTILITY template, or record a marketing opt-in at signup.",
    };
  } else {
    choice = {
      ok: false, reason: "none_approved",
      message: ours.length > 0
        ? `${ours[0].name} is submitted but Meta has not approved it yet.`
        : "No NowOpen template has been submitted to Meta for this WhatsApp Business Account.",
    };
  }

  cached = { at: now(), choice };
  return choice;
}

/** Trailing _v<N>, or 0. Lets v10 beat v9 rather than losing alphabetically. */
function version(name: string): number {
  const m = name.match(/_v(\d+)$/);
  return m ? Number(m[1]) : 0;
}
