import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Flag, Share2, Ticket, Volume2, VolumeX, X } from 'lucide-react';

import {
  UPDATE_TYPES, isInAppPath, postedAgoLabel, updateShareLink, updateTimeLabel,
} from '../../lib/businessUpdates';
import {
  UPDATE_REPORT_REASONS, reportUpdate, resignMedia,
  type PublicMedia, type PublicUpdate, type UpdateReportReason,
} from '../../lib/publicUpdates';
import { track } from '../../lib/telemetry';

/**
 * One business's live updates, full screen.
 *
 * Deliberately no auto-advance and no progress bars: content that moves on by
 * itself is a timed interaction people cannot pause (WCAG 2.2.1), and it spends
 * mobile data on things nobody chose to watch. People move with the buttons,
 * the arrow keys, or a swipe. Video starts muted and never plays on its own.
 *
 * What is live is decided by the server: `liveIds` is the set from the strip's
 * last successful read. An update missing from it (ended early, hidden by
 * NowOpen) or past its time shows "This update has ended." instead of itself.
 */
interface Props {
  updates: PublicUpdate[];
  /** Whose updates these are, for the owner's counts (analytics business_id). */
  businessId: string;
  liveIds: Set<string>;
  startIndex: number;
  businessName: string;
  slug: string;
  mode: 'focus' | 'list';
  onClose: () => void;
  onIndexChange: (id: string) => void;
}

const typeLabel = (t: string) => UPDATE_TYPES.find((x) => x.key === t)?.label ?? 'Update';
const timeLine = (u: PublicUpdate, now: Date) =>
  `Posted ${postedAgoLabel(u.published_at, now)} · ${updateTimeLabel(
    { published_at: u.published_at, expires_at: u.expires_at, ended_at: null, moderation_status: 'ok' }, now)}`;
const btn44 = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 rounded-full text-sm font-semibold';
const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, video[controls]';

/** One photo or video. A failed load re-signs once, then says the photo is unavailable. */
function MediaItem({ m, expiresAt }: { m: PublicMedia; expiresAt: string }) {
  const [url, setUrl] = useState(m.url);
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(!m.url);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  const onError = async () => {
    if (retried) { setFailed(true); return; }
    setRetried(true);
    const fresh = await resignMedia(m.path, expiresAt);
    if (fresh) setUrl(fresh); else setFailed(true);
  };

  // `muted` is a property React does not keep in sync as an attribute.
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  if (failed || !url) {
    return (
      <div className="w-full aspect-square flex items-center justify-center bg-gray-900 text-gray-300 text-sm rounded-xl">
        {m.kind === 'video' ? 'Video unavailable' : 'Photo unavailable'}
      </div>
    );
  }
  if (m.kind === 'image') {
    return <img src={url} alt={m.alt ?? ''} onError={() => void onError()} className="w-full max-h-[60vh] object-contain rounded-xl bg-black" />;
  }
  return (
    <div className="relative">
      <video ref={videoRef} src={url} muted playsInline controls preload="metadata" aria-label={m.alt ?? 'Video'}
        onError={() => void onError()} className="w-full max-h-[60vh] rounded-xl bg-black" />
      <button type="button" onClick={() => setMuted((v) => !v)}
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        className={`${btn44} absolute top-2 right-2 bg-black/70 text-white`}>
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
    </div>
  );
}

function UpdateBody({ u, now, onLeave, onCta }: { u: PublicUpdate; now: Date; onLeave: () => void; onCta: () => void }) {
  const url = u.cta_url ?? '';
  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {u.media.map((m) => <MediaItem key={m.id} m={m} expiresAt={u.expires_at} />)}
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-rose-400">{typeLabel(u.type)}</p>
      {u.title && <h3 className="text-lg font-bold text-white break-words">{u.title}</h3>}
      {u.body && <p className="text-sm text-gray-100 whitespace-pre-line break-words">{u.body}</p>}
      <p className="text-[12px] text-gray-400">{timeLine(u, now)}</p>
      <div className="flex flex-wrap gap-2">
        {u.cta_label && url.startsWith('https://') && (
          <a href={url} target="_blank" rel="noopener noreferrer" onClick={onCta} className={`${btn44} bg-white text-gray-900`}>{u.cta_label}</a>
        )}
        {/* In-app links close the viewer first, or it would keep covering the page they open. */}
        {u.cta_label && isInAppPath(url) && (
          <Link to={url} onClick={() => { onCta(); onLeave(); }} className={`${btn44} bg-white text-gray-900`}>{u.cta_label}</Link>
        )}
        {u.type === 'offer' && u.offer_id && (
          <Link to="/offers" onClick={onLeave} className={`${btn44} border border-white/40 text-white`}><Ticket size={15} /> See the offer</Link>
        )}
      </div>
    </div>
  );
}

