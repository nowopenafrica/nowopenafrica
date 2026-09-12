// AI Command Center — the staff-only gateway between the Admin Creator and the
// intelligence engine.
//
// ONE function, dispatched on `action`. It does five things and nothing else:
//
//   1. Auth: a JWT from a staff member (admin or editor). Everything else is
//      denied. The whole function is dead code to anyone else.
//
//   2. Execute tools (action 'run'). Tool definitions and executors live in
//      _shared/aiTools.ts — the server is the authority, the client only
//      mirrors names for routing. Phase 1 is LEVEL 2 (PREPARE): executable
//      tools are read-only, and the executors run against the CALLING USER's
//      client so Postgres RLS scopes every result to what that staff member may
//      actually see. Every run is recorded in ai_tool_calls + the session
//      stream, and admin runs get a one-line audit_log entry.
//
//   3. Synthesise (action 'llm'): the provider-agnostic runAgent() from
//      _shared/llm.ts over evidence already gathered by tools. The model never
//      sees the database; it sees results and is asked to reason.
//
//   4. Session / approval / task persistence for the workspace UI.
//
//   5. Broker the OpenCode engine (actions 'opencode.*'): create/link an
//      upstream `opencode serve` session (engine="opencode" rows), forward
//      prompts, mirror replies + tool steps back into ai_messages, and pipe
//      the server's SSE stream to the browser. The OpenCode server runs NowOpen
//      work through .opencode/tools/nowopen.ts, which calls back into action
//      'run' with the staff JWT — RLS still fences everything.
//
// SECURITY MODEL: the worker client (service role) is used ONLY for the ai_*
// ledger rows and audit shadowing — never for tool data. Tools run with the
// user's own anon+JWT client, so an editor's `system_health` returns what an
// editor is allowed to see (nothing, for admin-only tables) rather than what a
// superuser could.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";
import { runAgent, type AgentTurn } from "../_shared/llm.ts";
import { AI_TOOL_BY_NAME, AUTONOMY_LEVEL, hashArgs, type AiToolDef } from "../_shared/aiTools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Apikey, X-Client-Info",
};

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// Service role for the ai_* LEDGER writes only (the audit trail must be
// complete even though audit_log itself is admin-writable). Never for reads.
const ledgers = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

// OpenCode engine — the hosted `opencode serve` that powers engine="opencode"
// sessions (deploy the opencode/ package in this repo and set the URL +
// password as edge function secrets). Until then opencode.* answers 503 and
// the UI stays on the built-in engine. The edge function is the ONLY holder of
// the server password; the browser never sees it.
const OPENCODE_URL = Deno.env.get("OPENCODE_SERVER_URL") ?? "";
const OPENCODE_USER = Deno.env.get("OPENCODE_SERVER_USERNAME") ?? "opencode";
const OPENCODE_PASS = Deno.env.get("OPENCODE_SERVER_PASSWORD") ?? "";
const opencodeReady = Boolean(OPENCODE_URL && OPENCODE_PASS);
const opencodeBasic = "Basic " + btoa(`${OPENCODE_USER}:${OPENCODE_PASS}`);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface StaffUser {
  id: string;
  email?: string;
  role: "staff" | "admin";
}

/** Resolve the JWT to a staff member, or null. Calls is_staff()/is_admin()
 *  as the calling user against the real policies. */
async function currentStaff(req: Request): Promise<StaffUser | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return null;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const { data: staff } = await client.rpc("is_staff");
  if (!staff) return null;
  const { data: admin } = await client.rpc("is_admin");
  return { id: data.user.id, email: data.user.email ?? undefined, role: admin ? "admin" : "staff" };
}

/** The client that executes read tools — scoped by the user's own RLS. */
function userClient(req: Request): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

const nonEmpty = (v: unknown, label: string): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

