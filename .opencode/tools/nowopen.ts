// NowOpen bridge tool — the ONLY tool the AI Command Center engine may call.
//
// The opencode server never touches the NowOpen database directly. Model
// requests to "do NowOpen stuff" funnel into this one tool, which posts back to
// the same ai-command Edge Function the browser uses. The staff JWT arrives in
// the tool args (injected by the session's system prompt) and becomes the
// Authorization header, so Postgres RLS + is_staff() still scope every run to
// the staff member who asked. The server itself holds only SUPABASE_URL + the
// anon key — no service role, no database credentials.

import { tool } from "@opencode-ai/plugin";

const BRIDGE_TOOLS = [
  "platform_health",
  "businesses_snapshot",
  "claim_pipeline",
  "analytics_overview",
  "opportunity_finder",
  "duplicate_finder",
  "data_quality",
  "growth_gaps",
  "system_health",
  "security_snapshot",
  "directory_search",
];

const supabaseUrl = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY ?? "";

export default tool({
  description:
    `Execute a NowOpen business tool through the platform gateway (ai-command ` +
    `Edge Function). Results are scoped by RLS to the requesting staff member. ` +
    `Known tool names: ${BRIDGE_TOOLS.join(", ")}. Use the tool catalog from the ` +
    `session system prompt for each tool's exact arguments. The LLM MUST always ` +
    `pass the session's staff jwt verbatim — it is the only credential this bridge has.`,
  args: {
    tool: tool.schema
      .string()
      .describe(`NowOpen tool name. One of: ${BRIDGE_TOOLS.join(", ")}`),
    args: tool.schema
      .record(tool.schema.any())
      .optional()
      .describe("Arguments for the tool, matching its catalog schema."),
    sessionId: tool.schema
      .string()
      .optional()
      .describe("NowOpen AI session id to attach the run to (from the session context)."),
    jwt: tool.schema
      .string()
      .describe("Staff JWT for the requesting user — always forward it verbatim."),
  },
  async execute({ tool: toolName, args = {}, sessionId, jwt }) {
    if (!supabaseUrl) {
      return "Bridge is not configured: SUPABASE_URL is missing on the server.";
    }
    if (!jwt) {
      return "Bridge rejected the call: no staff jwt in the tool args.";
    }
    if (!BRIDGE_TOOLS.includes(toolName)) {
      return `Unknown NowOpen tool "${toolName}". Known tools: ${BRIDGE_TOOLS.join(", ")}.`;
    }
    let response: Response;
    try {
      response = await fetch(`${supabaseUrl}/functions/v1/ai-command`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ action: "run", sessionId, toolName, args }),
      });
    } catch (e) {
      return `Bridge transport error: ${e instanceof Error ? e.message : String(e)}`;
    }
    const text = await response.text();
    if (!response.ok) {
      return `nowopen "${toolName}" failed (HTTP ${response.status}): ${text.slice(0, 500)}`;
    }
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  },
});