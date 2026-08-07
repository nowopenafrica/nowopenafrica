// Provider-agnostic LLM layer for the NowOpen assistant.
//
// The assistant is one edge function called by three clients — the web chat
// widget, the web Live assistant and the mobile app — so swapping the model here
// changes it everywhere at once. That's why this lives in _shared rather than
// inside the chatbot function.
//
// PROVIDERS, in the order they're picked up:
//
//   GROQ_API_KEY        Groq — free tier, open-weight models (Llama 3.3 70B),
//                       very fast, solid tool calling. The recommended default.
//   OPENROUTER_API_KEY  OpenRouter — free ":free" variants of the same open
//                       models. Slower and rate-limited, but a drop-in second.
//   ANTHROPIC_API_KEY   Anthropic — the original provider, kept working so
//                       nothing regresses for anyone already using it.
//
// Groq and OpenRouter both speak the OpenAI chat-completions format, so ONE
// adapter covers both — only the base URL and model id differ.
//
// A NOTE ON "FREE": the models are genuinely open-weight, but a hosted product
// still needs a free API key from the host. There is no reliable keyless option
// — this codebase already learned that when gen.pollinations.ai started
// returning 401 and its "free & keyless" integration silently stopped working.
//
// With NO key set the caller still gets a useful answer: runAgent reports
// `provider: 'none'` and the function falls back to formatting real search
// results directly. Degraded, but never a dead chat box.

export type ProviderName = "groq" | "openrouter" | "anthropic" | "none";

export interface ProviderConfig {
  name: ProviderName;
  model: string;
  /** Human label for logs and the health endpoint. */
  label: string;
}

/** Overridable per deployment, so a model can be changed without a code edit. */
const DEFAULTS: Record<Exclude<ProviderName, "none">, string> = {
  groq: "llama-3.3-70b-versatile",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  anthropic: "claude-opus-4-8",
};

/**
 * Every configured provider, best first.
 *
 * Returning a LIST rather than a single winner matters: a key that is present
 * but dead (revoked, mistyped, rotated) would otherwise shadow a working key
 * further down and drop the assistant to search-only with no visible cause.
 * runAgent walks this list, so a broken provider costs one failed request
 * instead of the whole feature.
 *
 * ASSISTANT_MODEL only overrides the FIRST provider — it names a model id, and
 * model ids aren't portable across providers, so applying it to a fallback would
 * just guarantee the fallback fails too.
 */
export function resolveProviders(): ProviderConfig[] {
  const env = (k: string) => Deno.env.get(k) || "";
  const out: ProviderConfig[] = [];

  if (env("GROQ_API_KEY")) {
    out.push({ name: "groq", model: DEFAULTS.groq, label: "Groq · Llama 3.3 70B" });
  }
  if (env("OPENROUTER_API_KEY")) {
    out.push({ name: "openrouter", model: DEFAULTS.openrouter, label: "OpenRouter · Llama 3.3 70B (free)" });
  }
  if (env("ANTHROPIC_API_KEY")) {
    out.push({ name: "anthropic", model: DEFAULTS.anthropic, label: "Anthropic" });
  }

  const override = env("ASSISTANT_MODEL");
  if (override && out.length) out[0] = { ...out[0], model: override };
  return out;
}

/** The provider that will be tried first, or a "none" placeholder. */
export function resolveProvider(): ProviderConfig {
  return resolveProviders()[0] ?? { name: "none", model: "", label: "No model configured" };
}

// --- shared tool shape -------------------------------------------------------

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface AgentTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentResult {
  text: string;
  provider: ProviderName;
  model: string;
  /** True when a tool actually ran — useful for logging and tests. */
  usedTool: boolean;
}

type RunTool = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * Why a turn produced no answer.
 *
 * The caller needs this to stay honest. "The model was rate-limited" and "the
 * directory has no matches" are completely different facts, and a fallback that
 * reports the second when the first happened tells the user something untrue
 * about their own platform.
 */
export type FailureReason = "no_provider" | "rate_limited" | "auth" | "error";

/**
 * Classify an upstream HTTP status. 429 survives a retry only when the limit is
 * genuinely exhausted, and that must not be reported as a generic error — it is
 * temporary, and the user should be told to try again rather than told the
 * directory came up empty.
 */
function statusToReason(status: number): FailureReason {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "auth";
  return "error";
}

/**
 * Collected as providers are tried.
 *
 * Only the FIRST failure is kept. The preferred provider is the one the
 * deployment actually intends to use, so its reason is the actionable one — a
 * later fallback failing on a stale key would otherwise overwrite "rate limited"
 * with "auth" and point at the wrong problem entirely.
 */
interface Diag {
  reason?: FailureReason;
  /** Upstream status and body of the first failure, for the debug endpoint. */
  status?: number;
  detail?: string;
}

function note(diag: Diag, reason: FailureReason, status?: number, detail?: string) {
  if (diag.reason) return;
  diag.reason = reason;
  diag.status = status;
  diag.detail = detail;
}

