import { useMemo, useRef, useState } from 'react';
import { Download, Loader2, X } from 'lucide-react';

import { downloadBlob } from '../../lib/studio';
import { formatTime, videoDurationMs, type VideoDocument } from '../../lib/studio/videoDocument';
import {
  checkExport, estimateBytes, ExportCancelled, exportVideo, FORMAT_INFO, outputSize,
  type ExportFormat, type ExportOptions, type ExportQuality,
} from '../../lib/studio/videoExport';

/*
 * Export: pick a format, a size, a frame rate and a quality, see what the
 * file will be and anything that will be left out, then make it. Everything
 * happens in this browser: nothing is uploaded.
 */

const SIZES: { label: string; short: number }[] = [
  { label: 'Project size', short: 0 },
  { label: '4K (2160p)', short: 2160 },
  { label: 'Full HD (1080p)', short: 1080 },
  { label: 'HD (720p)', short: 720 },
  { label: 'SD (480p)', short: 480 },
  { label: 'Small (360p)', short: 360 },
];
const GIF_SIZES: { label: string; short: number }[] = [
  { label: 'Large (480)', short: 480 },
  { label: 'Medium (360)', short: 360 },
  { label: 'Small (240)', short: 240 },
];
const FPS_VIDEO = [24, 25, 30, 50, 60];
const FPS_GIF = [10, 12, 15, 20, 25];
const QUALITIES: { key: ExportQuality; label: string }[] = [
  { key: 'small', label: 'Smaller file' },
  { key: 'standard', label: 'Recommended' },
  { key: 'high', label: 'Best quality' },
];

