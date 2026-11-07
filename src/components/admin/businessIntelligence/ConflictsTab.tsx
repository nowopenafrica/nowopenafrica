import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { isUnprovisionedError } from '../../../lib/enrichmentOps';
import { proposalFieldLabel } from '../../../lib/changeProposals';
import {
  recommended, recommendationReason, sourceName, isCurrentValue, blockedReason,
  conflictSummary, displayConflictValue, UNRANKED_AUTHORITY,
  type FieldConflictRow, type ConflictCandidate,
} from '../../../lib/fieldConflicts';
import { Card, EmptyState, StatusChip, WarnBanner } from './shared';

/**
 * Admin → Business Intelligence → Conflicts.
 *
 * When two sources disagree about one field, somebody has to choose. This is
 * where they do it, and the choice is recorded with the rivals it beat.
 *
 * The panel recommends but never decides: `business_field_conflicts` orders the
 * candidates by the per-field authority ladder, and the top one is shown as a
 * suggestion with its reasoning spelled out. Resolving runs
 * `resolve_field_conflict(evidence_id)`, which applies the winner through the
 * SAME applier a staff approval uses — so the claimed-profile guard, the
 * writable-field allowlist and the evidence re-check all still hold. Losing
 * evidence is superseded, never deleted.
 */

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function ConflictsTab() {
  const [rows, setRows] = useState<FieldConflictRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unprovisioned, setUnprovisioned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase
      .from('business_field_conflicts')
      .select('*')
      .order('first_seen', { ascending: true })
      .limit(200);
    setLoading(false);
    if (e) {
      if (isUnprovisionedError(e.message)) { setUnprovisioned(true); setRows([]); setError(null); return; }
      setError(e.message);
      setRows([]);
      return;
    }
    setUnprovisioned(false);
    setError(null);
    setRows((data as FieldConflictRow[] | null) ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const key = (r: FieldConflictRow) => `${r.business_id}:${r.field_name}`;

  const resolve = async (r: FieldConflictRow, c: ConflictCandidate) => {
    const k = key(r);
    setBusy(k);
    const { data, error: e } = await supabase.rpc('resolve_field_conflict', {
      p_evidence: c.evidence_id,
      p_note: noteFor[k]?.trim() || null,
    });
    setBusy(null);
    if (e) { toast.error(e.message); return; }
    const res = data as { applied?: boolean; superseded?: number; already_held?: boolean } | null;
    toast.success(
      res?.already_held
        ? `Kept the existing value; ${res?.superseded ?? 0} rival source(s) superseded.`
        : `Applied ${sourceName(c.source)}'s value; ${res?.superseded ?? 0} rival source(s) superseded.`,
    );
    setNoteFor((p) => { const n = { ...p }; delete n[k]; return n; });
    void load();
  };

  const dismiss = async (r: FieldConflictRow) => {
    const k = key(r);
    setBusy(k);
    const { error: e } = await supabase.rpc('dismiss_field_conflict', {
      p_business: r.business_id,
      p_field: r.field_name,
      p_note: noteFor[k]?.trim() || null,
    });
    setBusy(null);
    if (e) { toast.error(e.message); return; }
    toast.success('Dismissed — the business keeps what it has.');
    void load();
  };

  const blockedCount = useMemo(() => rows.filter((r) => r.business_claimed).length, [rows]);

  if (loading) {
    return <div className="py-10 text-center text-sm text-gray-400">Loading conflicts…</div>;
  }

  if (unprovisioned) {
    return (
      <Card>
        <EmptyState>
          Conflict resolution is not provisioned in this database. It reads the{' '}
          <code className="font-mono text-[11px]">business_field_conflicts</code> view, created by migration
          20260917020000.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <p className="max-w-3xl text-[13px] text-gray-500 dark:text-gray-400">
          Fields where two or more sources disagree. The first candidate is the one the per-field authority
          ladder recommends — it is a suggestion, not a decision. Choosing one applies it through the normal
          staff path and supersedes the rest; nothing is deleted.
        </p>
        <button
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-[13px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <WarnBanner>{error}</WarnBanner>}
      {blockedCount > 0 && (
        <WarnBanner>
          {blockedCount} of these {blockedCount === 1 ? 'is' : 'are'} on a claimed business. Staff cannot write
          those fields — the owner controls them.
        </WarnBanner>
      )}

      {/*
        * `error` suppresses the empty state deliberately. A failed read returns
        * no rows, and "no conflicts" is a claim about the data — saying it
        * above an error message tells the operator the opposite of the truth.
        * Nothing is known when the read failed, so nothing is asserted.
        */}
      {error ? null : rows.length === 0 ? (
        <Card>
          <EmptyState>
            No field has two sources disagreeing about it. Today only one source has ever enriched a business,
            and one source cannot disagree with itself — this fills as the enrichment network adds sources.
          </EmptyState>
        </Card>
      ) : (
        rows.map((r) => {
          const k = key(r);
          const top = recommended(r);
          const blocked = blockedReason(r);
          const reason = recommendationReason(r);
          return (
            <Card
              key={k}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {r.business_name ?? r.business_id}
                  <StatusChip status="review">{proposalFieldLabel(r.field_name)}</StatusChip>
                  <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                    {conflictSummary(r)}
                  </span>
                </span>
              }
              action={
                <button
                  disabled={busy === k}
                  onClick={() => void dismiss(r)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                  title="Reject every rival and keep the current value"
                >
                  <X size={13} /> None of these
                </button>
              }
            >
              <div className="space-y-3 text-[12px]">
                <p className="text-gray-500 dark:text-gray-400">
                  Currently on the profile:{' '}
                  <span className="font-semibold text-gray-800 dark:text-gray-100">
                    {displayConflictValue(r.current_value)}
                  </span>
                  <span className="ml-3 text-gray-400 dark:text-gray-500">first seen {fmtDate(r.first_seen)}</span>
                </p>

                {blocked && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-amber-800 dark:text-amber-200">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {blocked}
                  </p>
                )}

                {reason && (
                  <p className="flex items-start gap-1.5 text-gray-600 dark:text-gray-300">
                    <Sparkles size={13} className="mt-0.5 shrink-0 text-nowopen-500" /> {reason}
                  </p>
                )}

                <ul className="divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-100 dark:border-gray-700">
                  {r.candidates.map((c, i) => {
                    const isTop = top?.evidence_id === c.evidence_id;
                    const held = isCurrentValue(r, c);
                    return (
                      <li key={c.evidence_id ?? i} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-2">
                        {isTop && (
                          <span className="rounded bg-nowopen-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-nowopen-600 dark:text-nowopen-300">
                            suggested
                          </span>
                        )}
                        <span
                          className="max-w-[280px] truncate font-semibold text-gray-900 dark:text-white"
                          title={c.value ?? ''}
                        >
                          {displayConflictValue(c.value)}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">{sourceName(c.source)}</span>
                        <span
                          className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-600 dark:text-gray-300"
                          title={
                            (c.authority ?? UNRANKED_AUTHORITY) >= UNRANKED_AUTHORITY
                              ? 'This source is not ranked for this field, so it sorts last.'
                              : 'Source authority for this field. Lower wins.'
                          }
                        >
                          rank {c.authority ?? UNRANKED_AUTHORITY}
                        </span>
                        <span className="tabular-nums text-gray-500 dark:text-gray-400" title="Confidence">
                          {c.confidence ?? '—'}
                        </span>
                        {c.by_ai && (
                          <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                            AI
                          </span>
                        )}
                        {held && (
                          <span className="rounded bg-gray-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                            already held
                          </span>
                        )}
                        {c.source_url && (
                          <a className="text-nowopen-600 hover:underline" href={c.source_url} target="_blank" rel="noreferrer">
                            source
                          </a>
                        )}
                        <button
                          disabled={busy === k || !!blocked}
                          onClick={() => void resolve(r, c)}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            blocked
                              ? blocked
                              : held
                                ? 'Keeps this value and supersedes the rivals — writes nothing.'
                                : 'Applies this value through the normal staff path.'
                          }
                        >
                          {busy === k ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          {held ? 'Keep this' : 'Use this'}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <input
                  value={noteFor[k] ?? ''}
                  onChange={(e) => setNoteFor((p) => ({ ...p, [k]: e.target.value }))}
                  placeholder="Why (recorded on the decision, optional)"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-[12px]"
                />
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
