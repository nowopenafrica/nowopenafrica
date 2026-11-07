import { useCallback, useRef, useState } from 'react';

import type { DesignPage } from '../../lib/studio/designDocument';
import {
  angleTo, HANDLES, hitTest, localDelta, moveBy, pageAspect, pxToNorm, resizeFrom, snapAngle, withObject, type Handle,
} from '../../lib/studio/editorGeometry';
import { moveSelection, selectionBounds } from '../../lib/studio/selection';
import { boundsOf, snapMove, snapTargets, type Guide } from '../../lib/studio/snapping';
import DesignSurface from './DesignSurface';
import {
  dragHasImage, dropHint, imageFilesFrom, replaceTargetId, type DropHint,
} from '../../lib/studio/dropImage';

/**
 * The editing surface.
 *
 * ── WHY DOM AND NOT CANVAS ───────────────────────────────────────────────
 *
 * The templates were already structured slot documents rendered as
 * absolutely positioned DOM, and keeping that means the text on this canvas
 * is real text: selectable, translatable, and readable by a screen reader.
 * Canvas text is pixels, and an editor whose content is invisible to assistive
 * technology fails the accessibility requirement at the first object.
 *
 * See lib/studio/designDocument.ts for the full engine decision.
 *
 * ── WHAT THIS COMPONENT OWNS ─────────────────────────────────────────────
 *
 * Pointer handling and nothing else. The drawing is DesignSurface, shared
 * with the exporter so a downloaded file cannot differ from the screen. Every
 * calculation lives in editorGeometry, which is tested without a DOM —
 * selection, moving and resizing are where an editor is right or wrong, and
 * that arithmetic should not be reachable only by dragging something.
 */

/*
 * Pointer capture keeps a drag alive when the pointer leaves the element.
 *
 * It THROWS when the pointer is no longer active — a released pointer, a
 * cancelled touch, a synthetic event. Guarding only that the method exists
 * is not enough: an exception here aborts the rest of the handler, so the
 * drag never starts and the object simply refuses to move, with the reason
 * only visible in the console.
 *
 * Capture is an enhancement, so losing it must never cost the gesture.
 */
function capture(el: Element, pointerId: number, take: boolean): void {
  try {
    if (take) el.setPointerCapture?.(pointerId);
    else el.releasePointerCapture?.(pointerId);
  } catch {
    /* The drag still works; it just stops tracking outside the element. */
  }
}

interface Props {
  page: DesignPage;
  /** Every selected id. One is the ordinary case; several is a group edit. */
  selectedIds: string[];
  /** `additive` is a shift-click: add to or remove from the selection. */
  onSelect: (id: string | null, additive: boolean) => void;
  onChange: (page: DesignPage) => void;
  /**
   * Called BEFORE the first change of a gesture.
   *
   * It has to be before. Snapshotting at the end records the document as it
   * already is, so undo restores the state the drag produced and appears to
   * do nothing — measured in the browser on 2026-10-14, with all sixteen
   * geometry tests passing. The arithmetic was right; the timing was not.
   */
  onGestureStart: () => void;
  /** Called when the gesture ENDS, so history holds one entry per gesture. */
  onCommit: () => void;
  accent: string;
  /**
   * A picture was dropped on the canvas.
   *
   * `overImageId` is the picture it landed on, if any — the canvas decides
   * that, because it is the only thing that knows where the pointer was in
   * the document's own coordinates. A non-null id means REPLACE, keeping
   * that frame's position, size and crop; null means add a new one at `at`.
   */
  onDropFiles?: (files: File[], at: { x: number; y: number }, overImageId: string | null) => void;
}

type Drag =
  | { kind: 'move'; id: string; lastX: number; lastY: number }
  | { kind: 'resize'; id: string; handle: Handle; lastX: number; lastY: number }
  /* Rotation is absolute — the angle follows the pointer, so no last point. */
  | { kind: 'rotate'; id: string };

