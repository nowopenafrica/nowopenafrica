import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";
import { runAgent, resolveProvider, probeProviders, type ToolDef } from "../_shared/llm.ts";

const corsHeaders = {
  // "*" here is deliberate, not an oversight: this endpoint takes only the
  // public anon key (no cookies/credentials), so CORS can't protect
  // anything a direct HTTP call couldn't already do — the anon key is
  // visible in the shipped frontend bundle regardless. Real abuse
  // protection is the rate limiter below, not the origin check.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface BusinessContext {
  name?: string;
  category?: string;
  location?: string;
  description?: string;
}

interface ChatRequest {
  messages?: ChatMessage[];
  query: string;
  /** Present when the widget is opened from a business's NowOpen Live
   * viewer — scopes the assistant to that business without a second prompt. */
  business?: BusinessContext;
}

const MAX_HISTORY_MESSAGES = 20;
const MAX_QUERY_LENGTH = 2000;
// The model is no longer named here — _shared/llm.ts picks the provider from
// whichever API key is set (Groq, then OpenRouter, then Anthropic).

// Anon key only — every table this searches has a public SELECT policy, so
// there's nothing here RLS wouldn't already allow a visitor to read directly.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_ANON_KEY") ?? ""
);

const SYSTEM_PROMPT = `You are the AI assistant for NowOpen Africa — "the operating system for business growth in Africa." You help visitors get discovered, book advertising, and hire creative professionals, all on one platform.

What's on the platform:
- **Discover** (/businesses) — a directory of African businesses across categories like food & hospitality, retail, tech, health, professional services, trades, education, and arts & entertainment. Each business has a profile at nowopenafrica.com/<username> with a location map, contact details, and a blue verified badge for verified/premium listings.
- **Promote** (/adverts) — advertising placements across Africa: billboards, digital screens, transit, airport displays, mall media, street furniture, stadiums, radio. Cities include Lagos, Nairobi, Accra, Johannesburg, Cairo, Kigali, Dakar, and more. Typical pricing is roughly $110–$900 per day depending on location and traffic.
- **Create** (/media) — creative and media services: photography, videography, branding, web/app design, social media management, animation, audio production, and more. Typical pricing is roughly $15–$3,000 per project.
- **Pricing** (/pricing) — Free Launch (free: basic profile, 50 AI credits/mo), Growth (~$3/mo, ~$33/yr: verified badge, bookings, analytics, 500 AI credits), Business Pro (~$12/mo, ~$120/yr: unlimited modules, 0% booking fees, 2,000 AI credits), Enterprise (custom). AI credits and Promote advertising are separate add-on spends.
- **Waitlist** (/waitlist) — the platform is in invite-only early access; visitors join the waitlist for an invite. Founding members get launch pricing locked for 12 months and a free verified badge.

Use the search_platform tool whenever someone asks about specific businesses, advertising placements, or creative services — including their prices, categories or locations. Never invent listings, prices, or ratings; state only what the tool returns. If a search comes back empty, say so honestly and suggest browsing the relevant page or joining the waitlist instead of guessing.

Do NOT use the tool for subscription plans and their pricing (Free Launch, Growth, Business Pro, Enterprise) — those are listed above; answer directly and link to /pricing. The tool only searches listings, and its "domain" must be exactly one of businesses, adverts, media, or all.

Reply in short, friendly markdown: **bold** sparingly, a bullet list when there are multiple results, and markdown links like [Business Name](/username) or [View placement](/adverts/id) so people can click straight through. Keep answers brief — this is a chat widget, not an essay. If someone asks something unrelated to NowOpen Africa, answer briefly and steer back to how the platform can help.`;

const SEARCH_TOOL = {
  name: "search_platform",
  description:
    "Search NowOpen Africa's live directory of businesses, advertising placements, and creative/media services. Always use this before answering questions about specific listings, prices, categories, or locations.",
  input_schema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        enum: ["businesses", "adverts", "media", "all"],
        description: "Which part of the platform to search.",
      },
      query: {
        type: "string",
        description: "Free-text search term — matched against name/title, description, and category.",
      },
      location: {
        type: "string",
        description: "Optional city or country to filter by (businesses and adverts only).",
      },
    },
    required: ["domain", "query"],
  },
};

