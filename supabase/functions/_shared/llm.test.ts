import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveProvider, resolveProviders, runAgent, type ToolDef } from './llm';

// This file runs under Vitest (Node), not Deno, so the two globals the module
// touches are stubbed: `Deno.env` and `fetch`. Everything else in llm.ts is
// plain TypeScript, which is the whole reason it's testable at all — the rest
// of the edge functions import from jsr: and can't run here.
//
// What's worth pinning down:
//  - provider precedence, since it decides which key wins on a deployment that
//    has more than one set;
//  - that the OpenAI-compatible and Anthropic paths BOTH complete a tool call,
//    because the two wire formats are entirely different and a regression in
//    either one silently degrades the assistant to search-only.

let env: Record<string, string> = {};

beforeEach(() => {
  env = {};
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
});

afterEach(() => {
  delete (globalThis as any).Deno;
  vi.unstubAllGlobals();
});

const TOOL: ToolDef = {
  name: 'search_platform',
  description: 'search',
  parameters: { type: 'object', properties: { query: { type: 'string' } } },
};

/** Queue up JSON responses, and record the request bodies that were sent. */
function stubFetch(payloads: unknown[]) {
  const bodies: any[] = [];
  const fn = vi.fn(async (_url: string, init: any) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => payloads.shift(), text: async () => '' } as any;
  });
  vi.stubGlobal('fetch', fn);
  return { bodies, fn };
}

