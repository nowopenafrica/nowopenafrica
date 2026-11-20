import { useRef } from 'react';
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX, Trash2 } from 'lucide-react';
import { clipEndMs, formatTime, videoDurationMs, type Clip, type Track, type VideoDocument } from '../../lib/studio/videoDocument';
import { moveClip, snapMs, snapPoints, trimClip } from '../../lib/studio/videoEdit';
import { assetLabel } from '../../lib/studio/videoAssets';

/*
 * The multi-track timeline. Dragging edits a DRAFT: every pointer move
 * recomputes the document from the one that existed when the drag began
 * (so a refused intermediate position never compounds), shown live through
 * onLive; letting go commits once, so a drag is one undo step, not hundreds.
 */

export const HEADER_PX = 148;
const SNAP_PX = 8;

type Drag =
  | { mode: 'move'; clipId: string; base: VideoDocument; x0: number; start0: number; trackId: string }
  | { mode: 'start' | 'end'; clipId: string; base: VideoDocument; x0: number; edge0: number }
  | { mode: 'seek' };

interface Props {
  doc: VideoDocument;
  selectedId: string | null;
  playheadMs: number;
  pps: number;
  onSelect: (id: string | null) => void;
  onSeek: (ms: number) => void;
  /** A draft during a drag — not an undo step. */
  onLive: (doc: VideoDocument) => void;
  /** The drag ended: `base` is the document before it began. */
  onCommit: (base: VideoDocument) => void;
  onTrackFlag: (trackId: string, flag: 'muted' | 'locked' | 'hidden', value: boolean) => void;
  onRemoveTrack: (trackId: string) => void;
}

const TRACK_TINT: Record<Track['kind'], string> = {
  video: 'bg-sky-600/80 border-sky-300',
  overlay: 'bg-violet-600/80 border-violet-300',
  text: 'bg-amber-600/80 border-amber-300',
  audio: 'bg-emerald-600/80 border-emerald-300',
};

function clipLabel(doc: VideoDocument, c: Clip): string {
  switch (c.type) {
    case 'text': return c.text.split('\n')[0] || 'Text';
    case 'motion-scene': return c.scene.elements?.title?.text ?? c.scene.text;
    default: {
      const a = doc.assets[c.assetId];
      if (!a) return 'Missing media';
      if (a.link?.platform && !a.path) return `${a.link.platform === 'youtube' ? 'YouTube' : a.link.platform[0].toUpperCase() + a.link.platform.slice(1)} video`;
      if (!a.path) return a.kind === 'video' ? 'Clip from link' : a.kind === 'image' ? 'Image from link' : 'Sound from link';
      return assetLabel(a.kind, a.path);
    }
  }
}