// Strip characters that are structurally meaningful in a PostgREST filter
// string (comma separates conditions, parens group them) — defense in depth
// against a crafted "query" breaking out of the intended .or() filter. These
// tables are public-read regardless, so the real risk is just a malformed
// filter, not a data leak.
const sanitize = (s: string) => s.replace(/[,()]/g, " ").trim().slice(0, 200);

async function searchBusinesses(query: string, location?: string) {
  const term = sanitize(query);
  let q = supabase
    .from("businesses")
    .select("name, username, category, location, rating, status, verified")
    .limit(5);
  if (term) q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`);
  if (location) q = q.ilike("location", `%${sanitize(location)}%`);
  const { data, error } = await q;
  if (error) {
    console.error("searchBusinesses error:", error.message);
    return [];
  }
  return (data || []).map((b) => ({
    type: "business",
    name: b.name,
    category: b.category,
    location: b.location,
    rating: b.rating,
    status: b.status,
    verified: b.verified,
    link: b.username ? `/${b.username}` : null,
  }));
}

async function searchAdverts(query: string, location?: string) {
  const term = sanitize(query);
  let q = supabase
    .from("advertisements")
    .select("id, title, type, category, location, price_per_day, status")
    .limit(5);
  if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%,type.ilike.%${term}%`);
  if (location) q = q.ilike("location", `%${sanitize(location)}%`);
  const { data, error } = await q;
  if (error) {
    console.error("searchAdverts error:", error.message);
    return [];
  }
  return (data || []).map((a) => ({
    type: "advert",
    title: a.title,
    category: a.type || a.category,
    location: a.location,
    price_per_day: a.price_per_day,
    status: a.status,
    link: `/adverts/${a.id}`,
  }));
}

async function searchMedia(query: string) {
  const term = sanitize(query);
  let q = supabase
    .from("media_services")
    .select("id, title, service_type, pricing, pricing_model, rating, review_count, status")
    .limit(5);
  if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%,service_type.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) {
    console.error("searchMedia error:", error.message);
    return [];
  }
  return (data || []).map((m) => ({
    type: "media_service",
    title: m.title,
    category: m.service_type,
    pricing: m.pricing,
    pricing_model: m.pricing_model,
    rating: m.rating,
    review_count: m.review_count,
    status: m.status,
    link: `/media/${m.id}`,
  }));
}

async function runSearchTool(input: { domain?: string; query?: string; location?: string }) {
  const domain = input.domain || "all";
  const query = input.query || "";
  const location = input.location;

  const [businesses, adverts, media] = await Promise.all([
    domain === "businesses" || domain === "all" ? searchBusinesses(query, location) : [],
    domain === "adverts" || domain === "all" ? searchAdverts(query, location) : [],
    domain === "media" || domain === "all" ? searchMedia(query) : [],
  ]);

  const results = [...businesses, ...adverts, ...media];
  return { result_count: results.length, results };
}

/**
 * Format directory matches for when no model is available.
 *
 * Returns "" when there are no matches — the caller decides what to say about
 * that, because only the caller knows whether the model was reachable. This
 * function must never imply the directory is empty.
 */
const FALLBACK_GROUPS: { type: string; label: string }[] = [
  { type: "business", label: "Businesses" },
  { type: "advert", label: "Ad placements" },
  { type: "media_service", label: "Creative services" },
];

