/**
 * Which of the models we offer are actually still there.
 *
 * The Command Centre's picker is a hardcoded list of ids. Provider catalogues
 * change, and this codebase has been bitten before: `llm.ts` records Groq
 * answering 404 model_not_found for the configured default on 2026-08-29,
 * while the health endpoint still read healthy because it reported the model
 * that was CONFIGURED rather than the one that answers.
 *
 * This asks each provider what it serves and compares. It is a button rather
 * than something that runs on mount: it spends a real (tiny) probe call per
 * provider, and an operator should choose when to do that.
 */

import { useCallback, useState } from 'react';
import { RefreshCw, Loader2, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { AI_MODEL_GROUPS } from '../../lib/aiCommand/models';
import {
  auditModels, auditSummary, type ModelAuditRow, type ProviderCatalog,
} from '../../lib/aiCommand/modelAudit';

/**
 * What this build will actually use, inlined at build time.
 *
 * Read here rather than assumed: a deployment can have the OpenCode broker
 * fully configured and still run every session on the built-in engine because
 * the bundle was built without this set, and nothing on screen would say so.
 */
const ENGINE_IN_BUILD: string = import.meta.env.VITE_AI_ENGINE ?? 'builtin';

export default function ModelAvailability() {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ModelAuditRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [engine, setEngine] = useState<{ opencodeConfigured: boolean; note: string } | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { data, error } = await supabase.functions.invoke('selftest-ai-models', { body: {} });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(String(data?.reason ?? 'The check was refused.'));

      const offered = AI_MODEL_GROUPS.flatMap((g) => g.models.map((m) => m.id));
      setRows(auditModels(offered, (data.catalogs ?? []) as ProviderCatalog[]));
      setCheckedAt(String(data.checkedAt ?? ''));
      setEngine(data.engine ?? null);
    } catch (e) {
      /*
       * Never leave a stale result on screen beside a failure — a list from
       * ten minutes ago read as current is exactly the kind of stale claim
       * this panel exists to catch.
       */
      setRows(null);
      setEngine(null);
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const summary = rows ? auditSummary(rows) : null;

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Model availability</h3>
          <p className="text-[11px] text-gray-500">
            Asks each configured provider what it actually serves, and checks the picker against it.
          </p>
        </div>
        <button
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-[12px] font-semibold min-h-[44px] disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {busy ? 'Asking the providers…' : 'Check now'}
        </button>
      </div>

      {problem && (
        <p className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-[12px] text-amber-800 dark:text-amber-200">
          {problem}
        </p>
      )}

      {engine && (
        /*
         * The OpenCode coding engine needs BOTH halves: secrets on the edge
         * function, and the browser built with VITE_AI_ENGINE=opencode. With
         * only one, sessions quietly run on the built-in engine, or every run
         * fails with what looks like an outage. Showing the server half, and
         * naming the browser half, is the difference between "broken" and
         * "not switched on".
         */
        <div className={`mt-3 rounded-xl border p-3 text-[12px] ${
          engine.opencodeConfigured
            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300'
        }`}>
          <span className="font-semibold">
            OpenCode engine: {engine.opencodeConfigured ? 'broker configured' : 'not configured'}
          </span>
          <span className="block text-[11px] mt-0.5 opacity-90">{engine.note}</span>
          <span className="block text-[11px] mt-0.5 opacity-90">
            This browser is built with VITE_AI_ENGINE=<span className="font-mono">{ENGINE_IN_BUILD}</span>.
          </span>
        </div>
      )}

      {summary && (
        <>
          <p className="mt-3 text-[12px] text-gray-700 dark:text-gray-300">
            <span className="font-semibold">{summary.live} live</span>
            {summary.retired > 0 && <> · <span className="font-semibold text-rose-600 dark:text-rose-400">{summary.retired} retired</span></>}
            {summary.unverifiable > 0 && <> · {summary.unverifiable} not checkable</>}
            {checkedAt && <span className="text-gray-400"> · {new Date(checkedAt).toLocaleTimeString()}</span>}
          </p>

          <ul className="mt-2 space-y-1">
            {rows!.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-[11px]">
                {r.verdict === 'live' && <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />}
                {r.verdict === 'retired' && <XCircle size={13} className="mt-0.5 shrink-0 text-rose-600" />}
                {/*
                  * Deliberately a question mark, not a cross. "We could not
                  * check" is not "this is gone", and showing them the same
                  * would have an operator delete working models.
                  */}
                {r.verdict === 'unverifiable' && <HelpCircle size={13} className="mt-0.5 shrink-0 text-gray-400" />}
                <span className="min-w-0">
                  <span className="font-mono text-gray-800 dark:text-gray-200">{r.id}</span>
                  {r.verdict !== 'live' && <span className="text-gray-500"> — {r.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
