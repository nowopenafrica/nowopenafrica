import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { BellRing, Clock, ImagePlus, Loader2, Send, X } from 'lucide-react';

import {
  MAX_BODY, MAX_CTA_LABEL, MAX_MEDIA, MAX_TITLE, UPDATE_TOPIC, UPDATE_TYPES, classifyMediaFile, validateUpdateDraft,
  type UpdateType,
} from '../../lib/businessUpdates';
import {
  createDraftUpdate, loadOwnOffers, publishUpdate, updateDraftText, uploadUpdateMedia, type OfferOption,
} from '../../lib/businessUpdatesApi';
import { topicLabel, type KeepTopic } from '../../lib/keeps';
import { localDateTimeNow } from '../../lib/dates';

/**
 * Create a Business Update.
 *
 * Two things are said BEFORE the button, not after: who will be told (a real
 * count of keepers for this topic, or no number when it cannot be read), and
 * that the update is public for 24 hours and then private. An owner who learns
 * either by surprise stops trusting the dashboard.
 *
 * Files are checked against the bucket's own limits on pick, so a refusal
 * names the file before anything uploads. If an upload still fails, the
 * update stays a draft: nothing half-finished goes live.
 */

export interface ComposerInitial {
  draftId?: string;
  type?: UpdateType;
  title?: string;
  body?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  offerId?: string | null;
  /** Media already on the draft being edited; it counts toward "has content". */
  existingMediaCount?: number;
  notifyKeepers?: boolean;
}

interface Props {
  businessId: string;
  businessName: string;
  isOwner: boolean;
  reach: Record<KeepTopic, number> | null;
  initial?: ComposerInitial;
  onDone: () => void;
  onCancel: () => void;
}

interface Picked {
  key: string;
  file: File;
  preview: string;
  kind: 'image' | 'video';
  durationMs: number | null;
  alt: string;
}

const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white';
const label = 'block text-sm font-semibold text-gray-900 dark:text-white';

/** A video's length from its metadata; null when the browser cannot read it (the database still caps it). */
function readDurationMs(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    let settled = false;
    const done = (ms: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      resolve(ms);
    };
    // A browser that never answers is treated as "cannot read", which refuses the file.
    const timer = setTimeout(() => done(null), 8000);
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) { done(Math.round(v.duration * 1000)); return; }
      // MediaRecorder WebM reports Infinity until seeked past the end; the real
      // length then arrives on durationchange.
      v.ondurationchange = () => { if (Number.isFinite(v.duration)) done(Math.round(v.duration * 1000)); };
      v.currentTime = 1e101;
    };
    v.onerror = () => done(null);
    v.src = url;
  });
}