export default function VideoTimeline(p: Props) {
  const drag = useRef<Drag | null>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const total = Math.max(videoDurationMs(p.doc) + 5000, 15000);
  const width = Math.ceil((total / 1000) * p.pps);

  const msAt = (clientX: number) => {
    const r = laneRef.current?.getBoundingClientRect();
    return r ? Math.max(0, ((clientX - r.left) / p.pps) * 1000) : 0;
  };
  const snapThreshold = (SNAP_PX / p.pps) * 1000;

  const onClipDown = (e: React.PointerEvent, track: Track, clip: Clip, mode: 'move' | 'start' | 'end') => {
    e.stopPropagation();
    p.onSelect(clip.id);
    if (track.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = mode === 'move'
      ? { mode, clipId: clip.id, base: p.doc, x0: e.clientX, start0: clip.startMs, trackId: track.id }
      : { mode, clipId: clip.id, base: p.doc, x0: e.clientX, edge0: mode === 'start' ? clip.startMs : clipEndMs(clip) };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.mode === 'seek') { p.onSeek(msAt(e.clientX)); return; }
    const deltaMs = ((e.clientX - d.x0) / p.pps) * 1000;
    const pts = snapPoints(d.base, d.clipId, p.playheadMs);
    if (d.mode === 'move') {
      const clip = d.base.tracks.flatMap((t) => t.clips).find((c) => c.id === d.clipId)!;
      let start = d.start0 + deltaMs;
      /* Snap whichever edge is nearer a point. */
      const s1 = snapMs(start, pts, snapThreshold);
      const s2 = snapMs(start + clip.durationMs, pts, snapThreshold) - clip.durationMs;
      start = Math.abs(s1 - start) <= Math.abs(s2 - start) ? s1 : s2;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-track-id]') as HTMLElement | null;
      const toTrack = over?.dataset.trackId ?? d.trackId;
      let next = moveClip(d.base, d.clipId, start, toTrack);
      /* Over a track that refuses it: keep it on its own track rather than freezing. */
      if (next === d.base && toTrack !== d.trackId) next = moveClip(d.base, d.clipId, start, d.trackId);
      p.onLive(next);
    } else {
      p.onLive(trimClip(d.base, d.clipId, d.mode, snapMs(d.edge0 + deltaMs, pts, snapThreshold)));
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.mode !== 'seek') p.onCommit(d.base);
  };

  const ticks: number[] = [];
  const step = p.pps >= 120 ? 0.5 : p.pps >= 50 ? 1 : p.pps >= 20 ? 5 : 10;
  for (let s = 0; s * 1000 <= total; s += step) ticks.push(s);

  return (
    <div className="flex text-xs select-none" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {/* Track headers */}
      <div className="shrink-0 border-r border-gray-300 dark:border-gray-700" style={{ width: HEADER_PX }}>
        <div className="h-6 border-b border-gray-300 dark:border-gray-700" />
        {p.doc.tracks.map((t) => (
          <div key={t.id} className="h-12 px-2 flex items-center gap-1 border-b border-gray-200 dark:border-gray-800">
            <span className="flex-1 truncate font-medium text-gray-700 dark:text-gray-200" title={t.name}>{t.name}</span>
            {t.kind === 'audio' || t.kind === 'video' ? (
              <button type="button" className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" aria-label={t.muted ? `Unmute ${t.name}` : `Mute ${t.name}`}
                onClick={() => p.onTrackFlag(t.id, 'muted', !t.muted)}>{t.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>
            ) : null}
            {t.kind !== 'audio' ? (
              <button type="button" className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" aria-label={t.hidden ? `Show ${t.name}` : `Hide ${t.name}`}
                onClick={() => p.onTrackFlag(t.id, 'hidden', !t.hidden)}>{t.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
            ) : null}
            <button type="button" className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" aria-label={t.locked ? `Unlock ${t.name}` : `Lock ${t.name}`}
              onClick={() => p.onTrackFlag(t.id, 'locked', !t.locked)}>{t.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
            {t.clips.length === 0 && p.doc.tracks.length > 1 ? (
              <button type="button" className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" aria-label={`Remove ${t.name}`}
                onClick={() => p.onRemoveTrack(t.id)}><Trash2 size={13} /></button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Lanes */}
      <div className="flex-1 overflow-x-auto">
        <div ref={laneRef} className="relative" style={{ width }}>
          <div
            className="h-6 border-b border-gray-300 dark:border-gray-700 relative cursor-pointer"
            onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { mode: 'seek' }; p.onSeek(msAt(e.clientX)); }}
          >
            {ticks.map((s) => (
              <span key={s} className="absolute top-0 h-full border-l border-gray-300 dark:border-gray-700 pl-0.5 text-[10px] text-gray-500" style={{ left: s * p.pps }}>
                {Number.isInteger(s) ? formatTime(s * 1000).replace(/\.0$/, '') : ''}
              </span>
            ))}
          </div>
          {p.doc.tracks.map((t) => (
            <div key={t.id} data-track-id={t.id}
              className={`h-12 relative border-b border-gray-200 dark:border-gray-800 ${t.locked ? 'bg-gray-100/60 dark:bg-gray-900/60' : ''} ${t.hidden ? 'opacity-50' : ''}`}
              onPointerDown={() => p.onSelect(null)}
            >
              {t.clips.map((c) => {
                const sel = c.id === p.selectedId;
                return (
                  <div key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${clipLabel(p.doc, c)}, ${formatTime(c.startMs)} to ${formatTime(clipEndMs(c))}`}
                    aria-pressed={sel}
                    className={`absolute top-1 bottom-1 rounded border text-white overflow-hidden ${TRACK_TINT[t.kind]} ${sel ? 'ring-2 ring-white outline outline-2 outline-blue-500' : ''} ${t.locked ? 'cursor-not-allowed' : 'cursor-grab'}`}
                    style={{ left: (c.startMs / 1000) * p.pps, width: Math.max(4, (c.durationMs / 1000) * p.pps) }}
                    onPointerDown={(e) => onClipDown(e, t, c, 'move')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect(c.id); } }}
                  >
                    <span className="block px-2 pt-1 truncate text-[11px] font-medium pointer-events-none">{clipLabel(p.doc, c)}</span>
                    <span className="block px-2 truncate text-[10px] opacity-80 pointer-events-none">{(c.durationMs / 1000).toFixed(1)}s</span>
                    {!t.locked ? (
                      <>
                        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60" onPointerDown={(e) => onClipDown(e, t, c, 'start')} />
                        <span aria-hidden className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-white/30 hover:bg-white/60" onPointerDown={(e) => onClipDown(e, t, c, 'end')} />
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          <div aria-hidden className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none" style={{ left: (p.playheadMs / 1000) * p.pps }} />
        </div>
      </div>
    </div>
  );
}