async function ensureOwnSession(db: SupabaseClient, sessionId: string, adminId: string): Promise<boolean> {
  const { data, error } = await ledgers
    .from("ai_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("admin_id", adminId)
    .maybeSingle();
  return !error && Boolean(data);
}

async function recordToolCall(params: {
  sessionId?: string;
  adminId: string;
  tool: AiToolDef;
  args: Record<string, unknown>;
  status: string;
  result?: unknown;
  error?: string;
  durationMs: number;
}) {
  const { sessionId, adminId, tool, args, status, result, error, durationMs } = params;
  const row = {
    session_id: sessionId ?? null,
    admin_id: adminId,
    tool_name: tool.name,
    args,
    args_hash: hashArgs(args),
    risk: tool.risk,
    read_only: tool.readOnly,
    status,
    result: result == null ? null : JSON.parse(JSON.stringify(result)),
    error: error ?? null,
    duration_ms: durationMs,
    executed_at: status === "executed" || status === "failed" ? new Date().toISOString() : null,
  };
  const { error: insertError } = await ledgers.from("ai_tool_calls").insert(row);
  if (insertError) console.error("ai_tool_calls insert failed:", insertError.message);
  return row;
}

async function auditShadow(admin: StaffUser, action: string, entityType: string | undefined, entityId: string | null) {
  if (admin.role !== "admin") return; // audit_log policy is is_admin() — respect it
  await ledgers.from("audit_log").insert({
    actor_id: admin.id,
    actor_email: admin.email ?? null,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId ?? null,
    detail: { source: "ai-command" },
  });
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

async function runTool(admin: StaffUser, req: Request, body: Record<string, unknown>): Promise<Response> {
  const sessionId = nonEmpty(body.sessionId, "session");
  const toolName = nonEmpty(body.toolName, "tool");
  const args = (body.args ?? {}) as Record<string, unknown>;
  const tool = toolName ? AI_TOOL_BY_NAME[toolName] : undefined;
  if (!tool) return json({ ok: false, error: `Unknown tool: ${toolName ?? "(none)"}` }, 404);
  if (tool.phase === 2 || !tool.readOnly) {
    return json({ ok: false, error: `${tool.name} is Level 2 PREPARE registered — not executable in Phase 1.`, phase: 2 }, 403);
  }
  if (tool.role === "admin" && admin.role !== "admin") {
    return json({ ok: false, error: `Tool ${tool.name} is admin-only.` }, 403);
  }
  if (sessionId && !(await ensureOwnSession(ledgers, sessionId, admin.id))) {
    return json({ ok: false, error: "Session not found or not yours." }, 404);
  }

  const started = Date.now();
  let status = "executed";
  let result: unknown;
  let runError: string | undefined;
  try {
    result = await tool.run(userClient(req), args);
    status = "executed";
  } catch (e) {
    status = "failed";
    runError = String(e instanceof Error ? e.message : e);
  }
  const durationMs = Date.now() - started;
  const recorded = await recordToolCall({
    sessionId, adminId: admin.id, tool, args, status, result, error: runError, durationMs,
  });
  await auditShadow(admin, "ai.run_tool", "ai_tool_call", recorded.id ?? null);

  if (sessionId) {
    await ledgers.from("ai_messages").insert({
      session_id: sessionId,
      role: "tool",
      agent: null,
      content: {
        tool_name: tool.name,
        risk: tool.risk,
        read_only: tool.readOnly,
        status,
        result: result ?? null,
        error: runError ?? null,
        duration_ms: durationMs,
      },
    });
  }

  return json({ ok: true, tool: tool.name, risk: tool.risk, readOnly: tool.readOnly, status, result: result ?? null, error: runError ?? null, durationMs });
}

async function runLlm(admin: StaffUser, req: Request, body: Record<string, unknown>): Promise<Response> {
  const sessionId = nonEmpty(body.sessionId, "session");
  const system = typeof body.system === "string" ? body.system : "";
  const turns = Array.isArray(body.turns)
    ? (body.turns as AgentTurn[]).filter((t) => t && (t.content || "") !== "").slice(0, 24)
    : [];
  if (!system) return json({ ok: false, error: "Missing system prompt." }, 400);
  if (sessionId && !(await ensureOwnSession(ledgers, sessionId, admin.id))) {
    return json({ ok: false, error: "Session not found or not yours." }, 404);
  }

  const started = Date.now();
  const outcome = await runAgent(system, turns, [], async () => ({ error: "no tools" }), {
    // The frontend's model picker (opencode/:* ids, or any provider id) is the
    // source of truth when present; otherwise the gateway's default provider.
    model: typeof body.model === "string" && body.model ? body.model : undefined,
  });
  const durationMs = Date.now() - started;
  let status = "executed";
  if (!outcome.ok) status = "failed";

  if (sessionId) {
    await ledgers.from("ai_messages").insert({
      session_id: sessionId,
      role: "assistant",
      agent: nonEmpty(body.agent, "agent"),
      content: {
        text: outcome.ok ? outcome.text : `The model could not answer (${outcome.reason}). The tool evidence above is intact.`,
        provider: outcome.ok ? outcome.provider : "none",
        model: outcome.ok ? outcome.model : outcome.detail ?? null,
        duration_ms: durationMs,
        ok: outcome.ok,
      },
    });
  }
  await auditShadow(admin, "ai.run_llm", "agent", nonEmpty(body.agent, "agent") ?? null);

  return json({
    ok: outcome.ok,
    text: outcome.ok ? outcome.text : null,
    provider: outcome.ok ? outcome.provider : null,
    model: outcome.ok ? outcome.model : outcome.status ?? null,
    reason: outcome.ok ? null : outcome.reason,
    durationMs,
  }, outcome.ok ? 200 : 502);
}

async function sessionList(admin: StaffUser): Promise<Response> {
  const { data, error } = await ledgers
    .from("ai_sessions")
    .select("id, title, agent_ids, autonomy_level, status, updated_at, created_at, summary, engine, opencode_session_id")
    .eq("admin_id", admin.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, autonomy_level: AUTONOMY_LEVEL, sessions: data });
}

async function sessionCreate(admin: StaffUser, body: Record<string, unknown>): Promise<Response> {
  const title = nonEmpty(body.title, "title") ?? "New session";
  const { data, error } = await ledgers
    .from("ai_sessions")
    .insert({ admin_id: admin.id, title, agent_ids: [], autonomy_level: AUTONOMY_LEVEL })
    .select("id, title, admin_id, autonomy_level, created_at")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  await auditShadow(admin, "ai.session.create", "ai_session", data.id);
  return json({ ok: true, session: data });
}

async function sessionGet(admin: StaffUser, body: Record<string, unknown>): Promise<Response> {
  const sessionId = nonEmpty(body.sessionId, "session");
  if (!sessionId || !(await ensureOwnSession(ledgers, sessionId, admin.id))) {
    return json({ ok: false, error: "Session not found or not yours." }, 404);
  }
  const [session, messages, toolCalls, approvals] = await Promise.all([
    ledgers.from("ai_sessions").select("*").eq("id", sessionId).single(),
    ledgers.from("ai_messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(200),
    ledgers.from("ai_tool_calls").select("*").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(100),
    ledgers.from("ai_approvals").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(50),
  ]);
  if (session.error) return json({ ok: false, error: session.error.message }, 400);
  return json({
    ok: true,
    session: session.data,
    autonomy_level: AUTONOMY_LEVEL,
    messages: messages.data ?? [],
    tool_calls: toolCalls.data ?? [],
    approvals: approvals.data ?? [],
  });
}

async function sessionArchive(admin: StaffUser, body: Record<string, unknown>): Promise<Response> {
  const sessionId = nonEmpty(body.sessionId, "session");
  if (!sessionId || !(await ensureOwnSession(ledgers, sessionId, admin.id))) {
    return json({ ok: false, error: "Session not found or not yours." }, 404);
  }
  const { error } = await ledgers.from("ai_sessions").update({ status: "archived", archived_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true });
}

async function sessionDelete(admin: StaffUser, body: Record<string, unknown>): Promise<Response> {
  const sessionId = nonEmpty(body.sessionId, "session");
  if (!sessionId || !(await ensureOwnSession(ledgers, sessionId, admin.id))) {
    return json({ ok: false, error: "Session not found or not yours." }, 404);
  }
  // ai_messages / ai_tool_calls / ai_approvals / ai_tasks all carry
  // `on delete cascade` from session_id, so one row is the whole thread.
  const { error } = await ledgers.from("ai_sessions").delete().eq("id", sessionId).eq("admin_id", admin.id);
  if (error) return json({ ok: false, error: error.message }, 400);
  await auditShadow(admin, "ai.session.delete", "ai_session", sessionId);
  return json({ ok: true });
}

async function approvalRequest(admin: StaffUser, body: Record<string, unknown>): Promise<Response> {
  const sessionId = nonEmpty(body.sessionId, "session");
  const toolName = nonEmpty(body.toolName, "tool");
  const tool = toolName ? AI_TOOL_BY_NAME[toolName] : undefined;
  const args = (body.args ?? {}) as Record<string, unknown>;
  const reason = (body.reason ?? {}) as Record<string, unknown>;
  if (!tool) return json({ ok: false, error: `Unknown tool: ${toolName ?? "(none)"}` }, 404);
  if (tool.phase !== 2) return json({ ok: false, error: `${tool.name} is read-only and needs no approval.` }, 400);
  if (sessionId && !(await ensureOwnSession(ledgers, sessionId, admin.id))) {
    return json({ ok: false, error: "Session not found or not yours." }, 404);
  }
  const argsHash = hashArgs(args);
  const { data, error } = await ledgers
    .from("ai_approvals")
    .insert({
      session_id: sessionId ?? null,
      admin_id: admin.id,
      tool_name: tool.name,
      args,
      args_hash: argsHash,
      risk: tool.risk,
      reason,
    })
    .select("id, tool_name, risk, status, created_at")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  await ledgers.from("ai_tool_calls").insert({
    session_id: sessionId ?? null,
    admin_id: admin.id,
    tool_name: tool.name,
    args,
    args_hash: argsHash,
    risk: tool.risk,
    read_only: false,
    status: "planned",
    approval_id: data.id,
  });
  await auditShadow(admin, "ai.approval.request", "ai_approval", data.id);
  return json({ ok: true, approval: data, note: "LEVEL 2 PREPARE — execution lands in Phase 2." });
}

async function approvalList(admin: StaffUser): Promise<Response> {
  const { data, error } = await ledgers
    .from("ai_approvals")
    .select("*")
    .eq("admin_id", admin.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, autonomy_level: AUTONOMY_LEVEL, approvals: data });
}

async function sessionAppend(admin: StaffUser, body: Record<string, unknown>): Promise<Response> {
  const sessionId = nonEmpty(body.sessionId, "session");
  const role = nonEmpty(body.role, "role");
  if (!role || !["user", "step", "system"].includes(role)) {
    return json({ ok: false, error: "role must be user, step or system." }, 400);
  }
  const content = typeof body.content === "object" && body.content !== null ? body.content : { text: String(body.content ?? "") };
  if (!sessionId || !(await ensureOwnSession(ledgers, sessionId, admin.id))) {
    return json({ ok: false, error: "Session not found or not yours." }, 404);
  }
  const { data, error } = await ledgers
    .from("ai_messages")
    .insert({ session_id: sessionId, role, agent: nonEmpty(body.agent, "agent") ?? null, content })
    .select("id, role, created_at")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, message: data });
}

