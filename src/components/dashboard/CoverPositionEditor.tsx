import { useCallback, useRef, useState } from 'react';

import {
  clampFocal, DEFAULT_FOCAL, focalFromPointer, focalToCss, isDefaultFocal, nudgeFocal,
  type FocalPoint,
} from '../../lib/coverPosition';

/**
 * Drag a cover photo or video into place.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * The cover frame is short and very wide, and it changes shape between phone,
 * tablet and desktop — then changes again as a directory card. An owner
 * uploading a photo of their shopfront gets whatever the middle of it happens
 * to be, which is frequently a doorway or somebody's chin.
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────
 *
 * It does not crop, scale or re-encode. The uploaded file is untouched; only
 * two integers are stored. So an owner can reposition as often as they like
 * without the picture degrading, and a future frame shape still works.
 *
 * The preview is deliberately the SAME aspect ratio as the real cover on a
 * desktop (h-96 at container width), so what they arrange is what they get.
 */

interface Props {
  /** The uploaded cover. An image URL, or a video when one has been set. */
  src: string;
  kind: 'image' | 'video';
  value: { x: number | null; y: number | null };
  onChange: (point: FocalPoint) => void;
}

export default function CoverPositionEditor({ src, kind, value, onChange }: Props) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const point = clampFocal(value.x, value.y);

  const moveTo = useCallback((clientX: number, clientY: number) => {
    const el = frame.current;
    if (!el) return;
    onChange(focalFromPointer(clientX, clientY, el.getBoundingClientRect()));
  }, [onChange]);

  /*
   * Pointer events, not mouse events: this is a touch-first audience, and the
   * same handler then covers finger, pen and mouse. Capture means a drag that
   * leaves the frame keeps working rather than freezing where it crossed the
   * edge — focalFromPointer clamps it to the border.
   */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    moveTo(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    moveTo(e.clientX, e.clientY);
  };

  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setDragging(false);
  };

  /*
   * Arrow keys, because a drag target is unusable without a pointer and this
   * is the only control here. Shift moves five percent so crossing the frame
   * does not take a hundred presses.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const d = map[e.key];
    if (!d) return;
    e.preventDefault();
    onChange(nudgeFocal(point, d[0], d[1], e.shiftKey));
  };

  const position = focalToCss(point.x, point.y);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="block text-xs font-medium text-gray-600 dark:text-gray-300">
          Position your cover
        </span>
        {!isDefaultFocal(point.x, point.y) && (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FOCAL })}
            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 min-h-[32px] px-1"
          >
            Re-centre
          </button>
        )}
      </div>

      {/*
        * Same shape as the real cover, so this is a preview and not an
        * approximation. touch-none stops the browser scrolling the page while
        * a finger is dragging inside the frame.
        */}
      <div
        ref={frame}
        role="application"
        aria-label="Drag to choose which part of the cover stays visible. Arrow keys also work."
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
        className={`relative w-full h-36 sm:h-56 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 touch-none select-none
          ${dragging ? 'cursor-grabbing' : 'cursor-grab'}
          focus:outline-none focus:ring-2 focus:ring-violet-500`}
      >
        {kind === 'video' ? (
          <video
            src={src}
            muted
            loop
            playsInline
            autoPlay
            className="w-full h-full object-cover pointer-events-none"
            style={{ objectPosition: position }}
          />
        ) : (
          <img
            src={src}
            alt=""
            draggable={false}
            className="w-full h-full object-cover pointer-events-none"
            style={{ objectPosition: position }}
          />
        )}

        {/* Where the focal point currently sits. Decorative — the frame carries the label. */}
        <span
          aria-hidden="true"
          className="absolute h-6 w-6 -ml-3 -mt-3 rounded-full border-2 border-white shadow ring-1 ring-black/30"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
        />
      </div>

      <p className="mt-1 text-[10px] text-gray-400">
        Drag the picture to choose what stays visible. Nothing is cropped — the file you uploaded is kept as it is.
      </p>
    </div>
  );
}
