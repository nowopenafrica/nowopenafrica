/**
 * Which AI models this deployment can actually reach, asked rather than assumed.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────
 *
 * `src/lib/aiCommand/models.ts` offers 18 model ids in the AI Command Centre
 * dropdown, hardcoded. Model catalogues change constantly, and this codebase
 * has already been bitten by exactly that: llm.ts records that on 2026-08-29
 * Groq returned 404 model_not_found for `llama-3.3-70b-versatile`, which had
 * been the default — and because the health endpoint reported which model was
 * CONFIGURED rather than which one answers, the assistant read as healthy
 * while every real call fell through.
 *
 * The same exposure sits in the dropdown today. A retired id there is an
 * operator choosing a model that cannot run, and finding out only when the
 * task fails.
 *
 * This endpoint asks each configured provider what it actually serves. It
 * does not decide anything — the browser compares the live catalogue against
 * what the UI offers, so the comparison lives with its own tests.
 *
 * ── READ-ONLY, AND STAFF ONLY ────────────────────────────────────────────
 *
 * It lists catalogues and makes the smallest possible probe call. It changes
 * nothing. Staff-gated anyway: the list of configured providers is an
 * operational fact, and `probeProviders` spends a real (tiny) request.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

import { probeProviders, resolveProviders } from "../_shared/llm.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const STAFF = new Set(["admin", "editor", "business_curator"]);

/** Where each OpenAI-compatible provider lists its catalogue. */
const CATALOG_URL: Record<string, string> = {
  groq: "https://api.groq.com/openai/v1/models",
  openai: "https://api.openai.com/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
  zen: "https://opencode.ai/zen/v1/models",
};

/** The env var holding each provider's key. Never returned to the caller. */
const KEY_ENV: Record<string, string> = {
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  zen: "OPENCODE_API_KEY",
};

interface CatalogResult {
  provider: string;
  /** Is a key present for this provider at all? */
  configured: boolean;
  /** Did the catalogue request succeed? */
  reachable: boolean;
  /** Model ids the provider says it serves. */
  models: string[];
  /** Why the catalogue could not be read, if it could not. */
  note?: string;
}

async function catalogFor(provider: string): Promise<CatalogResult> {
  const key = Deno.env.get(KEY_ENV[provider] ?? "") ?? "";
  const base: CatalogResult = { provider, configured: !!key, reachable: false, models: [] };

  if (!key) return { ...base, note: `${KEY_ENV[provider]} is not set.` };

  const url = CATALOG_URL[provider];
  if (!url) {
    /*
     * Anthropic has no OpenAI-style catalogue endpoint here. Saying so is the
     * honest answer — reporting an empty list would read as "no models".
     */
    return { ...base, note: "This provider does not expose a catalogue endpoint; availability is proven by the probe instead." };
  }

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) {
      return { ...base, note: `Catalogue request returned ${res.status}.` };
    }
    const body = await res.json() as { data?: Array<{ id?: string }> };
    const models = (body.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean).sort();
    return { ...base, reachable: true, models };
  } catch (e) {
    return { ...base, note: `Catalogue request failed: ${String(e).slice(0, 200)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const auth = req.headers.get("Authorization") ?? "";
  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: me, error: meErr } = await asCaller.auth.getUser();
  if (meErr || !me?.user) return json({ ok: false, reason: "Sign in first." }, 401);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: actor } = await db.from("users").select("role").eq("id", me.user.id).maybeSingle();
  if (!STAFF.has((actor as { role?: string } | null)?.role ?? "")) {
    return json({ ok: false, reason: "Not authorised." }, 403);
  }

  /*
   * Which providers are configured, which answer, and what each serves.
   * `probeProviders` makes the smallest real call there is; the catalogue
   * requests cost nothing.
   */
  const configured = resolveProviders().map((p) => p.name);
  const [probes, catalogs] = await Promise.all([
    probeProviders(),
    Promise.all([...new Set([...configured, ...Object.keys(KEY_ENV)])].map(catalogFor)),
  ]);

  /*
   * Is the OpenCode coding engine actually usable?
   *
   * Booleans only — the server password lives in this function and nowhere
   * else, and a self-test that leaks what it is checking is worse than no
   * self-test. `ai-command` answers 503 for every opencode.* action without
   * both of these, and the Command Centre reports that as "The OpenCode
   * engine did not respond", which reads like an outage rather than a
   * missing setting.
   */
  const serverUrlSet = !!Deno.env.get("OPENCODE_SERVER_URL");
  const passwordSet = !!Deno.env.get("OPENCODE_SERVER_PASSWORD");

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    engine: {
      opencodeConfigured: serverUrlSet && passwordSet,
      serverUrlSet,
      passwordSet,
      note: serverUrlSet && passwordSet
        ? "The broker can reach an OpenCode server. The browser must also be built with VITE_AI_ENGINE=opencode for sessions to use it."
        : "Set OPENCODE_SERVER_URL and OPENCODE_SERVER_PASSWORD as edge function secrets. Until then every opencode.* action answers 503 and the Command Centre stays on the built-in engine.",
    },
    /** Providers the router would use, in priority order. */
    configured,
    /** The smallest real call to each, so a dead key is visible. */
    probes,
    /** What each provider says it serves. Compared against the UI's list client-side. */
    catalogs,
  });
});