async function taskCreate(admin: StaffUser, body: Record<string, unknown>): Promise<Response> {
  const task = nonEmpty(body.task, "task");
  if (!task) return json({ ok: false, error: "Missing task text." }, 400);
  const sessionId = nonEmpty(body.sessionId, "session");
  if (sessionId && !(await ensureOwnSession(ledgers, sessionId, admin.id))) {
    return json({ ok: false, error: "Session not found or not yours." }, 404);
  }
  const { data, error } = await ledgers
    .from("ai_tasks")
    .insert({ session_id: sessionId ?? null, admin_id: admin.id, task, agent: nonEmpty(body.agent, "agent") ?? null, priority: Number(body.priority) || 0 })
    .select("id, task, agent, status, priority, created_at")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, task: data });
}

async function taskList(admin: StaffUser): Promise<Response> {
  const { data, error } = await ledgers
    .from("ai_tasks")
    .select("*")
    .eq("admin_id", admin.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ ok: false, error: error.message }, 400);
  return json({ ok: true, tasks: data });
}

// ---------------------------------------------------------------------------
// opencode engine actions
//
// engine="opencode" sessions ride a hosted `opencode serve` (the opencode/
// deployment package). The edge function is a thin, staff-authenticated
// broker: it creates/links the upstream session, forwards prompts, mirrors the
// assistant's reply and tool steps into the NowOpen stream, and pipes the
// server's SSE events back to the browser so the UI can stream. The server
// executes NowOpen work through .opencode/tools/nowopen.ts, which calls THIS
// function again — so every run is RLS-scoped by the staff JWT no matter how
// deep the engine goes.
// ---------------------------------------------------------------------------

