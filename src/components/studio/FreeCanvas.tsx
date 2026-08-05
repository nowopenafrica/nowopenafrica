import { useCallback, useEffect, useRef } from 'react';
import { Trash2, Copy, Lock, Unlock, Eye, EyeOff, ChevronUp, ChevronDown, Undo2, Redo2, MousePointer2 } from 'lucide-react';
import {
  CanvasDoc, Layer, layerAt, moveLayer, removeLayer, duplicateLayer, reorderLayer,
  updateLayer, resizeLayer, MIN_SIZE,
} from '../../lib/canvasDoc';

// Free-canvas rendering for Creative Studio.
//
// Split in two on purpose:
//   • <CanvasLayers> paints inside DesignStudio's existing capture node, so PNG
//     / PDF / video export needs no changes at all — it still screenshots the
//     same element.
//   • <CanvasPanel> is the layers list and controls for the editor column.
//
// Smart layout is a completely separate render path and this file never touches
// it. Nothing here runs unless the merchant opts into free canvas.

const SELECT_RING = '#7c3aed';

function layerStyle(l: Layer): React.CSSProperties {
  return {
    position: 'absolute',
    left: l.x,
    top: l.y,
    width: l.w,
    height: l.h,
    opacity: l.hidden ? 0 : l.opacity,
    transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
    transformOrigin: 'center',
    pointerEvents: 'none',
  };
}

/**
 * The layers themselves. `interactive` is false during export capture so no
 * selection chrome is baked into the image.
 */