// --- OpenAI-compatible (Groq, OpenRouter) -----------------------------------

// How many search-then-think cycles a single turn may take. One is too few:
// open models routinely search, find little, and refine the query — ending that
// turn on a tool call means no answer at all. Beyond a handful it's a loop.
const MAX_TOOL_ROUNDS = 3;

/**
 * POST with one retry when the provider says "too many requests".
 *
 * Free tiers are metered per minute, and a single assistant turn can be three
 * or four upstream calls, so a busy moment trips the limit routinely. Without
 * this the user gets the search-only fallback for no reason they can see.
 *
 * Deliberately ONE retry, capped at 4s: a chat widget has someone waiting, and
 * a longer wait is worse than a fast degraded answer.
 */
async function postWithRetry(url: string, init: RequestInit, label: string): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 429) return res;

  const header = Number(res.headers.get("retry-after"));
  const waitMs = Math.min(Number.isFinite(header) && header > 0 ? header * 1000 : 1500, 4000);
  console.warn(`${label} rate-limited; retrying once in ${waitMs}ms`);
  await res.text().catch(() => "");
  await new Promise((r) => setTimeout(r, waitMs));

  // Whatever comes back is final — the caller reads the status and degrades.
  return await fetch(url, init);
}

const OPENAI_BASE: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

async function runOpenAICompatible(
  cfg: ProviderConfig,
  system: string,
  turns: AgentTurn[],
  tools: ToolDef[],
  runTool: RunTool,
  maxTokens: number,
  diag: Diag,
): Promise<AgentResult | null> {
  const key = Deno.env.get(cfg.name === "groq" ? "GROQ_API_KEY" : "OPENROUTER_API_KEY") || "";
  const url = OPENAI_BASE[cfg.name];

  const messages: any[] = [{ role: "system", content: system }, ...turns];
  const toolSpec = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  // Set when the host rejects a malformed tool call, so the loop knows the turn
  // is still recoverable.
  let toolFormatFailed = false;

  const call = async (withTools: boolean) => {
    const res = await postWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        // OpenRouter asks for these; harmless on Groq.
        "HTTP-Referer": Deno.env.get("APP_BASE_URL") || "https://nowopenafrica.com",
        "X-Title": "NowOpen Africa",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        messages,
        // Some OpenAI-compatible hosts reject an empty `tools` array, so send
        // the keys only when there are actual tools (e.g. translation has none).
        ...(withTools && toolSpec.length ? { tools: toolSpec, tool_choice: "auto" } : {}),
      }),
    }, cfg.name);
    if (!res.ok) {
      const body = await res.text();

      // Llama-family models sometimes emit a function call as raw text
      // ("<function=search_platform={...}>") instead of structured tool_calls,
      // and the host rejects the whole request with 400 tool_use_failed. That
      // is a formatting slip, not a real failure: the model still knows the
      // answer. Losing the turn over it is the wrong trade, so the caller
      // retries with the tools withheld and gets a prose answer instead.
      if (res.status === 400 && body.includes("tool_use_failed")) {
        toolFormatFailed = true;
        console.warn(`${cfg.name} emitted a malformed tool call; answering without tools.`);
        return null;
      }

      note(diag, statusToReason(res.status), res.status, body.slice(0, 300));
      console.error(`${cfg.name} API error:`, res.status, body);
      return null;
    }
    return res.json();
  };

  let usedTool = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await call(true);
    if (!data) {
      if (!toolFormatFailed) return null;
      break; // recoverable — fall through to the tool-less call below
    }
    const msg = data.choices?.[0]?.message;

    if (!msg?.tool_calls?.length) {
      return { text: (msg?.content || "").trim(), provider: cfg.name, model: cfg.model, usedTool };
    }

    usedTool = true;
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        // A model can emit malformed JSON; an empty object still lets the tool
        // run its own validation rather than blowing up the whole turn.
      }
      const result = await runTool(tc.function?.name || "", args);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  // Out of rounds and still searching. Ask once more with the tools withheld so
  // the model has to answer in prose from what it already gathered — otherwise
  // the turn ends on a tool call with no text and the whole answer is lost.
  const final = await call(false);
  if (!final) return null;
  return {
    text: (final.choices?.[0]?.message?.content || "").trim(),
    provider: cfg.name,
    model: cfg.model,
    usedTool,
  };
}

// --- Anthropic ---------------------------------------------------------------

