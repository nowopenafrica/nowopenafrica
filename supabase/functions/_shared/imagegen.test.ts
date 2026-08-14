import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveImageProvider, generateImage, parseModelRef } from './imagegen';

// Runs under Vitest with Deno.env and fetch stubbed, same as llm.test.ts.
// The two provider shapes are completely different — Hugging Face returns image
// bytes from one call, Replicate creates a prediction and polls — so both paths
// need pinning independently.

let env: Record<string, string> = {};

beforeEach(() => {
  env = {};
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
});

afterEach(() => {
  delete (globalThis as any).Deno;
  vi.unstubAllGlobals();
});

const REQ = { prompt: 'a jollof rice close-up', width: 512, height: 512, seed: 7 };

/** A tiny PNG-ish body; only the bytes matter, not that it decodes. */
const pngBytes = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe('resolveImageProvider', () => {
  it('reports "none" when no key is set', () => {
    expect(resolveImageProvider().name).toBe('none');
  });

  it('prefers Hugging Face (free tier) over Replicate (paid)', () => {
    env = { REPLICATE_API_TOKEN: 'r' };
    expect(resolveImageProvider().name).toBe('replicate');

    env = { REPLICATE_API_TOKEN: 'r', HUGGINGFACE_API_KEY: 'h' };
    expect(resolveImageProvider().name).toBe('huggingface');
  });

  it('defaults to an open-weight model, overridable per deployment', () => {
    env = { HUGGINGFACE_API_KEY: 'h' };
    expect(resolveImageProvider().model).toBe('stabilityai/stable-diffusion-3-medium-diffusers');

    env = { HUGGINGFACE_API_KEY: 'h', IMAGE_MODEL: 'stabilityai/sdxl-turbo' };
    expect(resolveImageProvider().model).toBe('stabilityai/sdxl-turbo');
  });
});

describe('generateImage — no provider', () => {
  it('names the reason instead of throwing', async () => {
    expect(await generateImage(REQ)).toEqual({ ok: false, reason: 'no_provider' });
  });
});

describe('parseModelRef', () => {
  it('reads the provider prefix so the model dropdown can target any host', () => {
    expect(parseModelRef('hf:stabilityai/sdxl-turbo')).toEqual({ provider: 'huggingface', model: 'stabilityai/sdxl-turbo' });
    expect(parseModelRef('replicate:black-forest-labs/flux-dev')).toEqual({ provider: 'replicate', model: 'black-forest-labs/flux-dev' });
    expect(parseModelRef('pollinations:flux')).toEqual({ provider: 'pollinations', model: 'flux' });
  });

  it('leaves a bare id to whichever provider is configured', () => {
    expect(parseModelRef('stabilityai/sdxl-turbo')).toEqual({ model: 'stabilityai/sdxl-turbo' });
    expect(parseModelRef(undefined)).toEqual({});
  });

  it('does not mistake a URL for a provider prefix', () => {
    expect(parseModelRef('https://example.com/m')).toEqual({ model: 'https://example.com/m' });
  });
});

