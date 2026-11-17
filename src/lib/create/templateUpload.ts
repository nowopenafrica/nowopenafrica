/**
 * Turning an uploaded file into a template the catalogue can show.
 *
 * ── THE ONE DECISION THAT MAKES THIS SMALL ───────────────────────────────
 *
 * The 66 templates in `designTemplates.ts` are plain data: a surface, some
 * shapes, and a list of slots. The renderer, the gallery, the editor, the
 * export path and the motion studio all already consume that shape.
 *
 * So an uploaded template does NOT need a new renderer, a sandbox, or a
 * conversion pipeline. It needs to arrive AS THAT SHAPE — validated,
 * because it comes from a file — and everything downstream works unchanged.
 *
 * That is the whole architecture. A row in the database produces a
 * `DesignTemplate`; the catalogue is code templates plus published rows.
 *
 * ── WHY VALIDATION IS NOT OPTIONAL ───────────────────────────────────────
 *
 * This JSON is uploaded by a person and rendered into the page's own DOM.
 * Every field is therefore checked, clamped, or dropped:
 *
 *   - A slot must name a role the renderer knows. An unknown role draws
 *     nothing and silently loses a line of somebody's design.
 *   - Coordinates are fractions of the canvas. A slot at x = 40 is off the
 *     page, and a flat export does not clip it — it loses it.
 *   - Colours and font keys must be ones we ship. A CSS colour string can
 *     carry `url(...)`; a font key we do not have renders as a fallback
 *     nobody chose.
 *
 * Anything that fails is REFUSED with a reason. A template that half-imports
 * is worse than one that does not import, because the half is invisible.
 */

import {
  DESIGN_TEMPLATES, SAMPLE_LIST_ROLES, SAMPLE_TEXT_ROLES,
  type DesignTemplate, type SampleCopy, type ShapeSpec, type SlotSpec, type SurfaceSpec,
} from '../designTemplates';
import { DELIVERABLE_CATEGORIES } from '../design/deliverables';
import { directionOf } from '../design/directions';
import { SUBCATEGORIES } from './catalogueTaxonomy';
import type { GradientSpec, Look, PatternSpec } from '../design/look';
import { paletteOf, type PaletteRole } from '../design/palettes';
import { paletteCarries } from '../design/remix';
import { PATTERNS } from '../design/patterns';
import { TYPE_PAIRINGS } from '../design/typefaces';

/**
 * How much of an uploaded design NowOpen can actually edit.
 *
 * Stated per template and shown to the person using it, because "it
 * uploaded" and "it is editable" are different facts and conflating them is
 * how a customer discovers at export time that the words are baked in.
 */
export type Editability =
  /** Native slot JSON. Identical to a template written in code. */
  | 'full'
  /** Some parts are live, some are a flattened picture behind them. */
  | 'partial'
  /** A picture. It can be placed, cropped and used as a ground. */
  | 'asset'
  /** Kept and shown, but not editable here. */
  | 'preview';

export const EDITABILITY_LABEL: Record<Editability, string> = {
  full: 'Fully editable',
  partial: 'Partly editable',
  asset: 'Image only',
  preview: 'Preview only',
};

/**
 * What each uploaded format can honestly become.
 *
 * MEASURED against what this repository actually contains, not against what
 * a conversion library could theoretically do:
 *
 *   - `.json` in the native slot shape IS a template. Nothing to convert.
 *   - PNG/JPG/WebP are pictures. They can back a design; they are not one.
 *   - PDF now yields real text per page (see lib/studio/importPdf.ts), but
 *     into a DOCUMENT, not into a reusable slot template — so as a catalogue
 *     template it is partial at best.
 *   - PSD, AI, Figma and Canva have NO importer in this codebase. Accepting
 *     them as "templates" would mean storing a file nobody can open and
 *     labelling it editable. They are refused by name instead.
 */
export const UPLOAD_FORMATS: { ext: string; mime: string[]; becomes: Editability }[] = [
  { ext: 'json', mime: ['application/json'], becomes: 'full' },
  { ext: 'png', mime: ['image/png'], becomes: 'asset' },
  { ext: 'jpg', mime: ['image/jpeg'], becomes: 'asset' },
  { ext: 'webp', mime: ['image/webp'], becomes: 'asset' },
];

