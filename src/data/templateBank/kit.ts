import type { MotionIn, ShapeSpec, ShapeTone, SlotMotion } from '../../lib/designTemplates';
import type { BankSample } from '../../lib/templateBank/package';

export const mo = (kind: MotionIn, at: number, dur = 0.5): SlotMotion => ({ in: kind, at, dur });

/** Placeholder identity shared by every sample. Labels, never a real business. */
export const YOU: Pick<BankSample, 'brand' | 'meta' | 'contact'> = {
  brand: 'Your business',
  meta: 'yourbusiness.nowopenafrica.com',
  contact: ['Your phone', 'Your address', '@yourhandle'],
};

export const NO_PHOTO = 'None required. An optional background photograph sits under the layout’s scrim.';
export const PHOTO_LED = 'One strong photograph as the background: subject off-centre, calm area where the type sits.';

/** A rectangular border drawn as four bars, inset from every edge. */
export function border(inset: number, thickness: number, tone: ShapeTone, alpha?: number): ShapeSpec[] {
  const span = 1 - inset * 2;
  const a = alpha === undefined ? {} : { alpha };
  return [
    { kind: 'rect', x: inset, y: inset, w: span, h: thickness, tone, ...a },
    { kind: 'rect', x: inset, y: 1 - inset - thickness, w: span, h: thickness, tone, ...a },
    { kind: 'rect', x: inset, y: inset, w: thickness, h: span, tone, ...a },
    { kind: 'rect', x: 1 - inset - thickness, y: inset, w: thickness, h: span, tone, ...a },
  ];
}