describe('generateImage — model and key overrides', () => {
  it('lets a personal key reach a provider the deployment has no key for', async () => {
    env = {}; // nothing configured on the server at all
    const fetchMock = vi.fn(async () => ({
      ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => pngBytes().buffer,
    }) as any);
    vi.stubGlobal('fetch', fetchMock);

    const out = await generateImage({ ...REQ, model: 'hf:stabilityai/sdxl-turbo', apiKey: 'hf_personal' });
    expect(out.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain('stabilityai/sdxl-turbo');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer hf_personal');
  });

  it('refuses rather than calling out with no credential at all', async () => {
    env = {};
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await generateImage({ ...REQ, model: 'replicate:owner/m' })).toEqual({ ok: false, reason: 'no_provider' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects video on Hugging Face instead of returning a still that claims to be a clip', async () => {
    env = { HUGGINGFACE_API_KEY: 'h' };
    expect(await generateImage({ ...REQ, kind: 'video' })).toMatchObject({ ok: false, reason: 'error' });
  });

  it('omits image-only inputs when asking Replicate for a clip', async () => {
    env = { REPLICATE_API_TOKEN: 'r' };
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/predictions') && !String(url).includes('/v1/predictions/')) {
        return { ok: true, json: async () => ({ status: 'succeeded', output: ['https://replicate.delivery/o.mp4'] }) } as any;
      }
      return { ok: true, headers: { get: () => 'video/mp4' }, arrayBuffer: async () => pngBytes().buffer } as any;
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await generateImage({ ...REQ, model: 'replicate:owner/t2v', kind: 'video' });
    expect(out.ok).toBe(true);
    const input = JSON.parse(fetchMock.mock.calls[0][1].body).input;
    expect(input).toEqual({ prompt: REQ.prompt, seed: REQ.seed });
    expect(input).not.toHaveProperty('num_outputs');
  }, 20_000);
});

describe('generateImage — Hugging Face', () => {
  it('returns a data URL the canvas can draw without tainting', async () => {
    env = { HUGGINGFACE_API_KEY: 'h' };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => pngBytes().buffer,
    }) as any);
    vi.stubGlobal('fetch', fetchMock);

    const out = await generateImage(REQ);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(out.provider).toBe('huggingface');

    // The seed must reach the model, or a re-render produces a different image.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.parameters).toMatchObject({ width: 512, height: 512, seed: 7 });

    // The old api-inference host was retired and no longer resolves in DNS, so
    // pin the router URL — a silent revert would fail with a lookup error that
    // reads nothing like "wrong endpoint".
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3-medium-diffusers',
    );
  });

  it('distinguishes a cold model (503) from a real failure', async () => {
    env = { HUGGINGFACE_API_KEY: 'h' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => 'loading' }) as any));
    expect(await generateImage(REQ)).toMatchObject({ ok: false, reason: 'loading', status: 503 });
  });

  it('treats a 200 JSON body as an error, not an image', async () => {
    // HF can answer 200 with {"error": ...}; writing that into a data: URL would
    // hand the renderer a "picture" that is really an error message.
    env = { HUGGINGFACE_API_KEY: 'h' };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => '{"error":"Model too busy"}',
    }) as any));
    expect(await generateImage(REQ)).toMatchObject({ ok: false, reason: 'error' });
  });

  it('reports auth separately so a bad key is actionable', async () => {
    env = { HUGGINGFACE_API_KEY: 'bad' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'invalid' }) as any));
    expect(await generateImage(REQ)).toMatchObject({ ok: false, reason: 'auth' });
  });
});

describe('generateImage — Replicate', () => {
  it('polls until the prediction succeeds, then inlines the result', async () => {
    env = { REPLICATE_API_TOKEN: 'r' };
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      call++;
      if (call === 1) {
        return { ok: true, json: async () => ({ status: 'processing', urls: { get: 'https://api.replicate.com/v1/predictions/x' } }) } as any;
      }
      if (String(url).includes('/v1/predictions/')) {
        return { ok: true, json: async () => ({ status: 'succeeded', output: ['https://replicate.delivery/out.png'] }) } as any;
      }
      // The image download, fetched server-side so the browser never touches
      // replicate.delivery and the CSP stays unchanged.
      return { ok: true, headers: { get: () => 'image/png' }, arrayBuffer: async () => pngBytes().buffer } as any;
    }));

    const out = await generateImage(REQ);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.provider).toBe('replicate');
    expect(out.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  }, 20_000);

  it('fails cleanly when the prediction does not succeed', async () => {
    env = { REPLICATE_API_TOKEN: 'r' };
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: 'failed', error: 'NSFW filter triggered' }),
    }) as any));

    expect(await generateImage(REQ)).toMatchObject({ ok: false, reason: 'error', detail: 'NSFW filter triggered' });
  });

  it('returns null-shaped failure rather than throwing when fetch dies', async () => {
    env = { REPLICATE_API_TOKEN: 'r' };
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await generateImage(REQ)).toMatchObject({ ok: false, reason: 'error' });
  });
});
