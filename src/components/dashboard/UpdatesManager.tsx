import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { BellOff, BellRing, Loader2, Megaphone, Plus, ShieldAlert, X } from 'lucide-react';

import ConfirmDialog from '../ConfirmDialog';
import UpdateComposer, { type ComposerInitial } from './UpdateComposer';
import {
  UPDATE_TYPES, deriveUpdateState, ownerGroup, updateTimeLabel, type OwnerGroup,
} from '../../lib/businessUpdates';
import {
  deleteUpdate, endUpdate, listOwnerUpdates, loadKeeperReach, publishUpdate, type OwnerUpdate, type Result,
} from '../../lib/businessUpdatesApi';
import type { KeepTopic } from '../../lib/keeps';

/**
 * Business Updates, from the owner's side: create, schedule, end, delete.
 *
 * Every state shown here is re-derived from the row's own times on a 30-second
 * clock, so an update moves to Archive when its 24 hours end without a reload,
 * the same moment the public stops seeing it. A failed read says so; it never
 * pretends to be an empty list, because "no updates yet" on top of a broken
 * connection invites someone to post everything twice.
 */
interface Props {
  businessId: string;
  businessName: string;
  isOwner: boolean;
  onClose: () => void;
}

const TABS: { key: OwnerGroup; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'upcoming', label: 'Scheduled & drafts' },
  { key: 'archive', label: 'Archive' },
];

const typeLabel = (t: string) => UPDATE_TYPES.find((x) => x.key === t)?.label ?? 'Update';
const summary = (u: OwnerUpdate) => u.title || (u.body.length > 60 ? `${u.body.slice(0, 60)}…` : u.body) || typeLabel(u.type);

type Confirm = { kind: 'end' | 'delete'; u: OwnerUpdate } | null;

