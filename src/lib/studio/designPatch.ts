/**
 * The only changes anything is allowed to make to a design.
 *
 * ── WHY A CLOSED SET ─────────────────────────────────────────────────────
 *
 * A prompt-driven editor has to turn a sentence into a change. The tempting
 * shape is "let the thing that interprets the sentence hand back a new
 * document", and it is the wrong one twice over:
 *
 *   - A whole replacement document silently discards anything the author
 *     changed by hand and cannot be undone to a sensible point.
 *   - Whatever produces it — a rule parser today, a model later — becomes a
 *     writer with unlimited reach into the document.
 *
 * So changes travel as a LIST OF OPERATIONS from a fixed vocabulary, every
 * one naming the object it touches, validated here before anything is
 * applied. An operation this file does not recognise is refused, not
 * guessed at. That holds whether the caller is `promptOps.ts` or something
 * that did not exist when this was written.
 *
 * ── WHY IT IS PURE ───────────────────────────────────────────────────────
 *
 * `applyPatch` returns a new page and never mutates the old one, so the
 * existing history module gets a clean before/after pair and undo works for
 * a prompt exactly as it does for a drag. Nothing here touches React,
 * storage or the network.
 */

import type { DesignObject, DesignPage, TextObject, ShapeObject } from './designDocument';

/** Every change that may be made. Nothing else is applied, ever. */
export type PatchOp =
  | { op: 'setText'; id: string; text: string }
  /** A multiplier on the current type size — 1.25 is "a bit bigger". */
  | { op: 'scaleText'; id: string; factor: number }
  | { op: 'setColour'; id: string; colour: string }
  | { op: 'setAlign'; id: string; align: 'left' | 'center' | 'right' }
  | { op: 'setWeight'; id: string; weight: number }
  | { op: 'setCase'; id: string; upper: boolean }
  /** Fractions of the page, positive is right and down. */
  | { op: 'nudge'; id: string; dx: number; dy: number }
  | { op: 'setFill'; id: string; fill: string }
  | { op: 'setOpacity'; id: string; opacity: number }
  | { op: 'setBackground'; colour: string };

export interface PatchResult {
  page: DesignPage;
  /** The operations that actually changed something. */
  applied: PatchOp[];
  /** The ones that did not, each with the reason, for the caller to report. */
  rejected: { op: PatchOp; why: string }[];
}

/*
 * Bounds. Every number an operation carries is clamped rather than trusted:
 * a size of 40 or an opacity of -3 is not an edit, it is a destroyed design
 * that somebody has to undo.
 */
const MIN_TYPE = 0.004;
const MAX_TYPE = 0.4;
const MAX_NUDGE = 0.5;
const TEXT_LIMIT = 2000;

/**
 * A colour this renderer will actually draw.
 *
 * Deliberately narrow: `#rgb`, `#rrggbb` and a short list of names. A CSS
 * colour string can carry `url(...)` and `var(...)`, and a document is
 * rendered into the page's own DOM — so an unvalidated colour is a hole, not
 * a convenience.
 */
const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#dc2626', green: '#16a34a',
  blue: '#2563eb', yellow: '#eab308', orange: '#ea580c', purple: '#7c3aed',
  pink: '#db2777', grey: '#6b7280', gray: '#6b7280', navy: '#1e3a8a',
  cream: '#faf7f0', gold: '#b8860b', teal: '#0d9488',
};

