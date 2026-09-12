import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Loader2, Power, RefreshCw, Save, ShieldCheck } from 'lucide-react';

import { Business } from '../../types';
import { supabase } from '../../lib/supabase';
import { isUnprovisionedError } from '../../lib/enrichmentOps';
import {
  DEFAULT_APPROVAL_THRESHOLD, SYNC_FAMILIES, postureMessage,
  type SyncPreferences,
} from '../../lib/syncPreferences';

/**
 * Studio → Manage → Enrichment & Sync.
 *
 * The owner's half of the enrichment engine. The engine WRITES proposed
 * changes; whether one is applied is authority, and the authority is the
 * owner's wallet here: the `auto_apply_*` flags, the confidence bar and the
 * master switch all live in business_sync_preferences, and the SQL applier
 * (auto_apply_due_proposals) reads THIS table — not this screen. The panel is
 * just the honest editor (owner RLS allows exactly the owner to read/update
 * their row). Rules take effect from the next scheduled run.
 */

interface Props {
  business: Business;
}

export default function EnrichmentSyncPanel({ business }: Props) {
  const [original, setOriginal] = useState<SyncPreferences | null>(null);
  const [draft, setDraft] = useState<SyncPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [unprovisioned, setUnprovisioned] = useState(false);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('business_sync_preferences')
      .select('*')
      .eq('business_id', business.id)
      .maybeSingle();
    setLoading(false);
    if (error) {
      if (isUnprovisionedError(error.message)) {
        setUnprovisioned(true);
        setMissing(false);
        setOriginal(null);
        setDraft(null);
        return;
      }
      toast.error(error.message);
      return;
    }
    setUnprovisioned(false);
    if (data) {
      setMissing(false);
      const prefs = data as SyncPreferences;
      setOriginal(prefs);
      setDraft(prefs);
    } else {
      setMissing(true);
      setOriginal(null);
      setDraft(null);
    }
  }, [business.id]);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => {
    if (!original || !draft) return false;
    return (
      original.sync_enabled !== draft.sync_enabled
      || original.auto_apply_hours !== draft.auto_apply_hours
      || original.auto_apply_source_images !== draft.auto_apply_source_images
      || original.auto_apply_discovery_fields !== draft.auto_apply_discovery_fields
      || original.notify_on_change !== draft.notify_on_change
      || original.approval_threshold !== draft.approval_threshold
      || original.confirm_24_hours !== draft.confirm_24_hours
      || (original.hours_override_reason ?? null) !== (draft.hours_override_reason ?? null)
    );
  }, [original, draft]);

  const set = <K extends keyof SyncPreferences>(key: K, value: SyncPreferences[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!draft || !dirty) return;
    setSaving(true);
    const { error } = await supabase
      .from('business_sync_preferences')
      .update({
        sync_enabled: draft.sync_enabled,
        auto_apply_hours: draft.auto_apply_hours,
        auto_apply_source_images: draft.auto_apply_source_images,
        auto_apply_discovery_fields: draft.auto_apply_discovery_fields,
        notify_on_change: draft.notify_on_change,
        approval_threshold: draft.approval_threshold,
        confirm_24_hours: draft.confirm_24_hours,
        hours_override_reason: draft.hours_override_reason?.trim() || null,
      })
      .eq('business_id', business.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setOriginal({ ...draft });
    toast.success('Saved — the enrichment engine will follow this from the next run.');
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="animate-spin mr-2" /> Loading sync preferences…</div>;
  }

  if (unprovisioned) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center space-y-1.5">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Enrichment is not yet provisioned in this database.</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
          These preferences live in <code className="font-mono">business_sync_preferences</code>, created by the
          enrichment migrations (20260911000000 … 20260912020000). Until a database has them (
          <code className="font-mono">audits/APPLY_ALL_PENDING.sql</code> provisions the whole set in one paste),
          there is nothing to configure here and nothing wrong with the app.
        </p>
      </div>
    );
  }

  if (missing || !draft) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-10 text-center space-y-1.5">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Nothing on file for this business yet.</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
          It is treated as on by default, with every change proposed for you to review first. Preference rows are
          created automatically for new businesses; re-run the page after the row lands.
        </p>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} /> Check again
        </button>
      </div>
    );
  }

  const toggleClass = (on: boolean) =>
    `relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Enrichment &amp; Sync</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            What NowOpen's profile engine may do with this listing — the engine proposes, and applies only what you
            allow here. Changes take effect from the next scheduled run.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" />
        <span>{postureMessage(draft)}</span>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Master switch</p>
          <button
            onClick={() => set('sync_enabled', !draft.sync_enabled)}
            className={toggleClass(draft.sync_enabled)}
            aria-pressed={draft.sync_enabled}
            aria-label={draft.sync_enabled ? 'Enrichment on' : 'Enrichment off'}
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${draft.sync_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="p-4 text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
          <Power size={15} className="mt-0.5 text-gray-400 shrink-0" />
          Off stops the engine queueing this business entirely. On keeps it collecting evidence and proposing changes.
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Apply without asking</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Each family auto-applies only when a source's confidence clears the bar below. Everything else stays a
            proposal for your review in Change Proposals.
          </p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {SYNC_FAMILIES.map((family) => (
            <div key={family.key} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{family.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{family.blurb}</p>
              </div>
              <button
                onClick={() => set(family.flag, !draft[family.flag])}
                className={toggleClass(draft[family.flag])}
                aria-pressed={draft[family.flag]}
                aria-label={`${family.label}: ${draft[family.flag] ? 'auto-apply on' : 'auto-apply off'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${draft[family.flag] ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Confidence bar</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Only consulted for a family you switch on above: proposals below this score stay for review.
          </p>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
              <span>Minimum confidence to apply without asking</span>
              <span className="font-semibold">{draft.approval_threshold}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft.approval_threshold}
              onChange={(e) => set('approval_threshold', Number(e.target.value))}
              className="w-full mt-1 accent-blue-600"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Default {DEFAULT_APPROVAL_THRESHOLD}. A stricter bar means fewer things change on their own; a laxer one
              trusts sources more.
            </p>
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={draft.confirm_24_hours}
              onChange={(e) => set('confirm_24_hours', e.target.checked)}
              className="mt-0.5 accent-blue-600"
            />
            <span>
              I confirm this business is open 24/7 — matching hours a source reports are applied immediately, no
              matter the confidence bar.
            </span>
          </label>
          {draft.confirm_24_hours && (
            <input
              value={draft.hours_override_reason ?? ''}
              onChange={(e) => set('hours_override_reason', e.target.value)}
              placeholder="Why 24/7? (goes on the public record)"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          Save preferences
        </button>
        {saving ? (
          <span className="text-xs text-gray-500">Saving…</span>
        ) : dirty ? (
          <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
            <Check size={12} /> Unsaved changes
          </span>
        ) : null}
      </div>
    </div>
  );
}