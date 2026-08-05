import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";

const corsHeaders = {
  // See chatbot/index.ts for why this is intentionally "*" — anon-key-only,
  // no credentials, so CORS isn't the real abuse boundary here.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Haiku, not Opus — this runs once per caption line while a stream is live,
// so latency and cost matter far more than depth here.
const MODEL = "claude-haiku-4-5";
const MAX_TEXT_LENGTH = 500;
// A live broadcaster's speech can generate a caption line every few seconds —
// higher ceiling than the chat widget, but still bounded.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

const LANG_NAMES: Record<string, string> = {
  en: "English", fr: "French", sw: "Swahili", yo: "Yoruba", ha: "Hausa", ar: "Arabic", pt: "Portuguese",
};

interface TranslateRequest {
  text: string;
  targetLang: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return new Response(JSON.stringify({ error: "Rate limited" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { text, targetLang } = (await req.json()) as TranslateRequest;

    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!targetLang || targetLang === "en") {
      return new Response(JSON.stringify({ translation: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const languageName = LANG_NAMES[targetLang] || targetLang;
    const trimmedText = text.slice(0, MAX_TEXT_LENGTH);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: `You translate live-stream captions to ${languageName}. Reply with ONLY the translated text — no quotes, no explanation, no original text.`,
        messages: [{ role: "user", content: trimmedText }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Anthropic API error:", res.status, errBody);
      return new Response(JSON.stringify({ translation: text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const translation = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim() || text;

    return new Response(JSON.stringify({ translation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Translation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
