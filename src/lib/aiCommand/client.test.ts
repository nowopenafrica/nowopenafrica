import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aiSessionsList, aiSessionDelete, aiOpenCodeCreate, aiOpenCodeRun, aiOpenCodeStream, aiLlm, FUNCTIONS_BASE,
} from './client';

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok123' } },
        error: null,
      }),
    },
  },
}));

describe('aiCommand client same-origin invoke', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('calls the same-origin /sb-fn proxy with Authorization and apikey headers', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init: init as RequestInit });
      return new Response(JSON.stringify({ ok: true, autonomy_level: 1, sessions: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await aiSessionsList();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${FUNCTIONS_BASE}/ai-command`);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok123');
    expect(headers.apikey).toBeTruthy();
    expect(calls[0].init.method).toBe('POST');
  });

  it('rejects with a FunctionsHttpError line that echoes the body when the gateway returns non-2xx', async () => {
    globalThis.fetch = vi.fn(async () => new Response('denied', { status: 403 })) as unknown as typeof fetch;

    await expect(aiSessionsList()).rejects.toThrow('FunctionsHttpError (HTTP 403): Edge Function returned a non-2xx status code: denied');
  });

  it('rejects with the FunctionsFetchError transport wording when the network fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    await expect(aiSessionsList()).rejects.toThrow('FunctionsFetchError: Failed to send a request to the Edge Function');
  });

  it('aiSessionDelete posts action session.delete for the given session', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init: init as RequestInit });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    await aiSessionDelete('sess-1');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${FUNCTIONS_BASE}/ai-command`);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ action: 'session.delete', sessionId: 'sess-1' });
  });

  it('aiOpenCodeCreate posts action opencode.create with title and model', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init: init as RequestInit });
      return new Response(JSON.stringify({
        ok: true,
        session: { id: 's1', title: 'T', engine: 'opencode', opencode_session_id: 'oc1' },
        opencodeSessionId: 'oc1',
        model: 'opencode/big-pickle',
        system: 'You are the NowOpen OpenAI Code Center…',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    const res = await aiOpenCodeCreate('Check the health', 'opencode/big-pickle');

    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      action: 'opencode.create', title: 'Check the health', model: 'opencode/big-pickle',
    });
    expect(res.opencodeSessionId).toBe('oc1');
    expect(res.session.engine).toBe('opencode');
  });

  it('aiOpenCodeRun posts action opencode.run with session, text and model', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init: init as RequestInit });
      return new Response(JSON.stringify({
        ok: true, text: 'Claims look healthy.', model: 'opencode/big-pickle', durationMs: 42, parts: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    const res = await aiOpenCodeRun('s2', 'Why are claims stuck?', 'opencode/big-pickle');

    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      action: 'opencode.run', sessionId: 's2', text: 'Why are claims stuck?', model: 'opencode/big-pickle',
    });
    expect(res.text).toBe('Claims look healthy.');
  });

  it('aiLlm forwards the picked engine model in the action llm payload', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init: init as RequestInit });
      return new Response(JSON.stringify({
        ok: true, text: 'Healthy.', provider: 'zen', model: 'opencode/big-pickle', durationMs: 9,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    await aiLlm({
      sessionId: 's9', agent: 'Claims', system: 'You are the NowOpen OpenAI Code Center…',
      turns: [{ role: 'user', content: 'check claims' }], model: 'opencode/big-pickle',
    });

    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      action: 'llm', sessionId: 's9', agent: 'Claims', system: 'You are the NowOpen OpenAI Code Center…',
      turns: [{ role: 'user', content: 'check claims' }], model: 'opencode/big-pickle',
    });
  });

  it('aiLlm omits the model key when the engine default should apply', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      calls.push({ url: String(input), init: init as RequestInit });
      return new Response(JSON.stringify({
        ok: true, text: 'Healthy.', provider: 'groq', model: 'openai/gpt-oss-120b', durationMs: 9,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;

    await aiLlm({ agent: 'Claims', system: 'You…', turns: [], });

    expect(JSON.parse(String(calls[0].init.body))).toEqual({ action: 'llm', agent: 'Claims', system: 'You…', turns: [] });
    expect(JSON.parse(String(calls[0].init.body))).not.toHaveProperty('model');
  });

  it('aiOpenCodeStream parses SSE data lines into event types through the same-origin proxy', async () => {
    const reqs: Array<{ url: string; init: RequestInit }> = [];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode('data: {"type":"step-start"}\n\n'));
        controller.enqueue(enc.encode('comment: hi\ndata: {"type":"tool","tool":"nowopen"}\n\n'));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn(async (input, init) => {
      reqs.push({ url: String(input), init: init as RequestInit });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }) as unknown as typeof fetch;

    const events: string[] = [];
    await aiOpenCodeStream('s3', (e) => events.push(e.type));

    expect(reqs).toHaveLength(1);
    expect(JSON.parse(String(reqs[0].init.body))).toEqual({ action: 'opencode.stream', sessionId: 's3' });
    expect(events).toEqual(['step-start', 'tool']);
  });

  it('aiOpenCodeStream delivers live part/info payloads for text and tool chips', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode(
          'data: {"type":"message.part.updated","sessionID":"s4","messageID":"m1","part":{"id":"p1","type":"text","text":"Claims are ","state":"streaming"}}\n\n',
        ));
        controller.enqueue(enc.encode(
          'data: {"type":"message.part.updated","sessionID":"s4","messageID":"m1","part":{"id":"p2","type":"tool","tool":"nowopen","state":"completed"}}\n\n',
        ));
        controller.enqueue(enc.encode(
          'data: {"type":"message.updated","sessionID":"s4","messageID":"m1","info":{"modelID":"opencode/north-mini-code-free","state":"completed","tokens":{"input":10,"output":4}}}\n\n',
        ));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as unknown as typeof fetch;

    const events: Array<{
      type: string;
      part?: { type?: string; text?: string; state?: string; tool?: string };
      info?: { modelID?: string };
    }> = [];
    await aiOpenCodeStream('s4', (e) => events.push(e));

    expect(events).toHaveLength(3);
    expect(events[0].part?.text).toBe('Claims are ');
    expect(events[0].part?.state).toBe('streaming');
    expect(events[1].part?.type).toBe('tool');
    expect(events[1].part?.tool).toBe('nowopen');
    expect(events[2].info?.modelID).toBe('opencode/north-mini-code-free');
  });
});