export function normaliseColour(input: string): string | null {
  const raw = (input ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (NAMED[raw]) return NAMED[raw];
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(raw);
  if (!hex) return null;
  const body = hex[1];
  return `#${body.length === 3 ? body.split('').map((c) => c + c).join('') : body}`;
}

export const COLOUR_WORDS = Object.keys(NAMED);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Apply one operation, or say why not.
 *
 * Returns null when the operation would change nothing — a "make it bigger"
 * on something already at the ceiling is not a failure, but it must not be
 * reported as a change either, or the screen says it did something it did
 * not do.
 */
function applyOne(page: DesignPage, op: PatchOp): { page: DesignPage } | { why: string } {
  if (op.op === 'setBackground') {
    const colour = normaliseColour(op.colour);
    if (!colour) return { why: `"${op.colour}" is not a colour I can use` };
    if (page.background === colour) return { why: 'the background is already that colour' };
    return { page: { ...page, background: colour } };
  }

  const target = page.objects.find((o) => o.id === op.id);
  if (!target) return { why: 'that object is not on this page' };
  if (target.locked) return { why: `"${target.name}" is locked` };

  const replace = (next: DesignObject): { page: DesignPage } => ({
    page: { ...page, objects: page.objects.map((o) => (o.id === op.id ? next : o)) },
  });
  const asText = (): TextObject | null => (target.type === 'text' ? target : null);

  switch (op.op) {
    case 'setText': {
      const t = asText();
      if (!t) return { why: `"${target.name}" is not text` };
      const text = String(op.text ?? '').slice(0, TEXT_LIMIT);
      if (!text.trim()) return { why: 'the new text is empty' };
      if (text === t.text) return { why: 'that is already what it says' };
      return replace({ ...t, text });
    }
    case 'scaleText': {
      const t = asText();
      if (!t) return { why: `"${target.name}" is not text` };
      if (!finite(op.factor) || op.factor <= 0) return { why: 'that is not a size change' };
      const size = clamp(t.size * op.factor, MIN_TYPE, MAX_TYPE);
      if (Math.abs(size - t.size) < 1e-6) return { why: 'it is already as big as it goes' };
      return replace({ ...t, size });
    }
    case 'setColour': {
      const t = asText();
      if (!t) return { why: `"${target.name}" is not text — use a fill for a shape` };
      const colour = normaliseColour(op.colour);
      if (!colour) return { why: `"${op.colour}" is not a colour I can use` };
      if (t.colour === colour) return { why: 'it is already that colour' };
      return replace({ ...t, colour });
    }
    case 'setAlign': {
      const t = asText();
      if (!t) return { why: `"${target.name}" is not text` };
      if (!['left', 'center', 'right'].includes(op.align)) return { why: 'that is not an alignment' };
      if (t.align === op.align) return { why: `it is already ${op.align}` };
      return replace({ ...t, align: op.align });
    }
    case 'setWeight': {
      const t = asText();
      if (!t) return { why: `"${target.name}" is not text` };
      if (!finite(op.weight)) return { why: 'that is not a weight' };
      const weight = clamp(Math.round(op.weight / 100) * 100, 100, 900);
      if (t.weight === weight) return { why: 'it is already that weight' };
      return replace({ ...t, weight });
    }
    case 'setCase': {
      const t = asText();
      if (!t) return { why: `"${target.name}" is not text` };
      if ((t.upper ?? false) === op.upper) return { why: 'it already reads that way' };
      return replace({ ...t, upper: op.upper });
    }
    case 'nudge': {
      if (!finite(op.dx) || !finite(op.dy)) return { why: 'that is not a move' };
      const dx = clamp(op.dx, -MAX_NUDGE, MAX_NUDGE);
      const dy = clamp(op.dy, -MAX_NUDGE, MAX_NUDGE);
      /* Kept on the page: an object nudged off the edge is gone from a flat
         export, and "it disappeared" is the worst outcome of a tidy-up. */
      const x = clamp(target.x + dx, -0.05, Math.max(0, 1 - target.w * 0.25));
      const y = clamp(target.y + dy, -0.05, Math.max(0, 1 - target.h * 0.25));
      if (Math.abs(x - target.x) < 1e-6 && Math.abs(y - target.y) < 1e-6) {
        return { why: 'it cannot move any further that way' };
      }
      return replace({ ...target, x, y });
    }
    case 'setFill': {
      if (target.type !== 'shape') return { why: `"${target.name}" is not a shape` };
      const fill = normaliseColour(op.fill);
      if (!fill) return { why: `"${op.fill}" is not a colour I can use` };
      if ((target as ShapeObject).fill === fill) return { why: 'it is already that colour' };
      return replace({ ...(target as ShapeObject), fill });
    }
    case 'setOpacity': {
      if (!finite(op.opacity)) return { why: 'that is not an opacity' };
      const opacity = clamp(op.opacity, 0.05, 1);
      if (Math.abs(opacity - target.opacity) < 1e-6) return { why: 'it is already that faded' };
      return replace({ ...target, opacity });
    }
    default:
      /* An operation from outside the vocabulary. Refused, never guessed. */
      return { why: `"${(op as { op: string }).op}" is not something I can do` };
  }
}

/**
 * Apply a list of operations in order.
 *
 * Each one sees the result of the one before, so "make it white and bigger"
 * behaves as a person would expect. A rejected operation does not abort the
 * rest: changing two of three things and saying which one failed is more
 * useful than refusing all three.
 */
export function applyPatch(page: DesignPage, ops: readonly PatchOp[]): PatchResult {
  let next = page;
  const applied: PatchOp[] = [];
  const rejected: { op: PatchOp; why: string }[] = [];

  for (const op of ops) {
    const outcome = applyOne(next, op);
    if ('page' in outcome) {
      next = outcome.page;
      applied.push(op);
    } else {
      rejected.push({ op, why: outcome.why });
    }
  }
  return { page: next, applied, rejected };
}