export function CanvasLayers({
  doc,
  selectedId,
  interactive = true,
  scale = 1,
  onSelect,
  onChange,
}: {
  doc: CanvasDoc;
  selectedId: string | null;
  interactive?: boolean;
  scale?: number;
  onSelect?: (id: string | null) => void;
  onChange?: (next: CanvasDoc) => void;
}) {
  const drag = useRef<{ id: string; lastX: number; lastY: number; mode: 'move' | 'resize' } | null>(null);

  const toDesign = useCallback((clientDelta: number) => clientDelta / (scale || 1), [scale]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || !onSelect) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / (scale || 1);
    const y = (e.clientY - box.top) / (scale || 1);
    const hit = layerAt(doc, x, y);
    onSelect(hit?.id ?? null);
    if (hit) {
      drag.current = { id: hit.id, lastX: e.clientX, lastY: e.clientY, mode: 'move' };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !onChange) return;
    const dx = toDesign(e.clientX - d.lastX);
    const dy = toDesign(e.clientY - d.lastY);
    if (!dx && !dy) return;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    onChange(d.mode === 'resize' ? resizeLayer(doc, d.id, dx, dy) : moveLayer(doc, d.id, dx, dy));
  };

  const endDrag = () => { drag.current = null; };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ position: 'absolute', inset: 0, cursor: interactive ? 'default' : undefined }}
    >
      {doc.layers.map((l) => {
        const selected = interactive && l.id === selectedId;
        return (
          <div key={l.id} style={layerStyle(l)}>
            {l.kind === 'text' && (
              <span
                style={{
                  display: 'block',
                  color: l.fill ?? '#ffffff',
                  fontSize: l.fontSize,
                  fontWeight: l.fontWeight ?? 700,
                  textAlign: l.align ?? 'left',
                  lineHeight: 1.1,
                  textShadow: '0 2px 14px rgba(0,0,0,.35)',
                  wordBreak: 'break-word',
                }}
              >
                {l.text}
              </span>
            )}
            {(l.kind === 'image' || l.kind === 'logo' || l.kind === 'qr') && l.src && (
              <img
                src={l.src}
                crossOrigin="anonymous"
                alt=""
                style={{
                  width: '100%', height: '100%',
                  objectFit: l.kind === 'image' ? 'cover' : 'contain',
                  borderRadius: l.radius ?? (l.kind === 'qr' ? 8 : 0),
                  background: l.kind === 'qr' ? '#ffffff' : undefined,
                  padding: l.kind === 'qr' ? 6 : undefined,
                }}
              />
            )}
            {l.kind === 'shape' && (
              <div style={{ width: '100%', height: '100%', background: l.fill ?? SELECT_RING, borderRadius: l.radius ?? 12 }} />
            )}
            {selected && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute', inset: -2,
                  border: `2px solid ${SELECT_RING}`,
                  borderRadius: 4,
                  boxShadow: '0 0 0 1px rgba(255,255,255,.6)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Layers list + controls, for the editor column. */
export function CanvasPanel({
  doc,
  selectedId,
  onSelect,
  onChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  doc: CanvasDoc;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: CanvasDoc) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}) {
  const sel = doc.layers.find((l) => l.id === selectedId) ?? null;

  // Keyboard: nudge with arrows, delete with Delete/Backspace, undo/redo.
  // Skipped while a form field has focus so typing a headline still works.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el instanceof HTMLElement && el.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) onRedo(); else onUndo();
        return;
      }
      if (!sel) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(moveLayer(doc, sel.id, -step, 0)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onChange(moveLayer(doc, sel.id, step, 0)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); onChange(moveLayer(doc, sel.id, 0, -step)); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); onChange(moveLayer(doc, sel.id, 0, step)); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onChange(removeLayer(doc, sel.id));
        onSelect(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, sel, onChange, onSelect, onUndo, onRedo]);

  const iconBtn = 'inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" className={iconBtn}>
          <Undo2 size={15} />
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" className={iconBtn}>
          <Redo2 size={15} />
        </button>
        <span className="ml-1 text-[11px] text-gray-400">
          {sel ? `${sel.name} selected` : 'Click a layer on the design'}
        </span>
      </div>

      {sel && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
          <button type="button" onClick={() => { const r = duplicateLayer(doc, sel.id); onChange(r.doc); if (r.id) onSelect(r.id); }} title="Duplicate" aria-label="Duplicate layer" className={iconBtn}><Copy size={14} /></button>
          <button type="button" onClick={() => onChange(reorderLayer(doc, sel.id, 'forward'))} title="Bring forward" aria-label="Bring forward" className={iconBtn}><ChevronUp size={15} /></button>
          <button type="button" onClick={() => onChange(reorderLayer(doc, sel.id, 'backward'))} title="Send backward" aria-label="Send backward" className={iconBtn}><ChevronDown size={15} /></button>
          <button type="button" onClick={() => onChange(updateLayer(doc, sel.id, { locked: !sel.locked }))} title={sel.locked ? 'Unlock' : 'Lock'} aria-label={sel.locked ? 'Unlock layer' : 'Lock layer'} className={iconBtn}>{sel.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
          <button type="button" onClick={() => onChange(updateLayer(doc, sel.id, { hidden: !sel.hidden }))} title={sel.hidden ? 'Show' : 'Hide'} aria-label={sel.hidden ? 'Show layer' : 'Hide layer'} className={iconBtn}>{sel.hidden ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          <button type="button" onClick={() => { onChange(removeLayer(doc, sel.id)); onSelect(null); }} title="Delete" aria-label="Delete layer" className={`${iconBtn} hover:text-red-600`}><Trash2 size={14} /></button>
        </div>
      )}

      {sel?.kind === 'text' && (
        <div className="space-y-2">
          <input
            value={sel.text ?? ''}
            onChange={(e) => onChange(updateLayer(doc, sel.id, { text: e.target.value }))}
            aria-label={`${sel.name} text`}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Size</label>
            <input
              type="range" min={MIN_SIZE} max={Math.round(doc.width * 0.22)} value={sel.fontSize ?? 48}
              onChange={(e) => onChange(updateLayer(doc, sel.id, { fontSize: Number(e.target.value) }))}
              className="flex-1 accent-purple-600"
            />
            <input
              type="color" value={sel.fill ?? '#ffffff'}
              onChange={(e) => onChange(updateLayer(doc, sel.id, { fill: e.target.value }))}
              aria-label="Text colour"
              className="w-8 h-8 rounded cursor-pointer border border-gray-300 dark:border-gray-600 bg-transparent"
            />
          </div>
        </div>
      )}

      {/* Layers list — reversed so the topmost layer reads first. */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Layers</p>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 max-h-56 overflow-y-auto">
          {[...doc.layers].reverse().map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onSelect(l.id)}
              className={`w-full flex items-center gap-2 px-2.5 min-h-[44px] text-left text-xs transition ${
                l.id === selectedId ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 font-bold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {l.id === selectedId ? <MousePointer2 size={12} /> : <span className="w-3" />}
              <span className="flex-1 truncate">{l.name}</span>
              {l.locked && <Lock size={11} className="text-gray-400" />}
              {l.hidden && <EyeOff size={11} className="text-gray-400" />}
            </button>
          ))}
          {!doc.layers.length && (
            <p className="px-2.5 py-3 text-[11px] text-gray-400">No layers yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