async function searchOnlyAnswer(query: string): Promise<string> {
  const { results } = await runSearchTool({ domain: "all", query });

  const parts = FALLBACK_GROUPS.map(({ type, label }) => {
    const rows = results.filter((r: any) => r.type === type);
    if (!rows.length) return null;
    const lines = rows.slice(0, 5).map((r: any) => {
      // Businesses carry `name`, adverts and services carry `title`.
      const title = r.name || r.title || "Untitled";
      const detail = r.location || r.category || "";
      const text = r.link ? `[${title}](${r.link})` : title;
      return `- ${text}${detail ? ` — ${detail}` : ""}`;
    });
    return `**${label}**\n${lines.join("\n")}`;
  }).filter(Boolean);

  return parts.length ? parts.join("\n\n") : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // GET is a health check: which provider is actually live on this deployment.
  // Without it the only way to tell a working assistant from one silently
  // running on the search-only fallback is to read the function logs.
  // It reports the provider NAME and model id — never the key itself.
  if (req.method === "GET") {
    const provider = resolveProvider();

    // ?probe=1 additionally makes a 1-token call upstream and reports the real
    // status. A key can be present but dead, or a model id can be retired by the
    // host — both look identical from outside, and both silently downgrade the
    // assistant to search-only.
    if (new URL(req.url).searchParams.get("probe")) {
      const probes = await probeProviders();
      return new Response(
        JSON.stringify({
          firstChoice: provider.name,
          // `usable` is the real answer: runAgent walks the list, so the
          // assistant is model-backed as long as ANY provider here is ok.
          usable: probes.filter((p) => p.ok).map((p) => p.provider),
          probes,
        }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: provider.name !== "none",
        provider: provider.name,
        model: provider.model || null,
        label: provider.label,
        mode: provider.name === "none" ? "search-only fallback" : "model",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return new Response(JSON.stringify({ message: "You're sending messages too quickly — please wait a moment and try again." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { query, messages = [], business } = (await req.json()) as ChatRequest;

    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(JSON.stringify({ message: "Please type a message." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trimmedQuery = query.slice(0, MAX_QUERY_LENGTH);

    const system = business?.name
      ? `${SYSTEM_PROMPT}\n\nRight now you're embedded in "${business.name}"'s live stream on NowOpen Africa${business.category ? ` (a ${business.category} business` : ""}${business.location ? ` in ${business.location}` : ""}${business.category || business.location ? ")" : ""}.${business.description ? ` About them: ${business.description}` : ""} Prioritize answering questions about this specific business — use search_platform to look up their current services/products/pricing rather than guessing. If asked about something unrelated to this business or the platform, answer briefly and steer back.`
      : SYSTEM_PROMPT;

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));

    // The API requires the first message to be from the user, so drop any
    // leading assistant turns (e.g. the widget's canned greeting).
    while (history.length > 0 && history[0].role === "assistant") {
      history.shift();
    }

    const turns = [...history, { role: "user" as const, content: trimmedQuery }];

    // The tool definition, in the shared shape. Anthropic calls this field
    // `input_schema` and OpenAI-compatible providers call it `parameters`;
    // _shared/llm.ts maps it per provider so there's one definition here.
    const tool: ToolDef = {
      name: SEARCH_TOOL.name,
      description: SEARCH_TOOL.description,
      parameters: SEARCH_TOOL.input_schema,
    };

    const runTool = async (name: string, args: Record<string, unknown>) =>
      name === "search_platform" ? await runSearchTool(args as any) : { error: "unknown tool" };

    const result = await runAgent(system, turns, [tool], runTool);

    // The model was unreachable. Rather than a dead chat box, search the
    // directory directly and hand back real listings.
    //
    // The wording matters more than it looks. An earlier version always said
    // "I couldn't find anything matching X" — which, when the real cause was a
    // rate limit, told the user their own directory was empty. On a platform
    // whose pitch is discovery, that's a damaging thing to say untruthfully.
    // So the message names the actual cause, and the listings are offered as
    // what we *can* still confirm.
    if (!result.ok) {
      console.warn(`Assistant degraded (${result.reason}) — answering from search only.`);

      const listings = await searchOnlyAnswer(trimmedQuery);
      const preamble = result.reason === "rate_limited"
        ? "The assistant is handling a lot of requests right now, so I can't answer in full for a moment."
        : "I can't reach the assistant right now.";

      const message = listings
        ? `${preamble} Here's what I can pull straight from the directory:\n\n${listings}`
        : `${preamble} Please try again shortly — in the meantime you can browse [businesses](/businesses), [ad placements](/adverts) or [creative services](/media).`;

      // Upstream detail is withheld unless ASSISTANT_DEBUG is set — it is
      // operator diagnostics, not something a visitor should be shown.
      const debug = Deno.env.get("ASSISTANT_DEBUG")
        ? { status: result.status, detail: result.detail }
        : {};

      return new Response(JSON.stringify({ message, degraded: true, reason: result.reason, ...debug }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ message: result.text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ message: "An error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
