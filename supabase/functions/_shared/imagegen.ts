// Provider-agnostic image generation for NowOpen Studio.
//
// WHY THIS IS SERVER-SIDE, like _shared/llm.ts:
//   1. The API key stays a Supabase secret. A VITE_* key ships in the bundle —
//      the mistake already made once with VITE_PEXELS_API_KEY.
//   2. The browser only ever talks to the Supabase function, so no new host has
//      to be added to the CSP allowlist for each provider.
//   3. Swapping providers needs no web deploy and no mobile release.
//
// PROVIDERS, in the order they're picked up:
//
//   HUGGINGFACE_API_KEY  Hugging Face Inference — FLUX.1-schnell, genuinely
//                        open-weight, free tier. Returns image bytes directly.
//                        Caveat: a cold model answers 503 "loading" for the
//                        first ~20s, which is handled below.
//   REPLICATE_API_TOKEN  Replicate — same open models, paid but reliable and
//                        without cold starts. Async: create a prediction, poll.
//   POLLINATIONS_API_KEY Pollinations — Flux/Z-Image/Seedream stills and
//                        Wan/Veo/Seedance clips, billed per Pollen. Requires a
//                        key since it stopped being free; it originally shipped
//                        keyless here and went inert overnight when that ended.
//
// A NOTE ON "FREE", again: the MODELS are open-weight; the hosting is not
// free-forever. Pollinations was integrated here precisely because it needed no
// key, and it now returns 401 with the whole AI Art Director inert. The point of
// this layer is that the next such change costs one secret, not a rewrite.

export type ImageProviderName = "huggingface" | "replicate" | "pollinations" | "none";

export interface ImageProviderConfig {
  name: ImageProviderName;
  model: string;
  label: string;
}

const DEFAULTS: Record<Exclude<ImageProviderName, "none">, string> = {
  // Open-weight, and — the part that matters — actually served by the
  // `hf-inference` provider. FLUX.1-schnell is the more obvious pick but HF
  // routes it through nscale/together, not hf-inference, so asking for it on
  // this route 404s. Override with IMAGE_MODEL if you add another provider.
  huggingface: "stabilityai/stable-diffusion-3-medium-diffusers",
  replicate: "black-forest-labs/flux-schnell",
  // Pollinations model ids are bare names, not owner/name.
  pollinations: "flux",
};

/** The secret each provider is configured by, for the no-key check. */
const SECRETS: Record<Exclude<ImageProviderName, "none">, string> = {
  huggingface: "HUGGINGFACE_API_KEY",
  replicate: "REPLICATE_API_TOKEN",
  pollinations: "POLLINATIONS_API_KEY",
};

// api-inference.huggingface.co was retired — it no longer resolves in DNS at
// all, which is why the first deploy failed with a lookup error rather than an
// HTTP status. Inference Providers replaced it with a per-provider router.
const HF_ROUTER = "https://router.huggingface.co/hf-inference/models";

export function resolveImageProvider(): ImageProviderConfig {
  const env = (k: string) => Deno.env.get(k) || "";
  const override = env("IMAGE_MODEL");

  if (env("HUGGINGFACE_API_KEY")) {
    return { name: "huggingface", model: override || DEFAULTS.huggingface, label: "Hugging Face · SD3 Medium" };
  }
  if (env("REPLICATE_API_TOKEN")) {
    return { name: "replicate", model: override || DEFAULTS.replicate, label: "Replicate · FLUX schnell" };
  }
  if (env("POLLINATIONS_API_KEY")) {
    return { name: "pollinations", model: override || DEFAULTS.pollinations, label: "Pollinations · Flux Schnell" };
  }
  return { name: "none", model: "", label: "No image model configured" };
}

export interface ImageRequest {
  prompt: string;
  width: number;
  height: number;
  /** Same seed + prompt must yield the same image, so a re-render is stable. */
  seed?: number;
  /**
   * "hf:owner/name" or "replicate:owner/name" picks the provider explicitly;
   * a bare id uses whichever provider is configured. Lets the Studio's model
   * dropdown reach a provider the deployment has no default key for, as long
   * as the person supplies their own.
   */
  model?: string;
  /**
   * Caller-supplied key, used for this one request and never stored. Someone
   * can use their own paid account without the platform holding their
   * credentials — but it does transit this function, which the UI says plainly.
   */
  apiKey?: string;
  kind?: "image" | "video";
  /** Clip length in seconds; only sent for video requests. */
  duration?: number;
}

