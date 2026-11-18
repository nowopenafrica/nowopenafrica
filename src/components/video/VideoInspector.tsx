import { FONT_CHOICES, weightsFor, resolveWeight } from '../../lib/studio/textStyle';
import type { FontKey } from '../../lib/design/typefaces';
import {
  type AudioClip, type Clip, type MediaClip, type MotionSceneClip, type TextClip, type Transform, type TransitionType, type VideoDocument,
} from '../../lib/studio/videoDocument';

/*
 * Properties of the selected clip. Every change goes through `onPatch`
 * (fields) or `onDuration` (length, which has trim bounds), so the page
 * keeps one place where edits become undo steps.
 */

interface Props {
  doc: VideoDocument;
  clip: Clip;
  locked: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onDuration: (ms: number) => void;
}

const field = 'w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm';
const label = 'block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1';

function Num({ name, value, min, max, step, onChange, suffix }: { name: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className={label}>{name}{suffix ? ` (${suffix})` : ''}</span>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} aria-label={name}
          onChange={(e) => onChange(Number(e.target.value))} className="flex-1 min-w-0" />
        <input type="number" min={min} max={max} step={step} value={Number(value.toFixed(3))} aria-label={`${name} value`}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))); }}
          className="w-16 shrink-0 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-1 py-0.5 text-xs" />
      </div>
    </label>
  );
}

function TransformFields({ t, onChange }: { t: Transform; onChange: (t: Transform) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Num name="Left" value={t.x} min={-1} max={1} step={0.01} onChange={(x) => onChange({ ...t, x })} />
      <Num name="Top" value={t.y} min={-1} max={1} step={0.01} onChange={(y) => onChange({ ...t, y })} />
      <Num name="Width" value={t.w} min={0.02} max={2} step={0.01} onChange={(w) => onChange({ ...t, w })} />
      <Num name="Height" value={t.h} min={0.02} max={2} step={0.01} onChange={(h) => onChange({ ...t, h })} />
      <Num name="Rotation" value={t.rotation} min={-180} max={180} step={1} suffix="°" onChange={(rotation) => onChange({ ...t, rotation })} />
      <Num name="Opacity" value={t.opacity} min={0} max={1} step={0.05} onChange={(opacity) => onChange({ ...t, opacity })} />
    </div>
  );
}

export default function VideoInspector({ doc, clip, locked, onPatch, onDuration }: Props) {
  const tr = clip.transitionIn ?? { type: 'cut' as TransitionType, ms: 0 };
  return (
    <fieldset disabled={locked} className="space-y-4 text-sm">
      {locked ? <p className="text-xs text-amber-700 dark:text-amber-400">This clip's track is locked. Unlock it to edit.</p> : null}

      <Num name="Length" suffix="s" value={clip.durationMs / 1000} min={0.1} max={60} step={0.1} onChange={(s) => onDuration(Math.round(s * 1000))} />

      {clip.type !== 'audio' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={label}>Entrance</span>
            <select className={field} value={tr.type} onChange={(e) => {
              const type = e.target.value as TransitionType;
              onPatch({ transitionIn: type === 'cut' ? undefined : { type, ms: tr.ms || 500 } });
            }}>
              <option value="cut">Cut</option>
              <option value="fade">Fade in</option>
              <option value="slide">Slide in</option>
            </select>
          </label>
          {tr.type !== 'cut' ? (
            <Num name="Entrance length" suffix="s" value={tr.ms / 1000} min={0.1} max={Math.min(5, clip.durationMs / 1000)} step={0.1}
              onChange={(s) => onPatch({ transitionIn: { ...tr, ms: Math.round(s * 1000) } })} />
          ) : null}
        </div>
      ) : null}

      {clip.type === 'text' ? <TextFields clip={clip} onPatch={onPatch} /> : null}
      {clip.type === 'media' ? <MediaFields doc={doc} clip={clip} onPatch={onPatch} /> : null}
      {clip.type === 'audio' ? <AudioFields clip={clip} onPatch={onPatch} /> : null}
      {clip.type === 'motion-scene' ? <SceneFields clip={clip} onPatch={onPatch} /> : null}
    </fieldset>
  );
}