export default function UpdatesManager({ businessId, businessName, isOwner, onClose }: Props) {
  const [result, setResult] = useState<Result<OwnerUpdate[]> | null>(null);
  const [reach, setReach] = useState<Record<KeepTopic, number> | null>(null);
  const [tab, setTab] = useState<OwnerGroup>('active');
  const [composing, setComposing] = useState<ComposerInitial | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    const r = await listOwnerUpdates(businessId);
    setResult(r);
    setNow(new Date());
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadKeeperReach(businessId).then(setReach); }, [businessId]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    // Never over an open composer: Escape in a text field would throw away the draft, or close mid-upload.
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !confirm && !composing) onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose, confirm, composing]);

  const groups = useMemo(() => {
    const out: Record<OwnerGroup, OwnerUpdate[]> = { active: [], upcoming: [], archive: [] };
    if (result?.ok) for (const u of result.value) out[ownerGroup(deriveUpdateState(u, now))].push(u);
    return out;
  }, [result, now]);

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    const r = confirm.kind === 'end' ? await endUpdate(confirm.u.id) : await deleteUpdate(confirm.u);
    setBusy(false);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success(confirm.kind === 'end' ? 'Ended. It is in your archive now.' : 'Deleted');
    setConfirm(null);
    void load();
  };

  const publishNow = async (u: OwnerUpdate) => {
    const r = await publishUpdate(u.id, null);
    if (!r.ok) { toast.error(r.message); return; }
    toast.success('Live now, for 24 hours');
    void load();
  };

  const postAgain = (u: OwnerUpdate) => {
    setComposing({ type: u.type, title: u.title, body: u.body, ctaLabel: u.cta_label, ctaUrl: u.cta_url, offerId: u.offer_id });
    if (u.media.length > 0) toast('Add the photos or videos again; they are not copied.', { icon: 'ℹ️' });
  };

  const actionBtn = 'px-3 min-h-[44px] rounded-lg text-[12px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200';

  const list = groups[tab];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Business updates">
      <div className="w-full max-w-2xl my-8 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Megaphone size={17} className="text-rose-600 dark:text-rose-400" /> Updates
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{businessName} · each update is public for 24 hours</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-[44px] h-[44px] inline-flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {composing ? (
            <UpdateComposer
              businessId={businessId}
              businessName={businessName}
              isOwner={isOwner}
              reach={reach}
              initial={composing}
              onCancel={() => setComposing(null)}
              onDone={() => { setComposing(null); void load(); }}
            />
          ) : (
            <button onClick={() => setComposing({})}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700">
              <Plus size={15} /> Create update
            </button>
          )}

          <div role="tablist" aria-label="Updates by state" className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto overflow-y-hidden">
            {TABS.map((t) => (
              <button key={t.key} role="tab" id={`upd-tab-${t.key}`} aria-selected={tab === t.key} aria-controls="upd-panel"
                onClick={() => setTab(t.key)}
                className={`px-3 min-h-[44px] text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${
                  tab === t.key ? 'border-rose-600 text-rose-700 dark:text-rose-300' : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}>
                {t.label} ({result?.ok ? groups[t.key].length : '–'})
              </button>
            ))}
          </div>

          <div id="upd-panel" role="tabpanel" aria-labelledby={`upd-tab-${tab}`}>
            {result === null ? (
              <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-6">
                <Loader2 size={15} className="animate-spin" /> Loading updates…
              </p>
            ) : !result.ok ? (
              <div className="py-4 space-y-2">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {result.missing
                    ? 'Updates are not set up on this database yet.'
                    : "Couldn't load your updates. Nothing has been deleted."}
                </p>
                <button onClick={() => void load()} className={actionBtn}>Try again</button>
              </div>
            ) : result.value.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                No updates yet. An update is public for 24 hours, then it moves here to your archive.
              </p>
            ) : list.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                {tab === 'active' ? 'Nothing is live right now.' : tab === 'upcoming' ? 'No drafts or scheduled updates.' : 'Nothing in the archive yet.'}
              </p>
            ) : (
              <ul className="space-y-2 pt-3">
                {list.map((u) => {
                  const state = deriveUpdateState(u, now);
                  const thumb = u.media[0];
                  return (
                    <li key={u.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex flex-col sm:flex-row sm:items-start gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-14 h-14 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-900 shrink-0 flex items-center justify-center">
                          {thumb?.url
                            ? (thumb.kind === 'image'
                              ? <img src={thumb.url} alt={thumb.alt_text ?? ''} className="w-full h-full object-cover" />
                              : <video src={thumb.url} muted playsInline preload="metadata" className="w-full h-full object-cover" aria-label={thumb.alt_text ?? 'Video'} />)
                            : <Megaphone size={18} className="text-gray-400" aria-hidden="true" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">{typeLabel(u.type)}</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white break-words">{summary(u)}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-2">
                            <span>{updateTimeLabel(u, now)}</span>
                            {u.notify_keepers
                              ? <span className="inline-flex items-center gap-1"><BellRing size={10} /> {u.notified_at ? 'Keeper alert handled' : 'Tells keepers'}</span>
                              : <span className="inline-flex items-center gap-1"><BellOff size={10} /> Quiet</span>}
                          </p>
                          {state === 'hidden' && (
                            <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-400 flex items-start gap-1">
                              <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                              <span>
                                Hidden by NowOpen{u.moderation_note ? `: ${u.moderation_note}` : ''}. It is kept for review, so it cannot be deleted.
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {state === 'active' && (
                          <button onClick={() => setConfirm({ kind: 'end', u })} aria-label={`End ${summary(u)} now`} className={actionBtn}>End now</button>
                        )}
                        {(state === 'draft' || state === 'scheduled') && (
                          <button onClick={() => void publishNow(u)} className={actionBtn}>Publish now</button>
                        )}
                        {state === 'draft' && (
                          <button onClick={() => setComposing({
                            draftId: u.id, type: u.type, title: u.title, body: u.body, ctaLabel: u.cta_label, ctaUrl: u.cta_url,
                            offerId: u.offer_id, existingMediaCount: u.media.length, notifyKeepers: u.notify_keepers,
                          })} className={actionBtn}>Edit</button>
                        )}
                        {state === 'ended' && (
                          <button onClick={() => postAgain(u)} className={actionBtn}>Post again</button>
                        )}
                        {state !== 'hidden' && (
                          <button onClick={() => setConfirm({ kind: 'delete', u })} aria-label={`Delete ${summary(u)}`}
                            className={`${actionBtn} text-red-600 dark:text-red-400`}>Delete</button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        tone="danger"
        busy={busy}
        title={confirm?.kind === 'end' ? 'End this update?' : 'Delete this update?'}
        message={confirm?.kind === 'end'
          ? 'It leaves your page and NowOpen straight away and moves to your archive. It cannot be restarted; you can post it again.'
          : confirm && deriveUpdateState(confirm.u, now) === 'active'
            ? 'It is live now. It will be ended, then deleted with its photos and videos. This cannot be undone.'
            : 'It is deleted with its photos and videos. This cannot be undone.'}
        confirmLabel={confirm?.kind === 'end' ? 'End now'
          : confirm && deriveUpdateState(confirm.u, now) === 'active' ? 'End and delete' : 'Delete'}
        onConfirm={() => void runConfirm()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
