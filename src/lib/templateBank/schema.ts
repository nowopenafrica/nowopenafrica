import {
  slotBox, typePx, settleTime, shapeGeometry, listRowBoxes, slotOf,
  type DesignTemplate, type SlotSpec, type ShapeSpec, type SurfaceSpec, type SlotRole,
  type MotionIn, type EaseKey, type CameraMove, type Mood, type Treatment, type ShapeTone, type FontKey,
} from '../designTemplates';
import { INDUSTRY_GROUPS } from '../design/taxonomy';
import { STYLE_TAGS, TEMPLATE_USES, type StyleTag, type TemplateUse } from '../design/tags';

/**
 * Turning an untrusted JSON object into a DesignTemplate.
 *
 * Templates in this file's caller come from an uploaded ZIP, not from the
 * type-checked catalogue, so every field the two renderers read is checked
 * here. The enum tables are Records keyed by the union type so that adding a
 * role or a motion to designTemplates.ts fails the build here until the
 * importer knows about it.
 */

const ROLES: Record<SlotRole, true> = {
  brand: true, eyebrow: true, headline: true, subline: true, meta: true, cta: true, qr: true,
  services: true, stats: true, contact: true, price: true,
};
const MOTIONS: Record<MotionIn, true> = {
  fade: true, rise: true, drop: true, wipe: true, pop: true, blur: true,
  'slide-left': true, 'slide-right': true, 'mask-up': true, 'scale-out': true,
};
const EASES: Record<EaseKey, true> = { linear: true, in: true, out: true, inOut: true, spring: true, elastic: true };
const CAMERAS: Record<CameraMove, true> = { none: true, push: true, pull: true, 'pan-left': true, 'pan-right': true, drift: true };
const MOODS: Record<Mood, true> = { editorial: true, bold: true, minimal: true, luxe: true, street: true, warm: true };
const TREATMENTS: Record<Treatment, true> = { plain: true, pill: true, panel: true, underline: true, outline: true, bar: true, disc: true };
const TONES: Record<ShapeTone, true> = { accent: true, ink: true, base: true, white: true, black: true };
const FONTS: Record<FontKey, true> = {
  sans: true, serif: true, mono: true, condensed: true, editorial: true, soft: true, grotesk: true, heavy: true,
};
const SURFACES: Record<SurfaceSpec['kind'], true> = { gradient: true, solid: true, spotlight: true, wash: true, frame: true };
const USES = new Set<string>(TEMPLATE_USES.map((u) => u.key));
const STYLES = new Set<string>(STYLE_TAGS);

export const TEMPLATE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The formats a template must hold together at. Same list the catalogue tests use. */
export const GATE_FORMATS: [string, number, number][] = [
  ['square post', 1080, 1080],
  ['story', 1080, 1920],
  ['landscape', 1920, 1080],
  ['A3 poster', 2480, 3508],
  ['thumbnail preview', 240, 240],
];

/** Longest a template may take to settle, in seconds. */
export const MAX_SETTLE_SECONDS = 2.2;

export type ParseResult =
  | { ok: true; template: DesignTemplate }
  | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

class Collector {
  errors: string[] = [];
  constructor(private readonly where: string) {}

  fail(field: string, message: string) { this.errors.push(`${this.where}${field}: ${message}`); }

  str(o: Obj, field: string, max = 200): string | undefined {
    const v = o[field];
    if (typeof v !== 'string' || !v.trim()) { this.fail(field, 'is required'); return undefined; }
    if (v.length > max) { this.fail(field, `is longer than ${max} characters`); return undefined; }
    return v;
  }

  num(o: Obj, field: string, min: number, max: number, required = false): number | undefined {
    const v = o[field];
    if (v === undefined) { if (required) this.fail(field, 'is required'); return undefined; }
    if (!isNum(v) || v < min || v > max) { this.fail(field, `must be a number from ${min} to ${max}`); return undefined; }
    return v;
  }

  pick<T extends string>(o: Obj, field: string, table: Record<T, true>, required = false): T | undefined {
    const v = o[field];
    if (v === undefined) { if (required) this.fail(field, 'is required'); return undefined; }
    if (typeof v !== 'string' || !(v in table)) {
      this.fail(field, `must be one of ${Object.keys(table).join(', ')}`);
      return undefined;
    }
    return v as T;
  }

