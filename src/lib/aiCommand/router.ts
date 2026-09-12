// OpenAI Code Center — deterministic router and planner.
//
// Given a user prompt, this decides WHO works (the agent(s)), WHAT they run
// (an ordered read-only tool plan) and WHY (a one-line summary). It is pure so
// it is testable, and it is the floor: the LLM ('llm' action) refines the
// answer from the evidence the tools return, but the plan itself never depends
// on a model being reachable. If the model is down, the tool stream still runs
// and the user still gets the real numbers.

import type { AiAgentId, RoutePlan, ToolPlan } from './types';
import { AI_AGENTS } from './agents';

const KNOWN_CITIES = [
  'lagos', 'abuja', 'ibadan', 'kano', 'ph', 'port harcourt', 'enugu', 'owerri', 'aba', 'benin city', 'kaduna',
  'accra', 'kumasi', 'takoradi', 'tamale', 'cape coast',
  'nairobi', 'mombasa', 'kisumu', 'eldoret', 'nakuru',
  'dakar', 'johannesburg', 'cape town', 'cairo', 'kigali', 'addis ababa', 'lagos',
  'lekki', 'victoria island', 'ikeja', 'yaba', 'surulere', 'mainland', 'island',
];

const KNOWN_CATEGORIES = [
  'restaurant', 'food', 'cafe', 'café', 'barber', 'salon', 'beauty', 'fashion', 'tailor', 'clothing',
  'church', 'hotel', 'lodging', 'real estate', 'property', 'tech', 'software', 'pharmacy', 'health',
  'fitness', 'gym', 'school', 'education', 'events', 'car', 'auto', 'photography', 'studio', 'grocery', 'market',
];

/** Lowercased, punctuation-stripped prompt tokens for signal matching. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** The first known city mentioned, if any. */
export function maybeCity(text: string): string | undefined {
  const lowered = ` ${text.toLowerCase()} `;
  return KNOWN_CITIES.find((c) => lowered.includes(` ${c} `));
}

/** The first known category mentioned, if any. */
export function maybeCategory(text: string): string | undefined {
  const lowered = ` ${text.toLowerCase()} `;
  return KNOWN_CATEGORIES.find((c) => lowered.includes(` ${c} `));
}

/** Score every agent against the prompt; highest wins. */
export function rankAgents(text: string): { agent: string; score: number }[] {
  const lowered = ` ${text.toLowerCase()} `;
  const scored = AI_AGENTS.map((a) => {
    const score = a.signals.reduce((sum, s) => {
      let hits = 0;
      let from = 0;
      while (true) {
        const i = lowered.indexOf(s, from);
        if (i === -1) break;
        hits += 1;
        from = i + s.length;
      }
      return sum + hits;
    }, 0);
    return { agent: a.id, score };
  });
  return scored.sort((a, b) => b.score - a.score);
}

/** Build a deterministic read-only tool plan for the winning agent. */
export function buildPlan(agentId: string, text: string): ToolPlan[] {
  const agent = AI_AGENTS.find((a) => a.id === agentId);
  if (!agent) return [{ tool: 'platform_health', args: {} }];
  const city = maybeCity(text);
  const category = maybeCategory(text);
  const plans: ToolPlan[] = [];
  for (const tool of agent.tools) {
    const args: Record<string, unknown> = {};
    if (tool === 'businesses_snapshot' && city) args.city = city;
    if (tool === 'businesses_snapshot' && category) args.category = category;
    if (tool === 'opportunity_finder' && category) args.category = category;
    if (tool === 'directory_search' && category) args.query = category;
    if (tool === 'directory_search' && city) args.city = city;
    plans.push({ tool, args });
  }
  return plans.length ? plans : [{ tool: 'platform_health', args: {} }];
}

/**
 * Route a prompt to an agent (or two, when the top tie is close) and produce
 * the tool plan. Deterministic — the planner never leaves the read-only set.
 */
export function planFor(prompt: string): RoutePlan {
  const ranked = rankAgents(prompt);
  const top = ranked[0];
  const lead: AiAgentId = top && top.score > 0 ? (top.agent as AiAgentId) : 'audit';
  const second: AiAgentId | undefined =
    ranked[1] && ranked[1].score === top?.score && top && top.score > 0 && ranked[1].agent !== lead
      ? (ranked[1].agent as AiAgentId)
      : undefined;
  const agents = second ? [lead, second] : [lead];
  const agentName = AI_AGENTS.find((a) => a.id === lead)?.name ?? 'Audit & Insight';
  return {
    agents,
    tools: buildPlan(lead, prompt),
    summary: `${agentName} — ${[...new Set(buildPlan(lead, prompt).map((p) => p.tool))].join(', ') || 'platform_health'}`,
  };
}