async function runAnthropic(
  cfg: ProviderConfig,
  system: string,
  turns: AgentTurn[],
  tools: ToolDef[],
  runTool: RunTool,
  maxTokens: number,
  diag: Diag,
): Promise<AgentResult | null> {
  const messages: any[] = [...turns];
  const toolSpec = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const call = async (withTools: boolean) => {
    const res = await postWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        system,
        ...(withTools && toolSpec.length ? { tools: toolSpec } : {}),
        messages,
      }),
    }, "anthropic");
    if (!res.ok) {
      const body = await res.text();
      note(diag, statusToReason(res.status), res.status, body.slice(0, 300));
      console.error("Anthropic API error:", res.status, body);
      return null;
    }
    return res.json();
  };

  const textOf = (data: any) => (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();

  let usedTool = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await call(true);
    if (!data) return null;

    if (data.stop_reason !== "tool_use") {
      return { text: textOf(data), provider: cfg.name, model: cfg.model, usedTool };
    }

    usedTool = true;
    const blocks = (data.content || []).filter((b: any) => b.type === "tool_use");
    messages.push({ role: "assistant", content: data.content });
    const results = await Promise.all(
      blocks.map(async (b: any) => ({
        type: "tool_result",
        tool_use_id: b.id,
        content: JSON.stringify(await runTool(b.name, b.input || {})),
      })),
    );
    messages.push({ role: "user", content: results });
  }

  // See the note in the OpenAI-compatible path: withhold the tools to force a
  // written answer rather than losing the turn to another tool call.
  const final = await call(false);
  if (!final) return null;
  return { text: textOf(final), provider: cfg.name, model: cfg.model, usedTool };
}

// --- diagnostics -------------------------------------------------------------

export interface ProbeResult {
  provider: ProviderName;
  model: string;
  ok: boolean;
  /** Upstream HTTP status, or null if the request never completed. */
  status: number | null;
  /** Upstream error body, truncated. Never contains the API key. */
  error?: string;
  /** Model ids the provider says are available — only fetched when the call failed. */
  availableModels?: string[];
}

/**
 * Make the smallest possible real call to the configured provider.
 *
 * Edge function logs aren't reachable from every CLI version, so without this
 * the only symptom of a bad key or a retired model id is the assistant quietly
 * answering from search. This turns that into an actual status code.
 */
export async function probeProviders(): Promise<ProbeResult[]> {
  const configured = resolveProviders();
  if (!configured.length) {
    return [{ provider: "none", model: "", ok: false, status: null, error: "No API key configured." }];
  }
  return await Promise.all(configured.map(probeOne));
}

async function probeOne(cfg: ProviderConfig): Promise<ProbeResult> {
  const base: ProbeResult = { provider: cfg.name, model: cfg.model, ok: false, status: null };

  try {
    if (cfg.name === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model: cfg.model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
      });
      return res.ok
        ? { ...base, ok: true, status: res.status }
        : { ...base, status: res.status, error: (await res.text()).slice(0, 400) };
    }

    const key = Deno.env.get(cfg.name === "groq" ? "GROQ_API_KEY" : "OPENROUTER_API_KEY") || "";
    const res = await fetch(OPENAI_BASE[cfg.name], {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: cfg.model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
    });
    if (res.ok) return { ...base, ok: true, status: res.status };

    const error = (await res.text()).slice(0, 400);
    // A failed call is usually a dead key or a retired model id. Listing what
    // the provider actually offers separates those two cases immediately.
    let availableModels: string[] | undefined;
    try {
      const listUrl = OPENAI_BASE[cfg.name].replace("/chat/completions", "/models");
      const list = await fetch(listUrl, { headers: { Authorization: `Bearer ${key}` } });
      if (list.ok) {
        const body = await list.json();
        availableModels = (body.data || []).map((m: any) => m.id).sort();
      }
    } catch {
      // Best-effort only — the status and error above are the real signal.
    }
    return { ...base, status: res.status, error, availableModels };
  } catch (e) {
    return { ...base, error: String(e).slice(0, 400) };
  }
}

// --- entry point -------------------------------------------------------------

export type AgentOutcome =
  | ({ ok: true } & AgentResult)
  | { ok: false; reason: FailureReason; status?: number; detail?: string };

/**
 * Run one assistant turn against whichever providers are configured, in order.
 *
 * Always returns an outcome rather than null: the caller must be able to tell
 * "no model was reachable" from "the model answered nothing", because those
 * warrant different things being said to the user.
 */
export async function runAgent(
  system: string,
  turns: AgentTurn[],
  tools: ToolDef[] = [],
  runTool: RunTool = async () => ({ error: "no tools" }),
  opts: { maxTokens?: number } = {},
): Promise<AgentOutcome> {
  const maxTokens = opts.maxTokens ?? 1024;
  const providers = resolveProviders();
  if (!providers.length) return { ok: false, reason: "no_provider" };

  const diag: Diag = {};

  for (const cfg of providers) {
    try {
      const result = cfg.name === "anthropic"
        ? await runAnthropic(cfg, system, turns, tools, runTool, maxTokens, diag)
        : await runOpenAICompatible(cfg, system, turns, tools, runTool, maxTokens, diag);
      if (result?.text) return { ok: true, ...result };
      console.warn(`Provider ${cfg.name} gave no answer — trying the next one.`);
    } catch (e) {
      note(diag, "error");
      console.error(`Provider ${cfg.name} threw:`, e);
    }
  }

  return { ok: false, reason: diag.reason ?? "error", status: diag.status, detail: diag.detail };
}
