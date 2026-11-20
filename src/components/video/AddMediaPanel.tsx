import { useEffect, useRef, useState } from 'react';
import { Camera, Clapperboard, Image as ImageIcon, Link2, Loader2, Music, RefreshCw, Video } from 'lucide-react';

import { VIDEO_UPLOAD_TYPES } from '../../lib/studio/videoAssets';
import type { AssetKind } from '../../lib/studio/videoDocument';
import { listOpenReels, type ReelFile } from '../../lib/studio/videoSources';
import { POSTER_SUFFIX } from '../../lib/reelShare';

/*
 * Video Studio's "add media" panel: one button per source, so the person
 * picks what they mean (a video, an image, a sound, a link, an OpenReel)
 * instead of one "upload" that hides the rest.
 *
 * The page does the work (upload, import, placing the clip); this only
 * collects the choice.
 */

/**
 * A video OpenReel shows the poster still the camera saved beside it
 * (`reel-<stamp>-poster.jpg`), so the list does not load every clip; a reel
 * without one falls back to the video's first frame.
 */
function ReelThumb({ reel, publicUrl }: { reel: ReelFile; publicUrl: (path: string) => string }) {
  const [noPoster, setNoPoster] = useState(false);
  const label = reel.kind === 'video' ? 'OpenReel video' : 'OpenReel photo';
  if (reel.kind !== 'video') return <img src={publicUrl(reel.path)} alt={label} loading="lazy" className="h-full w-full object-cover" />;
  if (noPoster) return <video src={`${publicUrl(reel.path)}#t=0.1`} aria-label={label} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
  return <img src={publicUrl(reel.path.replace(/\.[a-z0-9]+$/i, POSTER_SUFFIX))} alt={label} loading="lazy" onError={() => setNoPoster(true)} className="h-full w-full object-cover" />;
}

const acceptFor = (kind: AssetKind) =>
  Object.entries(VIDEO_UPLOAD_TYPES).filter(([, t]) => t.kind === kind).map(([mime]) => mime).join(',');

type Open = null | 'link' | 'reel';

const BTN = 'inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50 aria-pressed:bg-gray-900 aria-pressed:text-white aria-pressed:border-gray-900 dark:aria-pressed:bg-white dark:aria-pressed:text-gray-900';

export default function AddMediaPanel({
  userId, busy, publicUrl, onFiles, onLink, onReel, onRecord,
}: {
  userId: string | null;
  busy: boolean;
  publicUrl: (path: string) => string;
  onFiles: (files: File[]) => void;
  /** Resolves true when the link was added, so the field can clear. */
  onLink: (url: string) => Promise<boolean>;
  onReel: (reel: ReelFile) => void;
  onRecord: () => void;
}) {
  const inputs = { video: useRef<HTMLInputElement>(null), image: useRef<HTMLInputElement>(null), audio: useRef<HTMLInputElement>(null) };
  const [open, setOpen] = useState<Open>(null);
  const [link, setLink] = useState('');
  const [reels, setReels] = useState<ReelFile[] | null>(null);
  const [reelError, setReelError] = useState<string | null>(null);
  const [loadingReels, setLoadingReels] = useState(false);

  const loadReels = async () => {
    if (!userId) return;
    setLoadingReels(true);
    setReelError(null);
    try { setReels(await listOpenReels(userId)); } catch (e) { setReelError(e instanceof Error ? e.message : 'Could not list your OpenReels.'); }
    finally { setLoadingReels(false); }
  };
  /* Load the list the first time the OpenReel panel opens; Refresh reloads it. */
  useEffect(() => {
    if (open === 'reel' && reels === null) void loadReels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (kind: AssetKind) => inputs[kind].current?.click();
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length) onFiles(files);
  };
  const submitLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await onLink(link)) { setLink(''); setOpen(null); }
  };

  return (
    <div data-testid="add-media" className="mb-4 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Add media</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN} disabled={busy} onClick={() => pick('video')}><Video size={14} aria-hidden /> Video</button>
        <button type="button" className={BTN} disabled={busy} onClick={() => pick('image')}><ImageIcon size={14} aria-hidden /> Image</button>
        <button type="button" className={BTN} disabled={busy} onClick={() => pick('audio')}><Music size={14} aria-hidden /> Sound</button>
        <button type="button" className={BTN} disabled={busy} aria-pressed={open === 'link'} onClick={() => setOpen(open === 'link' ? null : 'link')}><Link2 size={14} aria-hidden /> Link</button>
        <button type="button" className={BTN} disabled={busy} aria-pressed={open === 'reel'} onClick={() => setOpen(open === 'reel' ? null : 'reel')}><Clapperboard size={14} aria-hidden /> OpenReel</button>
        {busy && <Loader2 size={16} className="animate-spin self-center text-gray-500" aria-label="Adding" />}
      </div>
      {(['video', 'image', 'audio'] as const).map((k) => (
        <input key={k} ref={inputs[k]} data-testid={`add-media-file-${k}`} type="file" accept={acceptFor(k)} multiple hidden onChange={take} />
      ))}

      {open === 'link' && (
        <form onSubmit={(e) => void submitLink(e)} className="space-y-1.5" data-testid="add-media-link">
          <label htmlFor="video-media-link" className="block text-xs text-gray-600 dark:text-gray-400">
            Paste any video link: YouTube, Vimeo, Instagram, TikTok, Facebook, or a direct file (.mp4, .jpg, .mp3). It shows on the timeline straight away.
          </label>
          <div className="flex gap-1.5">
            <input
              id="video-media-link"
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://…/clip.mp4"
              className="min-w-0 flex-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs"
            />
            <button type="submit" disabled={busy || !link.trim()} className="rounded bg-gray-900 px-2.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">Add</button>
          </div>
          <p className="text-[11px] text-gray-500">Platform videos (YouTube, Vimeo…) play through their own player and are not included when you save a frame or export.</p>
        </form>
      )}

      {open === 'reel' && (
        <div className="space-y-2" data-testid="add-media-reel">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRecord} disabled={busy || !userId} className="inline-flex items-center gap-1 rounded bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
              <Camera size={14} aria-hidden /> Record with OpenReel
            </button>
            <button type="button" onClick={() => void loadReels()} disabled={loadingReels || !userId} className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400" aria-label="Refresh my OpenReels">
              <RefreshCw size={12} aria-hidden className={loadingReels ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {!userId ? (
            <p className="text-xs text-gray-500">Sign in to use your OpenReels.</p>
          ) : reelError ? (
            <p className="text-xs text-red-600">{reelError}</p>
          ) : reels === null || loadingReels ? (
            <p className="text-xs text-gray-500">Looking for your OpenReels…</p>
          ) : reels.length === 0 ? (
            <p className="text-xs text-gray-500">No OpenReels yet. Record one and it lands on the timeline.</p>
          ) : (
            <>
              <p className="text-xs text-gray-600 dark:text-gray-400">Your OpenReels, newest first. Tap one to add it.</p>
              <ul className="grid grid-cols-3 gap-1.5">
                {reels.map((r) => (
                  <li key={r.path}>
                    <button type="button" disabled={busy} onClick={() => onReel(r)} data-testid="reel-pick" title={r.createdAt ? new Date(r.createdAt).toLocaleString() : r.path}
                      className="block aspect-[9/16] w-full overflow-hidden rounded border border-gray-300 bg-black disabled:opacity-50 dark:border-gray-700">
                      <ReelThumb reel={r} publicUrl={publicUrl} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