function ReportForm({ updateId, onDone }: { updateId: string; onDone: () => void }) {
  const [reason, setReason] = useState<UpdateReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // The Send button disappears with the form; focus goes to Close, inside the dialog.
  useEffect(() => { if (sent) closeRef.current?.focus(); }, [sent]);

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    const r = await reportUpdate(updateId, reason, detail);
    setBusy(false);
    if (r.ok) setSent(true); else setError(r.message);
  };

  if (sent) {
    return (
      <div className="rounded-xl bg-white/10 p-4 text-sm text-white" role="status">
        Thanks. NowOpen will review it.{' '}
        <button ref={closeRef} type="button" onClick={onDone} className="underline min-h-[44px] px-2">Close</button>
      </div>
    );
  }
  return (
    <fieldset className="rounded-xl bg-white/10 p-4 space-y-2">
      <legend className="text-sm font-bold text-white">What's wrong with this update?</legend>
      {UPDATE_REPORT_REASONS.map((r) => (
        <label key={r.key} className="flex items-center gap-3 min-h-[44px] text-sm text-gray-100 cursor-pointer">
          <input type="radio" name={`update-report-${updateId}`} value={r.key} checked={reason === r.key}
            onChange={() => setReason(r.key)} className="w-5 h-5" />
          {r.label}
        </label>
      ))}
      <label htmlFor={`update-report-detail-${updateId}`} className="sr-only">More detail (optional)</label>
      <textarea id={`update-report-detail-${updateId}`} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={500} rows={2}
        placeholder="More detail (optional)"
        className="w-full rounded-lg bg-black/40 text-white text-sm p-2 border border-white/20" />
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => void send()} disabled={!reason || busy}
          className={`${btn44} bg-white text-gray-900 disabled:opacity-50`}>Send report</button>
        <button type="button" onClick={onDone} className={`${btn44} text-gray-200`}>Cancel</button>
      </div>
    </fieldset>
  );
}

