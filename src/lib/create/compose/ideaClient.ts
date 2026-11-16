// Asks the server for ideas and copy, and gates the reply.
//
// The function it calls, `create-concept-ideas`, was trialled and taken down on
// 2026-11-16, and nothing in Create calls this yet. When it is wired in, the
// rule is already built into the return type: null means "use the copy you
// have", for every reason there is (signed out, offline, slow, rate limited,
// no model, unreadable reply). A concept screen must never wait on a model.

import { supabase } from '../../supabase';
import type { CreativeBrief } from '../brief';
import type { Concept } from './concepts';
import { applyIdeas, ideaRequestFor, readIdeas, type IdeaOutcome } from './ideas';

const TIMEOUT_MS = 9000;

export interface IdeaResult {
  concepts: Concept[];
  outcome: IdeaOutcome;
  /** Tokens as the provider reported them, or null when it reported none. */
  usage: { inputTokens: number; outputTokens: number; calls: number } | null;
}

export async function fetchIdeas(brief: CreativeBrief, concepts: Concept[], signal?: AbortSignal): Promise<IdeaResult | null> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url || !concepts.length) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    /* Signed-in people only: the function refuses anyone else, so do not spend the request. */
    if (!token) return null;
    const timer = new AbortController();
    const stop = setTimeout(() => timer.abort(), TIMEOUT_MS);
    signal?.addEventListener('abort', () => timer.abort(), { once: true });
    try {
      const res = await fetch(`${url}/functions/v1/create-concept-ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(ideaRequestFor(brief, concepts)),
        signal: timer.signal,
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { ideas?: unknown; usage?: IdeaResult['usage'] };
      if (!body.ideas) return null;
      const outcome = readIdeas(body.ideas, brief, concepts);
      if (!Object.values(outcome.accepted).some((a) => Object.keys(a).length)) return null;
      return { concepts: applyIdeas(concepts, outcome, brief), outcome, usage: body.usage ?? null };
    } finally {
      clearTimeout(stop);
    }
  } catch {
    return null;
  }
}