  bool(o: Obj, field: string): boolean | undefined {
    const v = o[field];
    if (v === undefined) return undefined;
    if (typeof v !== 'boolean') { this.fail(field, 'must be true or false'); return undefined; }
    return v;
  }
}

const compact = <T extends object>(o: T): T => {
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
};

function parseSlot(raw: unknown, i: number, errors: string[]): SlotSpec | null {
  const c = new Collector(`slots[${i}].`);
  if (!isObj(raw)) { errors.push(`slots[${i}]: must be an object`); return null; }
  const role = c.pick(raw, 'role', ROLES, true);
  const x = c.num(raw, 'x', 0, 1, true);
  const y = c.num(raw, 'y', 0, 1, true);
  const w = c.num(raw, 'w', 0.01, 1, true);

  let motion: SlotSpec['motion'];
  if (raw.motion !== undefined) {
    if (!isObj(raw.motion)) c.fail('motion', 'must be an object');
    else {
      const m = new Collector(`slots[${i}].motion.`);
      const kind = m.pick(raw.motion, 'in', MOTIONS, true);
      const at = m.num(raw.motion, 'at', 0, 10, true);
      const dur = m.num(raw.motion, 'dur', 0.05, 5, true);
      const ease = m.pick(raw.motion, 'ease', EASES);
      c.errors.push(...m.errors);
      if (kind && at !== undefined && dur !== undefined) motion = compact({ in: kind, at, dur, ease });
    }
  }

  const align = c.pick(raw, 'align', { left: true, center: true, right: true });
  const slot = {
    role, x, y, w, align,
    size: c.num(raw, 'size', 0.008, 0.5),
    weight: c.num(raw, 'weight', 100, 900),
    upper: c.bool(raw, 'upper'),
    tracking: c.num(raw, 'tracking', -0.2, 1),
    treatment: c.pick(raw, 'treatment', TREATMENTS),
    tone: c.pick(raw, 'tone', { onSurface: true, accent: true, muted: true }),
    fromBottom: c.bool(raw, 'fromBottom'),
    font: c.pick(raw, 'font', FONTS),
    motion,
    gap: c.num(raw, 'gap', 0.5, 6),
    bullet: c.pick(raw, 'bullet', { dot: true, check: true, number: true, bar: true, none: true }),
    direction: c.pick(raw, 'direction', { row: true, column: true }),
    max: c.num(raw, 'max', 1, 12),
  };
  errors.push(...c.errors);
  if (c.errors.length || !role || x === undefined || y === undefined || w === undefined) return null;
  return compact({ ...slot, role, x, y, w });
}

function parseShape(raw: unknown, i: number, errors: string[]): ShapeSpec | null {
  const c = new Collector(`shapes[${i}].`);
  if (!isObj(raw)) { errors.push(`shapes[${i}]: must be an object`); return null; }
  const tone = c.pick(raw, 'tone', TONES, true);
  const alpha = c.num(raw, 'alpha', 0, 1);
  let shape: ShapeSpec | null = null;

  switch (raw.kind) {
    case 'wedge': {
      const corner = c.pick(raw, 'corner', { tl: true, tr: true, bl: true, br: true }, true);
      const w = c.num(raw, 'w', 0, 1, true);
      const h = c.num(raw, 'h', 0, 1, true);
      if (tone && corner && w !== undefined && h !== undefined) shape = compact<ShapeSpec>({ kind: 'wedge', corner, w, h, tone, alpha });
      break;
    }
    case 'rect': {
      const x = c.num(raw, 'x', -0.5, 1.5, true);
      const y = c.num(raw, 'y', -0.5, 1.5, true);
      const w = c.num(raw, 'w', 0, 2, true);
      const h = c.num(raw, 'h', 0, 2, true);
      const radius = c.num(raw, 'radius', 0, 0.5);
      const skew = c.num(raw, 'skew', -1, 1);
      if (tone && x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
        shape = compact<ShapeSpec>({ kind: 'rect', x, y, w, h, tone, alpha, radius, skew });
      }
      break;
    }
    case 'circle':
    case 'ring': {
      const cx = c.num(raw, 'cx', -0.5, 1.5, true);
      const cy = c.num(raw, 'cy', -0.5, 1.5, true);
      const r = c.num(raw, 'r', 0, 1.5, true);
      const thickness = raw.kind === 'ring' ? c.num(raw, 'thickness', 0, 0.2) : undefined;
      if (tone && cx !== undefined && cy !== undefined && r !== undefined) {
        shape = raw.kind === 'ring'
          ? compact<ShapeSpec>({ kind: 'ring', cx, cy, r, tone, alpha, thickness })
          : compact<ShapeSpec>({ kind: 'circle', cx, cy, r, tone, alpha });
      }
      break;
    }
    case 'stripe': {
      const x = c.num(raw, 'x', -0.5, 1.5, true);
      const y = c.num(raw, 'y', -0.5, 1.5, true);
      const w = c.num(raw, 'w', 0, 2, true);
      const h = c.num(raw, 'h', 0, 2, true);
      const angle = c.num(raw, 'angle', -360, 360, true);
      if (tone && x !== undefined && y !== undefined && w !== undefined && h !== undefined && angle !== undefined) {
        shape = compact<ShapeSpec>({ kind: 'stripe', x, y, w, h, angle, tone, alpha });
      }
      break;
    }
    default:
      c.fail('kind', 'must be one of wedge, rect, circle, ring, stripe');
  }
  errors.push(...c.errors);
  return c.errors.length ? null : shape;
}

