import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";

// Pexels video search, proxied.
//
// Only the SEARCH needs the API key, and that's the part moved server-side —
// stockFootage.ts read it from VITE_PEXELS_API_KEY, which compiles into the
// shipped bundle where anyone can read it out of devtools. The clip URLs the
// search returns need no key at all, so the browser still streams the video
// straight from videos.pexels.com onto the render canvas (already allowed by
// media-src in the CSP). Nothing about the renderer changes.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// A storyboard asks for one search per distinct scene query, and results are
// cached client-side per query, so a few videos a minute sits well inside this.
const RATE_LIMIT_MAX = 40;
const RATE_LIMIT_WINDOW_MS = 60_000;

const ORIENTATIONS = new Set(["landscape", "portrait", "square"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const key = Deno.env.get("PEXELS_API_KEY") || "";

  // Health check: is footage available on this deployment at all? The Studio
  // asks this before offering the toggle, so it never promises something the
  // deployment can't do.
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: Boolean(key), provider: key ? "pexels" : "none" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return new Response(JSON.stringify({ ok: false, reason: "rate_limited", videos: [] }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!key) {
    return new Response(JSON.stringify({ ok: false, reason: "no_provider", videos: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { query, orientation, perPage } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(JSON.stringify({ ok: false, reason: "error", videos: [] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams({
      query: query.slice(0, 200),
      orientation: ORIENTATIONS.has(orientation) ? orientation : "portrait",
      per_page: String(Math.max(1, Math.min(20, Number(perPage) || 8))),
      size: "medium",
    });

    const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
      headers: { Authorization: key },
    });

    if (!res.ok) {
      const reason = res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate_limited" : "error";
      console.error("Pexels search failed:", res.status, (await res.text()).slice(0, 200));
      return new Response(JSON.stringify({ ok: false, reason, videos: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();

    // Pass through only what the client picker uses. Pexels returns a large
    // object per video; forwarding it whole would be pure payload weight on a
    // connection that may well be mobile data in Lagos.
    const videos = (data.videos ?? []).map((v: any) => ({
      id: v.id,
      image: v.image,
      width: v.width,
      height: v.height,
      duration: v.duration,
      video_files: (v.video_files ?? []).map((f: any) => ({
        link: f.link,
        file_type: f.file_type,
        width: f.width,
        height: f.height,
        quality: f.quality,
      })),
    }));

    return new Response(JSON.stringify({ ok: true, videos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ ok: false, reason: "error", videos: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