const mb = (b: number) => (b >= 1024 * 1024 * 1024 ? `${(b / 1024 / 1024 / 1024).toFixed(1)} GB` : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function ExportDialog({ doc, playheadMs, urlFor, onClose }: {
  doc: VideoDocument;
  playheadMs: number;
  urlFor: (path: string) => string;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [short, setShort] = useState(0);
  const [fps, setFps] = useState<number>(doc.fps);
  const [quality, setQuality] = useState<ExportQuality>('standard');
  const [audio, setAudio] = useState(true);
  const [range, setRange] = useState<'all' | 'from-playhead'>('all');
  const [progress, setProgress] = useState<{ f: number; stage: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; size: number; notes: string[] } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const isGif = format === 'gif';
  const isStill = format === 'png';
  const hasAudio = format === 'mp4' || format === 'webm';
  const shortSide = isGif ? (short || 360) : short;
  const frameRate = isGif ? (FPS_GIF.includes(fps) ? fps : 12) : (FPS_VIDEO.includes(fps) ? fps : 30);
  const duration = videoDurationMs(doc);
  const startMs = isStill ? playheadMs : range === 'from-playhead' ? Math.min(playheadMs, duration) : 0;

  const opts: ExportOptions = { format, shortSide, fps: frameRate, quality, includeAudio: hasAudio && audio, startMs, endMs: duration };
  const size = outputSize(doc, shortSide, isGif ? 1080 : 3840);
  const support = useMemo(() => ({
    webCodecs: typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window,
    mediaRecorder: typeof window !== 'undefined' && 'MediaRecorder' in window,
  }), []);
  const problems = checkExport(doc, opts, support);
  const busy = progress !== null && !done && !error;

  const start = async () => {
    setError(null);
    setDone(null);
    setProgress({ f: 0, stage: 'Starting' });
    const ac = new AbortController();
    abort.current = ac;
    try {
      const out = await exportVideo(doc, opts, { urlFor, signal: ac.signal, onProgress: (f, stage) => setProgress({ f, stage }) });
      downloadBlob(out.blob, out.filename);
      setDone({ name: out.filename, size: out.blob.size, notes: out.notes });
    } catch (e) {
      if (e instanceof ExportCancelled) { setProgress(null); return; }
      setError(e instanceof Error ? e.message : 'The export failed.');
    } finally {
      abort.current = null;
    }
  };

  const card = (on: boolean) => `rounded-lg border p-2.5 text-left ${on ? 'border-gray-900 ring-1 ring-gray-900 dark:border-white dark:ring-white' : 'border-gray-300 hover:border-gray-500 dark:border-gray-700'}`;
  const sel = 'w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="export-title" data-testid="export-dialog">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 text-sm shadow-xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="export-title" className="text-lg font-bold">Export</h2>
          <button type="button" aria-label="Close" onClick={() => { abort.current?.abort(); onClose(); }} className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={18} /></button>
        </div>

        <fieldset disabled={busy} className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400">Format</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Format">
              {(Object.keys(FORMAT_INFO) as ExportFormat[]).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={format === f} className={card(format === f)} onClick={() => { setFormat(f); setShort(0); }}>
                  <span className="block font-semibold">{FORMAT_INFO[f].label}</span>
                  <span className="block text-[11px] text-gray-500">{FORMAT_INFO[f].note}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-400">Size</span>
              <select className={sel} value={shortSide} onChange={(e) => setShort(Number(e.target.value))}>
                {(isGif ? GIF_SIZES : SIZES).map((s) => <option key={s.short} value={s.short}>{s.label}</option>)}
              </select>
            </label>
            {!isStill && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-400">Frame rate</span>
                <select className={sel} value={frameRate} onChange={(e) => setFps(Number(e.target.value))}>
                  {(isGif ? FPS_GIF : FPS_VIDEO).map((f) => <option key={f} value={f}>{f} fps</option>)}
                </select>
              </label>
            )}
            {(format === 'mp4' || format === 'webm') && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-400">Quality</span>
                <select className={sel} value={quality} onChange={(e) => setQuality(e.target.value as ExportQuality)}>
                  {QUALITIES.map((q) => <option key={q.key} value={q.key}>{q.label}</option>)}
                </select>
              </label>
            )}
            {!isStill && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-400">Range</span>
                <select className={sel} value={range} onChange={(e) => setRange(e.target.value as 'all' | 'from-playhead')}>
                  <option value="all">Whole video ({formatTime(duration)})</option>
                  <option value="from-playhead">From the playhead ({formatTime(playheadMs)})</option>
                </select>
              </label>
            )}
          </div>

          {hasAudio && (
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} /> Include sound
            </label>
          )}

          <p className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300" data-testid="export-summary">
            {FORMAT_INFO[format].label} · {size.width}×{size.height}
            {!isStill && ` · ${frameRate} fps · ${formatTime(duration - startMs)}`}
            {` · about ${mb(estimateBytes(opts, size, duration - startMs))}`}
          </p>

          {problems.warnings.map((w) => <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>)}
          {problems.blocking.map((b) => <p key={b} className="text-xs font-semibold text-red-600">{b}</p>)}
        </fieldset>

        {progress && !done && !error && (
          <div className="mt-4 space-y-1.5" aria-live="polite">
            <div className="h-2 overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
              <div className="h-full bg-green-600 transition-[width]" style={{ width: `${Math.round(progress.f * 100)}%` }} />
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">{progress.stage} · {Math.round(progress.f * 100)}%. Keep this tab open.</p>
          </div>
        )}
        {error && <p className="mt-4 text-sm font-semibold text-red-600" role="alert">{error}</p>}
        {done && (
          <div className="mt-4 space-y-1 rounded bg-green-50 px-3 py-2 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-300" role="status">
            <p className="font-semibold">Saved {done.name} ({mb(done.size)}).</p>
            {done.notes.map((n) => <p key={n}>{n}</p>)}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-700">Cancel</button>
          ) : (
            <button type="button" onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold dark:border-gray-700">Close</button>
          )}
          <button type="button" disabled={busy || problems.blocking.length > 0} onClick={() => void start()}
            className="inline-flex items-center gap-1.5 rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {done ? 'Export again' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}