function stringList(c: Collector, o: Obj, field: string, allowed?: Set<string> | string[], max = 24): string[] | undefined {
  const v = o[field];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > max || v.some((x) => typeof x !== 'string' || !x.trim() || x.length > 60)) {
    c.fail(field, `must be a list of up to ${max} short strings`);
    return undefined;
  }
  const list = v as string[];
  if (allowed) {
    const ok = allowed instanceof Set ? allowed : new Set(allowed);
    const bad = list.filter((x) => !ok.has(x));
    if (bad.length) { c.fail(field, `has unknown value${bad.length > 1 ? 's' : ''}: ${bad.join(', ')}`); return undefined; }
  }
  return list;
}

/** Validate the shape of one template definition. Unknown fields are dropped. */
export function parseTemplate(raw: unknown): ParseResult {
  if (!isObj(raw)) return { ok: false, errors: ['definition: must be an object'] };
  const c = new Collector('');
  const errors: string[] = [];

  const key = c.str(raw, 'key', 60);
  if (key && !TEMPLATE_KEY_PATTERN.test(key)) c.fail('key', 'must be lower-case words joined by hyphens');
  const label = c.str(raw, 'label', 60);
  const desc = c.str(raw, 'desc', 160);
  const mood = c.pick(raw, 'mood', MOODS, true);
  const scheme = c.pick(raw, 'scheme', { dark: true, light: true }, true);
  const font = c.pick(raw, 'font', FONTS);
  const use = raw.use === undefined ? undefined
    : (typeof raw.use === 'string' && USES.has(raw.use) ? raw.use as TemplateUse : (c.fail('use', `must be one of ${[...USES].join(', ')}`), undefined));
  const industries = stringList(c, raw, 'industries', INDUSTRY_GROUPS, 12);
  const styles = stringList(c, raw, 'styles', STYLES, 8) as StyleTag[] | undefined;
  const tags = stringList(c, raw, 'tags');

  let surface: SurfaceSpec | undefined;
  if (!isObj(raw.surface)) c.fail('surface', 'is required');
  else {
    const s = new Collector('surface.');
    const kind = s.pick(raw.surface, 'kind', SURFACES, true);
    const rest = {
      angle: s.num(raw.surface, 'angle', -360, 360),
      intensity: s.num(raw.surface, 'intensity', 0, 1),
      vignette: s.num(raw.surface, 'vignette', 0, 1),
      frame: s.num(raw.surface, 'frame', 0, 0.2),
    };
    errors.push(...s.errors);
    if (kind) surface = compact({ kind, ...rest });
  }

  let camera: DesignTemplate['camera'];
  if (raw.camera !== undefined) {
    if (!isObj(raw.camera)) c.fail('camera', 'must be an object');
    else {
      const m = new Collector('camera.');
      const move = m.pick(raw.camera, 'move', CAMERAS, true);
      const amount = m.num(raw.camera, 'amount', 0, 0.2);
      errors.push(...m.errors);
      if (move) camera = compact({ move, amount });
    }
  }

  let shapes: ShapeSpec[] | undefined;
  if (raw.shapes !== undefined) {
    if (!Array.isArray(raw.shapes) || raw.shapes.length > 24) c.fail('shapes', 'must be a list of up to 24 shapes');
    else shapes = raw.shapes.map((s, i) => parseShape(s, i, errors)).filter((s): s is ShapeSpec => s !== null);
  }

  let slots: SlotSpec[] = [];
  if (!Array.isArray(raw.slots) || !raw.slots.length || raw.slots.length > 16) c.fail('slots', 'must be a list of 1 to 16 slots');
  else slots = raw.slots.map((s, i) => parseSlot(s, i, errors)).filter((s): s is SlotSpec => s !== null);

  errors.unshift(...c.errors);
  if (errors.length || !key || !label || !desc || !mood || !scheme || !surface) return { ok: false, errors };

  return {
    ok: true,
    template: compact({ key, label, desc, mood, use, industries, styles, tags, scheme, font, surface, camera, shapes, slots }),
  };
}