export default function UpdateViewer({ updates, liveIds, businessId, startIndex, businessName, slug, mode, onClose, onIndexChange }: Props) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(updates.length - 1, 0)));
  const [now, setNow] = useState(() => new Date());
  // Which update's report form is open (one at a time, in either mode).
  const [reportingId, setReportingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const swipeX = useRef<number | null>(null);
  const reportingRef = useRef(reportingId);
  reportingRef.current = reportingId;

  const isLive = (u: PublicUpdate) => liveIds.has(u.id) && Date.parse(u.expires_at) > now.getTime();
  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;
  const current = updates[index];
  const headingId = 'update-viewer-title';

  const go = (delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= updates.length) return;
    setIndex(next);
    setReportingId(null);
    onIndexChange(updates[next].id);
  };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Focus moves into the dialog and returns to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reportingRef.current) setReportingId(null); else onClose();
        return;
      }
      // Arrow keys belong to the field or the video when one has focus.
      const owned = (e.target as HTMLElement | null)?.closest?.('input, textarea, video');
      if (mode === 'focus' && !owned) {
        if (e.key === 'ArrowRight') goRef.current(1);
        if (e.key === 'ArrowLeft') goRef.current(-1);
      }
      // Keep Tab inside the dialog, including straight after it opens, when the
      // dialog itself (not one of its controls) has focus.
      if (e.key === 'Tab' && dialogRef.current) {
        const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const inside = active !== dialogRef.current && dialogRef.current.contains(active);
        if (e.shiftKey && (!inside || active === first)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  // One "open" per update actually shown in focus mode. List mode shows them
  // all at once, which is not someone choosing one, so it records nothing.
  const recorded = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (mode !== 'focus' || !current || !isLiveRef.current(current)) return;
    if (recorded.current.has(current.id)) return;
    recorded.current.add(current.id);
    track('update_viewed', { update_id: current.id, type: current.type }, businessId);
  }, [mode, current, businessId]);

  const tapped = (u: PublicUpdate) => track('update_cta_clicked', { update_id: u.id, type: u.type }, businessId);

  const share = async (u: PublicUpdate) => {
    const url = `${window.location.origin}${updateShareLink(slug, u.id)}`;
    const title = u.title || `${businessName} on NowOpen`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        track('update_shared', { update_id: u.id, method: 'share' }, businessId);
        return;
      } catch (e) {
        // Closing the share sheet is not an error; anything else falls back to copying.
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
      track('update_shared', { update_id: u.id, method: 'copy' }, businessId);
    } catch {
      toast.error('Could not copy the link');
    }
  };

  // Swipe: only on the content, never when the drag starts on a control or the
  // video (its scrub bar), and a cancelled pointer (the page scrolling) is not a swipe.
  const onPointerDown = (e: ReactPointerEvent) => {
    const onControl = (e.target as HTMLElement | null)?.closest?.('video, button, a, input, textarea, label');
    swipeX.current = onControl ? null : e.clientX;
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (swipeX.current === null) return;
    const dx = e.clientX - swipeX.current;
    swipeX.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  const ended = <p className="text-white text-base py-16 text-center">This update has ended.</p>;

  const actions = (u: PublicUpdate) => (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void share(u)} className={`${btn44} border border-white/30 text-white`}>
        <Share2 size={15} /> Share
      </button>
      <button type="button" onClick={() => setReportingId((r) => (r === u.id ? null : u.id))}
        aria-label="Report this update" aria-expanded={reportingId === u.id}
        className={`${btn44} text-gray-300`}>
        <Flag size={15} /> Report
      </button>
    </div>
  );

  const report = (u: PublicUpdate) =>
    reportingId === u.id && <ReportForm key={u.id} updateId={u.id} onDone={() => setReportingId(null)} />;

  const title = mode === 'list'
    ? `${businessName} · ${updates.length} ${updates.length === 1 ? 'update' : 'updates'}`
    : `${businessName} · Update ${index + 1} of ${updates.length}`;

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={headingId}
      className="fixed inset-0 z-[60] bg-black/95 overflow-y-auto overscroll-contain outline-none">
      <div className="max-w-lg mx-auto px-4 py-4 min-h-full flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 id={headingId} className="text-sm font-semibold text-white truncate">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close updates" className={`${btn44} text-white`}>
            <X size={22} />
          </button>
        </div>

        {mode === 'list' ? (
          <ul className="space-y-6 pb-8">
            {updates.map((u) => (
              <li key={u.id} className="rounded-2xl bg-white/5 p-4 space-y-3">
                {isLive(u) ? (
                  <>
                    <UpdateBody u={u} now={now} onLeave={onClose} onCta={() => tapped(u)} />
                    {actions(u)}
                    {report(u)}
                  </>
                ) : ended}
              </li>
            ))}
          </ul>
        ) : (
          <div data-testid="update-swipe-area" className="flex-1 flex flex-col gap-4 touch-pan-y"
            onPointerDown={onPointerDown} onPointerUp={onPointerUp}
            onPointerCancel={() => { swipeX.current = null; }}>
            {current && isLive(current) ? (
              <>
                <UpdateBody u={current} now={now} onLeave={onClose} onCta={() => tapped(current)} />
                {actions(current)}
                {report(current)}
              </>
            ) : ended}
            <div className="mt-auto flex items-center justify-between pt-4">
              <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous update"
                className={`${btn44} bg-white/10 text-white disabled:opacity-30`}>
                <ChevronLeft size={20} />
              </button>
              <button type="button" onClick={() => go(1)} disabled={index >= updates.length - 1} aria-label="Next update"
                className={`${btn44} bg-white/10 text-white disabled:opacity-30`}>
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
