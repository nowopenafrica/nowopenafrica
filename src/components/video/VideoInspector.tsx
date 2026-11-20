import { useState } from 'react';

import { FONT_CHOICES, weightsFor, resolveWeight } from '../../lib/studio/textStyle';
import type { FontKey } from '../../lib/design/typefaces';
import {
  MAX_SPEED, MIN_SPEED, speedOf, TEXT_ANIMS_IN, TEXT_ANIMS_LOOP, TEXT_ANIMS_OUT, TRANSITION_TYPES,
  type AudioClip, type Clip, type ClipEffects, type MediaClip, type MediaFit, type MotionSceneClip, type TextAnimation, type TextClip,
  type TextClipStyle, type Transform, type Transition, type TransitionType, type VideoDocument,
} from '../../lib/studio/videoDocument';
import {
  FILTER_PRESETS, TEXT_IN_LABELS, TEXT_LOOP_LABELS, TEXT_OUT_LABELS, TRANSITION_LABELS,
} from '../../lib/studio/videoEffects';

/*
 * Properties of the selected clip, in tabs the way phone editors lay them
 * out. Every change goes through `onPatch` (fields), `onDuration` (length,
 * which has trim bounds) or `onSpeed` (which also changes the length), so the
 * page keeps one place where edits become undo steps.
 */

interface Props {
  doc: VideoDocument;
  clip: Clip;
  locked: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onDuration: (ms: number) => void;
  onSpeed?: (speed: number) => void;
}

const field = 'w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm';
const label = 'block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1';
const chip = (on: boolean) => `rounded border px-2 py-1.5 text-[11px] leading-tight text-left ${on ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-700 hover:border-gray-500'}`;

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