export default function DesignCanvas({ page, selectedIds, onSelect, onChange, onGestureStart, onCommit, accent, onDropFiles }: Props) {
  const surface = useRef<HTMLDivElement | null>(null);

  /*
   * The canvas in SCREEN pixels, for converting the snap threshold.
   *
   * Measured per gesture rather than stored: the canvas resizes with the
   * window and with the zoom control, and a stale size would make snapping
   * feel tight at one zoom and loose at another — the exact fault a fixed
   * normalised tolerance has.
   */
  const surfaceSize = useCallback(() => {
    const r = surface.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  }, []);
  const [drag, setDrag] = useState<Drag | null>(null);
  /*
   * The alignment guides currently showing.
   *
   * Was { x, y } of the page's own lines only. Now a list, because a guide
   * has to say WHAT you lined up with — a line spanning the whole canvas
   * tells you where you snapped but not to what.
   */
  const [guides, setGuides] = useState<Guide[]>([]);

  /** Pointer position in the document's 0..1 space. */
  const pointAt = useCallback((clientX: number, clientY: number) => {
    const el = surface.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { nx: pxToNorm(clientX - r.left, r.width), ny: pxToNorm(clientY - r.top, r.height) };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pointAt(e.clientX, e.clientY);
    if (!p) return;
    const hit = hitTest(page, p.nx, p.ny);
    const additive = e.shiftKey;

    if (!hit) { onSelect(null, false); return; }

    /*
     * Pressing on something already selected keeps the whole selection, so a
     * group can be dragged. Re-selecting just that object would silently
     * collapse the selection the moment the user tried to move it.
     */
    const alreadyIn = selectedIds.includes(hit.id);
    if (!alreadyIn || additive) onSelect(hit.id, additive);

    /* A shift-click is a selection change, not the start of a drag. */
    if (additive) return;

    e.preventDefault();
    capture(e.target as Element, e.pointerId, true);
    onGestureStart();
    setDrag({ kind: 'move', id: hit.id, lastX: p.nx, lastY: p.ny });
  };

  const startResize = (e: React.PointerEvent<HTMLButtonElement>, handle: Handle, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const p = pointAt(e.clientX, e.clientY);
    if (!p) return;
    capture(e.target as Element, e.pointerId, true);
    onGestureStart();
    setDrag({ kind: 'resize', id, handle, lastX: p.nx, lastY: p.ny });
  };

  const startRotate = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    capture(e.target as Element, e.pointerId, true);
    onGestureStart();
    setDrag({ kind: 'rotate', id });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const p = pointAt(e.clientX, e.clientY);
    if (!p) return;
    if (drag.kind === 'rotate') {
      onChange(withObject(page, drag.id, (ob) => {
        const raw = angleTo(page, ob, p.nx, p.ny);
        /*
         * Shift turns snapping off, the usual convention. Landing on 44
         * degrees when 45 was meant is the difference between a design that
         * looks deliberate and one that looks like a slip.
         */
        return { ...ob, rotation: e.shiftKey ? Math.round(raw) : snapAngle(raw) };
      }));
      return;
    }

    /* Move and resize are relative, so they need the distance travelled. */
    const dx = p.nx - drag.lastX;
    const dy = p.ny - drag.lastY;

    if (drag.kind === 'move') {
      /*
       * More than one selected moves as a single thing, clamped on the
       * group's bounds — see lib/studio/selection.ts for why clamping each
       * object separately pulls a tidy row apart.
       */
      if (selectedIds.length > 1 && selectedIds.includes(drag.id)) {
        /*
         * A multi-selection snaps on its OUTER bounds, as one thing. Snapping
         * each member separately pulls a tidy row apart — the same reasoning
         * that makes a multi-move clamp on the group bounds.
         */
        const moved = moveSelection(page, selectedIds, dx, dy);
        const bounds = boundsOf(moved.objects.filter((o) => selectedIds.includes(o.id)));
        const hit = bounds
          ? snapMove(bounds, snapTargets(page.objects, selectedIds), {
            pageW: surfaceSize().w, pageH: surfaceSize().h, disabled: e.altKey,
          })
          : { dx: 0, dy: 0, guides: [] };
        setGuides(hit.guides);
        onChange(hit.dx || hit.dy ? moveSelection(moved, selectedIds, hit.dx, hit.dy) : moved);
        setDrag({ ...drag, lastX: p.nx, lastY: p.ny });
        return;
      }

      onChange(withObject(page, drag.id, (o) => {
        const moved = moveBy(o, dx, dy);
        /*
         * Snap the object's own edges — left, centre and right; top, middle
         * and bottom — against every other visible object AND the page's own
         * lines. Snapping the object rather than the pointer is what makes it
         * appear to click into place instead of the cursor jumping.
         *
         * Alt is the escape hatch: sometimes 3px off centre is exactly right.
         */
        const hit = snapMove(moved, snapTargets(page.objects, [drag.id]), {
          pageW: surfaceSize().w, pageH: surfaceSize().h, disabled: e.altKey,
        });
        setGuides(hit.guides);
        return { ...moved, x: moved.x + hit.dx, y: moved.y + hit.dy };
      }));
    } else {
      onChange(withObject(page, drag.id, (ob) => {
        /*
         * The drag is measured on screen; the object is resized in its own
         * frame. Skip this and the right-hand handle of an object turned 90
         * degrees makes it taller instead of wider.
         */
        const local = localDelta(dx, dy, ob.rotation ?? 0, pageAspect(page));
        return resizeFrom(ob, drag.handle, local.dx, local.dy);
      }));
    }
    setDrag({ ...drag, lastX: p.nx, lastY: p.ny });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    capture(e.target as Element, e.pointerId, false);
    setDrag(null);
    setGuides([]);
    /*
     * One history entry per gesture. Recording every pointermove would make a
     * single drag take forty presses of undo to reverse.
     */
    onCommit();
  };

  /*
   * Handles belong to a single object. With several selected the sizes and
   * angles differ, so the canvas shows the group's extent and the properties
   * panel offers the operations that DO make sense for a group — aligning and
   * distributing — rather than handles that would have to guess.
   */
  const selected = selectedIds.length === 1
    ? page.objects.find((o) => o.id === selectedIds[0]) ?? null
    : null;
  const groupBounds = selectedIds.length > 1 ? selectionBounds(page, selectedIds) : null;

  /*
   * ── DROPPING A PICTURE ───────────────────────────────────────────────
   *
   * The hint is computed on every `dragover` rather than on drop, because
   * the whole value of drag and drop is knowing what will happen BEFORE you
   * let go. Dropping onto a picture replaces it in place; dropping anywhere
   * else adds one under the pointer.
   *
   * `dragenter` and `dragover` both have to preventDefault or the browser
   * takes the file and navigates the tab to it, which loses unsaved work —
   * the single most expensive way to get this wrong.
   */
  const [hint, setHint] = useState<DropHint>({ kind: 'none' });

  const onDragOver = (e: React.DragEvent) => {
    if (!onDropFiles) return;
    const items = Array.from(e.dataTransfer.items ?? []).map((i) => ({ kind: i.kind, type: i.type }));
    const carries = dragHasImage(items);
    e.preventDefault();
    e.dataTransfer.dropEffect = carries ? 'copy' : 'none';
    /* `pointAt` speaks in nx/ny; the drop helpers speak in x/y. */
    const p = pointAt(e.clientX, e.clientY);
    setHint(dropHint(page, p ? { x: p.nx, y: p.ny } : null, carries));
  };

  /*
   * Leaving a CHILD fires dragleave on the parent too, so the hint flickered
   * every time the pointer crossed an object. Only a leave that actually
   * exits the canvas counts.
   */
  const onDragLeave = (e: React.DragEvent) => {
    if (!onDropFiles) return;
    const next = e.relatedTarget as Node | null;
    if (next && surface.current?.contains(next)) return;
    setHint({ kind: 'none' });
  };

  const onDrop = (e: React.DragEvent) => {
    if (!onDropFiles) return;
    e.preventDefault();
    setHint({ kind: 'none' });
    const files = imageFilesFrom(Array.from(e.dataTransfer.files ?? []));
    if (!files.length) return;
    const p = pointAt(e.clientX, e.clientY);
    const at = p ? { x: p.nx, y: p.ny } : { x: 0.5, y: 0.5 };
    onDropFiles(files, at, replaceTargetId(page, at.x, at.y));
  };

  const target = hint.kind === 'replace'
    ? page.objects.find((o) => o.id === hint.id) ?? null
    : null;

  return (
    <DesignSurface
      ref={surface}
      page={page}
      accent={accent}
      selectedId={selectedIds.length === 1 ? selectedIds[0] : null}
      className="shadow-sm touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="application"
      aria-label="Design canvas. Click an object to select it, then use the arrow keys to move it."
    >
      {/*
        What this drop will do, said before it happens.

        An outline round one picture means that picture is about to be
        replaced; an outline round the whole canvas means a new one is about
        to be added. Red means the drag is carrying something that cannot be
        used, which is better than a drop that silently does nothing.
      */}
      {hint.kind !== 'none' && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 border-4 ${
            hint.kind === 'reject'
              ? 'border-red-500/70 bg-red-500/5'
              : hint.kind === 'replace'
                ? 'border-transparent'
                : 'border-dashed border-blue-500/80 bg-blue-500/5'
          }`}
        />
      )}
      {target && (
        <div
          aria-hidden
          className="pointer-events-none absolute border-4 border-blue-500 bg-blue-500/20"
          style={{
            left: `${target.x * 100}%`, top: `${target.y * 100}%`,
            width: `${target.w * 100}%`, height: `${target.h * 100}%`,
          }}
        />
      )}

      {/* The guide that caught, drawn only while dragging. */}
      {guides.filter((g) => g.axis === 'x').map((g) => (
        <div
          key={`x${g.at}`}
          aria-hidden
          className={`absolute w-px ${g.page ? 'bg-sky-400/90' : 'bg-fuchsia-500/90'}`}
          /* Only as long as it needs to be: from the moving box to the thing
             it matched, so the line names its own reason for existing. */
          style={{ left: `${g.at * 100}%`, top: `${g.from * 100}%`, height: `${(g.to - g.from) * 100}%` }}
        />
      ))}
      {guides.filter((g) => g.axis === 'y').map((g) => (
        <div
          key={`y${g.at}`}
          aria-hidden
          className={`absolute h-px ${g.page ? 'bg-sky-400/90' : 'bg-fuchsia-500/90'}`}
          style={{ top: `${g.at * 100}%`, left: `${g.from * 100}%`, width: `${(g.to - g.from) * 100}%` }}
        />
      ))}

      {/* Several selected: the group's extent, plus a mark on each member. */}
      {groupBounds && (
        <div
          aria-hidden
          className="absolute border-2 border-dashed border-blue-500 pointer-events-none"
          style={{
            left: `${groupBounds.x * 100}%`, top: `${groupBounds.y * 100}%`,
            width: `${groupBounds.w * 100}%`, height: `${groupBounds.h * 100}%`,
          }}
        />
      )}
      {groupBounds && page.objects.filter((ob) => selectedIds.includes(ob.id)).map((ob) => (
        <div
          key={ob.id}
          aria-hidden
          className="absolute border border-blue-400/70 pointer-events-none"
          style={{
            left: `${ob.x * 100}%`, top: `${ob.y * 100}%`,
            width: `${ob.w * 100}%`, height: `${ob.h * 100}%`,
            transform: ob.rotation ? `rotate(${ob.rotation}deg)` : undefined,
            transformOrigin: 'center',
          }}
        />
      ))}

      {/*
        * Selection chrome, drawn in the object's own frame.
        *
        * The whole box carries the object's rotation, so the handles sit on
        * the corners the user can actually see. Positioning them against the
        * page instead would leave a tilted object with handles floating off
        * its corners, pointing the wrong way.
        */}
      {selected && (
        <div
          className="absolute"
          style={{
            left: `${selected.x * 100}%`, top: `${selected.y * 100}%`,
            width: `${selected.w * 100}%`, height: `${selected.h * 100}%`,
            transform: selected.rotation ? `rotate(${selected.rotation}deg)` : undefined,
            transformOrigin: 'center',
            pointerEvents: 'none',
          }}
        >
          <div aria-hidden className="absolute inset-0 border-2 border-blue-500" />

          {!selected.locked && HANDLES.map((h) => {
            const pos = handleCorner(h);
            return (
              <button
                key={h}
                type="button"
                onPointerDown={(e) => startResize(e, h, selected.id)}
                aria-label={`Resize from ${h}`}
                className="absolute h-3 w-3 -ml-1.5 -mt-1.5 rounded-sm border border-white bg-blue-500 shadow"
                style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, cursor: `${h}-resize`, pointerEvents: 'auto' }}
              />
            );
          })}

          {!selected.locked && (
            <button
              type="button"
              onPointerDown={(e) => startRotate(e, selected.id)}
              aria-label="Rotate"
              title="Drag to rotate. Hold Shift for any angle."
              className="absolute h-4 w-4 -ml-2 rounded-full border border-white bg-fuchsia-500 shadow"
              style={{ left: '50%', top: '-28px', cursor: 'grab', pointerEvents: 'auto' }}
            />
          )}
        </div>
      )}
    </DesignSurface>
  );
}

/**
 * Where a handle sits, as a fraction of the SELECTION BOX.
 *
 * Relative to the box rather than the page, because the box is what carries
 * the rotation — so the handles turn with the object for free.
 */
function handleCorner(h: Handle): { x: number; y: number } {
  switch (h) {
    case 'nw': return { x: 0, y: 0 };
    case 'n': return { x: 0.5, y: 0 };
    case 'ne': return { x: 1, y: 0 };
    case 'e': return { x: 1, y: 0.5 };
    case 'se': return { x: 1, y: 1 };
    case 's': return { x: 0.5, y: 1 };
    case 'sw': return { x: 0, y: 1 };
    default: return { x: 0, y: 0.5 };
  }
}
