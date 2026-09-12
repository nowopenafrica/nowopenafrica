// OpenAI Code Center — shared client-side types.
//
// These mirror the server contract in supabase/functions/_shared/aiTools.ts and
// the edge function's dispatch. The server stays the authority; this file just
// gives the UI and router static types. Phase 1 autonomy is LEVEL 2 (PREPARE).

export type AiRisk = 'READ' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AiToolRole = 'admin' | 'editor' | 'staff';
export type AiToolPhase = 1 | 2;

export type AiToolCategory =
  | 'directory'
  | 'claims'
  | 'analytics'
  | 'quality'
  | 'growth'
  | 'ops'
  | 'security';

export interface AiTool {
  name: string;
  label: string;
  description: string;
  readOnly: boolean;
  risk: AiRisk;
  phase: AiToolPhase;
  role: AiToolRole;
  category: AiToolCategory;
  /** Human phrasing of the risk, used in the UI and approval copy. */
  riskLabel: string;
}

export type AiAgentId =
  | 'audit'
  | 'intelligence'
  | 'claims'
  | 'analytics'
  | 'opportunities'
  | 'data-steward'
  | 'seo'
  | 'security'
  | 'community'
  | 'run-ops'
  | 'founder'
  | 'campaign';

export interface AiAgent {
  id: AiAgentId;
  name: string;
  /** Persona system prompt sent to the model for synthesis. */
  prompt: string;
  /** Read tools this agent is scoped to in Phase 1. */
  tools: string[];
  /** Keywords that route a prompt to this agent. */
  signals: string[];
}

/** One step the router planned: a tool plus its args. */
export interface ToolPlan {
  tool: string;
  args: Record<string, unknown>;
}

/** What the router decided for a prompt. */
export interface RoutePlan {
  agents: AiAgentId[];
  tools: ToolPlan[];
  /** Deterministic — the model refines this later; it is never skipped. */
  summary: string;
}

export const AUTONOMY_LEVEL = 2 as const;

export const AUTONOMY_LABEL = 'Level 2 · Prepare' as const;

export interface MessageContent {
  text?: string;
  tool_name?: string;
  risk?: AiRisk;
  read_only?: boolean;
  status?: string;
  result?: unknown;
  error?: string | null;
  duration_ms?: number;
  provider?: string | null;
  model?: string | null;
  ok?: boolean;
  agent?: string;
  /** engine that produced this row: builtin or opencode. */
  engine?: string;
}

export interface AppMessage {
  id: string;
  role: 'user' | 'assistant' | 'step' | 'tool' | 'system';
  agent?: string | null;
  content: MessageContent;
  createdAt: string;
  /** Tool card renders the raw result. */
  result?: unknown;
}

export interface SessionSummary {
  id: string;
  title: string;
  agent_ids: string[];
  autonomy_level: number;
  status: 'active' | 'archived';
  updated_at: string;
  created_at: string;
  summary: Record<string, unknown>;
  /** builtin = Phase 1 router+llm; opencode = hosted OpenCode SDK session. */
  engine?: 'builtin' | 'opencode';
  opencode_session_id?: string | null;
}

export interface ToolCallLedger {
  id: string;
  session_id: string | null;
  admin_id: string | null;
  tool_name: string;
  args: Record<string, unknown>;
  args_hash: string;
  risk: AiRisk;
  read_only: boolean;
  status: 'planned' | 'approved' | 'denied' | 'executed' | 'failed' | 'cancelled';
  result: unknown;
  error: string | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface ApprovalSummary {
  id: string;
  session_id: string | null;
  admin_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  risk: AiRisk;
  reason: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
}

export interface TaskSummary {
  id: string;
  session_id: string | null;
  task: string;
  agent: string | null;
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  created_at: string;
}