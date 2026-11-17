import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw, ShieldCheck } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { formatLagos } from '../../lib/brandSocial';
import ConfirmDialog from '../ConfirmDialog';

/**
 * Direct publishing — approved brand posts go straight to Meta at their
 * planned time, without Zoho, for channels on the 'meta_direct' route.
 *
 * Off until the founder switches it on. The test button makes an UNPUBLISHED
 * Page post and deletes it, so the write path can be proved without anything
 * appearing publicly.
 */

interface Status {
  settings: { direct_publish_enabled: boolean; direct_publish_grace_minutes: number; direct_publish_last_tick: string | null; direct_publish_last_result: any } | null;
  channels: { id: string; label: string; publish_route: string; external_account_id: string | null }[];
  token: { configured: boolean; valid?: boolean; expires?: string | null; canPostFacebook?: boolean; canPostInstagram?: boolean; canPostThreads?: boolean };
}

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 min-h-[44px] text-sm font-semibold transition disabled:opacity-50';
const btnQuiet = `${btn} border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700`;

async function fnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { const b = await ctx.json(); if (b?.error) return String(b.error); } catch { /* fall through */ }
  }
  return (error as Error)?.message ?? 'Something went wrong.';
}

export default function BrandDirectPublish({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);

  const call = useCallback(async (action: 'status' | 'run' | 'test') => {
    const { data, error } = await supabase.functions.invoke('brand-social-publish', { body: { action } });
    if (error) throw new Error(await fnError(error));
    return data;
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try { setStatus(await call('status') as Status); } catch (e) { setErr((e as Error).message); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  const setEnabled = async (on: boolean) => {
    setBusy('toggle');
    const { error } = await supabase.from('brand_social_settings').update({ direct_publish_enabled: on }).eq('id', true);
    setBusy(null); setConfirmOn(false);
    if (error) { toast.error(error.message); return; }
    toast.success(on ? 'Direct publishing is on.' : 'Direct publishing is off.');
    void load(); onChanged();
  };

  const act = async (action: 'run' | 'test') => {
    setBusy(action);
    try {
      const r = await call(action);
      if (action === 'test') {
        if (r?.ok) toast.success(`Facebook write test passed (unpublished post ${r.deleted ? 'created and deleted' : 'created; delete it on the Page'}).`);
        else toast.error(`Test failed: ${r?.error ?? 'unknown error'}`);
      } else if (r?.skipped) toast(r.skipped);
      else toast.success(`Checked ${r?.considered ?? 0}; published ${(r?.results ?? []).filter((x: any) => x.ok).length}.`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
    void load(); onChanged();
  };

  if (err) {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-900 dark:text-amber-100">
        <p className="font-semibold flex items-center gap-2"><AlertTriangle size={16} /> Direct publishing could not be checked.</p>
        <p className="mt-1">{err}</p>
        <button type="button" className={`${btnQuiet} mt-3`} onClick={() => void load()}><RefreshCw size={16} /> Check again</button>
      </div>
    );
  }
  if (!status) return <div className="text-sm text-gray-500 dark:text-gray-400">Checking direct publishing…</div>;

  const s = status.settings;
  const direct = status.channels.filter((c) => c.publish_route === 'meta_direct' || c.publish_route === 'direct');
  const last = s?.direct_publish_last_result;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><ShieldCheck size={18} /> Direct publishing</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
            Approved posts go straight to {direct.map((c) => c.label).join(' and ') || 'no channel'} at their planned Lagos time, checked every 5 minutes.
            A post more than {s?.direct_publish_grace_minutes ?? 120} minutes overdue is left for you to reschedule, never posted late.
            Other channels keep going through Zoho, and the Zoho file leaves these out so nothing posts twice.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white min-h-[44px]">
          <input type="checkbox" className="h-5 w-5" checked={!!s?.direct_publish_enabled} disabled={busy === 'toggle'}
            onChange={(e) => (e.target.checked ? setConfirmOn(true) : void setEnabled(false))} />
          Publishing on
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Meta token</p>
          <p className="text-gray-900 dark:text-white">{!status.token.configured ? 'Not set' : status.token.valid ? `Valid, expires ${status.token.expires ?? 'unknown'}` : 'Invalid: reconnect'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Can post</p>
          <p className="text-gray-900 dark:text-white flex flex-col">
            <span>{status.token.canPostFacebook ? '✓' : '✗'} Facebook Page</span>
            <span>{status.token.canPostInstagram ? '✓' : '✗'} Instagram{status.token.canPostInstagram ? '' : ' (token lacks instagram_content_publish)'}</span>
            <span>{status.token.canPostThreads ? '✓' : '✗'} Threads{status.token.canPostThreads ? '' : ' (not connected)'}</span>
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Last run</p>
          <p className="text-gray-900 dark:text-white">{s?.direct_publish_last_tick ? formatLagos(s.direct_publish_last_tick) : 'Never'}</p>
          {last && <p className="text-xs text-gray-500 dark:text-gray-400">{last.due ?? 0} due, {(last.results ?? []).filter((r: any) => r.ok).length} published, {(last.results ?? []).filter((r: any) => !r.ok).length} failed</p>}
        </div>
      </div>

      {(last?.results ?? []).filter((r: any) => !r.ok).length > 0 && (
        <ul className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-800 dark:text-red-200 space-y-1">
          {(last.results as any[]).filter((r) => !r.ok).map((r, i) => <li key={i}><span className="font-semibold">{r.code} · {r.channel}:</span> {r.error}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnQuiet} disabled={!!busy} onClick={() => void act('test')}>
          {busy === 'test' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Test Facebook connection (private)
        </button>
        <button type="button" className={btnQuiet} disabled={!!busy || !s?.direct_publish_enabled} onClick={() => void act('run')}>
          {busy === 'run' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Publish what is due now
        </button>
      </div>

      <ConfirmDialog
        open={confirmOn}
        title="Turn on direct publishing?"
        message={`From now on, every approved post with a ${direct.map((c) => c.label).join(' or ')} version is published publicly at its planned time, without anyone pressing send. Posts still waiting for approval are not published.`}
        confirmLabel="Turn on"
        busy={busy === 'toggle'}
        onConfirm={() => void setEnabled(true)}
        onCancel={() => setConfirmOn(false)}
      />
    </div>
  );
}
