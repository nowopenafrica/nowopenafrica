// OpenAI Code Center — client gateway.
//
// Talks to the same-origin /sb-fn proxy (Vite in dev, Vercel rewrite in prod)
// which forwards to the platform's /functions/v1/ai-command. Same-origin means
// the browser never runs a CORS preflight or cross-origin check, so the call
// behaves identically in local dev and production. The server owns the
// contract (see supabase/functions/ai-command/index.ts); this file just rides
// the proxy and turns failures into readable errors. No business logic lives
// here — routing and planning are in router.ts.

import { supabase } from '../supabase';
import type { SessionSummary, ToolCallLedger, ApprovalSummary, TaskSummary } from './types';

export const FUNCTIONS_BASE = '/sb-fn';

export interface AiRunResult {
  ok: boolean;
  tool: string;
  risk: string;
  readOnly: boolean;
  status: 'executed' | 'failed';
  result: unknown;
  error: string | null;
  durationMs: number;
}

export interface AiLlmResult {
  ok: boolean;
  text: string | null;
  provider: string | null;
  model: string | null;
  reason: string | null;
  durationMs: number;
}

export interface SessionDetail {
  session: SessionSummary;
  autonomy_level: number;
  messages: Array<{ id: string; session_id: string; role: string; agent: string | null; content: Record<string, unknown>; created_at: string }>;
  tool_calls: ToolCallLedger[];
  approvals: ApprovalSummary[];
}

interface SdkError {
  name?: string;
  message?: string;
  context?: { status?: number; url?: string };
  statusCode?: number;
}

