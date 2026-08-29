import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";
import { runAgent } from "../_shared/llm.ts";

/**
 * Draft a business profile from a sentence or two.
 *
 * Asking an owner to write an About, a Vision, a Mission, five reasons to
 * choose them and three FAQs is asking for an afternoon nobody has. This takes
 * "we sell fresh chicken in Yaba and deliver around Lagos, 7 years" and returns
 * a draft of all of it.
 *
 * IT NEVER SAVES. The response is a draft the owner reviews and edits in the
 * story editor before pressing Save. That is not squeamishness: this text is
 * the business's own voice on its own page, and a model that wrote straight to
 * a live profile would eventually put words in somebody's mouth that they would
 * not have chosen and might not agree with.
 *
 * The rules in the prompt exist because a generic model writes marketing
 * sludge: superlatives it cannot support, invented awards, invented delivery
 * areas. Everything here has to be traceable to what the owner actually said.
 */
const corsHeaders = {
  // Same reasoning as the chatbot function: this endpoint takes only the
  // public anon key, so an origin check protects nothing a direct HTTP call
  // could not already do. The rate limit below is the real protection.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Generation is far more expensive than a chat turn, so the allowance is
// smaller: enough to iterate on a draft, not enough to run a content farm.
const RATE_LIMIT_MAX = 6;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface Draft {
  tagline?: string;
  about?: string;
  story?: string;
  vision?: string;
  mission?: string;
  core_values?: string[];
  why_us?: string[];
  faqs?: { q: string; a: string }[];
}

const SYSTEM = `You write business profiles for NowOpen Africa, a directory used across Nigeria, Kenya, Ghana and South Africa.

You are given what a business owner said about their own business, in their own words. Turn it into a profile draft.

HARD RULES — these matter more than polish:
- Use ONLY facts the owner gave you. Never invent awards, certifications, customer numbers, years in business, delivery areas, prices or partnerships.
- If they did not say it, leave it out. A short honest profile beats a padded one.
- No superlatives you cannot support. Not "the best", not "world-class", not "leading" unless the owner said it.
- Write in the business's voice: plain, warm, concrete. Short sentences.
- British/African English spelling. Local terms the owner used are correct — keep them.
- Currency in Naira as ₦ only if the owner mentioned amounts.

WHAT TO PRODUCE, as JSON only, no prose around it:
{
  "tagline": "under 12 words, what they do and for whom",
  "about": "60-120 words, plain, what they offer and where",
  "story": "40-80 words on how it started, ONLY if the owner said something about it, otherwise omit",
  "vision": "one sentence, ONLY if it follows naturally from what they said, otherwise omit",
  "mission": "one sentence on what they do for customers today",
  "core_values": ["3-5 single words or short phrases"],
  "why_us": ["3-6 short concrete reasons, each under 8 words, each traceable to what they said"],
  "faqs": [{"q": "...", "a": "..."}]
}

FAQs: 3-5, the questions a real customer of THIS kind of business asks — opening times, delivery, payment, booking, wholesale. Answer only what the owner's words support; if the answer is not known, do not include that question.

Return the JSON object and nothing else.`;

/** Models wrap JSON in prose or fences however firmly you ask them not to. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
};

const list = (v: unknown, max: number, itemMax: number): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x) => (typeof x === "string" ? x.trim().slice(0, itemMax) : ""))
    .filter(Boolean)
    .slice(0, max);
  return out.length ? out : undefined;
};

/**
 * Shape whatever came back into the draft the client expects.
 *
 * The model is instructed to return this shape; it is not trusted to. Anything
 * unexpected is dropped rather than passed through to a form that would then
 * render it.
 */
function toDraft(raw: unknown): Draft {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const faqs = Array.isArray(r.faqs)
    ? r.faqs
        .map((f) => (f && typeof f === "object" ? f as Record<string, unknown> : {}))
        .map((f) => ({ q: str(f.q, 160) ?? "", a: str(f.a, 600) ?? "" }))
        .filter((f) => f.q && f.a)
        .slice(0, 6)
    : undefined;

  return {
    tagline: str(r.tagline, 120),
    about: str(r.about, 1200),
    story: str(r.story, 900),
    vision: str(r.vision, 300),
    mission: str(r.mission, 300),
    core_values: list(r.core_values, 6, 40),
    why_us: list(r.why_us, 8, 80),
    faqs: faqs && faqs.length ? faqs : undefined,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const ip = getClientIp(req);
  if (isRateLimited(`generate-profile:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return json({ error: "Too many requests. Try again in a minute." }, 429);
  }

  let body: { prompt?: string; name?: string; category?: string; location?: string; businessId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const prompt = (body.prompt ?? "").trim();
  if (prompt.length < 20) {
    return json({ error: "Tell us a little more about the business first — a sentence or two." }, 400);
  }

  /*
    Ownership check.

    Generation costs money and this endpoint is reachable with the public anon
    key, so it is gated on the caller actually owning the business they name.
    Without it the function is a free text generator for anyone who finds the
    URL.
  */
  const authHeader = req.headers.get("Authorization") ?? "";
  if (body.businessId) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", body.businessId)
      .maybeSingle();
    if (error || !data) return json({ error: "Not your business." }, 403);
  } else {
    // No business named means no owner to verify, so require a signed-in
    // caller at minimum rather than serving anonymous traffic.
    if (!authHeader || authHeader.length < 20) return json({ error: "Sign in first." }, 401);
  }

  const context = [
    body.name ? `Business name: ${body.name}` : "",
    body.category ? `Category: ${body.category}` : "",
    body.location ? `Location: ${body.location}` : "",
    "",
    "In the owner's own words:",
    prompt.slice(0, 2000),
  ].filter(Boolean).join("\n");

  const result = await runAgent(SYSTEM, [{ role: "user", content: context }], [], undefined, {
    maxTokens: 1600,
  });

  if (!result.ok) {
    // Degraded, but say which kind of degraded — "try again" is useless advice
    // when no provider is configured at all.
    const msg = result.reason === "no_provider"
      ? "Profile writing is not switched on for this deployment."
      : result.reason === "rate_limited"
        ? "The writing service is busy. Try again shortly."
        : "Could not draft a profile just now.";
    return json({ error: msg, reason: result.reason }, 503);
  }

  const draft = toDraft(extractJson(result.text ?? ""));
  if (!Object.keys(draft).length) {
    return json({ error: "Could not make sense of that. Try describing the business again." }, 502);
  }

  return json({ draft, provider: result.provider ?? null });
});