const asError = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const rawJwt = (req: Request): string =>
  (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

async function opencodeJson<T>(path: string, body?: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: T | null; error: string }> {
  try {
    const res = await fetch(`${OPENCODE_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: opencodeBasic },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: T | null = null;
    if (text) {
      try { parsed = JSON.parse(text) as T; } catch { /* upstream text is fine */ }
    }
    if (!res.ok) return { ok: false, status: res.status, body: null, error: text.slice(0, 300) };
    return { ok: true, status: res.status, body: parsed, error: "" };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: asError(e) };
  }
}

/** The read-tool catalogue as a prompt block the model can reason over. */
function toolCatalog(): string {
  return Object.values(AI_TOOL_BY_NAME)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      const props = (t.argsSchema as { properties?: Record<string, unknown> })?.properties ?? {};
      const keys = Object.keys(props);
      return `  - ${t.name}: ${t.description}${keys.length ? ` | args: ${keys.join(", ")}` : ""}`;
    })
    .join("\n");
}

function opencodeSystemPrompt(admin: StaffUser, jwt: string, sessionId: string): string {
  return [
    `You are the NowOpen OpenAI Code Center running inside the Admin Creator for ${admin.email ?? "this staff member"} (role: ${admin.role}).`,
    `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
    "You operate the NowOpen Africa platform — you do business work (planning, analysis, recommendations), never code, shell or files (you have no such tools).",
    "You execute platform tools through ONE bridge tool, nowopen:",
    toolCatalog(),
    "",
    "MANDATORY on every nowopen call:",
    `  - tool = the exact tool name above`,
    "  - args = the tool's arguments per its schema",
    `  - sessionId = ${sessionId}`,
    `  - jwt = ${jwt} — pass this string VERBATIM, never rewrite it (the gateway validates it).`,
    "",
    "Rules:",
    "1. Reason from tool evidence before replying; all tools are read-only (Level 2 PREPARE).",
    "2. Be concise and concrete: direct plain language, answer first, no preamble, no 'here is', no closing sign-off — like a CLI assistant. End with the single most valuable next step.",
    "3. If a tool errors, say what failed and try a narrower argument set.",
  ].join("\n");
}

async function ownOpenCodeSession(sessionId: string, adminId: string): Promise<{ id: string; opencode_session_id: string } | null> {
  const { data } = await ledgers
    .from("ai_sessions")
    .select("id, opencode_session_id")
    .eq("id", sessionId)
    .eq("admin_id", adminId)
    .eq("engine", "opencode")
    .maybeSingle();
  return data && typeof data.opencode_session_id === "string" && data.opencode_session_id
    ? { id: data.id as string, opencode_session_id: data.opencode_session_id }
    : null;
}

interface OpenCodePart {
  type?: string;
  text?: string;
  tool?: string;
  input?: Record<string, unknown>;
  state?: string;
}

function partsText(parts: OpenCodePart[]): string {
  return parts
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n");
}

/** Mirror opencode tool invocations into the NowOpen stream as `tool` steps. */
async function mirrorOpenCodeTools(sessionId: string, parts: OpenCodePart[]): Promise<void> {
  for (const p of parts) {
    if (!p || p.type !== "tool" || typeof p.tool !== "string") continue;
    await ledgers.from("ai_messages").insert({
      session_id: sessionId,
      role: "tool",
      agent: "opencode",
      content: {
        tool_name: p.tool,
        args: p.input ?? {},
        state: p.state ?? "unknown",
        engine: "opencode",
      },
    });
  }
}

async function opencodeCreate(admin: StaffUser, req: Request, body: Record<string, unknown>): Promise<Response> {
  if (!opencodeReady) {
    return json({ ok: false, error: "The OpenCode engine is not configured yet (OPENCODE_SERVER_URL / OPENCODE_SERVER_PASSWORD).", engine: "unconfigured" }, 503);
  }
  const title = nonEmpty(body.title, "title") ?? "New session";
  const { data: session, error } = await ledgers
    .from("ai_sessions")
    .insert({ admin_id: admin.id, title, agent_ids: [], autonomy_level: AUTONOMY_LEVEL, engine: "opencode" })
    .select("id, title, engine, created_at")
    .single();
  if (error) return json({ ok: false, error: error.message }, 400);

  const out = await opencodeJson<{ id?: string }>("/session", { title });
  if (!out.ok || !out.body?.id) {
    await ledgers.from("ai_sessions").delete().eq("id", session.id); // roll the NowOpen row back
    return json({ ok: false, error: out.body === null && !out.ok ? `OpenCode engine unreachable: ${out.error}` : "OpenCode returned no session id." }, 502);
  }
  await ledgers.from("ai_sessions").update({ opencode_session_id: out.body.id }).eq("id", session.id);
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "opencode/big-pickle";
  await auditShadow(admin, "ai.opencode.create", "ai_session", session.id);
  return json({
    ok: true,
    session: { id: session.id, title: session.title, engine: session.engine, opencode_session_id: out.body.id },
    opencodeSessionId: out.body.id,
    model,
    system: opencodeSystemPrompt(admin, rawJwt(req), session.id),
  });
}

async function opencodeTurn(admin: StaffUser, req: Request, body: Record<string, unknown>): Promise<Response> {
  if (!opencodeReady) return json({ ok: false, error: "The OpenCode engine is not configured on this deployment yet.", engine: "unconfigured" }, 503);
  const sessionId = nonEmpty(body.sessionId, "session");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!sessionId || !text) return json({ ok: false, error: "Missing session and/or message text." }, 400);
  const bound = await ownOpenCodeSession(sessionId, admin.id);
  if (!bound) return json({ ok: false, error: "OpenCode session not found or not yours." }, 404);

  await ledgers.from("ai_messages").insert({ session_id: sessionId, role: "user", content: { text, engine: "opencode" } });

  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "opencode/big-pickle";
  const system = opencodeSystemPrompt(admin, rawJwt(req), sessionId);
  const started = Date.now();
  const out = await opencodeJson<{ parts?: OpenCodePart[] }>(
    `/session/${encodeURIComponent(bound.opencode_session_id)}/message`,
    { model, system, parts: [{ type: "text", text }] },
  );
  const durationMs = Date.now() - started;
  if (!out.ok || !out.body) {
    return json({ ok: false, error: `OpenCode turn failed (HTTP ${out.status}${out.error ? `): ${out.error}` : ") — engine unreachable."}` }, 502);
  }
  const parts = out.body.parts ?? [];
  const replyText = partsText(parts);
  await ledgers.from("ai_messages").insert({
    session_id: sessionId,
    role: "assistant",
    agent: "opencode",
    content: { text: replyText || "[no text reply]", engine: "opencode", model, duration_ms: durationMs },
  });
  await mirrorOpenCodeTools(sessionId, parts);
  await auditShadow(admin, "ai.opencode.run", "ai_session", sessionId);
  return json({ ok: true, text: replyText, model, durationMs, parts });
}

