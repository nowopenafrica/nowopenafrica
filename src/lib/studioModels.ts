// Model catalogue + client for Creative Studio's generate panel.
//
// The request always goes to the `generate-image` edge function, never to a
// provider directly — so the platform's key stays a Supabase secret and no
// provider host has to be added to the CSP.
//
// BRING-YOUR-OWN KEY: someone can pick a model this deployment has no key for
// and supply their own. That key is held in this tab's memory only. It is not
// written to localStorage, because unlike a Pexels search key these unlock paid
// generation, and a key sitting in web storage outlives the intent to use it.
// It does pass through our edge function to reach the provider, which the panel
// says out loud — anything else would be a lie of omission.

export type GenerateKind = 'image' | 'video';

export interface StudioModel {
  /** "hf:owner/name" or "replicate:owner/name" — the provider prefix is parsed server-side. */
  id: string;
  label: string;
  kind: GenerateKind;
  /**
   * What it costs to CALL, not what the weights cost.
   *
   * 'free'  — a real free allowance, no card. Only Workers AI today.
   * 'free-tier' — open weights on a host with limited free credits that run
   *   out, and models that may be gated. Works, until it doesn't.
   * 'paid'  — billed per image.
   *
   * The old two-way split called every Hugging Face model "free", which is the
   * claim that leaves someone wondering why generation stopped working.
   */
  tier: 'free' | 'free-tier' | 'paid';
  /** Shown under the dropdown so the cost is never a surprise. */
  note: string;
  /** Which secret the platform would need for this to work without a personal key. */
  needs: 'CLOUDFLARE_API_TOKEN' | 'HUGGINGFACE_API_KEY' | 'REPLICATE_API_TOKEN';
}

// Kept deliberately short. A long list of ids that may or may not be live is
// worse than a few that are, plus the Custom option for anything else.
export const STUDIO_MODELS: StudioModel[] = [
  {
    id: 'cf:@cf/black-forest-labs/flux-1-schnell',
    label: 'FLUX.1 schnell',
    kind: 'image', tier: 'free',
    note: 'Free daily allowance, no card, no cold start. The best free option — the default.',
    needs: 'CLOUDFLARE_API_TOKEN',
  },
  {
    id: 'cf:@cf/stabilityai/stable-diffusion-xl-base-1.0',
    label: 'SDXL 1.0',
    kind: 'image', tier: 'free',
    note: 'Also on the free allowance. Softer than FLUX — good for backgrounds.',
    needs: 'CLOUDFLARE_API_TOKEN',
  },
  {
    id: 'hf:stabilityai/stable-diffusion-3-medium-diffusers',
    label: 'Stable Diffusion 3 Medium',
    kind: 'image', tier: 'free-tier',
    note: 'Open weights on Hugging Face credits. Good all-rounder; cold starts on first use.',
    needs: 'HUGGINGFACE_API_KEY',
  },
  {
    id: 'hf:stabilityai/sdxl-turbo',
    label: 'SDXL Turbo',
    kind: 'image', tier: 'free-tier',
    note: 'Fastest of the Hugging Face set. Lower detail, good for backgrounds.',
    needs: 'HUGGINGFACE_API_KEY',
  },
  {
    id: 'hf:black-forest-labs/FLUX.1-dev',
    label: 'FLUX.1 dev',
    kind: 'image', tier: 'free-tier',
    note: 'Highest quality on Hugging Face, and the slowest. Often gated — may need a licence accepted.',
    needs: 'HUGGINGFACE_API_KEY',
  },
  {
    id: 'replicate:black-forest-labs/flux-schnell',
    label: 'FLUX schnell',
    kind: 'image', tier: 'paid',
    note: 'About $0.003 an image. Fast, no cold start.',
    needs: 'REPLICATE_API_TOKEN',
  },
  {
    id: 'replicate:black-forest-labs/flux-dev',
    label: 'FLUX dev',
    kind: 'image', tier: 'paid',
    note: 'About $0.025 an image. The best quality here.',
    needs: 'REPLICATE_API_TOKEN',
  },
];

export const CUSTOM_MODEL_ID = '__custom__';

export interface GenerateRequest {
  prompt: string;
  width: number;
  height: number;
  seed?: number;
  model?: string;
  apiKey?: string;
  kind?: GenerateKind;
  signal?: AbortSignal;
}

export type GenerateReason = 'no_provider' | 'rate_limited' | 'auth' | 'loading' | 'error';

export type GenerateResult =
  | { ok: true; dataUrl: string; provider: string; model: string }
  | { ok: false; reason: GenerateReason; detail?: string };

export async function generateMedia(req: GenerateRequest): Promise<GenerateResult> {
  const { signal, ...body } = req;
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    const out = await res.json().catch(() => null);
    if (!out) return { ok: false, reason: 'error' };
    return out as GenerateResult;
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Plain-language explanation of a failure, for the panel. */
export function generateMessage(reason: GenerateReason, model: StudioModel | null, hasOwnKey: boolean): string {
  if (reason === 'no_provider') {
    const secret = model?.needs ?? 'an API key';
    return hasOwnKey
      ? 'That key was not accepted for this model. Check it matches the provider.'
      : `This model needs ${secret} on the server, or your own key below.`;
  }
  if (reason === 'auth') return 'The provider rejected the key. Check it and try again.';
  if (reason === 'rate_limited') return 'The provider is rate limiting right now — wait a moment and retry.';
  if (reason === 'loading') return 'The model is warming up (normal on the free tier after it has been idle). Try again in about a minute.';
  return 'Generation failed. Try a different model, or simplify the prompt.';
}

// --- provider status ---------------------------------------------------------

export interface ProviderStatus {
  /** True when the deployment has a model configured and generation can work. */
  ok: boolean;
  /** 'cloudflare' | 'huggingface' | 'replicate' | 'pollinations' | 'none' */
  provider: string;
  model: string | null;
  label: string;
}

/**
 * Ask the edge function whether a model is actually configured.
 *
 * The endpoint has existed since this layer was written and nothing called it,
 * so the only way to discover that no key was set was to write a prompt, wait,
 * and get designed graphics back. That silent fallback is the exact failure
 * this codebase calls "the Pollinations mistake" — the button appears to work
 * and quietly produces nothing.
 *
 * Never throws: an unreachable function is reported as "not configured", which
 * is what it means for the person looking at the panel.
 */
export async function fetchProviderStatus(signal?: AbortSignal): Promise<ProviderStatus> {
  const offline: ProviderStatus = {
    ok: false,
    provider: 'none',
    model: null,
    label: 'No image model configured',
  };
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      signal,
    });
    if (!res.ok) return offline;
    const body = await res.json().catch(() => null);
    if (!body || typeof body.ok !== 'boolean') return offline;
    return {
      ok: body.ok,
      provider: String(body.provider ?? 'none'),
      model: body.model ?? null,
      label: String(body.label ?? offline.label),
    };
  } catch {
    return offline;
  }
}

/** What to show beside the generate controls, given the provider status. */
export function providerStatusMessage(status: ProviderStatus): string {
  if (status.ok) return `Generating with ${status.label}.`;
  return 'No image model is connected, so generating will fall back to designed graphics. '
    + 'Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID for the free tier, or use your own key below.';
}
