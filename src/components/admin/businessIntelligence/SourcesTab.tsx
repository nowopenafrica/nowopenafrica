import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Activity, History, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isUnprovisionedError } from '../../../lib/enrichmentOps';
import { sourcePermits, type SourcePolicy } from '../../../lib/acquire/adapter';
import { sourceGate } from '../../../lib/radar/sources';
import { toRadarSource } from '../../../lib/discoveryEngine';
import { Card, EmptyState, StatusChip, WarnBanner } from './shared';

interface SourceRow {
  key: string;
  name: string;
  kind: string;
  active: boolean;
  automated_access: string;
  bulk_extraction: string;
  competing_dataset: string;
  redistribution: string;
  /* Added 20260917010000 — the two rights the registry could not answer. */
  image_reuse_allowed?: string | null;
  contact_storage_allowed?: string | null;
  compliance_status?: string | null;
  license_type?: string | null;
  licence: string | null;
  authorised_by: string | null;
  authorised_at: string | null;
  notes: string | null;
  last_run_at: string | null;
  records_seen: number;
  health_status: string | null;
  last_successful_sync: string | null;
  last_error: string | null;
}

interface RunRow {
  id: string;
  campaign_id: string | null;
  status: string;
  records_discovered: number;
  records_published: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

interface CampaignLite { id: string; name: string; }

const OPS: Array<{ key: 'discover' | 'bulk' | 'publish'; label: string }> = [
  { key: 'discover', label: 'discover/fetch' },
  { key: 'bulk', label: 'bulk' },
  { key: 'publish', label: 'publish' },
];

function toPolicy(row: SourceRow): SourcePolicy {
  return {
    key: row.key,
    name: row.name,
    active: row.active,
    automatedAccess: row.automated_access,
    bulkExtraction: row.bulk_extraction,
    redistribution: row.redistribution,
    competingDataset: row.competing_dataset,
    licence: row.licence,
    authorisedBy: row.authorised_by,
  };
}

export default function SourcesTab() {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [runCampaigns, setRunCampaigns] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, runsR, campaignsR] = await Promise.all([
      supabase.from('radar_sources').select('*').order('name'),
      supabase.from('business_discovery_runs').select('*').order('created_at', { ascending: false }).limit(8),
      supabase.from('business_discovery_campaigns').select('id,name'),
    ]);
    if (s.error) setError(isUnprovisionedError(s.error.message) ? 'Sources table not provisioned.' : s.error.message);
    else setRows(s.data as unknown as SourceRow[]);
    if (!runsR.error && runsR.data) setRuns(runsR.data as unknown as RunRow[]);
    if (!campaignsR.error && campaignsR.data) setRunCampaigns(Object.fromEntries((campaignsR.data as CampaignLite[]).map((x) => [x.id, x.name])));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const key = r.health_status ?? (r.active ? 'unknown' : 'disabled');
      out[key] = (out[key] ?? 0) + 1;
    }
    return out;
  }, [rows]);

  const HEALTH_ORDER = ['healthy', 'degraded', 'unhealthy', 'unknown', 'disabled'];

  const toggle = async (row: SourceRow) => {
    setBusy(row.key);
    const next = !row.active;
    const { error: e } = await supabase.from('radar_sources').update({ active: next }).eq('key', row.key);
    if (e) {
      toast.error(e.message.includes('radar_sources_active_requires_rights')
        ? 'Cannot switch on: every right must be permitted and a named person must have signed off. Edit the source in the database first.'
        : e.message);
    } else {
      toast.success(next ? `${row.name} switched on.` : `${row.name} switched off.`);
      void load();
    }
    setBusy(null);
  };

  if (loading) return <div className="py-10 text-center text-sm text-gray-400">Loading source registry…</div>;

  return (
    <div className="space-y-5">
      {error && <WarnBanner>{error}</WarnBanner>}
      <p className="text-[13px] text-gray-500 dark:text-gray-400">
        The registry is rights-gated in the database: a source cannot be stored active unless all four rights are
        permitted and signed off. Switching a source off here blocks every future ingest and keeps its records from
        reaching the queue.
      </p>
      <Card title={<span className="flex items-center gap-2"><Activity size={14} /> Network health</span>}>
        <div className="flex flex-wrap items-center gap-2">
          {HEALTH_ORDER.map((key) => (
            <StatusChip key={key} status={key}>
              {summary[key] ?? 0} {key}
            </StatusChip>
          ))}
          <span className="text-[12px] text-gray-500 dark:text-gray-400">across {rows.length} registered source(s), as last reported by the worker</span>
        </div>
      </Card>
      {rows.length === 0 ? (
        <Card><EmptyState>No sources registered.</EmptyState></Card>
      ) : (
        rows.map((row) => {
          const policy = toPolicy(row);
          const gate = sourceGate(toRadarSource(row));
          return (
            <Card
              key={row.key}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {row.name}
                  <span className="font-normal text-gray-400">({row.key})</span>
                  <StatusChip status={row.active ? 'active' : 'blocked'}>{row.active ? 'active' : 'off'}</StatusChip>
                </span>
              }
              action={
                <button
                  disabled={busy === row.key}
                  onClick={() => void toggle(row)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                    row.active
                      ? 'border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                      : 'bg-nowopen-500 text-white hover:bg-nowopen-600'
                  }`}
                >
                  {busy === row.key ? <Loader2 size={13} className="animate-spin" /> : row.active ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
                  {row.active ? 'Switch off' : 'Switch on'}
                </button>
              }
            >
              <div className="space-y-3 text-[12px]">
                {/*
                  * SIX rights, not four.
                  *
                  * Images and contacts are separately licensed from the data
                  * around them — Wikidata is the case that proves it: CC0
                  * data, photographs on Commons that are licensed per file.
                  * Showing only the first four let an operator conclude that
                  * "everything permitted" covered the pictures too.
                  */}
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                  <RightBox label="automated access" value={row.automated_access} />
                  <RightBox label="bulk extraction" value={row.bulk_extraction} />
                  <RightBox label="competing dataset" value={row.competing_dataset} />
                  <RightBox label="redistribution" value={row.redistribution} />
                  <RightBox label="image reuse" value={row.image_reuse_allowed ?? 'unknown'} />
                  <RightBox label="contact storage" value={row.contact_storage_allowed ?? 'unknown'} />
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    source health: <StatusChip status={row.health_status ?? 'unknown'}>{row.health_status ?? 'unknown'}</StatusChip>
                  </span>
                  {/* Health is operational; review is legal. Different questions. */}
                  <span className="flex items-center gap-1.5">
                    review: <strong>{(row.compliance_status ?? 'review_required').replace(/_/g, ' ')}</strong>
                  </span>
                  {row.license_type && <span>licence type: {row.license_type.replace(/_/g, ' ')}</span>}
                  {row.licence && <span>licence: {row.licence}</span>}
                  <span>{row.authorised_by ? `signed off by ${row.authorised_by}` : 'no sign-off recorded'}</span>
                  <span>records seen: {row.records_seen}</span>
                  {row.last_run_at && <span>last run: {new Date(row.last_run_at).toLocaleString()}</span>}
                  {row.last_successful_sync && <span>last sync: {new Date(row.last_successful_sync).toLocaleString()}</span>}
                  {row.last_error && (
                    <span className="text-rose-600 dark:text-rose-400" title={row.last_error}>last error: {row.last_error.slice(0, 80)}</span>
                  )}
                  <span className="ml-auto">kind: {row.kind}</span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {OPS.map((op) => {
                    const v = sourcePermits(policy, op.key);
                    return (
                      <span key={op.key} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${v.permitted ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`} title={v.reason}>
                        {v.permitted ? '✓' : '✕'} {op.label}
                      </span>
                    );
                  })}
                  {!gate.allowed && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300" title={gate.reason}>
                      ✓ queue gate
                    </span>
                  )}
                </div>
                {!gate.allowed && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">{gate.reason}</p>
                )}
              </div>
            </Card>
          );
        })
      )}
      {runs.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><History size={14} /> Recent runs</span>}>
          <ul className="space-y-2">
            {runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                <StatusChip status={run.status}>{run.status}</StatusChip>
                <span className="font-semibold">{run.campaign_id ? runCampaigns[run.campaign_id] ?? run.campaign_id : 'no campaign'}</span>
                <span className="text-gray-500 dark:text-gray-400">{run.records_discovered} discovered · {run.records_published} published</span>
                {run.error && <span className="max-w-[260px] truncate text-rose-600 dark:text-rose-400" title={run.error}>err: {run.error.slice(0, 60)}</span>}
                <span className="ml-auto text-gray-400">{new Date(run.finished_at ?? run.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RightBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <StatusChip status={value}>{value}</StatusChip>
    </div>
  );
}