async function opencodeStream(admin: StaffUser, body: Record<string, unknown>): Promise<Response> {
  const sessionId = nonEmpty(body.sessionId, "session");
  if (!opencodeReady) return json({ ok: false, error: "The OpenCode engine is not configured on this deployment yet.", engine: "unconfigured" }, 503);
  const bound = await ownOpenCodeSession(sessionId ?? "", admin.id);
  if (!bound) return json({ ok: false, error: "OpenCode session not found or not yours." }, 404);

  let upstream: Response;
  try {
    upstream = await fetch(`${OPENCODE_URL}/event`, { headers: { Authorization: `Bearer ${OPENCODE_PASS}` } });
  } catch (e) {
    return json({ ok: false, error: `OpenCode engine unreachable: ${asError(e)}` }, 502);
  }
  if (!upstream.ok || !upstream.body) {
    return json({ ok: false, error: `OpenCode stream connect failed (HTTP ${upstream.status}).` }, 502);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only." }, 405);

  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return json({ ok: false, error: "Too many requests — please wait a moment." }, 429);
  }

  const admin = await currentStaff(req);
  if (!admin) return json({ ok: false, error: "Staff access required." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ ok: false, error: "Expected a JSON object body." }, 400);
  }

  switch (body.action) {
    case "run": return await runTool(admin, req, body);
    case "llm": return await runLlm(admin, req, body);
    case "session.list": return await sessionList(admin);
    case "session.create": return await sessionCreate(admin, body);
    case "session.get": return await sessionGet(admin, body);
    case "session.archive": return await sessionArchive(admin, body);
    case "session.delete": return await sessionDelete(admin, body);
    case "session.append": return await sessionAppend(admin, body);
    case "approval.request": return await approvalRequest(admin, body);
    case "approval.list": return await approvalList(admin);
    case "approval.decide":
      return json({ ok: false, error: "LEVEL 2 PREPARE — write decisions land in Phase 2.", phase: 2 }, 403);
    case "task.create": return await taskCreate(admin, body);
    case "task.list": return await taskList(admin);
    case "opencode.create": return await opencodeCreate(admin, req, body);
    case "opencode.run": return await opencodeTurn(admin, req, body);
    case "opencode.stream": return await opencodeStream(admin, body);
    default: return json({ ok: false, error: `Unknown action: ${body.action ?? "(none)"}` }, 404);
  }
});