import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";
import { generateImage, resolveImageProvider } from "../_shared/imagegen.ts";

// Key art generation for Studio's Video Studio.
//
// The browser never talks to Hugging Face or Replicate directly: the key stays
// a Supabase secret, and proxying keeps every provider off the CSP allowlist.
// The response is a data: URL, which a canvas can draw without tainting — so
// the rendered video can still be read back by MediaRecorder.

const corsHeaders = {
  // Same reasoning as chatbot/index.ts: anon-key only, no credentials, so the
  // origin check isn't the abuse boundary — the rate limiter is.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Image generation is far more expensive per call than a chat turn, and a
// storyboard asks for one image per scene. Low enough to stop a runaway loop
// burning an account's quota, high enough for a few full storyboards a minute.
const RATE_LIMIT_MAX = 24;
const RATE_LIMIT_WINDOW_MS = 60_000;

const MAX_PROMPT = 800;
// Key art sits behind a Ken Burns move and a caption, so it does not need to be
// large — and every extra pixel is latency the owner waits through.
const MAX_SIDE = 1024;

const clampSide = (n: unknown, fallback: number) => {
  const v = Math.round(Number(n) || fallback);
  // Most diffusion models expect multiples of 8.
  return Math.max(256, Math.min(MAX_SIDE, Math.round(v / 8) * 8));
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Health check — is a model configured, and which. Never reveals the key.
  if (req.method === "GET") {
    const provider = resolveImageProvider();
    return new Response(
      JSON.stringify({
        ok: provider.name !== "none",
        provider: provider.name,
        model: provider.model || null,
        label: provider.label,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return new Response(JSON.stringify({ ok: false, reason: "rate_limited" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { prompt, width, height, seed, model, apiKey, kind } = await req.json();

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return new Response(JSON.stringify({ ok: false, reason: "error", detail: "Missing prompt." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await generateImage({
      prompt: prompt.slice(0, MAX_PROMPT),
      width: clampSide(width, 768),
      height: clampSide(height, 768),
      seed: Number.isFinite(Number(seed)) ? Number(seed) : undefined,
      model: typeof model === "string" ? model.slice(0, 200) : undefined,
      // Used for this request only and never written anywhere — not to a table,
      // not to a secret, not to the logs below.
      apiKey: typeof apiKey === "string" && apiKey.trim() ? apiKey.trim() : undefined,
      kind: kind === "video" ? "video" : "image",
    });

    if (!result.ok) {
      console.warn(`Image generation failed: ${result.reason}`, result.status ?? "", result.detail ?? "");
    }

    // Always 200 with an outcome body: the client distinguishes "still loading"
    // from "no key" from "failed" and shows different things for each, which a
    // bare HTTP error code can't carry.
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ ok: false, reason: "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