export default function UpdateComposer({ businessId, businessName, isOwner, reach, initial, onDone, onCancel }: Props) {
  const [type, setType] = useState<UpdateType>(initial?.type ?? 'announcement');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel ?? '');
  const [ctaUrl, setCtaUrl] = useState(initial?.ctaUrl ?? '');
  const [offerId, setOfferId] = useState<string | null>(initial?.offerId ?? null);
  const [offers, setOffers] = useState<OfferOption[] | null>(null);
  const [items, setItems] = useState<Picked[]>([]);
  const [rejects, setRejects] = useState<string[]>([]);
  const [when, setWhen] = useState<'now' | 'schedule'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [notify, setNotify] = useState(initial?.notifyKeepers ?? true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Once a draft row exists, retries publish it instead of making another.
  const [draftId, setDraftId] = useState<string | null>(initial?.draftId ?? null);
  const [uploadFailed, setUploadFailed] = useState(false);

  useEffect(() => {
    if (type !== 'offer' || !isOwner || offers !== null) return;
    let live = true;
    void loadOwnOffers(businessId).then((r) => { if (live) setOffers(r.ok ? r.value : []); });
    return () => { live = false; };
  }, [type, isOwner, offers, businessId]);

  // Previews are object URLs: released when one is removed, and the rest on close.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => { for (const i of itemsRef.current) URL.revokeObjectURL(i.preview); }, []);
  // The revoke stays outside the updater: updaters must be pure (StrictMode runs them twice).
  const removeItem = (key: string) => {
    const gone = items.find((x) => x.key === key);
    if (gone) URL.revokeObjectURL(gone.preview);
    setItems((cur) => cur.filter((x) => x.key !== key));
  };

  const publishAt = useMemo(() => (when === 'schedule' && scheduleAt ? new Date(scheduleAt) : null), [when, scheduleAt]);
  const problems = useMemo(() => validateUpdateDraft({
    type, title, body, mediaCount: items.length + (initial?.existingMediaCount ?? 0), offerId,
    ctaLabel: ctaLabel || null, ctaUrl: ctaUrl || null, publishAt,
  }), [type, title, body, items.length, initial?.existingMediaCount, offerId, ctaLabel, ctaUrl, publishAt]);
  const needsTime = when === 'schedule' && !scheduleAt;
  const canPublish = problems.length === 0 && !needsTime && !busy && !uploadFailed;

  const topic = UPDATE_TOPIC[type];
  const topicWords = topicLabel(topic).toLowerCase();
  const n = reach?.[topic];

  const pick = async (list: FileList | null) => {
    if (!list) return;
    const next: Picked[] = [];
    const bad: string[] = [];
    for (const file of Array.from(list)) {
      if (items.length + next.length >= MAX_MEDIA) { bad.push(`${file.name}: Up to ${MAX_MEDIA} photos or videos.`); continue; }
      const preview = URL.createObjectURL(file);
      const durationMs = file.type.startsWith('video/') ? await readDurationMs(preview) : null;
      const verdict = classifyMediaFile({ type: file.type, size: file.size, durationMs });
      if ('error' in verdict) { URL.revokeObjectURL(preview); bad.push(`${file.name}: ${verdict.error}`); continue; }
      next.push({ key: `${file.name}-${file.size}-${next.length}-${Date.now()}`, file, preview, kind: verdict.kind, durationMs, alt: '' });
    }
    setItems((cur) => [...cur, ...next]);
    setRejects(bad);
  };

  const submit = async (publish: boolean) => {
    setError(null);
    let id = draftId;

    if (!id) {
      setBusy('Saving…');
      const created = await createDraftUpdate({
        businessId, type, title, body, offerId, ctaLabel: ctaLabel || null, ctaUrl: ctaUrl || null, notifyKeepers: notify,
      });
      if (!created.ok) { setBusy(null); setError(created.message); return; }
      id = created.value;
      setDraftId(id);

      if (items.length > 0) {
        setBusy(`Uploading ${items.length === 1 ? 'your file' : `${items.length} files`}…`);
        const up = await uploadUpdateMedia(businessId, id, items.map((i) => ({ file: i.file, durationMs: i.durationMs, alt: i.alt })));
        if (up.failed.length > 0) {
          setBusy(null);
          setUploadFailed(true);
          setError(`Saved as a draft, not published. These could not be uploaded: ${
            up.failed.map((f) => `${f.name} (${f.message})`).join(', ')
          }. Delete the draft from Scheduled & drafts and try again.`);
          return;
        }
      }
    } else {
      setBusy('Saving…');
      const saved = await updateDraftText(id, { title, body, ctaLabel: ctaLabel || null, ctaUrl: ctaUrl || null });
      if (!saved.ok) { setBusy(null); setError(saved.message); return; }
    }

    if (!publish) {
      setBusy(null);
      toast.success('Saved as a draft');
      onDone();
      return;
    }

    setBusy(publishAt ? 'Scheduling…' : 'Publishing…');
    const done = await publishUpdate(id, publishAt);
    setBusy(null);
    if (!done.ok) { setError(done.message); return; }
    toast.success(publishAt ? 'Scheduled' : 'Live now, for 24 hours');
    onDone();
  };

  const firstProblem = needsTime ? 'Choose when it goes live.' : problems[0];
  const editingDraft = Boolean(initial?.draftId);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <fieldset>
        <legend className={label}>What is it?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {UPDATE_TYPES.map((t) => (
            <button key={t.key} type="button" onClick={() => setType(t.key)} aria-pressed={type === t.key}
              disabled={editingDraft || Boolean(draftId)}
              className={`px-3 min-h-[44px] rounded-full text-sm font-semibold border ${
                type === t.key
                  ? 'bg-rose-600 border-rose-600 text-white'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'
              } disabled:opacity-60`}>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      {type === 'offer' && (
        isOwner ? (
          <div>
            <label htmlFor="up-offer" className={label}>Which offer</label>
            <select id="up-offer" value={offerId ?? ''} onChange={(e) => setOfferId(e.target.value || null)}
              disabled={Boolean(draftId)} className={`${field} mt-1 min-h-[44px]`}>
              <option value="">{offers === null ? 'Loading your offers…' : offers.length ? 'Choose an offer' : 'No offers yet'}</option>
              {(offers ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.headline ? `${o.headline} · ` : ''}{o.title}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              The offer keeps its own dates and code. This update announces it for 24 hours.
            </p>
          </div>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Only the owner can attach an offer. You can post any other kind of update.
          </p>
        )
      )}

      <div>
        <label htmlFor="up-title" className={label}>Title <span className="font-normal text-gray-400">(optional)</span></label>
        <input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE}
          placeholder="Fresh bread is out" className={`${field} mt-1 min-h-[44px]`} />
        <p className="text-[10px] text-gray-400 mt-1 text-right">{title.length}/{MAX_TITLE}</p>
      </div>

      <div>
        <label htmlFor="up-body" className={label}>Text</label>
        <textarea id="up-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={MAX_BODY} rows={3}
          placeholder="What's new today?" className={`${field} mt-1`} />
        <p className="text-[10px] text-gray-400 mt-1 text-right">{body.length}/{MAX_BODY}</p>
      </div>

      {!editingDraft && (
        <div>
          <label htmlFor="up-media" className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg border border-dashed border-gray-400 dark:border-gray-500 text-sm font-semibold text-gray-700 dark:text-gray-200 cursor-pointer">
            <ImagePlus size={16} /> Add photos or videos
          </label>
          <input id="up-media" type="file" multiple className="sr-only"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
            disabled={Boolean(draftId) || items.length >= MAX_MEDIA}
            onChange={(e) => { void pick(e.target.files); e.target.value = ''; }} />
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            Up to {MAX_MEDIA}. Photos up to 10 MB, videos up to 60 seconds and 50 MB. Videos play muted until someone turns the sound on.
          </p>
          {rejects.length > 0 && (
            <ul className="mt-2 text-[12px] text-red-600 dark:text-red-400 space-y-0.5">
              {rejects.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {items.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((i, idx) => (
                <li key={i.key} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="relative aspect-square bg-gray-100 dark:bg-gray-900">
                    {i.kind === 'image'
                      ? <img src={i.preview} alt={`Preview of ${i.file.name}`} className="w-full h-full object-cover" />
                      : <video src={i.preview} muted playsInline aria-label={`Preview of ${i.file.name}`} className="w-full h-full object-cover" />}
                    {!draftId && (
                      <button type="button" onClick={() => removeItem(i.key)}
                        aria-label={`Remove ${i.file.name}`}
                        className="absolute top-1 right-1 w-[44px] h-[44px] inline-flex items-center justify-center rounded-full bg-black/60 text-white">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <label htmlFor={`up-alt-${idx}`} className="sr-only">Describe {i.file.name}</label>
                  <input id={`up-alt-${idx}`} value={i.alt} maxLength={200} disabled={Boolean(draftId)}
                    onChange={(e) => setItems((cur) => cur.map((x) => (x.key === i.key ? { ...x, alt: e.target.value } : x)))}
                    placeholder="Describe it (for screen readers)"
                    className="w-full px-2 min-h-[44px] text-[12px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-700" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {editingDraft && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          To change the photos or videos, delete this draft and start a new one.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="up-cta-label" className={label}>Button text <span className="font-normal text-gray-400">(optional)</span></label>
          <input id="up-cta-label" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} maxLength={MAX_CTA_LABEL}
            placeholder="Order now" className={`${field} mt-1 min-h-[44px]`} />
        </div>
        <div>
          <label htmlFor="up-cta-url" className={label}>Button link</label>
          <input id="up-cta-url" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} inputMode="url"
            placeholder="https://… or /your-page" className={`${field} mt-1 min-h-[44px]`} />
        </div>
      </div>

      <fieldset>
        <legend className={label}>When</legend>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(['now', 'schedule'] as const).map((w) => (
            <button key={w} type="button" onClick={() => setWhen(w)} aria-pressed={when === w}
              className={`px-3 min-h-[44px] rounded-lg text-sm font-semibold border ${
                when === w ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'
              }`}>
              {w === 'now' ? 'Now' : 'Schedule'}
            </button>
          ))}
          {when === 'schedule' && (
            <>
              <label htmlFor="up-at" className="sr-only">Goes live at</label>
              <input id="up-at" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)}
                min={localDateTimeNow()} max={localDateTimeNow(new Date(Date.now() + 14 * 86_400_000))}
                className={`${field} w-auto min-h-[44px]`} />
            </>
          )}
        </div>
      </fieldset>

      <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={Boolean(draftId)}
          className="mt-1 w-5 h-5" />
        <span className="text-sm text-gray-800 dark:text-gray-200 flex items-start gap-1.5">
          <BellRing size={14} className="mt-0.5 shrink-0 text-amber-600" />
          {typeof n === 'number'
            ? (n === 0
              ? `Nobody keeps ${businessName} for ${topicWords} yet, so no one will be told.`
              : `Tell the ${n} ${n === 1 ? 'person who keeps' : 'people who keep'} ${businessName} and asked about ${topicWords}.`)
            : `Tell the people who keep ${businessName} and asked about ${topicWords}.`}
          {' '}At most one such message every few hours.
        </span>
      </label>

      <p className="text-[12px] text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
        <Clock size={13} className="mt-0.5 shrink-0" />
        Public for 24 hours from when it goes live, then only you and your team can see it.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
      )}
      {!error && firstProblem && <p className="text-[12px] text-gray-500 dark:text-gray-400">{firstProblem}</p>}

      <div className="flex flex-wrap gap-2">
        {uploadFailed ? (
          <button type="button" onClick={onDone}
            className="px-4 min-h-[44px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold">
            Done
          </button>
        ) : (
          <>
            <button type="button" onClick={() => void submit(true)} disabled={!canPublish}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {busy ?? (when === 'schedule' ? 'Schedule' : 'Publish')}
            </button>
            <button type="button" onClick={() => void submit(false)} disabled={Boolean(busy)}
              className="px-4 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50">
              Save draft
            </button>
            <button type="button" onClick={onCancel} disabled={Boolean(busy)}
              className="px-4 min-h-[44px] text-sm font-semibold text-gray-600 dark:text-gray-300">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