/** Split "hf:owner/name" into its provider and model id. */
export function parseModelRef(ref?: string): { provider?: Exclude<ImageProviderName, "none">; model?: string } {
  if (!ref) return {};
  const i = ref.indexOf(":");
  if (i === -1) return { model: ref };
  const prefix = ref.slice(0, i);
  const rest = ref.slice(i + 1);
  if (prefix === "hf" || prefix === "huggingface") return { provider: "huggingface", model: rest };
  if (prefix === "replicate") return { provider: "replicate", model: rest };
  if (prefix === "pol" || prefix === "pollinations") return { provider: "pollinations", model: rest };
  return { model: ref };
}

export interface ImageResult {
  /** data: URL — safe to draw on a canvas without tainting it. */
  dataUrl: string;
  provider: ImageProviderName;
  model: string;
}

export interface ImageFailure {
  ok: false;
  reason: "no_provider" | "rate_limited" | "auth" | "loading" | "error";
  status?: number;
  detail?: string;
}

export type ImageOutcome = ({ ok: true } & ImageResult) | ImageFailure;

function statusToReason(status: number): ImageFailure["reason"] {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  // Hugging Face answers 503 while a cold model spins up. That is "try again in
  // a moment", not a failure, and the caller shows it differently.
  if (status === 503) return "loading";
  return "error";
}

function toDataUrl(bytes: Uint8Array, contentType: string): string {
  // btoa needs a binary string; chunked so a large image can't blow the stack
  // through String.fromCharCode(...spread).
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

// --- Hugging Face -----------------------------------------------------------

async function runHuggingFace(cfg: ImageProviderConfig, req: ImageRequest): Promise<ImageOutcome> {
  const res = await fetch(`${HF_ROUTER}/${cfg.model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey || Deno.env.get("HUGGINGFACE_API_KEY")}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({
      inputs: req.prompt,
      parameters: { width: req.width, height: req.height, num_inference_steps: 4, seed: req.seed },
      options: { wait_for_model: true },
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return { ok: false, reason: statusToReason(res.status), status: res.status, detail };
  }

  const contentType = res.headers.get("content-type") || "image/png";
  // An error can still arrive with 200 and a JSON body rather than an image.
  if (contentType.includes("application/json")) {
    return { ok: false, reason: "error", status: 200, detail: (await res.text()).slice(0, 300) };
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) return { ok: false, reason: "error", detail: "Empty image body." };

  return { ok: true, dataUrl: toDataUrl(bytes, contentType), provider: cfg.name, model: cfg.model };
}

// --- Replicate --------------------------------------------------------------

const REPLICATE_POLL_MS = 1500;
// Images land in seconds; a video model routinely takes one to three minutes,
// so a single ceiling would either truncate clips or stall stills for no reason.
const REPLICATE_MAX_POLLS_IMAGE = 40;   // ~60s
const REPLICATE_MAX_POLLS_VIDEO = 160;  // ~4min

async function runReplicate(cfg: ImageProviderConfig, req: ImageRequest): Promise<ImageOutcome> {
  const token = req.apiKey || Deno.env.get("REPLICATE_API_TOKEN");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const create = await fetch(`https://api.replicate.com/v1/models/${cfg.model}/predictions`, {
    method: "POST",
    headers: { ...headers, Prefer: "wait" },
    body: JSON.stringify({
      // Video models reject the still-image inputs (num_outputs/output_format),
      // so only the parameters both kinds understand are sent for a clip.
      input: req.kind === "video"
        ? { prompt: req.prompt, seed: req.seed }
        : {
            prompt: req.prompt,
            width: req.width,
            height: req.height,
            seed: req.seed,
            num_outputs: 1,
            output_format: "png",
          },
    }),
  });

  if (!create.ok) {
    const detail = (await create.text()).slice(0, 300);
    return { ok: false, reason: statusToReason(create.status), status: create.status, detail };
  }

  let prediction = await create.json();

  // `Prefer: wait` usually returns a finished prediction, but not always.
  const maxPolls = req.kind === "video" ? REPLICATE_MAX_POLLS_VIDEO : REPLICATE_MAX_POLLS_IMAGE;
  for (let i = 0; i < maxPolls && (prediction.status === "starting" || prediction.status === "processing"); i++) {
    await new Promise((r) => setTimeout(r, REPLICATE_POLL_MS));
    const poll = await fetch(prediction.urls?.get, { headers });
    if (!poll.ok) return { ok: false, reason: statusToReason(poll.status), status: poll.status };
    prediction = await poll.json();
  }

  if (prediction.status !== "succeeded") {
    return { ok: false, reason: "error", detail: String(prediction.error || prediction.status).slice(0, 300) };
  }

  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!url) return { ok: false, reason: "error", detail: "Prediction returned no output." };

  // Fetch server-side and inline it: the browser then needs no access to
  // replicate.delivery, so the CSP stays unchanged and the canvas stays clean.
  const img = await fetch(url);
  if (!img.ok) return { ok: false, reason: "error", status: img.status, detail: "Could not download the result." };
  const bytes = new Uint8Array(await img.arrayBuffer());

  return {
    ok: true,
    dataUrl: toDataUrl(bytes, img.headers.get("content-type") || "image/png"),
    provider: cfg.name,
    model: cfg.model,
  };
}