describe('resolveProvider', () => {
  it('reports "none" when no key is set, so callers can degrade deliberately', () => {
    expect(resolveProvider().name).toBe('none');
  });

  it('prefers Groq, then OpenRouter, then Anthropic', () => {
    env = { ANTHROPIC_API_KEY: 'a' };
    expect(resolveProvider().name).toBe('anthropic');

    env = { ANTHROPIC_API_KEY: 'a', OPENROUTER_API_KEY: 'o' };
    expect(resolveProvider().name).toBe('openrouter');

    env = { ANTHROPIC_API_KEY: 'a', OPENROUTER_API_KEY: 'o', GROQ_API_KEY: 'g' };
    expect(resolveProvider().name).toBe('groq');
  });

  it('defaults to an open-weight model on Groq, overridable per deployment', () => {
    // Pinned to whatever DEFAULTS says rather than a literal: model ids get
    // retired. llama-3.3-70b-versatile was the default until Groq dropped it,
    // and a test asserting the literal would have gone green while the live
    // assistant 404'd on every call.
    env = { GROQ_API_KEY: 'g' };
    const groqDefault = resolveProvider().model;
    expect(groqDefault).toBeTruthy();
    expect(groqDefault).not.toBe('');

    env = { GROQ_API_KEY: 'g', ASSISTANT_MODEL: 'llama-3.1-8b-instant' };
    expect(resolveProvider().model).toBe('llama-3.1-8b-instant');
  });

  it('applies ASSISTANT_MODEL only to the first provider, since model ids are not portable', () => {
    env = { GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a', ASSISTANT_MODEL: 'llama-3.1-8b-instant' };
    const [first, second] = resolveProviders();
    expect(first.model).toBe('llama-3.1-8b-instant');
    expect(second.model).toBe('claude-opus-4-8');
  });
});

describe('runAgent', () => {
  it('names "no_provider" rather than throwing or inventing a reply', async () => {
    expect(await runAgent('sys', [{ role: 'user', content: 'hi' }], [TOOL], async () => ({}))).toEqual({ ok: false, reason: 'no_provider' });
  });

  it('completes a tool round-trip on an OpenAI-compatible provider', async () => {
    env = { GROQ_API_KEY: 'g' };
    const { bodies } = stubFetch([
      {
        choices: [{
          message: {
            role: 'assistant',
            tool_calls: [{ id: 'c1', function: { name: 'search_platform', arguments: '{"query":"jollof"}' } }],
          },
        }],
      },
      { choices: [{ message: { content: 'Found 2 spots.' } }] },
    ]);

    const runTool = vi.fn(async () => ({ result_count: 2 }));
    const out = await runAgent('sys', [{ role: 'user', content: 'jollof?' }], [TOOL], runTool);

    expect(runTool).toHaveBeenCalledWith('search_platform', { query: 'jollof' });
    expect(out).toMatchObject({ text: 'Found 2 spots.', provider: 'groq', usedTool: true });

    // The second call must carry the tool result back, or the model answers blind.
    const followUp = bodies[1].messages.at(-1);
    expect(followUp).toMatchObject({ role: 'tool', tool_call_id: 'c1' });
    expect(followUp.content).toContain('result_count');
  });

  // The bug this caught in production: a single round meant the turn could end
  // on a tool call with no prose, and the answer was silently lost.
  it('allows the model to search more than once before answering', async () => {
    env = { GROQ_API_KEY: 'g' };
    const toolCall = (id: string, q: string) => ({
      choices: [{ message: { tool_calls: [{ id, function: { name: 'search_platform', arguments: JSON.stringify({ query: q }) } }] } }],
    });
    stubFetch([
      toolCall('c1', 'What businesses are listed in Lagos?'),
      toolCall('c2', 'Lagos'),
      { choices: [{ message: { content: 'Three businesses in Lagos.' } }] },
    ]);

    const runTool = vi.fn(async (_n: string, a: any) => (a.query === 'Lagos' ? { result_count: 3 } : { result_count: 0 }));
    const out = await runAgent('sys', [{ role: 'user', content: 'lagos?' }], [TOOL], runTool);

    expect(runTool).toHaveBeenCalledTimes(2);
    expect(out?.text).toBe('Three businesses in Lagos.');
  });

  it('forces a written answer when the model keeps calling tools', async () => {
    env = { GROQ_API_KEY: 'g' };
    const toolCall = { choices: [{ message: { tool_calls: [{ id: 'c', function: { name: 'search_platform', arguments: '{}' } }] } }] };
    const { bodies } = stubFetch([
      toolCall, toolCall, toolCall,
      { choices: [{ message: { content: 'Here is what I found.' } }] },
    ]);

    const out = await runAgent('sys', [{ role: 'user', content: 'x' }], [TOOL], async () => ({ result_count: 1 }));

    expect(out?.text).toBe('Here is what I found.');
    // The final request must withhold the tools, or it just loops again.
    expect(bodies.at(-1)).not.toHaveProperty('tools');
  });

  // Groq rejects Llama's raw-text function calls with 400 tool_use_failed.
  // Seen in production on "How much is the Business Pro plan?".
  it('recovers from a host-rejected malformed tool call by answering without tools', async () => {
    env = { GROQ_API_KEY: 'g' };
    const bodies: any[] = [];
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      n++;
      if (n === 1) {
        return {
          ok: false,
          status: 400,
          text: async () => '{"error":{"code":"tool_use_failed","message":"tool call validation failed"}}',
        } as any;
      }
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Business Pro is ~$12/mo.' } }] }), text: async () => '' } as any;
    }));

    const out = await runAgent('sys', [{ role: 'user', content: 'plan price?' }], [TOOL], async () => ({}));

    expect(out).toMatchObject({ ok: true, text: 'Business Pro is ~$12/mo.' });
    expect(bodies[0]).toHaveProperty('tools');
    expect(bodies[1]).not.toHaveProperty('tools');
  });

  it('survives malformed tool arguments instead of failing the whole turn', async () => {
    env = { GROQ_API_KEY: 'g' };
    stubFetch([
      { choices: [{ message: { tool_calls: [{ id: 'c1', function: { name: 'search_platform', arguments: '{not json' } }] } }] },
      { choices: [{ message: { content: 'ok' } }] },
    ]);
    const runTool = vi.fn(async () => ({}));
    const out = await runAgent('sys', [{ role: 'user', content: 'x' }], [TOOL], runTool);
    expect(runTool).toHaveBeenCalledWith('search_platform', {});
    expect(out?.text).toBe('ok');
  });

  it('omits the tools keys entirely when there are none (translation path)', async () => {
    env = { GROQ_API_KEY: 'g' };
    const { bodies } = stubFetch([{ choices: [{ message: { content: 'Bonjour' } }] }]);
    const out = await runAgent('translate', [{ role: 'user', content: 'Hello' }], [], undefined, { maxTokens: 300 });
    expect(out?.text).toBe('Bonjour');
    expect(bodies[0]).not.toHaveProperty('tools');
    expect(bodies[0]).not.toHaveProperty('tool_choice');
    expect(bodies[0].max_tokens).toBe(300);
  });

  it('completes a tool round-trip on Anthropic, whose wire format differs', async () => {
    env = { ANTHROPIC_API_KEY: 'a' };
    const { bodies } = stubFetch([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu1', name: 'search_platform', input: { query: 'salon' } }],
      },
      { content: [{ type: 'text', text: 'Two salons.' }] },
    ]);

    const runTool = vi.fn(async () => ({ result_count: 2 }));
    const out = await runAgent('sys', [{ role: 'user', content: 'salon?' }], [TOOL], runTool);

    expect(runTool).toHaveBeenCalledWith('search_platform', { query: 'salon' });
    expect(out).toMatchObject({ text: 'Two salons.', provider: 'anthropic', usedTool: true });
    // Anthropic names the schema field `input_schema`, not `parameters`.
    expect(bodies[0].tools[0]).toHaveProperty('input_schema');
    expect(bodies[1].messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu1' });
  });

  // Free tiers meter per minute and one turn is several upstream calls, so 429
  // is a normal event, not an exceptional one.
  it('retries once through a rate limit instead of degrading', async () => {
    env = { GROQ_API_KEY: 'g' };
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return { ok: false, status: 429, headers: { get: () => '0' }, text: async () => 'rate limited' } as any;
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Answered.' } }] }), text: async () => '' } as any;
    }));

    const out = await runAgent('sys', [{ role: 'user', content: 'x' }], [], undefined);
    expect(out?.text).toBe('Answered.');
    expect(calls).toBe(2);
  }, 10_000);

  it('gives up after one retry rather than holding the request open', async () => {
    env = { GROQ_API_KEY: 'g' };
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, headers: { get: () => '0' }, text: async () => 'rate limited' }) as any);
    vi.stubGlobal('fetch', fetchMock);

    expect(await runAgent('sys', [{ role: 'user', content: 'x' }], [], undefined)).toMatchObject({ ok: false, reason: 'rate_limited' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('returns null on an API error so the caller falls back', async () => {
    env = { GROQ_API_KEY: 'g' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'bad key' }) as any));
    expect(await runAgent('sys', [{ role: 'user', content: 'x' }], [TOOL], async () => ({}))).toMatchObject({ ok: false, reason: 'auth', status: 401 });
  });

  it('returns null when fetch throws, rather than propagating', async () => {
    env = { GROQ_API_KEY: 'g' };
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await runAgent('sys', [{ role: 'user', content: 'x' }], [TOOL], async () => ({}))).toMatchObject({ ok: false, reason: 'error' });
  });

  // The case that actually bit this deployment: a revoked Groq key sat in front
  // of a working Anthropic key and took the whole assistant down with it.
  it('falls through to the next provider when the first key is dead', async () => {
    env = { GROQ_API_KEY: 'revoked', ANTHROPIC_API_KEY: 'a' };
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('groq.com')) {
        return { ok: false, status: 401, text: async () => 'Invalid API Key' } as any;
      }
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Answered anyway.' }] }), text: async () => '' } as any;
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await runAgent('sys', [{ role: 'user', content: 'x' }], [TOOL], async () => ({}));
    expect(out).toMatchObject({ text: 'Answered anyway.', provider: 'anthropic' });
  });

  // Diagnostics must point at the provider the deployment actually relies on.
  // A stale fallback key failing afterwards must not rewrite the explanation.
  it('reports the first provider\'s failure, not the last', async () => {
    env = { GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'stale' };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('groq.com')
      ? { ok: false, status: 429, headers: { get: () => '0' }, text: async () => 'rate limited' }
      : { ok: false, status: 401, text: async () => 'invalid key' }) as any));

    expect(await runAgent('sys', [{ role: 'user', content: 'x' }], [TOOL], async () => ({})))
      .toMatchObject({ ok: false, reason: 'rate_limited' });
  }, 10_000);

  it('returns null only when every configured provider fails', async () => {
    env = { GROQ_API_KEY: 'bad', ANTHROPIC_API_KEY: 'alsobad' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'nope' }) as any));
    expect(await runAgent('sys', [{ role: 'user', content: 'x' }], [TOOL], async () => ({}))).toMatchObject({ ok: false, reason: 'auth' });
  });

  it('treats an empty answer as a failure and tries the next provider', async () => {
    env = { GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes('groq.com')
        ? { choices: [{ message: { content: '   ' } }] }
        : { content: [{ type: 'text', text: 'Real answer.' }] }),
      text: async () => '',
    }) as any));

    const out = await runAgent('sys', [{ role: 'user', content: 'x' }], [TOOL], async () => ({}));
    expect(out).toMatchObject({ text: 'Real answer.', provider: 'anthropic' });
  });
});