/** Formats people will try, with the reason each is not accepted yet. */
export const UNSUPPORTED_FORMATS: Record<string, string> = {
  psd: 'Photoshop files need a converter this platform does not have. Export the artwork as PNG, or the layout as a template JSON.',
  ai: 'Illustrator files need a converter this platform does not have. Export as PDF or PNG.',
  eps: 'EPS is kept as a reference image elsewhere in the editor, but it cannot become a reusable template.',
  fig: 'Figma files are not readable outside Figma. Export the frames as PNG, or rebuild the layout as a template JSON.',
  svg: 'SVG import is not wired into the template catalogue yet. It would need sanitising before it could be rendered.',
  zip: 'Template packages are not unpacked yet. Upload the design JSON on its own.',
  pdf: 'A PDF opens as an editable document in the Studio, but it is not a reusable catalogue template.',
};

export interface UploadRefusal {
  ok: false;
  /** What to tell the person, naming the field that was wrong. */
  reason: string;
}

export interface UploadAccepted {
  ok: true;
  template: DesignTemplate;
  editability: Editability;
  /** Things that were corrected rather than refused, worth reviewing. */
  notes: string[];
}

export type UploadResult = UploadAccepted | UploadRefusal;

/* ── field checks ─────────────────────────────────────────────────────── */

const SLOT_ROLES = new Set<string>([
  'brand', 'eyebrow', 'headline', 'subline', 'cta', 'contact',
  'price', 'services', 'stats', 'meta',
]);

const SURFACE_KINDS = new Set<string>(['gradient', 'solid', 'spotlight', 'wash', 'frame']);

/** The five palette roles. A look names these, never a colour. */
const ROLES = new Set<string>(['ground', 'ink', 'primary', 'secondary', 'highlight']);

/* 'accent' stays valid as an alias of primary; the role tones are a look's. */
const SLOT_TONES = new Set<string>(['onSurface', 'accent', 'muted', 'primary', 'secondary', 'highlight']);