export function formatInvokeError(error: unknown): string {
  const e = error as SdkError | null;
  const name = e && typeof e.name === 'string' && e.name !== 'Error' ? e.name : 'FunctionsError';
  const status = e?.context?.status ?? e?.statusCode;
  const detail = status ? ` (HTTP ${status})` : '';
  const message = e?.message || 'OpenAI Code Center call failed.';
  return `${name}${detail}: ${message}`;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const headers = await authHeaders();
  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_BASE}/ai-command`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      formatInvokeError({
        name: 'FunctionsFetchError',
        message: 'Failed to send a request to the Edge Function',
        context: { status: 0 },
      }),
    );
  }
  if (!response.ok) {
    let bodyText = '';
    try {
      bodyText = (await response.text()).slice(0, 300);
    } catch {
      // body is best-effort detail
    }
    throw new Error(
      formatInvokeError({
        name: 'FunctionsHttpError',
        message: `Edge Function returned a non-2xx status code${bodyText ? `: ${bodyText}` : ''}`,
        context: { status: response.status, url: response.url },
      }),
    );
  }
  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch {
    throw new Error('OpenAI Code Center returned an unreadable response.');
  }
  if (!envelope || typeof envelope !== 'object' || (envelope as { ok?: boolean }).ok !== true) {
    throw new Error((envelope as { error?: string })?.error ?? 'OpenAI Code Center returned an error.');
  }
  return envelope as T;
}

// --- tools + llm ------------------------------------------------------------

/** Same-origin headers: the anon key always, the staff JWT when we have one. */
async function authHeaders(): Promise<Record<string, string>> {
  const authHeader: Record<string, string> = {};
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) authHeader.Authorization = `Bearer ${token}`;
  } catch {
    // session read is best-effort; the request still goes out unauthenticated
  }
  return {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    ...authHeader,
  };
}

export function aiRunTool(body: { sessionId?: string; toolName: string; args?: Record<string, unknown> }): Promise<AiRunResult> {
  return invoke<AiRunResult>({ action: 'run', ...body });
}

export function aiLlm(body: { sessionId?: string; agent?: string; system: string; turns: { role: 'user' | 'assistant'; content: string }[]; model?: string }): Promise<AiLlmResult> {
  return invoke<AiLlmResult>({ action: 'llm', ...body });
}

// --- sessions ---------------------------------------------------------------

export function aiSessionsList(): Promise<{ autonomy_level: number; sessions: SessionSummary[] }> {
  return invoke<{ autonomy_level: number; sessions: SessionSummary[] }>({ action: 'session.list' });
}

export function aiSessionCreate(title?: string): Promise<{ session: { id: string; title: string; autonomy_level: number } }> {
  return invoke({ action: 'session.create', title });
}

export function aiSessionGet(sessionId: string): Promise<SessionDetail> {
  return invoke<SessionDetail>({ action: 'session.get', sessionId });
}

export function aiSessionArchive(sessionId: string): Promise<{ ok: true }> {
  return invoke<{ ok: true }>({ action: 'session.archive', sessionId });
}

export function aiSessionDelete(sessionId: string): Promise<{ ok: true }> {
  return invoke<{ ok: true }>({ action: 'session.delete', sessionId });
}

export function aiSessionAppend(sessionId: string, role: 'user' | 'step' | 'system', content: Record<string, unknown>, agent?: string): Promise<{ message: { id: string; role: string; created_at: string } }> {
  return invoke<{ message: { id: string; role: string; created_at: string } }>({ action: 'session.append', sessionId, role, content, ...(agent ? { agent } : {}) });
}

// --- opencode engine --------------------------------------------------------
//
// engine="opencode" sessions are brokered by the edge function: it creates and
// links the upstream session, forwards each prompt (re-injecting a fresh system
// brief with a current staff JWT), mirrors the reply + tool steps into the
// NowOpen stream, and can pipe the server's SSE events back to the browser.

export interface OpenCodeCreateResult {
  ok: true;
  session: { id: string; title: string; engine: string; opencode_session_id: string | null };
  opencodeSessionId: string;
  model: string;
  system: string;
}

export interface OpenCodeRunResult {
  ok: true;
  text: string;
  model: string;
  durationMs: number;
  /** OpenCode message parts (text/tool steps) as returned by the server. */
  parts: Array<{ type?: string; text?: string; tool?: string }>;
}

export function aiOpenCodeCreate(title?: string, model?: string): Promise<OpenCodeCreateResult> {
  return invoke<OpenCodeCreateResult>({ action: 'opencode.create', title, model });
}

export function aiOpenCodeRun(sessionId: string, text: string, model?: string): Promise<OpenCodeRunResult> {
  return invoke<OpenCodeRunResult>({ action: 'opencode.run', sessionId, text, model });
}

/**
 * One OpenCode stream event passed from the edge function's SSE pipe.
 *
 * The edge function passes the server's `/event` body through untouched, so
 * shapes here mirror opencode's wire format: `sessionID` scopes events to the
 * session that produced them, and `message.part.updated` carries the part in
 * flux (streaming text where `part.text` is the text accumulated so far, tool
 * parts where `part.tool` is the bridge tool name).
 */
export interface OpenCodeStreamPart {
  id?: string;
  type?: string;
  text?: string;
  state?: string;
  tool?: string;
  input?: unknown;
}

export interface OpenCodeStreamEvent {
  type: string;
  sessionID?: string;
  messageID?: string;
  part?: OpenCodeStreamPart;
  info?: { modelID?: string; state?: string; time?: { created: number; completed?: number }; tokens?: { input?: number; output?: number } };
}

/**
 * Open the server's SSE event pipe through the same-origin proxy. The edge
 * function streams the opencode `/event` stream body straight back, so the
 * browser reads raw `data:` JSON lines without any cross-origin request.
 * Resolution is streaming-safe: abort via `signal` (pass an AbortController).
 */
export async function aiOpenCodeStream(
  sessionId: string,
  onEvent: (event: OpenCodeStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${FUNCTIONS_BASE}/ai-command`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ action: 'opencode.stream', sessionId }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(
      formatInvokeError({
        name: 'FunctionsHttpError',
        message: `OpenCode stream failed (HTTP ${response.status})`,
        context: { status: response.status },
      }),
    );
  }
  const stream = response.body;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf('\n\n');
    while (sep >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const parsed = JSON.parse(payload) as Omit<OpenCodeStreamEvent, 'type'> & { type?: string };
          onEvent({ type: parsed?.type ?? 'message', ...parsed });
        } catch {
          onEvent({ type: 'message' });
        }
      }
      sep = buffer.indexOf('\n\n');
    }
  }
}

// --- approvals --------------------------------------------------------------

export function aiApprovalsList(): Promise<{ autonomy_level: number; approvals: ApprovalSummary[] }> {
  return invoke({ action: 'approval.list' });
}

export function aiApprovalRequest(body: { sessionId?: string; toolName: string; args: Record<string, unknown>; reason: Record<string, unknown> }): Promise<{ approval: ApprovalSummary; note?: string }> {
  return invoke<{ approval: ApprovalSummary; note?: string }>({ action: 'approval.request', ...body });
}

// --- tasks ------------------------------------------------------------------

export function aiTaskCreate(body: { sessionId?: string; task: string; agent?: string; priority?: number }): Promise<{ task: TaskSummary }> {
  return invoke<{ task: TaskSummary }>({ action: 'task.create', ...body });
}

export function aiTaskList(): Promise<{ tasks: TaskSummary[] }> {
  return invoke<{ tasks: TaskSummary[] }>({ action: 'task.list' });
}