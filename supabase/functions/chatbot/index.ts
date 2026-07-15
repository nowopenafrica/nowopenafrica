import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages?: ChatMessage[];
  query: string;
}

const MAX_HISTORY_MESSAGES = 20;
const MAX_QUERY_LENGTH = 2000;
const MODEL = "claude-opus-4-8";

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
- **Pricing** (/pricing) — Starter (free: 1 listing, pay-per-booking), Growth ($15/mo, $12/mo billed annually: verified badge, 5 campaigns, analytics), Pro ($39/mo, $31/mo annually: unlimited listings/campaigns, 0% booking fees, dedicated support).
- **Waitlist** (/waitlist) — the platform is in invite-only early access; visitors join the waitlist for an invite. Founding members get launch pricing locked for 12 months and a free verified badge.

Use the search_platform tool whenever someone asks about specific businesses, placements, prices, categories, or locations — never invent listings, prices, or ratings; state only what the tool returns. If a search comes back empty, say so honestly and suggest browsing the relevant page or joining the waitlist instead of guessing.

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

function extractText(content: any[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { query, messages = [] } = (await req.json()) as ChatRequest;

    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(JSON.stringify({ message: "Please type a message." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const trimmedQuery = query.slice(0, MAX_QUERY_LENGTH);

    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));

    // The API requires the first message to be from the user, so drop any
    // leading assistant turns (e.g. the widget's canned greeting).
    while (history.length > 0 && history[0].role === "assistant") {
      history.shift();
    }

    const anthropicMessages: any[] = [...history, { role: "user", content: trimmedQuery }];

    const callAnthropic = async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          thinking: { type: "adaptive" },
          tools: [SEARCH_TOOL],
          messages: anthropicMessages,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error("Anthropic API error:", res.status, errBody);
        return null;
      }
      return res.json();
    };

    let data = await callAnthropic();
    if (!data) {
      return new Response(
        JSON.stringify({ message: "I'm having trouble processing your request. Please try again later." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // One round of tool use is enough for a chat widget: search, then answer.
    if (data.stop_reason === "tool_use") {
      const toolUseBlocks = (data.content || []).filter((b: any) => b.type === "tool_use");

      anthropicMessages.push({ role: "assistant", content: data.content });

      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block: any) => {
          const result =
            block.name === "search_platform" ? await runSearchTool(block.input || {}) : { error: "unknown tool" };
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        })
      );
      anthropicMessages.push({ role: "user", content: toolResults });

      data = await callAnthropic();
      if (!data) {
        return new Response(
          JSON.stringify({ message: "I found some results but had trouble finishing my answer. Please try again." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const assistantMessage = extractText(data.content || []) || "I couldn't generate a response.";

    return new Response(JSON.stringify({ message: assistantMessage }), {
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
