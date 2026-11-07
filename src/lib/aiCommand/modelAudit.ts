/**
 * Do the models we offer still exist?
 *
 * ── WHY THIS IS NOT PARANOIA ─────────────────────────────────────────────
 *
 * The Command Centre's model dropdown is a hardcoded list of 18 ids. Provider
 * catalogues change constantly, and this codebase has already been bitten:
 * `llm.ts` records that on 2026-08-29 Groq answered 404 model_not_found for
 * `llama-3.3-70b-versatile`, which was the configured default — and because
 * the health endpoint reported which model was CONFIGURED rather than which
 * one answers, the assistant read as healthy while every real call fell
 * through to search.
 *
 * A retired id in the dropdown is the same failure with an operator in the
 * middle: they pick a model, the task fails, and nothing on screen connects
 * the two.
 *
 * ── THE THIRD STATE IS THE IMPORTANT ONE ─────────────────────────────────
 *
 * A model is live, retired, or UNVERIFIABLE — and the last is not a softer
 * version of retired. A provider with no key, or whose catalogue endpoint did
 * not answer, tells us nothing about its models. Marking those "retired"
 * would invent a finding; marking them "live" would hide one. They are
 * reported as unknown, which is what they are.
 */

export interface ProviderCatalog {
  provider: string;
  configured: boolean;
  reachable: boolean;
  models: string[];
  note?: string;
}

export type ModelVerdict =
  /** The provider lists this id. */
  | 'live'
  /** The provider answered, and this id is not in its catalogue. */
  | 'retired'
  /** No key, or the catalogue could not be read. Nothing is known. */
  | 'unverifiable';

export interface ModelAuditRow {
  /** The id exactly as the UI offers it, e.g. "opencode/deepseek-v4-pro". */
  id: string;
  provider: string;
  verdict: ModelVerdict;
  /** Why, in one phrase, for the operator. */
  detail: string;
}

/**
 * The provider an offered id belongs to.
 *
 * Ids are written "provider/model" in the UI list. An id with no prefix
 * cannot be attributed, and is reported as such rather than guessed into a
 * provider that may not serve it.
 */
export function providerOf(id: string): string | null {
  const slash = id.indexOf('/');
  if (slash <= 0) return null;
  const prefix = id.slice(0, slash);
  // The UI writes "opencode/..." for the OpenCode Zen gateway, which the
  // router calls "zen". One name for one thing, mapped in one place.
  return prefix === 'opencode' ? 'zen' : prefix;
}

/** The model id as the provider lists it, without the UI's prefix. */
export function bareId(id: string): string {
  const slash = id.indexOf('/');
  return slash <= 0 ? id : id.slice(slash + 1);
}

/**
 * Check every offered id against what the providers actually serve.
 *
 * @param offered the ids the UI puts in front of an operator
 * @param catalogs what each provider answered, from selftest-ai-models
 */
export function auditModels(offered: string[], catalogs: ProviderCatalog[]): ModelAuditRow[] {
  const byProvider = new Map(catalogs.map((c) => [c.provider, c]));

  return offered.map((id): ModelAuditRow => {
    const provider = providerOf(id);
    if (!provider) {
      return {
        id, provider: '(unknown)', verdict: 'unverifiable',
        detail: 'No provider prefix on this id, so there is nothing to check it against.',
      };
    }

    const catalog = byProvider.get(provider);
    if (!catalog) {
      return { id, provider, verdict: 'unverifiable', detail: 'That provider was not checked.' };
    }
    if (!catalog.configured) {
      return { id, provider, verdict: 'unverifiable', detail: catalog.note ?? 'No API key is set for this provider.' };
    }
    if (!catalog.reachable) {
      return { id, provider, verdict: 'unverifiable', detail: catalog.note ?? 'The catalogue could not be read.' };
    }

    /*
     * Compared on the bare id AND the full id: providers differ on whether
     * they echo back the prefix (OpenRouter does, Groq does not), and a
     * mismatch there would report every model retired.
     */
    const listed = catalog.models.includes(bareId(id)) || catalog.models.includes(id);
    return listed
      ? { id, provider, verdict: 'live', detail: 'Listed by the provider.' }
      : { id, provider, verdict: 'retired', detail: 'The provider answered and does not list this id.' };
  });
}

/** Counts for a one-line summary. */
export function auditSummary(rows: ModelAuditRow[]): Record<ModelVerdict, number> {
  return rows.reduce((acc, r) => ({ ...acc, [r.verdict]: acc[r.verdict] + 1 }),
    { live: 0, retired: 0, unverifiable: 0 } as Record<ModelVerdict, number>);
}