function shapeBounds(shape: ShapeSpec, w: number, h: number) {
  const g = shapeGeometry(shape, w, h);
  if (g.kind === 'polygon') {
    const xs = g.points.map(([x]) => x);
    const ys = g.points.map(([, y]) => y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  if (g.kind === 'circle' || g.kind === 'ring') {
    return { x0: g.cx - g.r, x1: g.cx + g.r, y0: g.cy - g.r, y1: g.cy + g.r };
  }
  return { x0: g.x, x1: g.x + g.w, y0: g.y, y1: g.y + g.h };
}

/**
 * The structural quality gate.
 *
 * The same rules the built-in catalogue is held to by designTemplates.test.ts
 * and taxonomy.test.ts, as a function, because an uploaded template never runs
 * through the test suite. Returns one sentence per failure; empty means the
 * template is safe to render at every format.
 */
export function gateTemplate(tpl: DesignTemplate): string[] {
  const issues: string[] = [];
  const headline = slotOf(tpl, 'headline');
  if (!headline) issues.push('has no headline slot');
  if (!tpl.use) issues.push('has no use, so it cannot be found by category');
  if ((tpl.styles ?? []).length < 2) issues.push('needs at least 2 style tags');
  if ((tpl.tags ?? []).length < 3) issues.push('needs at least 3 search tags');

  const settle = settleTime(tpl);
  if (settle > MAX_SETTLE_SECONDS) issues.push(`takes ${settle.toFixed(2)}s to settle; the limit is ${MAX_SETTLE_SECONDS}s`);

  const roles = tpl.slots.map((s) => s.role);
  const repeated = roles.find((r, i) => roles.indexOf(r) !== i);
  if (repeated) issues.push(`uses the ${repeated} slot more than once`);

  for (const slot of tpl.slots) {
    if (slot.treatment === 'disc' && slot.w > 0.5) issues.push(`${slot.role} disc is wider than half the canvas`);
  }

  for (const [name, w, h] of GATE_FORMATS) {
    for (const slot of tpl.slots) {
      const box = slotBox(slot, w, h);
      if (slot.x + slot.w > 1.0005) issues.push(`${slot.role} runs past the right edge`);
      if (slot.role !== 'qr' && typePx(slot.size, w, h) <= 0) issues.push(`${slot.role} type rounds to nothing @ ${name}`);
      if (slot.treatment === 'disc' && box.top + box.width > h + 0.5) issues.push(`${slot.role} disc leaves the canvas @ ${name}`);
      if ((slot.role === 'services' || slot.role === 'price') && slot.direction !== 'row') {
        const boxes = listRowBoxes(slot, w, h, slot.max ?? 4);
        const last = boxes[boxes.length - 1];
        if (last && last.y + last.size > h) issues.push(`${slot.role} list runs off the bottom @ ${name}`);
      }
    }

    if (!headline) continue;
    const box = slotBox(headline, w, h);
    const lineH = typePx(headline.size, w, h) * 1.06;
    const top = headline.fromBottom ? box.top - lineH * 1.6 : box.top;
    const hb = { x0: box.left, x1: box.left + box.width, y0: top, y1: top + lineH * 1.6 };
    for (const shape of tpl.shapes ?? []) {
      if ((shape.alpha ?? 1) < 0.6 || shape.tone === 'base') continue;
      const b = shapeBounds(shape, w, h);
      if ((b.x1 - b.x0) * (b.y1 - b.y0) < 0.02 * w * h) continue;
      if (b.x0 < hb.x1 && b.x1 > hb.x0 && b.y0 < hb.y1 && b.y1 > hb.y0) {
        issues.push(`a solid ${shape.kind} covers the headline @ ${name}`);
      }
    }
  }
  return [...new Set(issues)];
}
