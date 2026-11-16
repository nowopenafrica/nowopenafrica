// create-concept-ideas: one visual idea and the copy for each of Create's
// three concepts (decision D2).
//
// NOT DEPLOYED. It was deployed on 2026-11-16 for a trial on the five
// benchmark briefs and taken down the same day on the founder's word: the
// model's copy was not good enough (see the D2 record in the status file).
// Deploying again is a production change and waits for the founder's word. Until then Create uses the deterministic copy, which
// is also what it uses whenever this function fails, is rate limited or
// returns something the browser's validator refuses.
//
// Signed-in callers only (verify_jwt = true in config.toml): an anonymous
// visitor never reaches the model. The prompt is fixed on the server and the
// request is capped field by field (see _shared/conceptIdeas.ts), so this
// cannot be used as a general model endpoint.
//
// It returns what the model wrote, parsed but NOT trusted. The browser checks
// every line against the brief before any of it is shown.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getClientIp, isRateLimited } from "../_shared/rateLimit.ts";
import { runAgent } from "../_shared/llm.ts";
import { IDEA_SYSTEM, cleanIdeaRequest, ideaUserMessage, parseIdeaJson } from "../_shared/conceptIdeas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Automation-Key",
};

// A person refining a brief asks a handful of times, not dozens.
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 60_000;
// Three concepts of five short fields is about 300 tokens of answer. The
// ceiling is far above that on purpose. MEASURED 2026-11-16: at 700 the
// default Groq model (a reasoning model) spent the whole allowance thinking
// and returned no text at all, so every call fell through to the next
// provider. The ceiling bounds a runaway reply; it is not the expected cost.
const MAX_TOKENS = 2400;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * A signed-in person, or an operator holding the automation key.
 *
 * The gateway's JWT check is not enough on its own: the public anon key is a
 * valid JWT, so it passes, and anyone who reads the site's source holds it.
 * The token is therefore resolved to a real user here. The operator path is
 * the same key every automation uses, and it fails closed when unset.
 */
async function callerOf(req: Request): Promise<"operator" | "user" | null> {
  const secret = Deno.env.get("AUTOMATION_SECRET") ?? "";
  const offered = req.headers.get("x-automation-key") ?? "";
  if (secret && offered && offered === secret) return "operator";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data, error } = await supabase.auth.getUser(authHeader.slice(7));
    return !error && data.user ? "user" : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (isRateLimited(getClientIp(req), RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) return json({ error: "Rate limited" }, 429);
  const caller = await callerOf(req);
  if (!caller) return json({ error: "Sign in first." }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const request = cleanIdeaRequest(body);
  if (!request) return json({ error: "Not a concept request" }, 400);

  const outcome = await runAgent(IDEA_SYSTEM, [{ role: "user", content: ideaUserMessage(request) }], [], undefined, { maxTokens: MAX_TOKENS });
  if (!outcome.ok) {
    // The caller falls back to its own copy, so this is a 200 with a reason, not an error page.
    console.warn("create-concept-ideas: no answer:", outcome.reason, outcome.status ?? "", outcome.detail ?? "");
    // The provider's own words go to an operator only: they are for fixing a deployment, not for a customer.
    return json({ ideas: null, reason: outcome.reason, ...(caller === "operator" && { status: outcome.status, detail: outcome.detail }) });
  }

  // Tokens as the provider reported them. Never a price: see TokenUsage in llm.ts.
  console.log(JSON.stringify({
    fn: "create-concept-ideas", provider: outcome.provider, model: outcome.model,
    inputTokens: outcome.usage?.inputTokens ?? null, outputTokens: outcome.usage?.outputTokens ?? null,
  }));

  const ideas = parseIdeaJson(outcome.text);
  return json({ ideas, reason: ideas ? undefined : "unreadable", provider: outcome.provider, model: outcome.model, usage: outcome.usage });
});
