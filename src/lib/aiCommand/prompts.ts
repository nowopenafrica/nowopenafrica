// OpenAI Code Center — LLM prompt composition.
//
// Turns (prompt, plan, tool evidence) into exactly the system + turns payload
// the 'llm' edge action expects. Pure so it is testable. The persona is the
// agent's system prompt from agents.ts; the evidence is the real tool output
// that ran in the stream above. The model is asked to reason from evidence
// only — never to imagine a number the tools did not return.

import type { RoutePlan } from './types';
import { AI_AGENTS } from './agents';

export interface ToolEvidence {
  tool: string;
  result: unknown;
  error?: string | null;
}

/** The persona's hard rules, appended to every synthesis call. */
const EVIDENCE_RULES = [
  'Reason ONLY from the tool results in this conversation. Every number you state must appear in one of them.',
  'If a figure the user needs was not gathered, say it was not measured rather than estimating it.',
  'You are read-only. You have changed nothing. Do not claim to have sent, merged, approved or updated anything.',
  'Be concise: a short brief or a tight list with the recommendation up front.',
  'Voice: direct and plain, like a CLI assistant. Open with the answer, skip "here is", "sure", summaries of what you did, and any closing sign-off.',
].join('\n');

export function synthesizePersona(agentId: string): string {
  const agent = AI_AGENTS.find((a) => a.id === agentId) ?? AI_AGENTS[0];
  return `${agent.prompt}\n\n${EVIDENCE_RULES}`;
}

export function buildLlmPayload(params: {
  prompt: string;
  plan: RoutePlan;
  evidence: ToolEvidence[];
}): { system: string; turns: { role: 'user' | 'assistant'; content: string }[] } {
  const { prompt, plan, evidence } = params;
  const system = synthesizePersona(plan.agents[0]);
  const evidenceBlock = evidence.length
    ? evidence.map((e) => `--- ${e.tool}${e.error ? ' (error)' : ''} ---\n${JSON.stringify(e.result ?? null, null, 1)}`).join('\n\n')
    : '(no tools ran)';
  const turns = [
    { role: 'user' as const, content: prompt },
    {
      role: 'user' as const,
      content:
        `Tool evidence gathered for this request (reason from these only; plan: ${plan.tools.map((t) => t.tool).join(', ')}):\n\n${evidenceBlock}\n\nNow answer the request above.`,
    },
  ];
  return { system, turns };
}