function TextFields({ clip, onPatch }: { clip: TextClip; onPatch: Props['onPatch'] }) {
  const s = clip.style;
  const font = s.font as FontKey;
  return (
    <div className="space-y-3">
      <label className="block">
        <span className={label}>Words</span>
        <textarea className={field} rows={3} value={clip.text} onChange={(e) => onPatch({ text: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={label}>Typeface</span>
          <select className={field} value={font} onChange={(e) => {
            const f = e.target.value as FontKey;
            onPatch({ style: { ...s, font: f, weight: resolveWeight(f, s.weight) } });
          }}>
            {FONT_CHOICES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={label}>Weight</span>
          <select className={field} value={s.weight} onChange={(e) => onPatch({ style: { ...s, weight: Number(e.target.value) } })}>
            {weightsFor(font).map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={label}>Colour</span>
          <input type="color" className="h-8 w-full" value={s.color} onChange={(e) => onPatch({ style: { ...s, color: e.target.value } })} />
        </label>
        <label className="block">
          <span className={label}>Align</span>
          <select className={field} value={s.align} onChange={(e) => onPatch({ style: { ...s, align: e.target.value } })}>
            <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
          </select>
        </label>
      </div>
      <Num name="Size" suffix="% of width" value={s.size * 100} min={1} max={30} step={0.5} onChange={(n) => onPatch({ style: { ...s, size: n / 100 } })} />
      <Num name="Letter spacing" suffix="em" value={s.letterSpacing} min={-0.1} max={0.5} step={0.01} onChange={(n) => onPatch({ style: { ...s, letterSpacing: n } })} />
      <Num name="Line height" value={s.lineHeight} min={0.7} max={3} step={0.05} onChange={(n) => onPatch({ style: { ...s, lineHeight: n } })} />
      <TransformFields t={clip.transform} onChange={(transform) => onPatch({ transform })} />
    </div>
  );
}

function MediaFields({ doc, clip, onPatch }: { doc: VideoDocument; clip: MediaClip; onPatch: Props['onPatch'] }) {
  const asset = doc.assets[clip.assetId];
  return (
    <div className="space-y-3">
      <button type="button" className="text-xs underline" onClick={() => onPatch({ transform: { ...clip.transform, x: 0, y: 0, w: 1, h: 1, rotation: 0 } })}>
        Fill the frame
      </button>
      {asset?.kind === 'video' ? (
        <Num name="Clip volume" value={clip.volume ?? 1} min={0} max={1} step={0.05} onChange={(volume) => onPatch({ volume })} />
      ) : null}
      <TransformFields t={clip.transform} onChange={(transform) => onPatch({ transform })} />
    </div>
  );
}

function AudioFields({ clip, onPatch }: { clip: AudioClip; onPatch: Props['onPatch'] }) {
  const max = clip.durationMs / 2000;
  return (
    <div className="space-y-3">
      <Num name="Volume" value={clip.volume} min={0} max={1} step={0.05} onChange={(volume) => onPatch({ volume })} />
      <Num name="Fade in" suffix="s" value={clip.fadeInMs / 1000} min={0} max={max} step={0.1} onChange={(s) => onPatch({ fadeInMs: Math.round(s * 1000) })} />
      <Num name="Fade out" suffix="s" value={clip.fadeOutMs / 1000} min={0} max={max} step={0.1} onChange={(s) => onPatch({ fadeOutMs: Math.round(s * 1000) })} />
    </div>
  );
}

function SceneFields({ clip, onPatch }: { clip: MotionSceneClip; onPatch: Props['onPatch'] }) {
  const el = clip.scene.elements ?? {};
  const set = (key: 'title' | 'subline', text: string) =>
    onPatch({ scene: { ...clip.scene, elements: { ...el, [key]: { ...(el[key] ?? {}), text } } } });
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">A Motion Studio scene. Its look comes from the motion style; the words are yours to change.</p>
      <label className="block">
        <span className={label}>Headline</span>
        <input className={field} value={el.title?.text ?? clip.scene.text} onChange={(e) => set('title', e.target.value)} />
      </label>
      <label className="block">
        <span className={label}>Sub-line</span>
        <input className={field} value={el.subline?.text ?? clip.scene.voiceover} onChange={(e) => set('subline', e.target.value)} />
      </label>
    </div>
  );
}
