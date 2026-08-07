import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";
import { runAgent } from "../_shared/llm.ts";

const corsHeaders = {
  // See chatbot/index.ts for why this is intentionally "*" — anon-key-only,
  // no credentials, so CORS isn't the real abuse boundary here.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// The model comes from _shared/llm.ts (whichever key is set). This runs once
// per caption line while a stream is live, so latency matters more than depth —
// which is one reason Groq's default is a good fit here.
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

    // Same provider layer as the assistant, so one key (Groq, OpenRouter or
    // Anthropic) powers both. No tools — this is a single translate turn.
    const result = await runAgent(
      `You translate live-stream captions to ${languageName}. Reply with ONLY the translated text — no quotes, no explanation, no original text.`,
      [{ role: "user", content: trimmedText }],
      [],
      undefined,
      { maxTokens: 300 },
    );

    // Captions are live: returning the untranslated original is far better than
    // an error, so every failure path degrades to the source text.
    const translation = result.ok ? result.text : text;

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
