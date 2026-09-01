import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bot, Loader2, Play, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';

import { supabase } from '../../lib/supabase';

/**
 * Admin → the AI workforce.
 *
 * Shows what the agents concluded on their last run. It does not compute
 * anything: the rules live in one module the scheduler runs, and a console that
 * recalculated them in the browser would be a second implementation quietly
 * drifting from the first. What is on this screen is exactly what was recorded.
 *
 * "Run now" goes through the database, not the browser — admin_run_workforce()
 * is admin-gated and holds the automation key server-side, so the console never
 * needs a secret it cannot keep.
 */
interface Finding {
  title: string;
  severity: 'critical' | 'attention' | 'watch' | 'good';
  detail: string;
  basis: string[];
}

interface Fact { key: string; label: string; value: number; source: string; filter?: string }

interface AgentRow {
  agent_key: string;
  enabled: boolean;
  interval_min: number;
  last_run_at: string | null;
  last_status: string | null;
  failures: number;
  summary: string | null;
  findings: Finding[];
  facts: Fact[];
  reason: string | null;
}

const NAMES: Record<string, string> = {
  'chief-of-staff': 'Chief of Staff',
  'trust-safety': 'Trust & Safety',
  'customer-success': 'Customer Success',
  'growth-director': 'Growth Director',
};

const SEVERITY = {
  critical:  { tone: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', Icon: AlertTriangle },
  attention: { tone: 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', Icon: AlertTriangle },
  watch:     { tone: 'text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700', Icon: Clock },
  good:      { tone: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800', Icon: CheckCircle2 },
} as const;

function cadence(min: number): string {
  if (min < 60) return `every ${min} min`;
  if (min < 1440) return `every ${Math.round(min / 60)}h`;
  return min === 1440 ? 'daily' : `every ${Math.round(min / 1440)} days`;
}

function ago(iso: string | null): string {
  if (!iso) return 'never run';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return 'unknown';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export default function WorkforcePanel() {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [cron, setCron] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  /*
   * Wrapped, because this panel sits inside the founder dashboard: if the RPCs
   * are missing — an un-applied migration, a non-admin session — the panel
   * should render empty, not take the whole page down with it.
   */
  const load = useCallback(async () => {
    try {
      const [latest, status] = await Promise.all([
        supabase.rpc('workforce_latest'),
        supabase.rpc('workforce_cron_status'),
      ]);
      if (latest.error) throw latest.error;
      setRows((latest.data as AgentRow[]) ?? []);
      setCron((status.data as Record<string, unknown>) ?? null);
    } catch {
      setRows([]);
      setCron(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.rpc('admin_run_workforce');
      if (error) throw error;
    } catch (e) {
      setRunning(false);
      toast.error((e as { message?: string })?.message ?? 'Could not reach the workforce.');
      return;
    }
    /*
     * The call is fire-and-forget from the database's point of view — pg_net
     * queues the request and returns immediately — so the panel waits before
     * re-reading rather than showing the previous run and looking broken.
     */
    toast.success('Workforce running…');
    setTimeout(() => { void load().finally(() => setRunning(false)); }, 6000);
  };

  if (loading) {
    return <p className="flex items-center gap-2 text-sm text-gray-500 py-8"><Loader2 size={16} className="animate-spin" /> Loading the workforce…</p>;
  }

  const scheduled = cron?.scheduled === true && cron?.active === true;
  const criticalCount = rows.reduce((n, r) => n + (r.findings ?? []).filter((f) => f.severity === 'critical').length, 0);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Bot size={18} /> AI workforce
          </h2>
          <p className="text-[12px] text-gray-500 dark:text-gray-400 max-w-2xl">
            {/* Said plainly, because it is the safety model and people should be
                able to read it off the screen rather than take it on trust. */}
            Agents read the platform and report. They never publish, message a customer,
            approve a claim or change a business — those stay decisions a person makes.
          </p>
        </div>
        <button onClick={runNow} disabled={running}
          className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold disabled:opacity-50">
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run now
        </button>
      </header>

      {/* Whether it is actually autonomous, stated rather than assumed. */}
      <div className={`rounded-lg border px-3 py-2 text-[12px] ${
        scheduled ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                  : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300'}`}>
        {scheduled
          ? <>Running on its own, {String(cron?.schedule ?? '')} · last tick {ago(cron?.last_run as string ?? null)}
              {criticalCount > 0 && <> · <strong>{criticalCount} critical finding{criticalCount === 1 ? '' : 's'}</strong></>}</>
          : <>Not scheduled — agents will only run when someone presses Run now.</>}
      </div>

      {rows.length === 0 && (
        <p className="text-[12px] text-gray-500 dark:text-gray-400">
          No agent runs recorded yet.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((r) => {
          const findings = r.findings ?? [];
          const failed = r.last_status === 'failed';
          return (
            <article key={r.agent_key} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{NAMES[r.agent_key] ?? r.agent_key}</h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {cadence(r.interval_min)} · {ago(r.last_run_at)}
                    {!r.enabled && ' · paused'}
                  </p>
                </div>
                {failed
                  ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 dark:text-red-300"><XCircle size={12} /> failed</span>
                  : findings.length === 0
                    ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 dark:text-green-400"><CheckCircle2 size={12} /> clear</span>
                    : <span className="text-[11px] font-semibold text-gray-500">{findings.length} finding{findings.length === 1 ? '' : 's'}</span>}
              </div>

              {failed && r.reason && (
                <p className="mt-2 text-[11px] text-red-700 dark:text-red-300">{r.reason}</p>
              )}

              {r.summary && !failed && (
                <p className="mt-1.5 text-[12px] text-gray-600 dark:text-gray-300">{r.summary}</p>
              )}

              {findings.length > 0 && (
                <ul className="mt-2.5 space-y-1.5">
                  {findings.map((f, i) => {
                    const s = SEVERITY[f.severity] ?? SEVERITY.watch;
                    return (
                      <li key={i} className={`rounded-lg border px-2.5 py-2 ${s.tone}`}>
                        <p className="text-[12px] font-semibold flex items-start gap-1.5">
                          <s.Icon size={13} className="mt-0.5 shrink-0" /> {f.title}
                        </p>
                        <p className="text-[11px] opacity-90 mt-0.5">{f.detail}</p>
                        {/* The evidence, so a finding can be argued with rather
                            than only believed. */}
                        {f.basis?.length > 0 && (
                          <p className="text-[10px] opacity-70 mt-1 font-mono">from: {f.basis.join(', ')}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {(r.facts ?? []).length > 0 && (
                <details className="mt-2.5">
                  <summary className="text-[11px] text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                    What it counted
                  </summary>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {r.facts.map((f) => (
                      <div key={f.key} className="flex justify-between gap-2 text-[11px]">
                        <dt className="text-gray-500 truncate" title={f.filter ? `${f.source} where ${f.filter}` : f.source}>{f.label}</dt>
                        <dd className="font-mono font-semibold text-gray-900 dark:text-white tabular-nums">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
