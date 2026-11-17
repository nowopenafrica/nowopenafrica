import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ExternalLink, Flag, Loader2, Megaphone, ShieldAlert } from 'lucide-react';

import ConfirmDialog from '../ConfirmDialog';
import { UPDATE_TYPES, updateTimeLabel } from '../../lib/businessUpdates';
import { UPDATE_REPORT_REASONS } from '../../lib/publicUpdates';
import { dismissReports, hideUpdate, listModeration, unhideUpdate, wouldBeLive, type ModItem } from '../../lib/updateModeration';

/**
 * Admin Console → Updates: reported Business Updates first, then what is live
 * now, then what NowOpen has hidden.
 *
 * Hiding needs a written reason, because the owner reads it in their archive
 * and in their notifications; "removed" with no why teaches a business nothing.
 * A failed read says so; it never shows an empty queue as if nothing was wrong.
 */

type Lists = { reported: ModItem[]; live: ModItem[]; hidden: ModItem[] };
type Pending = { kind: 'hide' | 'unhide'; item: ModItem } | null;

const typeLabel = (t: string) => UPDATE_TYPES.find((x) => x.key === t)?.label ?? 'Update';
const reasonLabel = (r: string) => UPDATE_REPORT_REASONS.find((x) => x.key === r)?.label ?? r;
const summary = (i: ModItem) => i.update.title || i.update.body.slice(0, 80) || typeLabel(i.update.type);
const profileHref = (i: ModItem) => (i.business.username ? `/${i.business.username}` : `/businesses/${i.business.id}`);
const btn = 'inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold border';

function tally(reports: ModItem['reports']): string {
  const counts = new Map<string, number>();
  for (const r of reports) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts.entries()].map(([k, n]) => `${reasonLabel(k)} × ${n}`).join(' · ');
}

export default function UpdatesModerationPanel() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await listModeration();
    if (r.ok) { setLists(r.value); setFailed(false); } else { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    const r = pending.kind === 'hide' ? await hideUpdate(pending.item, reason) : await unhideUpdate(pending.item);
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success(pending.kind === 'hide'
      ? 'Hidden. The owner has been told why.'
      : ('stillLive' in r.value && r.value.stillLive)
        ? 'Visible again. The owner has been told.'
        : 'No longer hidden. Its 24 hours had ended, so it stays in the archive. The owner has been told.');
    if (r.value.warning) toast(r.value.warning, { icon: '⚠️' });
    setPending(null);
    setReason('');
    void load();
  };

  const dismiss = async (item: ModItem) => {
    const r = await dismissReports(item.update.id);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success('Reports dismissed. The update stays up.');
    void load();
  };

  const card = (i: ModItem, actions: React.ReactNode) => (
    <li key={i.update.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-col sm:flex-row gap-4">
      <div className="w-full sm:w-28 aspect-video sm:aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 flex items-center justify-center shrink-0">
        {i.thumb ? <img src={i.thumb} alt="" className="w-full h-full object-cover" /> : <Megaphone size={22} className="text-gray-400" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-800 dark:text-gray-100">{i.business.name}</span>
          {' · '}{typeLabel(i.update.type)}{' · '}
          {updateTimeLabel({
            published_at: i.update.published_at, expires_at: i.update.expires_at,
            ended_at: i.update.ended_at, moderation_status: i.update.moderation_status,
          })}
        </p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{summary(i)}</p>
        {i.update.title && i.update.body && <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line break-words">{i.update.body}</p>}
        {i.reports.length > 0 && (
          <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-800 dark:text-red-200 space-y-1">
            <p className="font-semibold flex items-center gap-1"><Flag size={12} aria-hidden="true" /> {tally(i.reports)}</p>
            {i.reports.filter((r) => r.detail).map((r, n) => (
              <p key={n} className="break-words">“{r.detail}”</p>
            ))}
          </div>
        )}
        {i.update.moderation_status === 'hidden' && i.update.moderation_note && (
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1">
            <ShieldAlert size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> Hidden: {i.update.moderation_note}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          {actions}
          <Link to={profileHref(i)} target="_blank" rel="noopener noreferrer"
            className={`${btn} border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>
            <ExternalLink size={13} aria-hidden="true" /> Open profile
          </Link>
        </div>
      </div>
    </li>
  );

  const hideBtn = (i: ModItem) => (
    <button type="button" onClick={() => { setReason(''); setPending({ kind: 'hide', item: i }); }}
      aria-label={`Hide ${summary(i)}`} className={`${btn} border-red-300 text-red-700 dark:text-red-300`}>Hide</button>
  );

  const section = (title: string, items: ModItem[], empty: string, actions: (i: ModItem) => React.ReactNode) => (
    <section className="space-y-3">
      <h3 className="text-base font-bold text-gray-900 dark:text-white">{title} ({items.length})</h3>
      {items.length === 0
        ? <p className="text-sm text-gray-500 dark:text-gray-400">{empty}</p>
        : <ul className="space-y-3">{items.map((i) => card(i, actions(i)))}</ul>}
    </section>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Megaphone size={18} className="text-rose-600" aria-hidden="true" /> Business Updates
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Reported updates first. Hiding takes an update off every public page at once and tells the owner why.
        </p>
      </div>

      {failed ? (
        <div className="space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300">Couldn't load updates for review. Nothing has changed.</p>
          <button type="button" onClick={() => void load()} className={`${btn} border-gray-300 dark:border-gray-600`}>Try again</button>
        </div>
      ) : !lists ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={15} className="animate-spin" /> Loading…</p>
      ) : (
        <>
          {section('Reported', lists.reported, 'Nothing reported. Every report people send appears here.', (i) => (
            <>
              {hideBtn(i)}
              <button type="button" onClick={() => void dismiss(i)} aria-label={`Dismiss reports for ${summary(i)}`}
                className={`${btn} border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Dismiss reports</button>
            </>
          ))}
          {section('Live now', lists.live, 'Nothing is live right now.', (i) => hideBtn(i))}
          {section('Hidden by NowOpen', lists.hidden, 'Nothing is hidden.', (i) => (
            <button type="button" onClick={() => setPending({ kind: 'unhide', item: i })} aria-label={`Unhide ${summary(i)}`}
              className={`${btn} border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Unhide</button>
          ))}
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        tone={pending?.kind === 'hide' ? 'danger' : 'primary'}
        busy={busy}
        title={pending?.kind === 'hide' ? 'Hide this update?' : 'Unhide this update?'}
        confirmLabel={pending?.kind === 'hide' ? 'Hide update' : 'Unhide'}
        confirmDisabled={pending?.kind === 'hide' && reason.trim().length < 5}
        message={pending?.kind === 'hide' ? (
          <div className="space-y-2">
            <p>It leaves every public page at once. Its open reports are closed, and the owner is notified.</p>
            <label htmlFor="mod-reason" className="block text-xs font-semibold text-gray-700 dark:text-gray-200">
              Reason the owner will see
            </label>
            <textarea id="mod-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm p-2 text-gray-900 dark:text-white" />
          </div>
        ) : pending && wouldBeLive(pending.item.update)
          ? 'It becomes visible again until its 24 hours end, and the owner is told. Keepers are not alerted.'
          : 'Its 24 hours have already ended, so it will not be shown anywhere. It stays in the owner’s archive without the hidden mark, and the owner is told.'}
        onConfirm={() => void confirm()}
        onCancel={() => { setPending(null); setReason(''); }}
      />
    </div>
  );
}