function Toggle({ name, on, onChange }: { name: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /> {name}
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

type Tab = { key: string; label: string };

function Tabs({ tabs, on, setOn }: { tabs: Tab[]; on: string; setOn: (k: string) => void }) {
  return (
    <div role="tablist" aria-label="Clip settings" className="flex flex-wrap gap-1 border-b border-gray-200 pb-2 dark:border-gray-800">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={on === t.key} onClick={() => setOn(t.key)}
          className={`rounded px-2.5 py-1 text-xs font-semibold ${on === t.key ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function VideoInspector({ doc, clip, locked, onPatch, onDuration, onSpeed }: Props) {
  const tabs: Tab[] = clip.type === 'media'
    ? [{ key: 'basic', label: 'Basic' }, { key: 'speed', label: 'Speed' }, { key: 'effects', label: 'Effects' }, { key: 'transitions', label: 'Transitions' }]
    : clip.type === 'text'
      ? [{ key: 'text', label: 'Text' }, { key: 'style', label: 'Style' }, { key: 'animation', label: 'Animation' }, { key: 'transitions', label: 'Transitions' }]
      : clip.type === 'audio'
        ? [{ key: 'basic', label: 'Sound' }, { key: 'speed', label: 'Speed' }]
        : [{ key: 'basic', label: 'Scene' }, { key: 'transitions', label: 'Transitions' }];
  const [tab, setTab] = useState(tabs[0].key);
  const on = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <fieldset disabled={locked} className="space-y-4 text-sm">
      {locked ? <p className="text-xs text-amber-700 dark:text-amber-400">This clip's track is locked. Unlock it to edit.</p> : null}
      <Tabs tabs={tabs} on={on} setOn={setTab} />

      {(on === 'basic' || on === 'text') && (
        <Num name="Length" suffix="s" value={clip.durationMs / 1000} min={0.1} max={600} step={0.1} onChange={(s) => onDuration(Math.round(s * 1000))} />
      )}

      {on === 'basic' && clip.type === 'media' && <MediaFields doc={doc} clip={clip} onPatch={onPatch} />}
      {on === 'basic' && clip.type === 'audio' && <AudioFields clip={clip} onPatch={onPatch} />}
      {on === 'basic' && clip.type === 'motion-scene' && <SceneFields clip={clip} onPatch={onPatch} />}
      {on === 'speed' && (clip.type === 'media' || clip.type === 'audio') && <SpeedFields clip={clip} onSpeed={onSpeed} />}
      {on === 'effects' && clip.type === 'media' && <EffectsFields clip={clip} onPatch={onPatch} />}
      {on === 'transitions' && <TransitionFields clip={clip} onPatch={onPatch} />}
      {on === 'text' && clip.type === 'text' && <TextFields clip={clip} onPatch={onPatch} />}
      {on === 'style' && clip.type === 'text' && <TextStyleFields clip={clip} onPatch={onPatch} />}
      {on === 'animation' && clip.type === 'text' && <TextAnimationFields clip={clip} onPatch={onPatch} />}
    </fieldset>
  );
}

// ── transitions ─────────────────────────────────────────────────────────────

function TransitionPicker({ title, value, maxMs, onChange }: { title: string; value: Transition | undefined; maxMs: number; onChange: (t: Transition | undefined) => void }) {
  const cur = value ?? { type: 'cut' as TransitionType, ms: 0 };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">{title}</p>
      <div className="grid grid-cols-3 gap-1" role="group" aria-label={title}>
        {TRANSITION_TYPES.map((t) => (
          <button key={t} type="button" aria-pressed={cur.type === t} className={chip(cur.type === t)}
            onClick={() => onChange(t === 'cut' ? undefined : { type: t, ms: cur.ms || Math.min(500, maxMs) })}>
            {TRANSITION_LABELS[t]}
          </button>
        ))}
      </div>
      {cur.type !== 'cut' && (
        <Num name={`${title} length`} suffix="s" value={cur.ms / 1000} min={0.1} max={Math.max(0.1, maxMs / 1000)} step={0.1}
          onChange={(s) => onChange({ ...cur, ms: Math.round(s * 1000) })} />
      )}
    </div>
  );
}

function TransitionFields({ clip, onPatch }: { clip: Clip; onPatch: Props['onPatch'] }) {
  if (clip.type === 'audio') return null;
  const maxMs = Math.min(5000, clip.durationMs);
  return (
    <div className="space-y-4">
      <TransitionPicker title="In" value={clip.transitionIn} maxMs={maxMs} onChange={(t) => onPatch({ transitionIn: t })} />
      <TransitionPicker title="Out" value={clip.transitionOut} maxMs={maxMs} onChange={(t) => onPatch({ transitionOut: t })} />
      <p className="text-[11px] text-gray-500">Tip: give one clip an Out and the next an In of the same kind for a smooth hand-over.</p>
    </div>
  );
}

// ── pictures ────────────────────────────────────────────────────────────────

function MediaFields({ doc, clip, onPatch }: { doc: VideoDocument; clip: MediaClip; onPatch: Props['onPatch'] }) {
  const asset = doc.assets[clip.assetId];
  const fit = clip.fit ?? 'cover';
  return (
    <div className="space-y-3">
      <div>
        <span className={label}>Fit</span>
        <div className="grid grid-cols-3 gap-1">
          {([['cover', 'Fill'], ['contain', 'Fit'], ['blur-fill', 'Fit + blur']] as [MediaFit, string][]).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={fit === k} className={chip(fit === k)} onClick={() => onPatch({ fit: k === 'cover' ? undefined : k })}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Toggle name="Mirror" on={!!clip.flipX} onChange={(v) => onPatch({ flipX: v || undefined })} />
        <Toggle name="Flip upside down" on={!!clip.flipY} onChange={(v) => onPatch({ flipY: v || undefined })} />
        <button type="button" className="text-xs underline" onClick={() => onPatch({ transform: { ...clip.transform, x: 0, y: 0, w: 1, h: 1, rotation: 0 } })}>
          Fill the frame
        </button>
      </div>
      {asset?.kind === 'video' ? (
        <Num name="Clip volume" value={clip.volume ?? 1} min={0} max={1} step={0.05} onChange={(volume) => onPatch({ volume })} />
      ) : null}
      <TransformFields t={clip.transform} onChange={(transform) => onPatch({ transform })} />
    </div>
  );
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

function SpeedFields({ clip, onSpeed }: { clip: MediaClip | AudioClip; onSpeed?: (s: number) => void }) {
  const s = speedOf(clip);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1" role="group" aria-label="Speed">
        {SPEEDS.map((v) => (
          <button key={v} type="button" aria-pressed={s === v} className={chip(s === v)} onClick={() => onSpeed?.(v)}>{v}×</button>
        ))}
      </div>
      <Num name="Speed" suffix="×" value={s} min={MIN_SPEED} max={MAX_SPEED} step={0.05} onChange={(v) => onSpeed?.(v)} />
      <p className="text-[11px] text-gray-500">The same footage plays faster or slower, so the clip gets shorter or longer. It stops at the next clip.</p>
    </div>
  );
}

const ADJUST: { key: keyof ClipEffects; name: string; min: number; max: number; step: number; neutral: number; suffix?: string }[] = [
  { key: 'brightness', name: 'Brightness', min: 0, max: 200, step: 1, neutral: 100, suffix: '%' },
  { key: 'contrast', name: 'Contrast', min: 0, max: 200, step: 1, neutral: 100, suffix: '%' },
  { key: 'saturation', name: 'Saturation', min: 0, max: 300, step: 1, neutral: 100, suffix: '%' },
  { key: 'hue', name: 'Hue', min: -180, max: 180, step: 1, neutral: 0, suffix: '°' },
  { key: 'sepia', name: 'Warmth (sepia)', min: 0, max: 100, step: 1, neutral: 0, suffix: '%' },
  { key: 'grayscale', name: 'Black and white', min: 0, max: 100, step: 1, neutral: 0, suffix: '%' },
  { key: 'invert', name: 'Invert', min: 0, max: 100, step: 1, neutral: 0, suffix: '%' },
  { key: 'blur', name: 'Blur', min: 0, max: 0.03, step: 0.0005, neutral: 0 },
  { key: 'vignette', name: 'Vignette', min: 0, max: 1, step: 0.05, neutral: 0 },
  { key: 'grain', name: 'Film grain', min: 0, max: 1, step: 0.05, neutral: 0 },
];

function EffectsFields({ clip, onPatch }: { clip: MediaClip; onPatch: Props['onPatch'] }) {
  const fx = clip.effects ?? {};
  const set = (patch: Partial<ClipEffects>) => {
    const next = { ...fx, ...patch };
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== 'none'));
    onPatch({ effects: Object.keys(clean).length ? clean : undefined });
  };
  const preset = fx.preset ?? 'none';
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-semibold">Filters</p>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Filters">
          {Object.entries(FILTER_PRESETS).map(([k, p]) => (
            <button key={k} type="button" aria-pressed={preset === k} className={chip(preset === k)} onClick={() => set({ preset: k === 'none' ? undefined : k })}>{p.label}</button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">Adjust</p>
          <button type="button" className="text-[11px] underline" onClick={() => onPatch({ effects: fx.preset ? { preset: fx.preset } : undefined })}>Reset</button>
        </div>
        {ADJUST.map((a) => (
          <Num key={a.key} name={a.name} suffix={a.suffix} min={a.min} max={a.max} step={a.step}
            value={(fx[a.key] as number | undefined) ?? (FILTER_PRESETS[preset]?.fx[a.key] as number | undefined) ?? a.neutral}
            onChange={(v) => set({ [a.key]: v === a.neutral ? undefined : v } as Partial<ClipEffects>)} />
        ))}
      </div>
    </div>
  );
}

function AudioFields({ clip, onPatch }: { clip: AudioClip; onPatch: Props['onPatch'] }) {
  const max = clip.durationMs / 2000;
  return (
    <div className="space-y-3">
      <Num name="Volume" value={clip.volume} min={0} max={2} step={0.05} onChange={(volume) => onPatch({ volume })} />
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

// ── words ───────────────────────────────────────────────────────────────────

/** Ready-made looks for words. Starting points of NowOpen's own, not copies of another app's designs. */
const TEXT_LOOKS: { name: string; style: Partial<TextClipStyle> }[] = [
  { name: 'Plain', style: { stroke: undefined, shadow: undefined, background: undefined } },
  { name: 'Outline', style: { stroke: { color: '#000000', width: 0.12 }, shadow: undefined, background: undefined } },
  { name: 'Shadow', style: { shadow: { color: '#000000', x: 0.05, y: 0.08, blur: 0.15 }, stroke: undefined, background: undefined } },
  { name: 'Caption box', style: { background: { color: '#000000', opacity: 0.65, padding: 0.3, radius: 0.2 }, stroke: undefined, shadow: undefined } },
  { name: 'Highlight', style: { background: { color: '#facc15', opacity: 1, padding: 0.2, radius: 0.1 }, color: '#111111', stroke: undefined, shadow: undefined } },
  { name: 'Neon', style: { color: '#f0abfc', shadow: { color: '#d946ef', x: 0, y: 0, blur: 0.5 }, stroke: undefined, background: undefined } },
];

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
          <input type="color" className="h-8 w-full" value={s.color.startsWith('#') ? s.color : '#ffffff'} onChange={(e) => onPatch({ style: { ...s, color: e.target.value } })} />
        </label>
        <label className="block">
          <span className={label}>Align</span>
          <select className={field} value={s.align} onChange={(e) => onPatch({ style: { ...s, align: e.target.value } })}>
            <option value="left">Left</option><option value="center">Centre</option><option value="right">Right</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Toggle name="Italic" on={!!s.italic} onChange={(v) => onPatch({ style: { ...s, italic: v || undefined } })} />
        <Toggle name="Capitals" on={!!s.uppercase} onChange={(v) => onPatch({ style: { ...s, uppercase: v || undefined } })} />
      </div>
      <Num name="Size" suffix="% of width" value={s.size * 100} min={1} max={30} step={0.5} onChange={(n) => onPatch({ style: { ...s, size: n / 100 } })} />
      <Num name="Letter spacing" suffix="em" value={s.letterSpacing} min={-0.1} max={0.5} step={0.01} onChange={(n) => onPatch({ style: { ...s, letterSpacing: n } })} />
      <Num name="Line height" value={s.lineHeight} min={0.7} max={3} step={0.05} onChange={(n) => onPatch({ style: { ...s, lineHeight: n } })} />
      <TransformFields t={clip.transform} onChange={(transform) => onPatch({ transform })} />
    </div>
  );
}

function TextStyleFields({ clip, onPatch }: { clip: TextClip; onPatch: Props['onPatch'] }) {
  const s = clip.style;
  const put = (patch: Partial<TextClipStyle>) => onPatch({ style: { ...s, ...patch } });
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-xs font-semibold">Looks</p>
        <div className="grid grid-cols-3 gap-1">
          {TEXT_LOOKS.map((l) => <button key={l.name} type="button" className={chip(false)} onClick={() => put(l.style)}>{l.name}</button>)}
        </div>
      </div>

      <div className="space-y-2">
        <Toggle name="Outline" on={!!s.stroke} onChange={(v) => put({ stroke: v ? { color: '#000000', width: 0.1 } : undefined })} />
        {s.stroke && (
          <div className="grid grid-cols-[3rem_1fr] items-end gap-2">
            <input type="color" aria-label="Outline colour" className="h-8 w-full" value={s.stroke.color} onChange={(e) => put({ stroke: { ...s.stroke!, color: e.target.value } })} />
            <Num name="Outline width" value={s.stroke.width} min={0.01} max={0.4} step={0.01} onChange={(width) => put({ stroke: { ...s.stroke!, width } })} />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Toggle name="Shadow" on={!!s.shadow} onChange={(v) => put({ shadow: v ? { color: '#000000', x: 0.05, y: 0.08, blur: 0.15 } : undefined })} />
        {s.shadow && (
          <div className="grid grid-cols-2 gap-2">
            <input type="color" aria-label="Shadow colour" className="h-8 w-full" value={s.shadow.color.startsWith('#') ? s.shadow.color : '#000000'} onChange={(e) => put({ shadow: { ...s.shadow!, color: e.target.value } })} />
            <Num name="Shadow blur" value={s.shadow.blur} min={0} max={1} step={0.01} onChange={(blur) => put({ shadow: { ...s.shadow!, blur } })} />
            <Num name="Shadow across" value={s.shadow.x} min={-0.5} max={0.5} step={0.01} onChange={(x) => put({ shadow: { ...s.shadow!, x } })} />
            <Num name="Shadow down" value={s.shadow.y} min={-0.5} max={0.5} step={0.01} onChange={(y) => put({ shadow: { ...s.shadow!, y } })} />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Toggle name="Background box" on={!!s.background} onChange={(v) => put({ background: v ? { color: '#000000', opacity: 0.6, padding: 0.25, radius: 0.15 } : undefined })} />
        {s.background && (
          <div className="grid grid-cols-2 gap-2">
            <input type="color" aria-label="Box colour" className="h-8 w-full" value={s.background.color} onChange={(e) => put({ background: { ...s.background!, color: e.target.value } })} />
            <Num name="Box opacity" value={s.background.opacity} min={0} max={1} step={0.05} onChange={(opacity) => put({ background: { ...s.background!, opacity } })} />
            <Num name="Box padding" value={s.background.padding} min={0} max={1} step={0.05} onChange={(padding) => put({ background: { ...s.background!, padding } })} />
            <Num name="Box corners" value={s.background.radius} min={0} max={1} step={0.05} onChange={(radius) => put({ background: { ...s.background!, radius } })} />
          </div>
        )}
      </div>
    </div>
  );
}

function TextAnimationFields({ clip, onPatch }: { clip: TextClip; onPatch: Props['onPatch'] }) {
  const a: TextAnimation = clip.animation ?? {};
  const put = (patch: Partial<TextAnimation>) => {
    const next = { ...a, ...patch };
    const empty = (!next.in || next.in.type === 'none') && (!next.out || next.out.type === 'none') && (!next.loop || next.loop === 'none');
    onPatch({ animation: empty ? undefined : next });
  };
  const maxS = Math.max(0.1, Math.min(5, clip.durationMs / 1000));
  const inType = a.in?.type ?? 'none';
  const outType = a.out?.type ?? 'none';
  const loop = a.loop ?? 'none';
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold">In</p>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Text in">
          {TEXT_ANIMS_IN.map((t) => (
            <button key={t} type="button" aria-pressed={inType === t} className={chip(inType === t)}
              onClick={() => put({ in: t === 'none' ? undefined : { type: t, ms: a.in?.ms ?? Math.min(800, clip.durationMs) } })}>{TEXT_IN_LABELS[t]}</button>
          ))}
        </div>
        {a.in && <Num name="In length" suffix="s" value={a.in.ms / 1000} min={0.1} max={maxS} step={0.1} onChange={(s) => put({ in: { ...a.in!, ms: Math.round(s * 1000) } })} />}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold">Out</p>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Text out">
          {TEXT_ANIMS_OUT.map((t) => (
            <button key={t} type="button" aria-pressed={outType === t} className={chip(outType === t)}
              onClick={() => put({ out: t === 'none' ? undefined : { type: t, ms: a.out?.ms ?? Math.min(600, clip.durationMs) } })}>{TEXT_OUT_LABELS[t]}</button>
          ))}
        </div>
        {a.out && <Num name="Out length" suffix="s" value={a.out.ms / 1000} min={0.1} max={maxS} step={0.1} onChange={(s) => put({ out: { ...a.out!, ms: Math.round(s * 1000) } })} />}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold">Loop (while on screen)</p>
        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Text loop">
          {TEXT_ANIMS_LOOP.map((t) => (
            <button key={t} type="button" aria-pressed={loop === t} className={chip(loop === t)} onClick={() => put({ loop: t === 'none' ? undefined : t })}>{TEXT_LOOP_LABELS[t]}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
