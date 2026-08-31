import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Play, AlertTriangle, Eye, Info, CheckCircle2 } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { chiefOfStaffBrief, type PlatformFacts } from '../../lib/agents/chiefOfStaff';
import { verifyRun, ranked, withDeltas, type Fact, type Finding } from '../../lib/workforceRuntime';

/**
 * The Chief of Staff's daily brief — the first AI role on the roster that
 * actually runs.
 *
 * Every number here was measured against the live database in the moment the
 * run happened, and the run is thrown away if the summary quotes a figure the
 * run did not measure. That check is not ceremony: this is the screen a
 * founder reads and acts on without re-checking, which is exactly where an
 * invented number does the most damage.
 *
 * Running it also updates the roster, so `os_workforce.current_work` stops
 * being a sentence from a seed migration and starts describing what the agent
 * last did — including saying so when it failed.
 */
interface RunRow {
  id: string;
  status: string;
  summary: string | null;
  facts: Fact[];
  findings: Finding[];
  reason: string | null;
  created_at: string;
}

const TONE = {
  act:   { icon: AlertTriangle, cls: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
  watch: { icon: Eye,   cls: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  info:  { icon: Info,  cls: 'text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
} as const;

export default function DailyBrief() {
  const [latest, setLatest] = useState<RunRow | null>(null);
  const [previous, setPrevious] = useState<RunRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('workforce_runs')
      .select('id,status,summary,facts,findings,reason,created_at')
      .eq('agent_key', 'chief-of-staff')
      .order('created_at', { ascending: false })
      .limit(2);
    const rows = (data as RunRow[]) ?? [];
    setLatest(rows[0] ?? null);
    setPrevious(rows[1] ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void load().catch(() => setLoading(false)); }, [load]);

  const run = async () => {
    setRunning(true);
    const started = performance.now();
    try {
      const { data, error } = await supabase.rpc('platform_facts');
      if (error) throw error;

      const result = chiefOfStaffBrief(data as PlatformFacts);
      const verdict = verifyRun(result);

      /*
       * A rejected run is still recorded, with its reason. Dropping it would
       * leave the agent showing its last good summary while it was in fact
       * producing something unusable — which is how an agent goes on looking
       * healthy for a month after it broke.
       */
      const { error: rpcError } = await supabase.rpc('record_workforce_run', {
        p_agent_key: 'chief-of-staff',
        p_status: verdict.status,
        p_summary: result.summary,
        p_facts: result.facts,
        p_findings: result.findings,
        p_reason: verdict.reason ?? null,
        p_duration_ms: Math.round(performance.now() - started),
      });
      if (rpcError) throw rpcError;

      await load();
      if (verdict.status === 'ok') toast.success('Brief updated');
      else if (verdict.status === 'rejected') toast.error(`Run rejected: ${verdict.reason}`);
      else toast('Ran — nothing to report.');
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'The run failed.');
    } finally {
      setRunning(false);
    }
  };

  const facts = latest ? withDeltas(latest.facts ?? [], previous?.facts ?? null) : [];
  const findings = ranked(latest?.findings ?? []);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Chief of Staff — daily brief</h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Measured against the live database. Every figure names the table it came from.
          </p>
        </div>
        <button onClick={run} disabled={running}
          className="inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-bold disabled:opacity-50">
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run now
        </button>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500 py-3">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      ) : !latest ? (
        <p className="text-[12px] text-gray-600 dark:text-gray-300 py-2">
          This agent has never run. Press <span className="font-semibold">Run now</span> to produce
          the first brief.
        </p>
      ) : (
        <>
          {latest.status !== 'ok' && latest.status !== 'nothing-to-report' && (
            <p className="text-[12px] rounded-lg px-3 py-2 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200">
              Last run {latest.status}: {latest.reason}
            </p>
          )}

          <p className="text-sm font-semibold text-gray-900 dark:text-white">{latest.summary}</p>

          {findings.length === 0 ? (
            <p className="flex items-center gap-1.5 text-[12px] text-green-700 dark:text-green-400">
              <CheckCircle2 size={13} /> Nothing needs a decision.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {findings.map((f) => {
                const tone = TONE[f.severity] ?? TONE.info;
                const Icon = tone.icon;
                return (
                  <li key={f.title} className={`rounded-lg border px-3 py-2 ${tone.cls}`}>
                    <p className="text-[12px] font-bold flex items-center gap-1.5"><Icon size={13} /> {f.title}</p>
                    <p className="text-[11px] opacity-90 mt-0.5">{f.detail}</p>
                  </li>
                );
              })}
            </ul>
          )}

          <details className="text-[11px]">
            <summary className="cursor-pointer text-gray-500 dark:text-gray-400 font-semibold">
              The numbers, and where each came from
            </summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full">
                <tbody>
                  {facts.map((f) => (
                    <tr key={f.key} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-1 pr-3 text-gray-700 dark:text-gray-200">{f.label}</td>
                      <td className="py-1 pr-3 text-right font-mono font-bold text-gray-900 dark:text-white tabular-nums">{f.value}</td>
                      <td className="py-1 pr-3 text-right font-mono tabular-nums text-gray-400">
                        {typeof f.delta === 'number' && f.delta !== 0 ? (f.delta > 0 ? `+${f.delta}` : f.delta) : ''}
                      </td>
                      <td className="py-1 text-gray-400 font-mono">{f.source}{f.filter ? ` · ${f.filter}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <p className="text-[10px] text-gray-400">
            Last run {new Date(latest.created_at).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
