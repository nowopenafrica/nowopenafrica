import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ImagePlus, Loader2, X } from 'lucide-react';

import type { PlanLine } from '../../lib/promote/campaignPlan';
import {
  artworkUrlFor, fetchOwnDesigns, setLineArtwork, uploadLineArtwork, type OwnDesignsRead,
} from '../../lib/promote/campaigns';
import {
  checkArtworkFit, describeShape, SIZE_TO_CONFIRM, studioSizeFor, type ArtworkFit,
} from '../../lib/promote/artworkFit';
import { signInLinkTo } from '../../lib/safeNext';
import AdPreviewStudio from './AdPreviewStudio';

const UNREADABLE = "We could not read that image's size.";
const NO_SIZE_NOTE = `${SIZE_TO_CONFIRM} — start square and adjust.`;

export interface LineArtworkChange {
  path: string;
  width: number;
  height: number;
  designId: string | null;
}

const isSize = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Measure an image through an element on an object URL. Never fetch() a
 * blob: URL (the site's CSP refuses it). The object URL is revoked either way.
 */
function measureFile(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const done = (fn: () => void) => { URL.revokeObjectURL(url); fn(); };
    const img = new Image();
    img.onload = () => done(() => resolve({ width: img.naturalWidth, height: img.naturalHeight }));
    img.onerror = () => done(() => reject(new Error('image')));
    img.src = url;
  });
}

function FitLine({ fit }: { fit: ArtworkFit }) {
  if (fit.verdict === 'match') {
    return <span className="text-[11px] font-semibold text-green-700 dark:text-green-400">Fits this placement</span>;
  }
  if (fit.verdict === 'mismatch') {
    return <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{fit.message}</span>;
  }
  return <span className="text-[11px] text-gray-500">{fit.message}</span>;
}

const btn = 'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200';

/**
 * The artwork for one placement line: pick a Create design, make one at the
 * placement's shape, or upload. The shape check says whether it fits; a size
 * that cannot be read is never guessed.
 */