const num = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v) ? v : null);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A key the catalogue can address: lowercase, hyphenated, no collisions. */
export function templateKeyFrom(title: string, taken: ReadonlySet<string>): string {
  const base = (title || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'template';
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function readSlot(raw: unknown, index: number): { slot: SlotSpec } | { why: string } {
  if (!raw || typeof raw !== 'object') return { why: `slot ${index + 1} is not an object` };
  const r = raw as Record<string, unknown>;

  const role = typeof r.role === 'string' ? r.role : '';
  if (!SLOT_ROLES.has(role)) {
    return { why: `slot ${index + 1} has role "${role || '(none)'}", which this renderer does not know` };
  }

  const x = num(r.x);
  const y = num(r.y);
  const w = num(r.w);
  if (x === null || y === null || w === null) {
    return { why: `slot "${role}" is missing x, y or w` };
  }
  /*
   * Fractions of the canvas, not pixels. A template authored at 1080 and
   * pasted in raw would put every slot hundreds of units off the page, and
   * a flat export loses whatever sits outside the frame rather than
   * clipping it — so this is refused rather than clamped into nonsense.
   */
  if (x > 1.5 || y > 1.5 || w > 1.5) {
    return { why: `slot "${role}" uses numbers above 1 — coordinates are fractions of the canvas, not pixels` };
  }

  const slot: SlotSpec = {
    role: role as SlotSpec['role'],
    x: clamp01(x),
    y: clamp01(y),
    w: Math.max(0.02, Math.min(1, w)),
  };

  if (r.align === 'left' || r.align === 'center' || r.align === 'right') slot.align = r.align;
  const size = num(r.size);
  if (size !== null) slot.size = Math.max(0.008, Math.min(0.4, size));
  const weight = num(r.weight);
  if (weight !== null) slot.weight = Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
  const tracking = num(r.tracking);
  if (tracking !== null) slot.tracking = Math.max(-0.1, Math.min(0.5, tracking));
  if (typeof r.upper === 'boolean') slot.upper = r.upper;
  if (typeof r.fromBottom === 'boolean') slot.fromBottom = r.fromBottom;
  if (typeof r.tone === 'string' && SLOT_TONES.has(r.tone)) slot.tone = r.tone as SlotSpec['tone'];
  /* The palette role a slot sits on, so its ink is measured against that role. */
  if (typeof r.on === 'string' && ROLES.has(r.on)) slot.on = r.on as PaletteRole;

  return { slot };
}

/** Brand roles a shape may be painted in. Never a literal colour. */
const SHAPE_TONES = new Set(['accent', 'ink', 'base', 'white', 'black', 'primary', 'secondary', 'highlight']);
const CORNERS = new Set(['tl', 'tr', 'bl', 'br']);

/**
 * One painted shape.
 *
 * ── WHY THIS HAD TO EXIST ────────────────────────────────────────────────
 *
 * It did not, and the consequence was invisible in the worst way: the
 * importer measured a design's bars, panels and discs, the Template Manager
 * wrote them to the database, and then every READ rebuilt the template from
 * an allowlist that had no `shapes` in it. The geometry was stored and
 * silently dropped on the way out, so 71 templates looked flat while their
 * rows said otherwise.
 *
 * Tones are checked against the five brand roles, never a colour: that is
 * what lets an imported design be drawn in somebody else's brand.
 */
function readShape(raw: unknown): ShapeSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const tone = typeof r.tone === 'string' && SHAPE_TONES.has(r.tone) ? r.tone : null;
  if (!tone) return null;

  /* Fractions of the canvas, as everywhere else in a template. */
  const frac = (v: unknown, max = 1.5): number | null => {
    const n = num(v);
    return n === null || n < -max || n > max ? null : n;
  };
  const alpha = num(r.alpha);
  const common = {
    tone: tone as ShapeSpec['tone'],
    ...(alpha !== null ? { alpha: clamp01(alpha) } : {}),
  };

  switch (r.kind) {
    case 'wedge': {
      const w = frac(r.w); const h = frac(r.h);
      if (w === null || h === null || typeof r.corner !== 'string' || !CORNERS.has(r.corner)) return null;
      return { kind: 'wedge', corner: r.corner as 'tl', w, h, ...common };
    }
    case 'rect': {
      const x = frac(r.x); const y = frac(r.y); const w = frac(r.w); const h = frac(r.h);
      if (x === null || y === null || w === null || h === null) return null;
      const radius = num(r.radius);
      const skew = num(r.skew);
      const fill = r.fill === undefined ? null : readGradient(r.fill, 'shape fill');
      if (fill && 'why' in fill) return null;
      return {
        kind: 'rect', x, y, w, h,
        ...(radius !== null ? { radius: Math.max(0, Math.min(1, radius)) } : {}),
        ...(skew !== null ? { skew: Math.max(-45, Math.min(45, skew)) } : {}),
        ...common,
        ...(fill ? { fill: fill.gradient } : {}),
      };
    }
    case 'circle': {
      const cx = frac(r.cx); const cy = frac(r.cy); const rad = frac(r.r);
      if (cx === null || cy === null || rad === null) return null;
      const fill = r.fill === undefined ? null : readGradient(r.fill, 'shape fill');
      if (fill && 'why' in fill) return null;
      return { kind: 'circle', cx, cy, r: rad, ...common, ...(fill ? { fill: fill.gradient } : {}) };
    }
    case 'ring': {
      const cx = frac(r.cx); const cy = frac(r.cy); const rad = frac(r.r);
      if (cx === null || cy === null || rad === null) return null;
      const thickness = num(r.thickness);
      return {
        kind: 'ring', cx, cy, r: rad,
        ...(thickness !== null ? { thickness: Math.max(0, Math.min(0.5, thickness)) } : {}),
        ...common,
      };
    }
    case 'stripe': {
      const x = frac(r.x); const y = frac(r.y); const w = frac(r.w); const h = frac(r.h);
      const angle = num(r.angle);
      if (x === null || y === null || w === null || h === null || angle === null) return null;
      return { kind: 'stripe', x, y, w, h, angle: ((angle % 360) + 360) % 360 - (angle < 0 ? 360 : 0), ...common };
    }
    default:
      return null;
  }
}

/* ── the look ─────────────────────────────────────────────────────────── */

/*
 * Any literal colour, anywhere. Hex lives only in palettes.ts: a look made of
 * keys and roles is what lets one design be redrawn in somebody else's brand,
 * and a colour smuggled into it would survive every re-brand as a stain.
 */
const LITERAL_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/i;

/** The dotted path of the first string inside `v` that is a literal colour. */
function colourIn(v: unknown, path: string): string | null {
  if (typeof v === 'string') return LITERAL_COLOUR.test(v) ? path : null;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i += 1) {
      const hit = colourIn(v[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const hit = colourIn(k, path) ?? colourIn(x, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

const GRADIENT_KINDS = new Set(['linear', 'radial', 'mesh']);
const PATTERN_KEYS = new Set<string>(PATTERNS.map((p) => p.key));
const PATTERN_ZONES = new Set(['full', 'top', 'bottom', 'left', 'right', 'band']);
/** The ceiling the look engine holds a pattern to wherever it may sit behind words. */
const PATTERN_MAX_OPACITY = 0.12;

function readGradient(raw: unknown, where: string): { gradient: GradientSpec } | { why: string } {
  if (!raw || typeof raw !== 'object') return { why: `${where} is not a gradient` };
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== 'string' || !GRADIENT_KINDS.has(r.kind)) {
    return { why: `${where} needs a kind: linear, radial or mesh` };
  }
  const stops = Array.isArray(r.stops) ? r.stops : [];
  if (stops.length < 2 || stops.length > 4 || !stops.every((s) => typeof s === 'string' && ROLES.has(s))) {
    return { why: `${where} needs 2 to 4 stops, each one of the palette roles: ${[...ROLES].join(', ')}` };
  }
  const angle = num(r.angle);
  return {
    gradient: {
      kind: r.kind as GradientSpec['kind'],
      stops: stops as PaletteRole[],
      ...(angle !== null ? { angle: ((angle % 360) + 360) % 360 } : {}),
    },
  };
}

/**
 * A template's own look, rebuilt field by field — the same allowlist rule as
 * slots and shapes, so nothing reaches the renderer that was not checked.
 */
function readLook(raw: unknown, notes: string[]): { look: Look } | { why: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { why: 'The look must be an object naming a palette and a type pairing.' };
  }
  const literal = colourIn(raw, 'look');
  if (literal) {
    return { why: `${literal} holds a colour. A look names palette roles, never colours — pick a palette instead.` };
  }
  const r = raw as Record<string, unknown>;

  const palette = typeof r.palette === 'string' ? r.palette : '';
  if (!paletteOf(palette)) return { why: `"${palette || '(none)'}" is not a palette in the library.` };

  const type = typeof r.type === 'string' ? r.type : '';
  if (!TYPE_PAIRINGS.some((p) => p.key === type)) {
    return { why: `"${type || '(none)'}" is not a type pairing. Use one of: ${TYPE_PAIRINGS.map((p) => p.key).join(', ')}.` };
  }

  const look: Look = { palette, type };

  if (r.gradient !== undefined) {
    const g = readGradient(r.gradient, 'look.gradient');
    if ('why' in g) return g;
    look.gradient = g.gradient;
  }

  if (r.pattern !== undefined) {
    const p = (r.pattern && typeof r.pattern === 'object' ? r.pattern : {}) as Record<string, unknown>;
    const key = typeof p.key === 'string' ? p.key : '';
    if (!PATTERN_KEYS.has(key)) return { why: `"${key || '(none)'}" is not a pattern in the library.` };
    if (typeof p.role !== 'string' || !ROLES.has(p.role)) {
      return { why: `look.pattern.role must be one of the palette roles: ${[...ROLES].join(', ')}.` };
    }
    const opacity = num(p.opacity);
    const scale = num(p.scale);
    if (opacity === null || scale === null) return { why: 'look.pattern needs a numeric opacity and scale.' };
    /*
     * Clamped, not refused: a pattern is decoration, and the contrast rule
     * says one that may sit behind words stays at or under 0.12.
     */
    if (opacity > PATTERN_MAX_OPACITY) {
      notes.push(`The pattern's opacity ${opacity} was lowered to ${PATTERN_MAX_OPACITY}, so it cannot drown the words above it.`);
    }
    const pattern: PatternSpec = {
      key: key as PatternSpec['key'],
      role: p.role as PaletteRole,
      opacity: Math.max(0, Math.min(PATTERN_MAX_OPACITY, opacity)),
      scale: Math.max(0.02, Math.min(0.5, scale)),
    };
    if (p.zone !== undefined) {
      if (typeof p.zone !== 'string' || !PATTERN_ZONES.has(p.zone)) {
        return { why: `look.pattern.zone must be one of: ${[...PATTERN_ZONES].join(', ')}.` };
      }
      pattern.zone = p.zone as PatternSpec['zone'];
    }
    look.pattern = pattern;
  }

  if (r.duotone !== undefined) {
    const d = r.duotone;
    if (!Array.isArray(d) || d.length !== 2 || !d.every((x) => typeof x === 'string' && ROLES.has(x))) {
      return { why: 'look.duotone must be two palette roles, dark then light.' };
    }
    look.duotone = [d[0] as PaletteRole, d[1] as PaletteRole];
  }

  /*
   * Not accepted from a file yet. The editor cannot draw a gradient headline
   * and textNeeds does not measure one, so a look that asked for it would
   * open in Studio as a different design and could ship words no check had
   * read. Dropped with a note rather than refused; the rest of the look stands.
   */
  if (r.headlineGradient !== undefined) {
    notes.push('The gradient headline was left out: it is not yet supported on uploaded templates, so the headline is set in flat ink.');
  }

  return { look };
}

function readSurface(raw: unknown, notes: string[]): SurfaceSpec {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = typeof r.kind === 'string' && SURFACE_KINDS.has(r.kind) ? r.kind : null;
  if (!kind) notes.push('No surface was given, so a plain gradient was used.');

  const surface: SurfaceSpec = { kind: (kind ?? 'gradient') as SurfaceSpec['kind'] };
  const angle = num(r.angle);
  if (angle !== null) surface.angle = ((angle % 360) + 360) % 360;
  const intensity = num(r.intensity);
  if (intensity !== null) surface.intensity = clamp01(intensity);
  const vignette = num(r.vignette);
  if (vignette !== null) surface.vignette = clamp01(vignette);
  const frame = num(r.frame);
  if (frame !== null) surface.frame = Math.max(0, Math.min(0.2, frame));
  return surface;
}

/** Longest demo line, and list rows, an upload may carry. */
export const SAMPLE_MAX_CHARS = 120;
export const SAMPLE_MAX_ROWS = 8;

/**
 * What the catalogue needs to file and show an upload: the product it is
 * (subcategory), its art direction, and its own demo copy. Without them the
 * house checks fail it on C2 and C9, so the import card asks for them.
 *
 * All three are optional at the door: a file can arrive without them and be
 * completed on the card. An unknown value is dropped with a note, never kept,
 * because a subcategory nothing knows files the layout nowhere.
 */
function readClassification(
  r: Record<string, unknown>, notes: string[],
): Pick<DesignTemplate, 'subcategory' | 'direction' | 'sample'> {
  const out: Pick<DesignTemplate, 'subcategory' | 'direction' | 'sample'> = {};

  if (typeof r.subcategory === 'string' && r.subcategory) {
    if (SUBCATEGORIES.some((s) => s.key === r.subcategory)) out.subcategory = r.subcategory;
    else notes.push(`"${r.subcategory}" is not a product in the catalogue, so it was left unset.`);
  }

  if (typeof r.direction === 'string' && r.direction) {
    const d = directionOf(r.direction);
    if (d) out.direction = d.key;
    else notes.push(`"${r.direction}" is not a creative direction, so it was left unset.`);
  }

  if (r.sample && typeof r.sample === 'object' && !Array.isArray(r.sample)) {
    const s = r.sample as Record<string, unknown>;
    const sample: SampleCopy = {};
    for (const role of SAMPLE_TEXT_ROLES) {
      const v = s[role];
      if (typeof v === 'string' && v.trim()) sample[role] = v.trim().slice(0, SAMPLE_MAX_CHARS);
    }
    for (const role of SAMPLE_LIST_ROLES) {
      const v = s[role];
      if (!Array.isArray(v)) continue;
      const rows = v.filter((x): x is string => typeof x === 'string' && !!x.trim())
        .map((x) => x.trim().slice(0, SAMPLE_MAX_CHARS)).slice(0, SAMPLE_MAX_ROWS);
      if (rows.length) sample[role] = rows;
    }
    if (Object.keys(sample).length) out.sample = sample;
  }

  return out;
}

/**
 * The classification as typed on a card, tidied the way the door reads it:
 * blank lines and blank fields gone, unknown values dropped. Run before save,
 * so what is stored (and hashed for the review) is what the validator keeps.
 */
export function cleanClassification(
  t: Pick<DesignTemplate, 'subcategory' | 'direction' | 'sample'>,
): Pick<DesignTemplate, 'subcategory' | 'direction' | 'sample'> {
  return readClassification({ subcategory: t.subcategory, direction: t.direction, sample: t.sample }, []);
}

/** A template with its classification tidied, the other fields untouched. */
export function withCleanClassification(t: DesignTemplate): DesignTemplate {
  const rest: DesignTemplate = { ...t };
  delete rest.subcategory; delete rest.direction; delete rest.sample;
  return { ...rest, ...cleanClassification(t) };
}

/**
 * Read an uploaded design JSON into a template, or say why not.
 *
 * `taken` is every key already in the catalogue — code templates included —
 * so an upload can never shadow one of the 66 and silently replace it.
 */
export function readTemplateUpload(
  raw: unknown,
  taken: ReadonlySet<string> = new Set(DESIGN_TEMPLATES.map((t) => t.key)),
  /**
   * `stored`: the row is already in the catalogue (read back by
   * templateCatalogue), not a file being uploaded. A look that no longer reads
   * there, say because its palette was removed from the library, costs the row
   * its look, never the row itself.
   */
  opts: { stored?: boolean } = {},
): UploadResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'That file is not a design template — it should be a JSON object.' };
  }
  const r = raw as Record<string, unknown>;
  const notes: string[] = [];

  const label = typeof r.label === 'string' ? r.label.trim() : '';
  if (!label) return { ok: false, reason: 'The template needs a label — it is what people see in the gallery.' };

  const slotsRaw = Array.isArray(r.slots) ? r.slots : null;
  if (!slotsRaw || !slotsRaw.length) {
    return { ok: false, reason: 'The template has no slots, so there would be nothing to edit.' };
  }
  if (slotsRaw.length > 24) {
    return { ok: false, reason: `The template has ${slotsRaw.length} slots. More than 24 is beyond what a single design should carry.` };
  }

  const slots: SlotSpec[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < slotsRaw.length; i += 1) {
    const read = readSlot(slotsRaw[i], i);
    if ('why' in read) return { ok: false, reason: read.why };
    /*
     * One slot per role. The content model keys copy by role, so a second
     * "headline" would be handed the same words and draw them twice.
     */
    if (seen.has(read.slot.role)) {
      return { ok: false, reason: `There are two "${read.slot.role}" slots. Each role can appear once.` };
    }
    seen.add(read.slot.role);
    slots.push(read.slot);
  }

  if (!seen.has('headline')) {
    return { ok: false, reason: 'Every template needs a headline slot — it is what the gallery previews and what the fitter sizes against.' };
  }

  /*
   * A deliverable category, checked against the ones that exist. The same
   * rule `check:templates` enforces on the code templates: a layout nobody
   * can find in a category is a layout that does not exist.
   */
  const category = typeof r.category === 'string' ? r.category : '';
  const known = DELIVERABLE_CATEGORIES.some((c) => c.id === category);
  if (!known) {
    return {
      ok: false,
      reason: `"${category || '(none)'}" is not a deliverable category. Use one of: ${DELIVERABLE_CATEGORIES.map((c) => c.id).join(', ')}.`,
    };
  }

  /*
   * The painted layer. Twelve is more geometry than any shipped layout
   * carries, and a document claiming forty is a nested tree rather than
   * forty decisions — so the extra are dropped and the drop is reported.
   */
  const shapesRaw = Array.isArray(r.shapes) ? r.shapes : [];
  const shapes: ShapeSpec[] = [];
  let refusedShapes = 0;
  for (const raw of shapesRaw.slice(0, 12)) {
    const shape = readShape(raw);
    if (shape) shapes.push(shape);
    else refusedShapes += 1;
  }
  if (refusedShapes) {
    notes.push(`${refusedShapes} shape${refusedShapes === 1 ? '' : 's'} could not be read and ${refusedShapes === 1 ? 'was' : 'were'} left out — a shape needs a known kind and one of the five brand tones.`);
  }
  if (shapesRaw.length > 12) {
    notes.push(`${shapesRaw.length - 12} shapes beyond the first twelve were left out.`);
  }

  /*
   * The designed look, when the file carries one. Refused rather than dropped
   * when it is wrong: a template whose look vanished on upload would show up
   * in the gallery as a different design from the one that was made.
   */
  let look: Look | null = null;
  if (r.look !== undefined) {
    const read = readLook(r.look, notes);
    if ('why' in read) {
      if (!opts.stored) return { ok: false, reason: read.why };
      notes.push(`The design's look was dropped and it is shown in its plain colours: ${read.why}`);
    } else {
      look = read.look;
    }
  }

  const key = typeof r.key === 'string' && r.key.trim()
    ? templateKeyFrom(r.key, taken)
    : templateKeyFrom(label, taken);
  if (typeof r.key === 'string' && r.key.trim() && key !== r.key.trim()) {
    notes.push(`The key "${r.key}" was already taken, so this one is "${key}".`);
  }

  const template: DesignTemplate = {
    key,
    label: label.slice(0, 60),
    desc: (typeof r.desc === 'string' ? r.desc : '').slice(0, 160),
    mood: (typeof r.mood === 'string' ? r.mood : 'warm') as DesignTemplate['mood'],
    scheme: r.scheme === 'light' ? 'light' : 'dark',
    surface: readSurface(r.surface, notes),
    slots,
    ...(Array.isArray(r.tags)
      ? { tags: r.tags.filter((t): t is string => typeof t === 'string').slice(0, 12) }
      : {}),
    ...(Array.isArray(r.styles)
      ? { styles: r.styles.filter((s): s is string => typeof s === 'string') as DesignTemplate['styles'] }
      : {}),
    ...(shapes.length ? { shapes } : {}),
    ...(r.photoLed === true ? { photoLed: true } : {}),
    ...(look ? { look } : {}),
    ...readClassification(r, notes),
  };

  /*
   * The contrast rule, at the door. The shipped looks are held to it by the
   * contrast suite; an uploaded one never passes through that suite, so it is
   * measured here with the same needs: every word the slots set, on what is
   * beneath it, under the ground gradient. A look that fails costs the
   * template its look, not its place: it is kept and drawn in its plain
   * colours, which never depended on the palette.
   */
  if (look) {
    const palette = paletteOf(look.palette);
    if (palette && !paletteCarries(template, palette, look.gradient?.stops)) {
      delete template.look;
      notes.push(`The look was dropped: the "${look.palette}" palette would leave some of this template's words too faint to read where they sit. The template is kept in its plain colours.`);
    }
  }

  return { ok: true, template, editability: 'full', notes };
}