// --- Pollinations ----------------------------------------------------------

const POLLINATIONS_BASE = "https://gen.pollinations.ai";

/** Map requested pixels to Pollinations' aspectRatio names for clips. */
function pollinationsAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  if (ratio >= 1.4) return "16:9";
  if (ratio <= 0.7) return "9:16";
  return "1:1";
}

async function runPollinations(cfg: ImageProviderConfig, req: ImageRequest): Promise<ImageOutcome> {
  const key = req.apiKey || Deno.env.get("POLLINATIONS_API_KEY");
  const video = req.kind === "video";

  const params = new URLSearchParams({ model: cfg.model });
  if (video) {
    if (req.duration) params.set("duration", String(Math.max(2, Math.min(12, Math.round(req.duration)))));
    params.set("aspectRatio", pollinationsAspectRatio(req.width, req.height));
  } else {
    params.set("width", String(req.width));
    params.set("height", String(req.height));
  }
  if (req.seed !== undefined) params.set("seed", String(req.seed >>> 0));

  const url = `${POLLINATIONS_BASE}/${video ? "video" : "image"}/${encodeURIComponent(req.prompt)}?${params.toString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    return { ok: false, reason: statusToReason(res.status), status: res.status, detail };
  }

  const contentType = res.headers.get("content-type") || (video ? "video/mp4" : "image/png");
  // An error can still arrive with 200 and a JSON body rather than media.
  if (contentType.includes("application/json")) {
    return { ok: false, reason: "error", status: 200, detail: (await res.text()).slice(0, 300) };
  }

  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) return { ok: false, reason: "error", detail: "Empty media body." };

  return { ok: true, dataUrl: toDataUrl(bytes, contentType), provider: cfg.name, model: cfg.model };
}

// --- entry point ------------------------------------------------------------

export async function generateImage(req: ImageRequest): Promise<ImageOutcome> {
  const { provider, model } = parseModelRef(req.model);

  // A caller-supplied key can reach a provider this deployment has no key for,
  // so the chosen provider wins over the configured one.
  let cfg: ImageProviderConfig;
  if (provider) {
    cfg = { name: provider, model: model || DEFAULTS[provider], label: provider };
    if (!req.apiKey && !Deno.env.get(SECRETS[provider])) {
      return { ok: false, reason: "no_provider" };
    }
  } else {
    cfg = resolveImageProvider();
    if (cfg.name === "none") return { ok: false, reason: "no_provider" };
    if (model) cfg = { ...cfg, model };
  }

  // Only Replicate and Pollinations run video models; HF's image route cannot
  // produce a clip.
  if (req.kind === "video" && cfg.name !== "replicate" && cfg.name !== "pollinations") {
    return {
      ok: false,
      reason: "error",
      detail: "Video generation needs a Replicate or Pollinations model (replicate:owner/name or pollinations:model).",
    };
  }

  try {
    if (cfg.name === "huggingface") return await runHuggingFace(cfg, req);
    if (cfg.name === "replicate") return await runReplicate(cfg, req);
    return await runPollinations(cfg, req);
  } catch (e) {
    console.error("Image generation threw:", e);
    return { ok: false, reason: "error", detail: String(e).slice(0, 300) };
  }
}