export default function LineArtwork({
  line, campaignId, placementDimensions, signedIn, onChanged,
}: {
  line: PlanLine;
  campaignId: string | null;
  placementDimensions: string | null;
  signedIn: boolean;
  onChanged?: (art: LineArtworkChange) => void;
}) {
  const here = useLocation();
  const [open, setOpen] = useState(false);
  const [designs, setDesigns] = useState<OwnDesignsRead | 'loading' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; n: number } | null>(null);
  const [opens, setOpens] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const thumbRetried = useRef(false);

  const path = line.artworkUrl;
  useEffect(() => {
    let live = true;
    setThumb(null);
    thumbRetried.current = false;
    if (!path) return undefined;
    void artworkUrlFor(path).then((u) => { if (live) setThumb(u); });
    return () => { live = false; };
  }, [path]);

  const closePreview = () => {
    setPreview(null);
    const back = returnTo.current;
    returnTo.current = null;
    /* After the dialog unmounts, so focus is not taken back by the removal. */
    if (back) setTimeout(() => { if (back.isConnected) back.focus(); }, 0);
  };

  useEffect(() => {
    if (!preview) return undefined;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreview(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  if (!signedIn) {
    return (
      <Link to={signInLinkTo(here.pathname)} className="inline-flex min-h-[44px] items-center text-xs font-semibold text-blue-700 underline dark:text-blue-300">
        Sign in to attach artwork
      </Link>
    );
  }

  const plan = campaignId ? `&plan=${encodeURIComponent(campaignId)}` : '';
  const lineQ = `plan_line=${encodeURIComponent(line.id)}${plan}`;
  const size = studioSizeFor(placementDimensions);
  const makeHref = `/media/studio?${size ? `w=${size.w}&h=${size.h}&` : ''}${lineQ}&text=${encodeURIComponent(line.title)}`;

  const pickDesigns = () => {
    setOpen(true);
    if (designs && designs !== 'loading' && designs.state === 'ready') return;
    setDesigns('loading');
    void fetchOwnDesigns().then(setDesigns);
  };

  const onFile = async (file: File) => {
    if (!campaignId) { setProblem('Save this plan to your account before attaching artwork.'); return; }
    setProblem(null);
    setBusy(true);
    try {
      /* Measure first (no network): the upload overwrites a same-named file,
         so an unreadable image must never reach storage. */
      let measured: { width: number; height: number };
      try {
        measured = await measureFile(file);
      } catch {
        setProblem(UNREADABLE);
        return;
      }
      if (!isSize(measured.width) || !isSize(measured.height)) { setProblem(UNREADABLE); return; }
      const up = await uploadLineArtwork(campaignId, line.id, file);
      if ('error' in up) { setProblem(up.error); return; }
      const art = { path: up.path, width: measured.width, height: measured.height };
      if (!(await setLineArtwork(line.id, art))) { setProblem('We could not save that artwork. Try again.'); return; }
      setOpen(false);
      onChanged?.({ ...art, designId: null });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openPreview = async () => {
    if (!path) return;
    setProblem(null);
    /* A signed link lasts an hour, so sign a fresh one on every open. */
    const url = await artworkUrlFor(path);
    if (!url) { setProblem('We could not open that artwork just now.'); return; }
    if (document.activeElement instanceof HTMLElement) returnTo.current = document.activeElement;
    setOpens((n) => n + 1);
    setPreview({ url, n: opens + 1 });
  };

  const hasArt = Boolean(path);
  const fit = hasArt && isSize(line.artworkWidth) && isSize(line.artworkHeight)
    ? checkArtworkFit({ width: line.artworkWidth, height: line.artworkHeight }, placementDimensions)
    : null;

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Upload artwork for ${line.title}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
      />

      {hasArt && (
        <div className="flex items-center gap-3">
          {thumb ? (
            <img
              src={thumb}
              alt={`Artwork for ${line.title}`}
              onError={() => {
                /* A signed link can lapse; sign a fresh one, once. */
                if (thumbRetried.current || !path) return;
                thumbRetried.current = true;
                void artworkUrlFor(path).then((u) => { if (u) setThumb(u); });
              }} className="h-12 w-12 shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-700" />
          ) : (
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-gray-200 text-gray-400 dark:border-gray-700"><ImagePlus size={16} /></span>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            {fit && <FitLine fit={fit} />}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void openPreview()} className={btn}>Preview on the medium</button>
              <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={btn}>Replace</button>
            </div>
          </div>
        </div>
      )}

      {!hasArt && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={btn}>
          <ImagePlus size={14} /> Add artwork
        </button>
      )}

      {open && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-900/40">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={pickDesigns} className={btn}>Pick a design made in Create</button>
            <Link to={makeHref} className={btn}>Make one at the right size</Link>
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={`${btn} disabled:opacity-50`}>
              {busy && <Loader2 size={14} className="animate-spin" />} Upload a file
            </button>
          </div>
          {!size && <p className="text-[11px] text-gray-500">{NO_SIZE_NOTE}</p>}

          {designs === 'loading' && <Loader2 size={16} className="animate-spin text-gray-400" aria-label="Loading your designs" />}
          {designs && designs !== 'loading' && designs.state === 'unavailable' && (
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{designs.reason}</p>
          )}
          {designs && designs !== 'loading' && designs.state === 'ready' && (
            designs.designs.length === 0 ? (
              <p className="text-[11px] text-gray-500">Nothing here yet. Make one at the right size, or upload a file.</p>
            ) : (
              <ul className="space-y-1">
                {designs.designs.map((d) => (
                  <li key={d.id}>
                    <Link
                      to={`/media/studio/${encodeURIComponent(d.id)}?${lineQ}`}
                      className="flex min-h-[44px] flex-col justify-center rounded-lg border border-gray-200 bg-white px-3 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
                    >
                      <span className="font-semibold text-gray-900 dark:text-white">{d.title}</span>
                      <span className="text-[11px] text-gray-500">
                        {describeShape(d.width, d.height)} · <FitLine fit={checkArtworkFit(d, placementDimensions)} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}

      {problem && <p role="alert" className="text-[11px] font-semibold text-red-700 dark:text-red-400">{problem}</p>}

      {preview && (
        <div role="dialog" aria-modal="true" aria-label={`Preview of ${line.title}`} className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-3 sm:p-6">
          <div className="mx-auto max-w-5xl rounded-2xl bg-white p-4 dark:bg-gray-800">
            <div className="mb-3 flex justify-end">
              <button ref={closeRef} type="button" onClick={closePreview} aria-label="Close preview" className="grid h-[44px] w-[44px] place-items-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">
                <X size={18} />
              </button>
            </div>
            <AdPreviewStudio
              key={preview.n}
              placement={{ title: line.title, type: line.type ?? '', location: line.location, dimensions: placementDimensions }}
              initialArtwork={{ url: preview.url, name: `${line.title} artwork` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