/**
 * What an uploaded FILE can become, before it is even read.
 *
 * Refusing by name beats accepting a .psd, storing it, and telling somebody
 * afterwards that nothing in it can be changed.
 */
export function classifyUpload(fileName: string, mime: string): { ext: string } & (
  | { supported: true; becomes: Editability }
  | { supported: false; reason: string }
) {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();

  const known = UPLOAD_FORMATS.find((f) => f.ext === ext || f.mime.includes(mime));
  if (known) return { ext, supported: true, becomes: known.becomes };

  const explained = UNSUPPORTED_FORMATS[ext];
  if (explained) return { ext, supported: false, reason: explained };

  return {
    ext,
    supported: false,
    reason: `".${ext || 'unknown'}" is not a format the template library takes. Supported: ${UPLOAD_FORMATS.map((f) => `.${f.ext}`).join(', ')}.`,
  };
}

/**
 * A shipped template, written back out as an upload file.
 *
 * "Upload a JSON in the native slot shape" is not an instruction anybody can
 * follow from a blank editor. Handing them a real template to open, change
 * and upload back is the difference between a feature and a file format.
 *
 * Derived from the shipped catalogue — nothing here is invented, which is
 * the same rule the industry examples follow.
 */
export function templateToUploadJson(
  template: DesignTemplate,
  category: string,
): string {
  const body = {
    key: `${template.key}-copy`,
    label: `${template.label} (copy)`,
    desc: template.desc,
    category,
    mood: template.mood,
    scheme: template.scheme,
    surface: template.surface,
    ...(template.tags?.length ? { tags: template.tags } : {}),
    ...(template.styles?.length ? { styles: template.styles } : {}),
    slots: template.slots,
    ...(template.look ? { look: template.look } : {}),
    ...(template.direction ? { direction: template.direction } : {}),
    ...(template.subcategory ? { subcategory: template.subcategory } : {}),
    ...(template.sample ? { sample: template.sample } : {}),
  };
  return JSON.stringify(body, null, 2);
}
