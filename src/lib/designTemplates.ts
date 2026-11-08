// Shared design templates — one definition, rendered as a still OR as motion.
//
// WHY THIS EXISTS
//
// Every template in Creative Studio was a hardcoded JSX branch:
// `if (layoutKey === 'classic') return (<>…</>)`, thirty of them, inside a
// 1,900-line component. Nothing else could use them. Motion Studio therefore
// grew its own unrelated scene system, and Brand Card, Landing Pages and the
// admin studios each invented their own layout again. Adding one template meant
// editing one giant file and helped exactly one tool.
//
// Here a template is DATA: a surface plus a list of role-based slots, each with
// a fractional box, a type step, and an optional entrance. From that one object:
//
//   - a still renders by resolving slots at t = settled, and
//   - a motion scene renders by resolving the same slots at any t.
//
// So the same "Editorial Split" is a poster, an Instagram post, and an animated
// reel scene, and a new template is a few lines here that appears in every tool
// that reads this catalogue.
//
// GEOMETRY IS FRACTIONAL. Boxes are 0..1 of the canvas and type sizes are
// multiples of the canvas's short edge, so one template is correct at 1080x1080,
// 1080x1920 and a 2480x3508 print poster without per-format variants — the thing
// that made the old hardcoded layouts unusable outside their original size.

export type SlotRole =
  | 'brand' | 'eyebrow' | 'headline' | 'subline' | 'meta' | 'cta' | 'qr'
  // Repeating slots. Everything above renders ONE string; these render a list,
  // which is what a real business flyer is mostly made of — a services column,
  // a proof-point row, a contact strip. Without them the catalogue could only
  // ever produce posters, never the corporate layouts people actually order.
  | 'services' | 'stats' | 'contact' | 'price';

/** Roles that render a list of rows rather than a single string. */
export const LIST_ROLES: readonly SlotRole[] = ['services', 'stats', 'contact', 'price'];

export const isListRole = (role: SlotRole): boolean => LIST_ROLES.includes(role);

/** How a slot arrives. Named for the visual, not the CSS. */
/**
 * How a slot arrives. Named for the visual, not the CSS.
 *
 * The first six were enough to prove the architecture and not enough to direct
 * anything: every scene in Motion Studio moved in the same two directions, so a
 * five-scene advert read as one animation repeated five times. Horizontal
 * travel and a mask reveal are what let consecutive scenes feel like cuts
 * rather than reloads.
 */
export type MotionIn =
  | 'fade' | 'rise' | 'drop' | 'wipe' | 'pop' | 'blur'
  // Horizontal travel. 'slide-left' arrives FROM the right — named for the
  // direction of movement, which is how an editor talks about it.
  | 'slide-left' | 'slide-right'
  /** Revealed by a mask climbing from the baseline. Reads as type being set. */
  | 'mask-up'
  /** Settles down from slightly too large. The opposite of 'pop'. */
  | 'scale-out';

/**
 * Named easing curves.
 *
 * There was one curve — a cubic ease-out — applied to everything. One curve is
 * a house style, and a house style with no exceptions is why cheap motion looks
 * cheap: a logo that lands with a little overshoot and a price that arrives
 * flatly are different statements, and both were the same before this.
 *
 * All are pure functions of progress 0..1 returning 0..1 (spring and elastic
 * deliberately overshoot past 1 in the middle and always end at exactly 1, or
 * the still renderer and the last video frame would disagree).
 */
export type EaseKey = 'linear' | 'in' | 'out' | 'inOut' | 'spring' | 'elastic';

export const EASINGS: Record<EaseKey, (p: number) => number> = {
  linear: (p) => p,
  in: (p) => p * p * p,
  out: (p) => 1 - Math.pow(1 - p, 3),
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  // Overshoots once and settles. The classic "lands with weight".
  spring: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -9 * p) * Math.cos(p * 11)),
  // Two visible bounces. Use sparingly; it is a loud curve.
  elastic: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -8 * p) * Math.cos(p * 19)),
};

/**
 * A camera move over the whole frame.
 *
 * This is the single biggest difference between a slideshow and something that
 * looks filmed. A static frame with text arriving on it reads as a slide; the
 * same frame drifting 4% closer over four seconds reads as a shot. It costs one
 * transform on the surface and applies to the entire composition, so no
 * template has to be re-authored for it.
 */
export type CameraMove = 'none' | 'push' | 'pull' | 'pan-left' | 'pan-right' | 'drift';

export interface CameraSpec {
  move: CameraMove;
  /**
   * How far, as a fraction. 0.04 is a 4% scale or 4% of the short edge of
   * travel across the whole scene.
   *
   * Kept small on purpose: a push you can SEE happening is a push that draws
   * attention to the camera instead of the subject.
   */
  amount?: number;
}

export interface CameraState {
  scale: number;
  dx: number;
  dy: number;
}

export const CAMERA_STILL: CameraState = { scale: 1, dx: 0, dy: 0 };

/**
 * Where the camera is at `t` seconds through a scene of `duration`.
 *
 * Linear, deliberately. A camera move that eases is a camera move somebody
 * notices — real slow pushes are constant-rate, and easing one makes the frame
 * appear to breathe.
 *
 * A push starts at 1 and ends larger, so the frame must be scaled from its
 * centre and overflow hidden; that is the renderer's job, not this function's.
 */
export function cameraAt(
  camera: CameraSpec | undefined,
  t: number,
  duration: number,
  w: number,
  h: number,
): CameraState {
  if (!camera || camera.move === 'none' || duration <= 0) return CAMERA_STILL;
  const p = Math.max(0, Math.min(1, t / duration));
  const amount = camera.amount ?? 0.04;
  const travel = amount * unitOf(w, h);

  switch (camera.move) {
    case 'push': return { scale: 1 + amount * p, dx: 0, dy: 0 };
    case 'pull': return { scale: 1 + amount * (1 - p), dx: 0, dy: 0 };
    // Panning has to scale up first or the edges of the frame come into shot.
    case 'pan-left': return { scale: 1 + amount, dx: -travel * p, dy: 0 };
    case 'pan-right': return { scale: 1 + amount, dx: travel * p, dy: 0 };
    // A slow diagonal. The most useful default for a photograph.
    case 'drift': return { scale: 1 + amount * (0.4 + 0.6 * p), dx: travel * 0.4 * p, dy: -travel * 0.3 * p };
    default: return CAMERA_STILL;
  }
}

export type Mood = 'editorial' | 'bold' | 'minimal' | 'luxe' | 'street' | 'warm';

export type Treatment = 'plain' | 'pill' | 'panel' | 'underline' | 'outline' | 'bar' | 'disc';
//
// 'disc' is the discount badge every sale post is built around — a filled
// circle with a short line centred in it. Its diameter is the slot's own `w`
// rather than anything measured from the text, so the canvas and the DOM
// arrive at the same circle instead of each guessing from font metrics.

/**
 * Type families.
 *
 * These four keys were web-safe stacks — Georgia, Arial Narrow, SF Mono — and
 * the note here used to explain why: a webfont that has not finished loading
 * silently substitutes in one of the three renderers, so the PNG would not
 * match the editor.
 *
 * That constraint is now answered rather than avoided. The faces are
 * self-hosted (one same-origin request, already allowed by the CSP) and every
 * export path awaits ensureTypefacesReady() before it rasterises, so a face is
 * PROVEN present rather than hoped for. Each stack still ends in the web-safe
 * face of the same shape, so a failed download degrades instead of breaking.
 *
 * The keys are unchanged on purpose: all twenty-seven templates below still say
 * `font: 'serif'`, and every one of them is now set in Playfair Display rather
 * than Georgia without a single template being edited.
 *
 * See src/lib/design/typefaces.ts for the library and the licences.
 */
export type { FontKey } from './design/typefaces';
export { FONT_STACKS, fontStack, nearestWeight } from './design/typefaces';

import type { FontKey } from './design/typefaces';
import type { StyleTag, TemplateUse } from './design/tags';
// Type-only on purpose: look.ts imports VALUES from this file, so a value import
// back would be a cycle (the same reason catalogueTemplates.ts avoids one).
import type { Look, GradientSpec } from './design/look';
import type { PaletteRole } from './design/palettes';
import type { DirectionKey } from './design/directions';
import type { PreviewSubject } from './design/previewMedia';
import { CATALOGUE_TEMPLATES } from './design/catalogueTemplates';
import { PILOT_TEMPLATES } from './design/pilotTemplates';

export interface SlotMotion {
  in: MotionIn;
  /** Seconds into the scene when this slot starts arriving. */
  at: number;
  /** Seconds the arrival takes. */
  dur: number;
  /** Curve. Defaults to 'out' — the old single behaviour, so nothing shifts. */
  ease?: EaseKey;
}

export interface SlotSpec {
  role: SlotRole;
  /** Fractions of the canvas: left, top, width. Height is content-driven. */
  x: number;
  y: number;
  w: number;
  align?: 'left' | 'center' | 'right';
  /** Multiplier of the canvas short edge. 0.09 of a 1080 square is ~97px. */
  size?: number;
  weight?: number;
  upper?: boolean;
  /** Letter spacing in em. Negative tightens display type. */
  tracking?: number;
  treatment?: Treatment;
  tone?: 'onSurface' | 'accent' | 'muted' | 'primary' | 'secondary' | 'highlight';
  /**
   * Which palette role this slot's text sits ON. Defaults to 'ground'. A slot
   * set over a primary-coloured band says so here, so it gets the ink that is
   * readable on that band rather than on the ground.
   */
  on?: PaletteRole;
  /** Anchor from the bottom instead of the top, so footers stay pinned. */
  fromBottom?: boolean;
  /** Overrides the template font for this slot — a mono eyebrow over a serif headline. */
  font?: FontKey;
  motion?: SlotMotion;

  // --- list slots only -------------------------------------------------------
  /** Gap between rows, as a multiple of the row's type size. */
  gap?: number;
  /** Marker drawn before each row. */
  bullet?: 'dot' | 'check' | 'number' | 'bar' | 'none';
  /** Lay rows out across the box (a stat strip) instead of down it (a services column). */
  direction?: 'row' | 'column';
  /** Cap on rows drawn, so long content cannot overrun the layout. */
  max?: number;
}

// --- decorative geometry -----------------------------------------------------
//
// The single biggest thing separating this catalogue from a real flyer library
// was that a template could only paint a background and set type on it. Every
// corporate flyer worth copying is built on hard geometry: a diagonal corner
// wedge, a full-bleed footer bar carrying the phone number, a circular photo
// cut-out, an angled accent stripe. Those are shapes, not gradients, and no
// amount of surface tuning produces them.
//
// Painted between the surface and the type, in array order.

export type ShapeTone = 'accent' | 'ink' | 'base' | 'white' | 'black' | 'primary' | 'secondary' | 'highlight';

export type ShapeSpec =
  /** Right-angled triangle filling one corner. The diagonal-cut look. */
  | { kind: 'wedge'; corner: 'tl' | 'tr' | 'bl' | 'br'; w: number; h: number; tone: ShapeTone; alpha?: number }
  /** Band, panel or footer bar. `skew` shears the vertical edges for an angled block. */
  | { kind: 'rect'; x: number; y: number; w: number; h: number; tone: ShapeTone; alpha?: number; radius?: number; skew?: number; fill?: GradientSpec }
  | { kind: 'circle'; cx: number; cy: number; r: number; tone: ShapeTone; alpha?: number; fill?: GradientSpec }
  /** Outline circle — a photo frame or a decorative orbit. */
  | { kind: 'ring'; cx: number; cy: number; r: number; tone: ShapeTone; alpha?: number; thickness?: number }
  /** Rotated bar, for accent slashes that cross the layout. */
  | { kind: 'stripe'; x: number; y: number; w: number; h: number; angle: number; tone: ShapeTone; alpha?: number };

export interface SurfaceSpec {
  kind: 'gradient' | 'solid' | 'spotlight' | 'wash' | 'frame';
  /** Gradient angle in degrees. */
  angle?: number;
  /** 0..1 — how strongly the accent colour reads. */
  intensity?: number;
  /** 0..1 — darkened edges, for text contrast over photography. */
  vignette?: number;
  /** Inset border as a fraction of the short edge. */
  frame?: number;
}

export interface DesignTemplate {
  key: string;
  label: string;
  desc: string;
  mood: Mood;
  /**
   * What the template is FOR, so it can be found.
   *
   * The catalogue used to carry only a label, a description and a mood, and the
   * picker showed all of them in one flat grid. That works at 27 and fails at
   * 60 — a template nobody can find is a template that does not exist. See
   * design/taxonomy.ts.
   */
  use?: TemplateUse;
  /**
   * NowOpen category GROUPS this suits, from data/categories.ts. Empty or
   * absent means it suits any trade.
   *
   * Real group names only, checked by a test. Inventing a second industry
   * vocabulary for Create is how a product ends up with "Restaurants" in one
   * place and "Food & Hospitality" in another, and a filter that matches
   * nothing.
   */
  industries?: string[];
  /** Named art direction (design/directions.ts). Absent until a template is classified. */
  direction?: DirectionKey;
  /** Key of the icon set this template draws from, when it uses one. */
  iconSet?: string;
  styles?: StyleTag[];
  /** Free words somebody might type. Not displayed; searched. */
  tags?: string[];
  /** 'dark' = light text on a dark surface. Decides the default ink colour. */
  scheme: 'dark' | 'light';
  /** Default family for every slot. Individual slots may override it. */
  font?: FontKey;
  surface: SurfaceSpec;
  /**
   * Palette + gradient + pattern + type, chosen together. Absent means the
   * template renders exactly as it always has (resolveLook's fallback path).
   */
  look?: Look;
  /** A slow move over the whole frame, for the motion renderers. Stills ignore it. */
  camera?: CameraSpec;
  /** Painted between surface and type, in order. */
  shapes?: ShapeSpec[];
  /**
   * This layout is built around a photograph.
   *
   * Opt-in rather than automatic: a dense price list or a certificate is worse
   * with a picture behind it, and a gallery that put one on all 47 would be
   * making that mistake 47 times. See design/previewMedia.ts.
   */
  photoLed?: boolean;
  /**
   * What the gallery's preview photograph should show, for a photo-led
   * layout. Absent keeps the key-hashed pick (previewPhotoFor), so no
   * existing template's preview changes. A dish post asking for `food`
   * stops previewing over a laptop.
   */
  photoSubject?: PreviewSubject;
  /**
   * Further sides or pages, after the first.
   *
   * ── ONE MECHANISM, SEVERAL PRODUCTS ─────────────────────────────────
   *
   * A business card has a back. A menu runs over pages. A brochure has
   * panels. They are the same thing: a design whose slots do not all fit on
   * one surface. Rather than special-casing "double-sided", a template may
   * declare any number of further pages and the document builder makes one
   * page each — so the editor's page tabs, the PDF exporter's page loop and
   * the save format all work on them already, with no further changes.
   *
   * Absent means one page, which is what every existing layout has.
   */
  extraPages?: { name: string; slots: SlotSpec[] }[];
  slots: SlotSpec[];
}

// --- geometry & type ---------------------------------------------------------

/**
 * The canvas short edge is the unit for every size.
 *
 * Short edge rather than width or area is what makes one template work across a
 * square post, a 9:16 story and an A3 poster: type stays in proportion to the
 * narrow dimension, which is what the eye reads as "how big is this".
 */
export const unitOf = (w: number, h: number): number => Math.min(w, h);

export function typePx(size: number | undefined, w: number, h: number): number {
  return Math.round((size ?? 0.05) * unitOf(w, h));
}

/**
 * Roughly how wide one character is, as a fraction of the font size.
 *
 * Deliberately approximate and deliberately PURE. Measuring real glyph advances
 * would be more accurate and would also break the one rule this file exists to
 * keep: the DOM preview and the canvas exporter must lay text out identically,
 * and only one of them can measure. A shared estimate that is slightly wrong in
 * both places beats an exact measurement in one.
 *
 * Values are per display face, because the spread is large enough to matter —
 * Archivo Black is nearly half again as wide as Bebas Neue at the same size,
 * which is exactly how a headline that fits in one face overflows in another.
 */
const ADVANCE: Record<string, number> = {
  heavy: 0.62,      // Archivo Black — very wide
  serif: 0.50,      // Playfair Display
  editorial: 0.48,  // DM Serif Display
  soft: 0.52,       // Fraunces
  grotesk: 0.55,    // Space Grotesk
  sans: 0.53,       // Outfit
  mono: 0.60,       // Space Mono — monospaced, so this one is exact
  condensed: 0.38,  // Bebas Neue — tall and narrow
  /*
   * Measured 2026-11-07 with fontTools: mean advance / unitsPerEm over a–z,
   * which is what the eight above track most closely (A–Z runs 0.05–0.2
   * wider). Before these existed the three fell through to 0.53.
   */
  humanist: 0.49,   // Source Sans 3 (600)
  script: 0.39,     // Dancing Script — narrow lowercase, wide capitals (A–Z 0.60)
  coolvetica: 0.47, // Coolvetica Regular
};

/**
 * Shrink a headline until it fits the lines its layout budgeted for it.
 *
 * THE DEFECT THIS FIXES, seen on the live gallery 2026-09-15.
 *
 * Nothing anywhere measured or constrained text. A slot carried a fixed size
 * and a fixed y, so a headline that needed three lines where the layout assumed
 * two simply grew downward and printed over the subline beneath it. On the
 * Megaphone style — Archivo Black, set 1.14x and in capitals — "YOUR HEADLINE
 * HERE" collided with its own body copy on five of the twelve designs on the
 * first screen.
 *
 * That is worse than a plain design. A plain design is a design; overlapping
 * text is a defect, and it was the first thing anybody saw of the library.
 *
 * Shrinking rather than clipping or wrapping wider: the layout's geometry is
 * the thing being sold, so the type yields, not the grid. The floor is 62% —
 * below that a display face stops being a display face, and the honest answer
 * is that the headline is too long for that layout.
 */
export function fittedTypePx(
  text: string | undefined,
  slot: SlotSpec,
  w: number,
  h: number,
  maxLines = 3,
): number {
  // See fitSlotSize below, which works out maxLines from the layout instead of
  // guessing it. This entry point stays for callers that know their own budget.

  const base = typePx(slot.size, w, h);
  const chars = (text ?? '').trim().length;
  if (!chars || !base) return base;

  const widthPx = Math.max(1, Math.min(1, slot.w) * w);
  const advance = ADVANCE[slot.font ?? 'sans'] ?? 0.53;
  // Tracking widens or tightens every character, so it belongs in the estimate.
  const per = advance + (slot.tracking ?? 0);

  const linesAt = (size: number) => {
    const perLine = Math.max(1, Math.floor(widthPx / Math.max(1, size * per)));
    return Math.ceil(chars / perLine);
  };

  let size = base;
  const floor = Math.round(base * 0.62);
  // One step at a time so the result is stable and easy to reason about; a
  // headline needs a handful of iterations at most.
  while (size > floor && linesAt(size) > maxLines) size -= Math.max(1, Math.round(base * 0.04));
  return Math.max(floor, size);
}

/**
 * How many lines this text will take at this size, in this slot.
 *
 * The SAME estimate `fittedTypePx` shrinks against, exposed because a second
 * reader needs it: the editor's document model stores a box height, and it was
 * computing one line unless the text contained a newline. A headline that
 * WRAPPED to two lines was therefore drawn into a one-line box and clipped —
 * which is most of why a template opened in the editor looked broken next to
 * the card that was clicked.
 *
 * Paragraphs are counted separately and summed, because an explicit break
 * always starts a new line however short the text before it.
 */
export function estimateLines(
  text: string | undefined,
  slot: SlotSpec,
  sizePx: number,
  w: number,
): number {
  const body = (text ?? '').trim();
  if (!body || sizePx <= 0) return 1;

  const widthPx = Math.max(1, Math.min(1, slot.w) * w);
  const per = (ADVANCE[slot.font ?? 'sans'] ?? 0.53) + (slot.tracking ?? 0);
  const perLine = Math.max(1, Math.floor(widthPx / Math.max(1, sizePx * per)));

  return body
    .split(String.fromCharCode(10))
    .reduce((n, para) => n + Math.max(1, Math.ceil(para.trim().length / perLine)), 0);
}

/**
 * The line height the renderers use. Big type sets tight, small type sets open.
 *
 * Duplicated nowhere: TemplateSurface reads this, drawTemplate reads this, and
 * the fit below reasons with it. Three copies of one number is how a preview
 * stops matching an export.
 */
export const lineHeightFor = (size: number | undefined): number =>
  (size ?? 0.05) > 0.07 ? 1.03 : 1.25;

/**
 * Fit a slot's type to the room the LAYOUT actually leaves it.
 *
 * WHY maxLines CANNOT BE A CONSTANT — the second attempt at this bug.
 *
 * The first version capped every headline at three lines. "Your headline here"
 * is two, so nothing shrank and the gallery collided exactly as before. The
 * budget was never a number of lines: it is the vertical gap between this slot
 * and whatever the template puts beneath it. A layout that starts its subline
 * at y 0.52 with a headline at y 0.40 has room for one line of 0.11 type, and
 * no amount of line-counting discovers that without looking at the neighbour.
 *
 * So the gap is measured, in the slot's own fractional coordinates, and turned
 * into a line budget. Slots with nothing below them keep a generous cap — the
 * frame edge is the only thing to respect there.
 */
/**
 * The smallest type this system will ever set.
 *
 * Below roughly this, a printed line stops being readable at arm's length
 * and a phone screen gives up on it entirely. If a slot cannot hold its text
 * at this size the template is wrong, and shrinking further only hides that.
 */
export const MIN_TYPE_PX = 9;

export function fitSlotSize(
  slot: SlotSpec,
  slots: SlotSpec[],
  text: string | undefined,
  w: number,
  h: number,
): number {
  const size = typePx(slot.size, w, h);
  if (!size) return size;

  /*
   * `fromBottom` MEASURES FROM THE OTHER EDGE, and forgetting that was a real
   * bug in the first version of this function.
   *
   * slotBox resolves `top = fromBottom ? h - y : y`. A CTA declared at y 0.21
   * with fromBottom therefore sits at 0.79 down the canvas, not 0.21. Comparing
   * raw `y` made it look like a neighbour 1% below the headline, so the fitter
   * computed an 11px line budget on a 1080 canvas and shrank headlines against
   * a slot that was nowhere near them. Four templates were affected —
   * why-choose-us, numbered-services, flash-sale and swiss-grid — which is
   * exactly the set that still looked collided after the first fix.
   */
  const topOf = (o: SlotSpec) => (o.fromBottom ? 1 - o.y : o.y);
  const mine = topOf(slot);

  /*
   * The next slot that starts below this one and shares any horizontal space
   * with it. A caption in a right-hand column cannot be collided with by a
   * headline on the left, so it must not constrain it.
   */
  /*
   * A MEANINGFUL overlap, not a touching edge.
   *
   * flash-sale puts the headline across 0.08-0.64 and a round CTA disc at
   * 0.63-0.92: they share one percent of the width, which is two columns
   * sitting side by side, not a collision. Treating that as "below" gave the
   * headline a 22px budget and shrank it to nothing. A tenth of the narrower
   * slot is the threshold for calling it a real obstruction.
   */
  const overlapsX = (o: SlotSpec) => {
    const left = Math.max(o.x, slot.x);
    const right = Math.min(o.x + o.w, slot.x + slot.w);
    const shared = right - left;
    return shared > Math.min(o.w, slot.w) * 0.1;
  };
  const below = slots
    .filter((o) => o !== slot && topOf(o) > mine && overlapsX(o))
    .reduce<number | null>((min, o) => (min === null || topOf(o) < min ? topOf(o) : min), null);

  // Down to the frame when nothing sits underneath, less a small margin.
  const bottom = below ?? 0.94;
  const roomPx = Math.max(0, (bottom - mine) * h);
  const lineHeight = lineHeightFor(slot.size);
  const lineBudget = Math.max(1, Math.floor(roomPx / (size * lineHeight)));

  const fitted = fittedTypePx(text, slot, w, h, lineBudget);

  /*
   * Even ONE line has to fit.
   *
   * The budget floors at one line, so a slot with less than a full line of room
   * asked for one line and then never shrank — story-caption needed 96px of
   * height in 86px of room and came out unchanged. Capping by the room itself
   * closes that: the line budget governs how many lines, this governs whether
   * a single one can be drawn at all.
   */
  const capped = roomPx > 0 ? Math.floor(roomPx / lineHeight) : fitted;
  let px = Math.min(fitted, capped);

  /*
   * ── AND THEN ALL OF THEM HAVE TO FIT ─────────────────────────────────
   *
   * `capped` only guarantees that ONE line fits the room. A slot holding
   * five lines of price list got a size that fitted one of them and
   * overflowed the other four straight through whatever sat underneath.
   *
   * There used to be a floor here as well — `max(nominal * 0.62, …)` — which
   * meant the fitter was forbidden from shrinking past 62% of the template's
   * nominal size even when the room demanded it. Between the two, 27 slots
   * across 21 layouts asked for more height than existed above the next slot,
   * the worst by a factor of 2.34 (price-drop's price list: 0.538 of the page
   * wanted, 0.230 available).
   *
   * In the gallery that read as crowding. In the editor it was worse: every
   * one of those became a text box literally on top of another text box — six
   * of them overlapping by 100%, one box entirely inside another — so
   * clicking a headline selected and dragged something else. That is what
   * "opening a template scatters it" actually was.
   *
   * The room wins now. A design whose words do not fit the space the template
   * drew for them gets smaller words, which is what a person would do.
   */
  /*
   * The SAME gap the document applies, or the two disagree by exactly it.
   *
   * A multi-line role (a price list, a three-line contact block) is set with
   * extra air between its lines. The fitter did not know that and the box
   * builder did, so six slots still overran after the line-height fix —
   * price-drop's five-line price by a factor of 1.47. One rule, read twice.
   */
  const gapFactor = text && text.includes(String.fromCharCode(10))
    ? (slot.gap ?? 1.4) / 1.4
    : 1;

  if (roomPx > 0 && text) {
    while (px > MIN_TYPE_PX
      && estimateLines(text, slot, px, w) * px * lineHeight * gapFactor > roomPx) {
      px -= 1;
    }
  }
  return Math.max(MIN_TYPE_PX, px);
}

export interface SlotBox {
  left: number;
  top: number;
  width: number;
  textAlign: 'left' | 'center' | 'right';
}

/**
 * Resolve a slot's fractional box to pixels.
 *
 * Clamped so a bad template value cannot place content off-canvas: the export
 * is a flat image, so anything outside the frame is silently lost rather than
 * scrollable. A clamp turns an authoring mistake into a visible squeeze.
 */
export function slotBox(slot: SlotSpec, w: number, h: number): SlotBox {
  const fw = Math.max(0, Math.min(1, slot.w));
  const width = fw * w;
  const left = Math.max(0, Math.min(1 - fw, slot.x)) * w;
  const y = Math.max(0, Math.min(1, slot.y)) * h;
  return {
    left,
    top: slot.fromBottom ? h - y : y,
    width,
    textAlign: slot.align ?? 'left',
  };
}

// --- motion ------------------------------------------------------------------

export interface MotionState {
  opacity: number;
  /** Pixels, already scaled to the canvas. */
  dx: number;
  dy: number;
  scale: number;
  blurPx: number;
  /** inset() percentages for a wipe: [top, right, bottom, left]. */
  clip: [number, number, number, number] | null;
}

export const SETTLED: MotionState = { opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: null };

/** Travel distance for a rise/drop/slide, as a fraction of the short edge. */
const TRAVEL = 0.06;

/**
 * Where a slot sits at time `t` seconds.
 *
 * Clamped at both ends deliberately: before `at` the slot is fully absent, and
 * at or after `at + dur` it is exactly SETTLED. That second guarantee is what
 * lets the still renderer reuse this function — resolve at settleTime() and
 * every slot is final, so a still can never drift from the animation's last
 * frame. Two renderers that agree by construction, not by coincidence.
 *
 * Which is also why the overshooting curves must land on exactly 1: a spring
 * that ends at 1.002 would make the PNG a fraction larger than the video's last
 * frame, and nobody would ever work out why.
 */
export function motionAt(slot: SlotSpec, t: number, w: number, h: number): MotionState {
  const m = slot.motion;
  if (!m) return SETTLED;

  const u = unitOf(w, h);
  const travel = TRAVEL * u;

  if (t <= m.at) {
    switch (m.in) {
      case 'rise': return { opacity: 0, dx: 0, dy: travel, scale: 1, blurPx: 0, clip: null };
      case 'drop': return { opacity: 0, dx: 0, dy: -travel, scale: 1, blurPx: 0, clip: null };
      case 'slide-left': return { opacity: 0, dx: travel * 1.6, dy: 0, scale: 1, blurPx: 0, clip: null };
      case 'slide-right': return { opacity: 0, dx: -travel * 1.6, dy: 0, scale: 1, blurPx: 0, clip: null };
      case 'pop': return { opacity: 0, dx: 0, dy: 0, scale: 0.9, blurPx: 0, clip: null };
      case 'scale-out': return { opacity: 0, dx: 0, dy: 0, scale: 1.12, blurPx: 0, clip: null };
      case 'blur': return { opacity: 0, dx: 0, dy: 0, scale: 1.02, blurPx: 0.02 * u, clip: null };
      // A wipe reveals geometry, so it stays opaque and hides via the clip.
      case 'wipe': return { opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: [0, 100, 0, 0] };
      // Masked from the baseline up. Opaque like a wipe, hidden by the clip.
      case 'mask-up': return { opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: [100, 0, 0, 0] };
      default: return { opacity: 0, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: null };
    }
  }
  if (t >= m.at + m.dur) return SETTLED;

  const p = (EASINGS[m.ease ?? 'out'] ?? EASINGS.out)((t - m.at) / m.dur);
  // Opacity is never allowed to overshoot: a spring on a fade would flash past
  // fully opaque and back, which reads as a dropped frame.
  const fade = Math.max(0, Math.min(1, p));
  const remaining = travel * (1 - p);
  switch (m.in) {
    case 'rise': return { opacity: fade, dx: 0, dy: remaining, scale: 1, blurPx: 0, clip: null };
    case 'drop': return { opacity: fade, dx: 0, dy: -remaining, scale: 1, blurPx: 0, clip: null };
    case 'slide-left': return { opacity: fade, dx: remaining * 1.6, dy: 0, scale: 1, blurPx: 0, clip: null };
    case 'slide-right': return { opacity: fade, dx: -remaining * 1.6, dy: 0, scale: 1, blurPx: 0, clip: null };
    case 'pop': return { opacity: fade, dx: 0, dy: 0, scale: 0.9 + 0.1 * p, blurPx: 0, clip: null };
    case 'scale-out': return { opacity: fade, dx: 0, dy: 0, scale: 1.12 - 0.12 * p, blurPx: 0, clip: null };
    case 'blur': return { opacity: fade, dx: 0, dy: 0, scale: 1.02 - 0.02 * p, blurPx: 0.02 * u * (1 - fade), clip: null };
    case 'wipe': return { opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: [0, 100 * (1 - fade), 0, 0] };
    case 'mask-up': return { opacity: 1, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: [100 * (1 - fade), 0, 0, 0] };
    default: return { opacity: fade, dx: 0, dy: 0, scale: 1, blurPx: 0, clip: null };
  }
}

/** When every slot has settled — the natural minimum length of a scene. */
export function settleTime(tpl: DesignTemplate): number {
  return tpl.slots.reduce(
    (max, s) => (s.motion ? Math.max(max, s.motion.at + s.motion.dur) : max),
    0,
  );
}

// --- surface -----------------------------------------------------------------

export const hexAlpha = (hex: string, a: number): string => {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const n = parseInt(full.length === 6 ? full : '000000', 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
};

const rgbOf = (hex: string): [number, number, number] => {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const n = parseInt(full.length === 6 ? full : '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (r: number, g: number, b: number): string =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v)))
    .toString(16).padStart(2, '0')).join('');

/**
 * Mix a colour toward black (`amount` > 0 darkens) or toward white (< 0).
 *
 * WHY A SURFACE NEEDS THIS AT ALL — the flatness bug, found 2026-09-15.
 *
 * Every one of the 376 generated designs rendered as a single flat block of the
 * brand colour, whatever style was chosen. The cause was not the style system,
 * which is sound; it was that the surface painter built its gradients from
 * `accent` and `base`, and styleColours() returns base === accent for the
 * `brand` colour rule whenever the brand is already readable — which is the
 * default Signature style on most brands. So every gradient ran blue to blue,
 * every spotlight faded blue into blue, and the whole library collapsed into
 * one look with the words moved around.
 *
 * Deriving the stops instead of reading two colours that may be the same
 * guarantees a visible tonal range no matter what the business's brand is, and
 * is what separates a printed-looking ground from a `background-color`.
 */
const shade = (hex: string, amount: number): string => {
  const [r, g, b] = rgbOf(hex);
  const t = Math.max(-1, Math.min(1, amount));
  return t >= 0
    ? toHex(r * (1 - t), g * (1 - t), b * (1 - t))
    : toHex(r + (255 - r) * -t, g + (255 - g) * -t, b + (255 - b) * -t);
};

/** Multiply the alpha of an rgba() string produced by hexAlpha. */
function scaleAlpha(rgba: string, scale: number): string {
  const m = /^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(rgba);
  if (!m) return rgba;
  const a = parseFloat(m[4]) * scale;
  return `rgba(${m[1].trim()}, ${m[2].trim()}, ${m[3].trim()}, ${a})`;
}

/**
 * A background layer, described structurally rather than as a CSS string.
 *
 * The DOM renderer needs `linear-gradient(...)`; the canvas renderer needs
 * ctx.createLinearGradient. Deriving both from one description is the only way
 * they stay identical — a preview that does not match the exported frame is the
 * single most damaging bug a design tool can have, and building the two
 * independently guarantees it eventually.
 */
export type SurfaceLayer =
  | { kind: 'linear'; angle: number; stops: { at: number; color: string }[] }
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: { at: number; color: string }[] };

/**
 * The structured surface description. Both renderers consume this.
 *
 * `alphaScale` thins every tint layer so a background photo or video can read
 * through. At 1 the surface is the opaque design it always was — which is why
 * it defaults to 1 and nothing that does not pass it changes at all.
 *
 * The vignette is deliberately NOT scaled: it darkens the edges, and that is
 * what keeps a headline legible over a busy photograph. Thinning it along with
 * the tint would remove the legibility aid exactly when the image needs it.
 */
export function surfaceSpecLayers(
  tpl: DesignTemplate,
  accent: string,
  base: string,
  alphaScale = 1,
): SurfaceLayer[] {
  const s = tpl.surface;
  const k = s.intensity ?? 0.5;
  const out: SurfaceLayer[] = [];

  /*
   * A light-scheme design writes in near-black on a pale ground; a dark one
   * writes in white on a deep one. They therefore need depth built in OPPOSITE
   * directions: lifting a pale ground toward white keeps dark type readable,
   * while lifting a deep ground toward white would eat the white type sitting
   * on it. Every ramp below is expressed as "deeper" and "lighter" relative to
   * the scheme, so one set of numbers serves both.
   */
  const light = tpl.scheme === 'light';
  /** Away from the ink: darker on a dark scheme, paler on a light one. */
  const deeper = (hex: string, amt: number) => shade(hex, light ? -amt : amt);
  /** Toward the ink. Used sparingly — this is the direction that costs contrast. */
  const lifted = (hex: string, amt: number) => shade(hex, light ? amt * 0.5 : -amt);

  /*
   * Does the ground carry a colour of its own, or is it the accent again?
   *
   * styleColours() returns base === accent for the `brand` rule on a readable
   * brand, and a genuinely different hue for `duotone` and `mono`. A gradient
   * that always ends in a darkened accent would throw the second hue away — so
   * the far stop is the GROUND when there is one to use, and a deepened accent
   * only when there is not. That keeps Duotone a two-colour design while still
   * refusing to collapse on the single-colour case.
   */
  const rgbDistance = (a: string, b: string) => {
    const [ar, ag, ab] = rgbOf(a);
    const [br, bg, bb] = rgbOf(b);
    return Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb);
  };
  const groundIsOwnColour = rgbDistance(accent, base) > 60;
  /** The colour a ramp travels toward. */
  const far = groundIsOwnColour ? deeper(base, 0.1) : deeper(accent, 0.45);

  switch (s.kind) {
    case 'solid':
    case 'frame':
      /*
       * Flat, but not a `background-color`. A printed ink area is never one
       * value: it catches light at the top and settles at the bottom, and a
       * design that ignores that reads as a coloured <div> rather than as a
       * poster. The move is deliberately small — this is the style people pick
       * when they want plain.
       */
      out.push({ kind: 'linear', angle: 168, stops: [
        { at: 0, color: hexAlpha(lifted(base, 0.10), 0.95) },
        { at: 0.55, color: hexAlpha(base, 0.95) },
        { at: 1, color: hexAlpha(deeper(base, 0.12), 0.95) },
      ] });
      // A soft off-centre light, so the block has a source.
      out.push({ kind: 'radial', cx: 0.22, cy: 0.1, r: 0.95, stops: [
        { at: 0, color: hexAlpha(lifted(base, 0.16), 0.5) },
        { at: 1, color: hexAlpha(base, 0) },
      ] });
      break;

    case 'spotlight':
      /*
       * One light, off centre, falling off hard. The old version put the source
       * dead centre at 68% falloff into the ground, which is a vignette rather
       * than a spotlight — nothing was actually lit.
       */
      out.push({ kind: 'linear', angle: 180, stops: [
        { at: 0, color: hexAlpha(deeper(base, 0.35), 0.98) },
        { at: 1, color: hexAlpha(deeper(base, 0.55), 0.98) },
      ] });
      out.push({ kind: 'radial', cx: 0.28, cy: 0.14, r: 0.85, stops: [
        { at: 0, color: hexAlpha(lifted(accent, 0.22), k) },
        { at: 0.45, color: hexAlpha(accent, k * 0.5) },
        { at: 1, color: hexAlpha(accent, 0) },
      ] });
      break;

    case 'wash':
      /*
       * Editorial: mostly clean ground, with one confident sweep of colour
       * rather than a whisper of it. The previous wash ran the accent at
       * intensity x 0.6 and faded it out by 70%, which at thumbnail size was
       * indistinguishable from no wash at all.
       */
      out.push({ kind: 'linear', angle: s.angle ?? 180, stops: [
        { at: 0, color: hexAlpha(lifted(base, 0.05), 0.97) },
        { at: 1, color: hexAlpha(deeper(base, 0.06), 0.97) },
      ] });
      out.push({ kind: 'linear', angle: (s.angle ?? 180) + 115, stops: [
        { at: 0, color: hexAlpha(accent, Math.min(0.5, k * 1.6)) },
        { at: 0.42, color: hexAlpha(accent, k * 0.35) },
        { at: 0.75, color: hexAlpha(accent, 0) },
      ] });
      break;

    case 'gradient':
    default:
      /*
       * A real two-tone. The old ramp handed over to the ground by 72%, so on
       * the common case where base and accent are the same colour it produced
       * nothing at all. This holds the accent across the canvas and lands in a
       * deepened version of ITSELF, which cannot collapse however the brand
       * colour and the ground relate.
       */
      out.push({ kind: 'linear', angle: s.angle ?? 155, stops: [
        { at: 0, color: hexAlpha(lifted(accent, 0.14), k) },
        { at: 0.5, color: hexAlpha(accent, k) },
        { at: 1, color: hexAlpha(far, Math.max(k, 0.96)) },
      ] });
      // A corner lift, the thing that stops a gradient looking like a ramp.
      out.push({ kind: 'radial', cx: 0.12, cy: 0.06, r: 0.8, stops: [
        { at: 0, color: hexAlpha(lifted(accent, 0.3), 0.38) },
        { at: 1, color: hexAlpha(accent, 0) },
      ] });
      break;
  }

  const scale = Math.max(0, Math.min(1, alphaScale));
  const scaled = scale === 1
    ? out
    : out.map((layer) => ({
        ...layer,
        stops: layer.stops.map((st) => ({ ...st, color: scaleAlpha(st.color, scale) })),
      })) as SurfaceLayer[];

  if (s.vignette) {
    scaled.push({ kind: 'radial', cx: 0.5, cy: 0.45, r: 1.15, stops: [
      { at: 0.42, color: hexAlpha('#000000', 0) },
      { at: 1, color: hexAlpha('#000000', s.vignette) },
    ] });
  }
  return scaled;
}

/** CSS form, for the DOM renderer. Derived from surfaceSpecLayers. */
export function surfaceLayers(
  tpl: DesignTemplate,
  accent: string,
  base: string,
  alphaScale = 1,
): string[] {
  return surfaceSpecLayers(tpl, accent, base, alphaScale).map((l) => {
    const stops = l.stops.map(st => `${st.color} ${Math.round(st.at * 100)}%`).join(', ');
    return l.kind === 'linear'
      ? `linear-gradient(${l.angle}deg, ${stops})`
      : `radial-gradient(${Math.round(l.r * 100)}% ${Math.round(l.r * 100)}% at ${Math.round(l.cx * 100)}% ${Math.round(l.cy * 100)}%, ${stops})`;
  });
}

/**
 * How much of a template's tint to keep over a background photo or video.
 *
 * Scheme-aware, because the two schemes fail in opposite directions. A dark
 * template writes in white: a vignette plus half its tint keeps that readable
 * over most images. A LIGHT template writes in near-black and needs a pale
 * ground to sit on — thin its surface the same amount and the headline lands
 * dark-on-dark and disappears, which is what a flat default did.
 *
 * Both are starting points; the background-strength slider overrides them.
 */
export const defaultMediaScrim = (tpl: DesignTemplate): number =>
  tpl.scheme === 'light' ? 0.78 : 0.5;

/** Default ink for the template's scheme. */
export const inkFor = (tpl: DesignTemplate): string => (tpl.scheme === 'dark' ? '#ffffff' : '#0b1220');

// --- shapes: one geometry, both renderers ------------------------------------
//
// Same contract as surfaceSpecLayers: resolve to pixel geometry HERE, so the
// canvas painter and the DOM painter cannot disagree about where a wedge sits.
// The canvas strokes these as paths; the DOM turns polygons into clip-path.

export function shapeColor(
  tone: ShapeTone,
  accent: string,
  ink: string,
  base: string,
  /** Resolved palette roles. Without them the role tones fall back to the accent. */
  roles?: Record<PaletteRole, string>,
): string {
  switch (tone) {
    case 'primary': return roles?.primary ?? accent;
    case 'secondary': return roles?.secondary ?? accent;
    case 'highlight': return roles?.highlight ?? accent;
    case 'accent': return roles?.primary ?? accent;
    case 'ink': return ink;
    case 'base': return base;
    case 'white': return '#ffffff';
    case 'black': return '#000000';
    default: return accent;
  }
}

export type ShapeGeom =
  | { kind: 'polygon'; points: [number, number][] }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ring'; cx: number; cy: number; r: number; thickness: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; radius: number };

/** Resolve a shape's fractional description to pixels on a w x h canvas. */
export function shapeGeometry(shape: ShapeSpec, w: number, h: number): ShapeGeom {
  const u = unitOf(w, h);

  switch (shape.kind) {
    case 'wedge': {
      const sw = shape.w * w;
      const sh = shape.h * h;
      // The right angle sits IN the corner; the hypotenuse cuts across. Which
      // two edges it runs between is what makes a wedge read as top-left vs
      // bottom-right, so each corner needs its own winding.
      const pts: Record<string, [number, number][]> = {
        tl: [[0, 0], [sw, 0], [0, sh]],
        tr: [[w, 0], [w - sw, 0], [w, sh]],
        bl: [[0, h], [sw, h], [0, h - sh]],
        br: [[w, h], [w - sw, h], [w, h - sh]],
      };
      return { kind: 'polygon', points: pts[shape.corner] };
    }
    case 'rect': {
      const x = shape.x * w;
      const y = shape.y * h;
      const rw = shape.w * w;
      const rh = shape.h * h;
      if (shape.skew) {
        // Shear the vertical edges. A positive skew leans the block right,
        // which is the angled colour panel used across corporate flyers.
        const d = shape.skew * rh;
        return { kind: 'polygon', points: [[x + d, y], [x + rw + d, y], [x + rw, y + rh], [x, y + rh]] };
      }
      return { kind: 'rect', x, y, w: rw, h: rh, radius: (shape.radius ?? 0) * u };
    }
    case 'circle':
      return { kind: 'circle', cx: shape.cx * w, cy: shape.cy * h, r: shape.r * u };
    case 'ring':
      return {
        kind: 'ring',
        cx: shape.cx * w,
        cy: shape.cy * h,
        r: shape.r * u,
        thickness: (shape.thickness ?? 0.006) * u,
      };
    case 'stripe': {
      const cx = (shape.x + shape.w / 2) * w;
      const cy = (shape.y + shape.h / 2) * h;
      const hw = (shape.w * w) / 2;
      const hh = (shape.h * h) / 2;
      const rad = (shape.angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const corner = (dx: number, dy: number): [number, number] => [
        cx + dx * cos - dy * sin,
        cy + dx * sin + dy * cos,
      ];
      return {
        kind: 'polygon',
        points: [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)],
      };
    }
    default:
      return { kind: 'rect', x: 0, y: 0, w: 0, h: 0, radius: 0 };
  }
}

// --- list slots --------------------------------------------------------------

export interface ListRowBox {
  x: number;
  y: number;
  w: number;
  /** Type size for this row, in pixels. */
  size: number;
}

/** One row of a 'price' slot: what it is, and what it costs. */
export interface PriceRow {
  label: string;
  price: string;
  /** Optional was-price, struck through beside the current one. */
  was?: string;
}

/**
 * Where each row of a list slot sits.
 *
 * A 'column' list (services, "why choose us") steps DOWN by the type size times
 * the gap. A 'row' list (a stat strip, a contact bar) divides the box ACROSS
 * into equal cells. Both are resolved here so the canvas and DOM painters place
 * row three in the same place.
 */
export function listRowBoxes(slot: SlotSpec, w: number, h: number, count: number): ListRowBox[] {
  if (count <= 0) return [];
  const box = slotBox(slot, w, h);
  const size = typePx(slot.size, w, h);
  const out: ListRowBox[] = [];

  if (slot.direction === 'row') {
    const cell = box.width / count;
    for (let i = 0; i < count; i++) {
      out.push({ x: box.left + i * cell, y: box.top, w: cell, size });
    }
    return out;
  }

  const step = size * (slot.gap ?? 1.9);
  for (let i = 0; i < count; i++) {
    out.push({ x: box.left, y: box.top + i * step, w: box.width, size });
  }
  return out;
}

/** Total height a column list occupies — used to keep a following slot clear. */
export function listHeight(slot: SlotSpec, w: number, h: number, count: number): number {
  if (count <= 0 || slot.direction === 'row') return 0;
  return typePx(slot.size, w, h) * (slot.gap ?? 1.9) * count;
}

// --- the catalogue -----------------------------------------------------------
//
// Type steps are named so a template reads as a design decision rather than a
// wall of magic numbers, and so the scale stays consistent between templates.

const HEAD = 0.092;
const HEAD_HERO = 0.115;
const SUB = 0.036;
const EYEBROW = 0.024;
const META = 0.022;
/** Row type for a services / "why choose us" column. */
const LIST = 0.030;
/** Base for a stat cell — the number renders at 1.55x this, the label at 0.62x. */
const STAT = 0.034;
/** Footer contact strip. Small on purpose: it is reference, not reading. */
const CONTACT = 0.019;

/*
 * ── WHICH LAYOUTS CARRY A PHOTOGRAPH ─────────────────────────────────────
 *
 * `photoLed` is opt-in, and it stays opt-in. The flyers African businesses
 * actually pay for are photo-led — a plate of food, a finished haircut, the
 * person whose service is being sold — and 50 of the 59 layouts previewed as
 * type on a flat colour, which is why the library read as basic rather than
 * as something you would print.
 *
 * It is NOT switched on for everything, for two reasons that both matter.
 *
 * READABILITY: a price list, a menu, a certificate, an opening-hours card, a
 * ticket or a business card is harder to read over a photograph, not easier.
 * Those carry dense information and keep a clean ground. An automated pass
 * over "has no list slots" put a photo behind `price-block` and both ticket
 * layouts; a guard in previewMedia.test.ts caught it, correctly.
 *
 * BANDWIDTH: every photo-led card is a remote image on exactly the mobile
 * connections this audience is using, which is why the same guard holds the
 * total under half the library. That ceiling is a cost decision, not a
 * stylistic one, and it is not to be raised to fit a bigger number.
 */
export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    key: 'editorial-split',
    look: { palette: 'midnight-silk', type: 'editorial', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Editorial Split',
    desc: 'Magazine masthead, accent rule, low headline',
    use: 'marketing',
    styles: ['editorial', 'modern', 'premium'], tags: ['magazine', 'announcement', 'masthead'],
    mood: 'editorial', scheme: 'dark', font: 'serif',
    surface: { kind: 'wash', angle: 200, intensity: 0.4, vignette: 0.3 },
    // A photograph wants a drift. Nothing else moves in this layout.
    camera: { move: 'drift', amount: 0.05 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.014, h: 1, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.09, w: 0.5, size: 0.05, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.5, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'bar', tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.3, dur: 0.6 } },
      { role: 'headline', x: 0.08, y: 0.44, w: 0.84, size: HEAD, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.5, dur: 0.7 } },
      { role: 'subline', x: 0.08, y: 0.68, w: 0.7, size: SUB, tone: 'muted', motion: { in: 'rise', at: 0.85, dur: 0.6 } },
      { role: 'meta', x: 0.08, y: 0.14, w: 0.6, size: META, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1.05, dur: 0.5 } },
      { role: 'qr', x: 0.78, y: 0.2, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.5 } },
    ],
  },
  {
    key: 'statement',
    photoLed: true,
    label: 'Statement',
    desc: 'One enormous centred line',
    use: 'social',
    styles: ['bold', 'high-contrast', 'modern'], tags: ['post', 'quote', 'one line', 'story'],
    mood: 'bold', scheme: 'dark',
    surface: { kind: 'spotlight', intensity: 0.62, vignette: 0.34 },
    // One line, coming at you. The only move that suits it.
    camera: { move: 'push', amount: 0.05 },
    slots: [
      { role: 'brand', x: 0.25, y: 0.1, w: 0.5, size: 0.046, align: 'center', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.25, y: 0.32, w: 0.5, size: EYEBROW, align: 'center', upper: true, tracking: 0.26, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.41, w: 0.84, size: HEAD_HERO, weight: 900, align: 'center', tracking: -0.03, motion: { in: 'pop', at: 0.45, dur: 0.7 } },
      { role: 'subline', x: 0.16, y: 0.66, w: 0.68, size: SUB, align: 'center', tone: 'muted', motion: { in: 'rise', at: 0.9, dur: 0.6 } },
      { role: 'cta', x: 0.3, y: 0.2, w: 0.4, size: 0.03, align: 'center', treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.5 } },
      { role: 'meta', x: 0.2, y: 0.1, w: 0.6, size: META, align: 'center', fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.25, dur: 0.5 } },
    ],
  },
  {
    key: 'quiet-luxe',
    look: { palette: 'red-earth', type: 'luxury' },
    label: 'Quiet Luxe',
    desc: 'Airy light layout, thin rules, wide tracking',
    use: 'business', industries: ['Fashion & Beauty', 'Professional Services'],
    styles: ['luxury', 'minimal', 'elegant', 'premium'], tags: ['salon', 'boutique', 'premium'],
    mood: 'luxe', scheme: 'light', font: 'serif',
    surface: { kind: 'solid' },
    // Settling back is the restrained option, and this layout is restraint.
    camera: { move: 'pull', amount: 0.04 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.985, w: 0.7, h: 0.015, tone: 'secondary' },
      { kind: 'rect', x: 0.7, y: 0.985, w: 0.3, h: 0.015, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.11, w: 0.5, size: 0.042, motion: { in: 'fade', at: 0, dur: 0.6 } },
      { role: 'eyebrow', x: 0.1, y: 0.26, w: 0.6, size: 0.022, upper: true, tracking: 0.34, tone: 'muted', motion: { in: 'wipe', at: 0.3, dur: 0.7 } },
      { role: 'headline', x: 0.1, y: 0.36, w: 0.72, size: 0.082, weight: 500, tracking: -0.015, motion: { in: 'blur', at: 0.5, dur: 0.8 } },
      { role: 'subline', x: 0.1, y: 0.6, w: 0.6, size: 0.032, tone: 'muted', motion: { in: 'rise', at: 0.95, dur: 0.6 } },
      { role: 'meta', x: 0.1, y: 0.13, w: 0.55, size: 0.02, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.15, dur: 0.5 } },
      { role: 'qr', x: 0.76, y: 0.19, w: 0.14, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.5 } },
    ],
  },
  {
    key: 'street-poster',
    look: { palette: 'baobab', type: 'street', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Street Poster',
    desc: 'Hard frame, stacked caps, high contrast',
    use: 'event', industries: ['Arts & Entertainment'],
    styles: ['street', 'bold', 'youth'], tags: ['party', 'concert', 'gig', 'flyer'],
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'frame', frame: 0.035, intensity: 0.5, vignette: 0.22 },
    // Louder than the rest, deliberately.
    camera: { move: 'push', amount: 0.06 },
    shapes: [
      { kind: 'rect', x: 0.1, y: 0.265, w: 0.16, h: 0.008, tone: 'secondary' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.14, w: 0.8, size: 0.026, upper: true, tracking: 0.3, treatment: 'outline', motion: { in: 'drop', at: 0, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.3, w: 0.8, size: 0.108, weight: 900, upper: true, tracking: -0.03, motion: { in: 'wipe', at: 0.35, dur: 0.7 } },
      { role: 'subline', x: 0.1, y: 0.62, w: 0.66, size: 0.034, motion: { in: 'rise', at: 0.8, dur: 0.6 } },
      { role: 'brand', x: 0.1, y: 0.17, w: 0.5, size: 0.04, fromBottom: true, motion: { in: 'fade', at: 1.0, dur: 0.5 } },
      { role: 'qr', x: 0.75, y: 0.17, w: 0.15, fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.45 } },
    ],
  },
  {
    key: 'warm-offer',
    photoLed: true,
    label: 'Warm Offer',
    desc: 'Panel-backed detail and a clear call to action',
    use: 'marketing', industries: ['Food & Hospitality', 'Local & Everyday Business'],
    styles: ['soft', 'organic', 'playful'], tags: ['offer', 'discount', 'weekend'],
    mood: 'warm', scheme: 'dark',
    surface: { kind: 'gradient', angle: 150, intensity: 0.58, vignette: 0.26 },
    slots: [
      { role: 'brand', x: 0.08, y: 0.1, w: 0.5, size: 0.046, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.08, y: 0.24, w: 0.55, size: EYEBROW, upper: true, tracking: 0.2, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.36, w: 0.8, size: 0.098, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.45, dur: 0.7 } },
      { role: 'subline', x: 0.08, y: 0.58, w: 0.62, size: SUB, treatment: 'panel', motion: { in: 'wipe', at: 0.85, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.19, w: 0.44, size: 0.032, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.5 } },
      { role: 'meta', x: 0.08, y: 0.1, w: 0.6, size: META, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.2, dur: 0.5 } },
      { role: 'qr', x: 0.77, y: 0.18, w: 0.15, fromBottom: true, motion: { in: 'pop', at: 1.15, dur: 0.45 } },
    ],
  },
  {
    key: 'minimal-grid',
    look: { palette: 'lagoon', type: 'modern', pattern: { key: 'topography', role: 'primary', opacity: 0.06, scale: 0.3 } },
    label: 'Minimal Grid',
    desc: 'Left rail, generous space, underlined heading',
    use: 'business', industries: ['Professional Services', 'Technology & Media'],
    styles: ['minimal', 'swiss', 'corporate'], tags: ['clean', 'grid', 'corporate'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.014, h: 1, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.12, y: 0.12, w: 0.4, size: 0.04, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.12, y: 0.24, w: 0.5, size: 0.021, upper: true, tracking: 0.28, tone: 'accent', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.12, y: 0.34, w: 0.68, size: 0.086, weight: 700, tracking: -0.02, treatment: 'underline', motion: { in: 'rise', at: 0.3, dur: 0.7 } },
      { role: 'subline', x: 0.12, y: 0.56, w: 0.56, size: 0.031, tone: 'muted', motion: { in: 'rise', at: 0.75, dur: 0.6 } },
      { role: 'meta', x: 0.12, y: 0.12, w: 0.6, size: 0.02, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1.0, dur: 0.5 } },
    ],
  },
  {
    key: 'soft-glass',
    photoLed: true,
    label: 'Soft Glass',
    desc: 'Frosted panel over a soft-focus photo',
    use: 'social', industries: ['Technology & Media'],
    styles: ['modern', 'tech', 'premium'], tags: ['glass', 'app', 'launch'],
    mood: 'minimal', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 200, intensity: 0.34, vignette: 0.4 },
    slots: [
      { role: 'brand', x: 0.09, y: 0.1, w: 0.5, size: 0.044, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.09, y: 0.46, w: 0.5, size: 0.021, upper: true, tracking: 0.3, font: 'mono', tone: 'accent', motion: { in: 'fade', at: 0.3, dur: 0.5 } },
      { role: 'headline', x: 0.09, y: 0.53, w: 0.74, size: 0.084, weight: 650, tracking: -0.02, treatment: 'panel', motion: { in: 'blur', at: 0.45, dur: 0.75 } },
      { role: 'subline', x: 0.09, y: 0.74, w: 0.62, size: 0.031, tone: 'muted', motion: { in: 'rise', at: 0.95, dur: 0.55 } },
      { role: 'cta', x: 0.09, y: 0.16, w: 0.42, size: 0.03, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.15, dur: 0.45 } },
      { role: 'qr', x: 0.76, y: 0.16, w: 0.14, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'mesh-accent',
    photoLed: true,
    label: 'Mesh Accent',
    desc: 'Layered colour bloom, tight modern sans',
    use: 'social', industries: ['Technology & Media'],
    styles: ['modern', 'bold', 'tech'], tags: ['gradient', 'mesh', 'launch'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.7, vignette: 0.2 },
    slots: [
      { role: 'eyebrow', x: 0.09, y: 0.12, w: 0.46, size: 0.02, upper: true, tracking: 0.32, font: 'mono', tone: 'accent', motion: { in: 'wipe', at: 0, dur: 0.5 } },
      { role: 'headline', x: 0.09, y: 0.24, w: 0.8, size: 0.104, weight: 800, tracking: -0.035, motion: { in: 'rise', at: 0.25, dur: 0.7 } },
      { role: 'subline', x: 0.09, y: 0.56, w: 0.6, size: 0.033, tone: 'muted', motion: { in: 'rise', at: 0.75, dur: 0.6 } },
      { role: 'brand', x: 0.09, y: 0.15, w: 0.5, size: 0.042, fromBottom: true, motion: { in: 'fade', at: 1.0, dur: 0.5 } },
      { role: 'meta', x: 0.09, y: 0.09, w: 0.6, size: 0.02, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1.15, dur: 0.45 } },
      { role: 'qr', x: 0.77, y: 0.15, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
    ],
  },
  {
    key: 'gallery-serif',
    photoLed: true,
    label: 'Gallery Serif',
    desc: 'Exhibition card - light, serif, wide margins',
    use: 'event', industries: ['Arts & Entertainment', 'Fashion & Beauty'],
    styles: ['editorial', 'elegant', 'luxury'], tags: ['exhibition', 'gallery', 'opening'],
    mood: 'luxe', scheme: 'light', font: 'serif',
    surface: { kind: 'solid' },
    // Reads like a camera moving along a wall.
    camera: { move: 'pan-right', amount: 0.05 },
    slots: [
      { role: 'eyebrow', x: 0.14, y: 0.18, w: 0.5, size: 0.019, upper: true, tracking: 0.38, font: 'mono', tone: 'muted', motion: { in: 'fade', at: 0, dur: 0.6 } },
      { role: 'headline', x: 0.14, y: 0.28, w: 0.66, size: 0.088, weight: 400, tracking: -0.01, motion: { in: 'blur', at: 0.35, dur: 0.85 } },
      { role: 'subline', x: 0.14, y: 0.54, w: 0.52, size: 0.029, tone: 'muted', motion: { in: 'rise', at: 0.95, dur: 0.6 } },
      { role: 'brand', x: 0.14, y: 0.16, w: 0.5, size: 0.036, fromBottom: true, motion: { in: 'fade', at: 1.1, dur: 0.5 } },
      { role: 'meta', x: 0.14, y: 0.1, w: 0.55, size: 0.019, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1.25, dur: 0.45 } },
    ],
  },
  {
    key: 'ticket',
    label: 'Ticket',
    desc: 'Stub-style panels, mono detail, event feel',
    use: 'event', industries: ['Arts & Entertainment'],
    styles: ['street', 'bold', 'youth'], tags: ['ticket', 'entry', 'event', 'date'],
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'gradient', angle: 120, intensity: 0.44, vignette: 0.3 },
    slots: [
      { role: 'brand', x: 0.09, y: 0.11, w: 0.5, size: 0.042, font: 'sans', motion: { in: 'drop', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.09, y: 0.24, w: 0.5, size: 0.022, upper: true, tracking: 0.26, font: 'mono', treatment: 'outline', motion: { in: 'fade', at: 0.15, dur: 0.45 } },
      { role: 'headline', x: 0.09, y: 0.3, w: 0.82, size: 0.112, weight: 700, upper: true, tracking: -0.02, motion: { in: 'wipe', at: 0.3, dur: 0.7 } },
      { role: 'subline', x: 0.09, y: 0.6, w: 0.64, size: 0.032, font: 'sans', treatment: 'panel', motion: { in: 'rise', at: 0.85, dur: 0.6 } },
      { role: 'meta', x: 0.09, y: 0.12, w: 0.55, size: 0.021, fromBottom: true, font: 'mono', tone: 'muted', motion: { in: 'fade', at: 1.1, dur: 0.45 } },
      { role: 'qr', x: 0.76, y: 0.17, w: 0.15, fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.45 } },
    ],
  },
  {
    key: 'story-caption',
    look: { palette: 'deep-sea', type: 'modern', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Story Caption',
    desc: 'Built for 9:16 - copy low and thumb-safe',
    use: 'social',
    styles: ['soft', 'playful', 'youth'], tags: ['story', 'whatsapp', 'status', 'vertical'],
    mood: 'warm', scheme: 'dark', font: 'sans',
    surface: { kind: 'wash', angle: 190, intensity: 0.3, vignette: 0.44 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.008, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.09, y: 0.08, w: 0.6, size: 0.04, motion: { in: 'fade', at: 0, dur: 0.5 } },
      // Anchored low so copy clears a story's own UI at the top and bottom.
      /*
       * 0.46, not 0.42 — the headline is at 0.42.
       *
       * Both were on the SAME anchor, so both resolved to 0.58 down the
       * canvas and the eyebrow was drawn inside the headline: the only pair
       * in the whole library overlapping by 100%. The note under the headline
       * explains it was raised from 0.3 to 0.42 to clear the subline, and it
       * landed exactly on top of the line above it instead.
       *
       * fromBottom, so a LARGER y is higher up the page. 0.46 puts the
       * eyebrow's foot a hair clear of the headline's crown.
       */
      { role: 'eyebrow', x: 0.09, y: 0.46, w: 0.5, size: 0.021, upper: true, tracking: 0.28, font: 'mono', tone: 'accent', fromBottom: true, motion: { in: 'wipe', at: 0.3, dur: 0.5 } },
      /*
       * Raised from y 0.3 to 0.42 (measured from the bottom, so UP the canvas).
       *
       * At 0.3 the headline sat 0.08 above the subline — 86px on a 1080 square
       * — while asking for 97px of type. The template was authored to collide
       * at a single line, before any content was long. It now has 0.20 of room,
       * which holds two lines of its own type size.
       */
      { role: 'headline', x: 0.09, y: 0.42, w: 0.82, size: 0.09, weight: 800, tracking: -0.025, fromBottom: true, motion: { in: 'rise', at: 0.45, dur: 0.7 } },
      { role: 'subline', x: 0.09, y: 0.22, w: 0.7, size: 0.03, tone: 'muted', fromBottom: true, motion: { in: 'rise', at: 0.9, dur: 0.55 } },
      { role: 'cta', x: 0.09, y: 0.12, w: 0.44, size: 0.029, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
    ],
  },
  {
    key: 'price-block',
    label: 'Price Block',
    desc: 'Offer-led - the number is the hero',
    use: 'marketing', industries: ['Retail & Commerce', 'Local & Everyday Business'],
    styles: ['bold', 'high-contrast'], tags: ['price', 'offer', 'cost'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 165, intensity: 0.6, vignette: 0.24 },
    slots: [
      { role: 'brand', x: 0.09, y: 0.1, w: 0.5, size: 0.042, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.09, y: 0.26, w: 0.55, size: 0.022, upper: true, tracking: 0.24, treatment: 'pill', tone: 'accent', font: 'mono', motion: { in: 'pop', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.09, y: 0.36, w: 0.7, size: 0.13, weight: 900, tracking: -0.04, motion: { in: 'pop', at: 0.4, dur: 0.65 } },
      /*
       * Lowered from 0.62. The headline above is set at 0.13 of the short edge
       * and had 0.26 of room — enough for two lines of it, not three, so a
       * normal-length headline ran into this line. 0.68 buys the third.
       */
      { role: 'subline', x: 0.09, y: 0.68, w: 0.62, size: 0.032, tone: 'muted', motion: { in: 'rise', at: 0.85, dur: 0.55 } },
      { role: 'cta', x: 0.09, y: 0.18, w: 0.46, size: 0.032, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.45 } },
      { role: 'meta', x: 0.09, y: 0.1, w: 0.6, size: 0.02, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1.2, dur: 0.45 } },
      { role: 'qr', x: 0.77, y: 0.17, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
    ],
  },

  // --- business flyers -------------------------------------------------------
  //
  // The twelve templates above are posters: a statement, some air, one idea.
  // These are the layouts businesses actually commission — a service list, a
  // reason to trust, a number to call. They are why 'services', 'stats',
  // 'contact' and the shape layer exist; none of them can be built without.

  {
    key: 'agency-services',
    label: 'Agency Services',
    desc: 'Diagonal cut, service list, contact bar',
    use: 'business', industries: ['Professional Services', 'Technology & Media'],
    styles: ['corporate', 'modern', 'bold'], tags: ['services', 'agency', 'what we do'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 155, intensity: 0.4, vignette: 0.24 },
    shapes: [
      { kind: 'wedge', corner: 'tr', w: 0.44, h: 0.19, tone: 'accent', alpha: 0.92 },
      { kind: 'rect', x: 0, y: 0.885, w: 1, h: 0.115, tone: 'accent', alpha: 0.95 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.46, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.185, w: 0.56, size: EYEBROW, upper: true, tracking: 0.2, treatment: 'bar', tone: 'accent', motion: { in: 'wipe', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.245, w: 0.8, size: HEAD, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.4, dur: 0.6 } },
      { role: 'subline', x: 0.08, y: 0.46, w: 0.74, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.7, dur: 0.5 } },
      { role: 'services', x: 0.08, y: 0.57, w: 0.8, size: LIST, weight: 600, bullet: 'dot', gap: 1.95, max: 4, motion: { in: 'rise', at: 0.9, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.2, w: 0.5, size: 0.03, weight: 700, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.25, dur: 0.45 } },
      { role: 'contact', x: 0.07, y: 0.055, w: 0.86, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.4, dur: 0.4 } },
    ],
  },
  {
    key: 'why-choose-us',
    look: { palette: 'moss-stone', type: 'modern' },
    label: 'Why Choose Us',
    desc: 'Ticked reasons to trust, light and corporate',
    use: 'marketing',
    styles: ['minimal', 'corporate'], tags: ['benefits', 'reasons', 'why us', 'trust'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid' },
    shapes: [
      { kind: 'wedge', corner: 'tr', w: 0.5, h: 0.16, tone: 'accent', alpha: 0.9 },
      { kind: 'stripe', x: 0.04, y: 0.145, w: 0.16, h: 0.008, angle: 0, tone: 'accent' },
      { kind: 'rect', x: 0, y: 0.9, w: 1, h: 0.1, tone: 'secondary', alpha: 0.12 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.44, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.2, w: 0.76, size: HEAD, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.25, dur: 0.6 } },
      { role: 'subline', x: 0.08, y: 0.4, w: 0.7, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.5 } },
      { role: 'services', x: 0.08, y: 0.51, w: 0.82, size: LIST, weight: 600, bullet: 'check', gap: 2.05, max: 4, motion: { in: 'rise', at: 0.8, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.21, w: 0.5, size: 0.03, weight: 700, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.2, dur: 0.45 } },
      { role: 'contact', x: 0.07, y: 0.05, w: 0.86, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.35, dur: 0.4 } },
    ],
  },
  {
    key: 'proof-points',
    label: 'Proof Points',
    desc: 'The numbers lead — clients, projects, years',
    use: 'marketing',
    styles: ['bold', 'corporate'], tags: ['stats', 'numbers', 'results', 'proof'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.45, vignette: 0.3 },
    shapes: [
      { kind: 'rect', x: 0.06, y: 0.585, w: 0.88, h: 0.185, tone: 'white', alpha: 0.07, radius: 0.03 },
      { kind: 'circle', cx: 0.9, cy: 0.13, r: 0.11, tone: 'accent', alpha: 0.2 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.44, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.19, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.25, w: 0.8, size: HEAD, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.08, y: 0.46, w: 0.72, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.65, dur: 0.5 } },
      { role: 'stats', x: 0.09, y: 0.625, w: 0.82, size: STAT, direction: 'row', align: 'left', max: 3, motion: { in: 'pop', at: 0.85, dur: 0.55 } },
      { role: 'cta', x: 0.08, y: 0.19, w: 0.52, size: 0.03, weight: 700, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.15, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.095, w: 0.84, size: CONTACT, weight: 600, tone: 'muted', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.3, dur: 0.4 } },
    ],
  },
  {
    key: 'numbered-services',
    label: 'Numbered Services',
    desc: '01-04 down the page, editorial and calm',
    use: 'business', industries: ['Professional Services', 'Home & Personal Services'],
    styles: ['editorial', 'modern'], tags: ['services', 'steps', 'process', 'numbered'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'wash', angle: 190, intensity: 0.34, vignette: 0.28 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.02, h: 1, tone: 'accent', alpha: 0.9 },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.085, w: 0.44, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.1, y: 0.18, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.235, w: 0.78, size: 0.085, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'services', x: 0.1, y: 0.45, w: 0.8, size: LIST, weight: 600, bullet: 'number', gap: 2.2, max: 4, motion: { in: 'rise', at: 0.65, dur: 0.65 } },
      { role: 'subline', x: 0.1, y: 0.24, w: 0.7, size: 0.03, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 1.05, dur: 0.5 } },
      { role: 'contact', x: 0.1, y: 0.1, w: 0.82, size: CONTACT, weight: 600, tone: 'muted', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'speaker-card',
    look: { palette: 'midnight-silk', type: 'editorial', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Speaker Card',
    desc: 'Portrait ring, name, role and the date',
    use: 'event', industries: ['Education & Community', 'Professional Services'],
    styles: ['bold', 'corporate'], tags: ['speaker', 'conference', 'seminar', 'webinar', 'guest'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 165, intensity: 0.5, vignette: 0.34 },
    shapes: [
      { kind: 'wedge', corner: 'bl', w: 0.5, h: 0.22, tone: 'accent', alpha: 0.16 },
      // Disc under ring. Alone, the ring read as an empty outline — a template
      // that looks like it failed to load. Filled, it is a portrait vignette
      // that works with a photo behind it and still looks deliberate without.
      { kind: 'circle', cx: 0.5, cy: 0.29, r: 0.19, tone: 'white', alpha: 0.07 },
      { kind: 'ring', cx: 0.5, cy: 0.29, r: 0.19, tone: 'secondary', alpha: 0.85, thickness: 0.008 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.085, w: 0.8, size: EYEBROW, align: 'center', upper: true, tracking: 0.24, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.53, w: 0.8, size: 0.082, weight: 800, align: 'center', tracking: -0.02, motion: { in: 'rise', at: 0.45, dur: 0.6 } },
      { role: 'subline', x: 0.12, y: 0.665, w: 0.76, size: 0.03, align: 'center', tone: 'accent', upper: true, tracking: 0.12, motion: { in: 'fade', at: 0.75, dur: 0.5 } },
      { role: 'meta', x: 0.15, y: 0.745, w: 0.7, size: META, align: 'center', treatment: 'pill', motion: { in: 'pop', at: 0.95, dur: 0.45 } },
      { role: 'cta', x: 0.2, y: 0.155, w: 0.6, size: 0.028, weight: 700, align: 'center', treatment: 'outline', fromBottom: true, motion: { in: 'pop', at: 1.15, dur: 0.45 } },
      { role: 'brand', x: 0.1, y: 0.075, w: 0.8, size: 0.024, align: 'center', upper: true, tracking: 0.18, fromBottom: true, motion: { in: 'fade', at: 1.3, dur: 0.4 } },
    ],
  },
  {
    key: 'promo-burst',
    photoLed: true,
    label: 'Promo Burst',
    desc: 'The discount is the hero - dates and a deadline',
    use: 'marketing', industries: ['Retail & Commerce'],
    styles: ['street', 'bold', 'youth'], tags: ['sale', 'burst', 'loud', 'discount'],
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'gradient', angle: 145, intensity: 0.62, vignette: 0.2 },
    shapes: [
      // Clear of the headline box on purpose: at cx 0.78 / r 0.2 this circle
      // overlapped the first line of a two-line headline on every format.
      { kind: 'circle', cx: 0.84, cy: 0.15, r: 0.13, tone: 'accent', alpha: 0.9 },
      { kind: 'rect', x: -0.05, y: 0.6, w: 1.1, h: 0.1, tone: 'black', alpha: 0.35, skew: 0.12 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.44, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.5, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.29, w: 0.66, size: HEAD_HERO, weight: 800, upper: true, tracking: -0.03, motion: { in: 'pop', at: 0.35, dur: 0.55 } },
      { role: 'subline', x: 0.08, y: 0.62, w: 0.7, size: 0.032, weight: 700, upper: true, tracking: 0.08, motion: { in: 'wipe', at: 0.7, dur: 0.5 } },
      { role: 'meta', x: 0.08, y: 0.73, w: 0.6, size: META, tone: 'muted', motion: { in: 'fade', at: 0.95, dur: 0.45 } },
      { role: 'cta', x: 0.08, y: 0.19, w: 0.56, size: 0.032, weight: 800, upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.09, w: 0.84, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'consulting-clean',
    look: { palette: 'harbour-blue', type: 'editorial' },
    label: 'Consulting Clean',
    desc: 'Left rail, quiet type, services and a number to call',
    use: 'business', industries: ['Professional Services'],
    styles: ['minimal', 'corporate', 'swiss'], tags: ['consulting', 'proposal', 'professional'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.055, h: 1, tone: 'accent', alpha: 0.95 },
      { kind: 'rect', x: 0.115, y: 0.885, w: 0.82, h: 0.002, tone: 'ink', alpha: 0.2 },
    ],
    slots: [
      /*
        ── A DIFFERENT DIRECTION, NOT A DIFFERENT PALETTE ─────────────────

        MEASURED by scripts/audit-templates.mjs: this shared a composition
        signature with `numbered-services` — same headline anchor, same type
        scale, same slot list, same stack order. Two templates in the same
        category that a shopper cannot tell apart are one template.

        So the composition changed rather than the colour. This is now an
        asymmetric two-column statement: the claim held low-left in a narrow
        measure, its proof listed in a right-hand column beside it. That is
        how a consultancy's own literature is usually set, and it reads
        nothing like the numbered list it used to duplicate.
      */
      { role: 'brand', x: 0.115, y: 0.09, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.115, y: 0.19, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      /* Low and narrow: deliberate empty space above it is the whole point. */
      { role: 'headline', x: 0.115, y: 0.46, w: 0.4, size: 0.078, weight: 700, tracking: -0.02, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.115, y: 0.68, w: 0.38, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.65, dur: 0.5 } },
      /* The proof column, beside the claim rather than under it. */
      { role: 'services', x: 0.58, y: 0.46, w: 0.35, size: LIST, weight: 600, bullet: 'bar', gap: 2.0, max: 4, motion: { in: 'rise', at: 0.85, dur: 0.6 } },
      { role: 'contact', x: 0.115, y: 0.075, w: 0.82, size: CONTACT, weight: 600, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'report-cover',
    look: { palette: 'paper-ink', type: 'editorial' },
    label: 'Report Cover',
    desc: 'Annual-report restraint - year, title, one rule',
    use: 'business', industries: ['Professional Services', 'Education & Community'],
    styles: ['editorial', 'elegant', 'premium'], tags: ['report', 'cover', 'annual', 'document'],
    mood: 'luxe', scheme: 'light', font: 'serif',
    surface: { kind: 'frame', frame: 0.045 },
    shapes: [
      { kind: 'rect', x: 0.12, y: 0.455, w: 0.2, h: 0.004, tone: 'accent' },
      { kind: 'rect', x: 0, y: 0.78, w: 1, h: 0.22, tone: 'secondary', alpha: 0.08 },
    ],
    slots: [
      { role: 'brand', x: 0.12, y: 0.13, w: 0.5, size: 0.028, weight: 700, upper: true, tracking: 0.2, font: 'sans', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.12, y: 0.24, w: 0.5, size: 0.05, weight: 400, tone: 'accent', font: 'sans', motion: { in: 'rise', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.12, y: 0.3, w: 0.74, size: 0.088, weight: 500, tracking: -0.015, motion: { in: 'rise', at: 0.4, dur: 0.65 } },
      { role: 'subline', x: 0.12, y: 0.51, w: 0.62, size: 0.032, tone: 'muted', font: 'sans', motion: { in: 'fade', at: 0.75, dur: 0.55 } },
      { role: 'stats', x: 0.12, y: 0.83, w: 0.76, size: 0.04, direction: 'row', align: 'left', max: 3, font: 'sans', motion: { in: 'rise', at: 0.95, dur: 0.55 } },
      { role: 'meta', x: 0.12, y: 0.075, w: 0.6, size: META, tone: 'muted', font: 'sans', fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.45 } },
    ],
  },

  // --- social promo posts ----------------------------------------------------
  //
  // The flyers above are what a business hands someone. These are what it posts
  // on a Tuesday: a discount, a price list, a countdown, a giveaway, a review.
  // They are square-first because that is where they live, and they lean on the
  // 'disc' badge and the 'price' rows rather than long-form copy.

  {
    key: 'flash-sale',
    look: { palette: 'carnival', type: 'street', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Flash Sale',
    desc: 'The discount is a badge and nothing competes with it',
    use: 'marketing', industries: ['Retail & Commerce', 'Fashion & Beauty'],
    styles: ['bold', 'high-contrast', 'street'], tags: ['sale', 'discount', 'percent', 'flash', 'weekend'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 150, intensity: 0.6, vignette: 0.22 },
    shapes: [
      { kind: 'wedge', corner: 'tl', w: 0.4, h: 0.16, tone: 'accent', alpha: 0.18 },
      { kind: 'rect', x: 0, y: 0.9, w: 1, h: 0.1, tone: 'black', alpha: 0.35 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.19, w: 0.55, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.28, w: 0.56, size: 0.086, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.35, dur: 0.55 } },
      // The badge: a disc whose diameter is this slot's width.
      { role: 'cta', x: 0.63, y: 0.3, w: 0.29, size: 0.05, weight: 800, align: 'center', upper: true, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.55, dur: 0.5 } },
      { role: 'subline', x: 0.08, y: 0.56, w: 0.72, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.8, dur: 0.5 } },
      { role: 'meta', x: 0.08, y: 0.68, w: 0.6, size: META, upper: true, tracking: 0.1, treatment: 'bar', tone: 'accent', motion: { in: 'wipe', at: 1, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.055, w: 0.84, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'price-list',
    look: { palette: 'cola-nut', type: 'modern' },
    label: 'Price List',
    desc: 'Menu-style rows, leader rules, prices right',
    use: 'industry', industries: ['Food & Hospitality', 'Home & Personal Services'],
    styles: ['editorial', 'minimal'], tags: ['menu', 'price list', 'rates', 'laundry', 'salon'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.36, vignette: 0.32 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.985, w: 0.7, h: 0.015, tone: 'primary' },
      { kind: 'rect', x: 0.7, y: 0.985, w: 0.3, h: 0.015, tone: 'secondary' },
    ],
    extraPages: [{
      name: 'Page 2',
      slots: [
        { role: 'headline', x: 0.08, y: 0.12, w: 0.84, size: 0.058, weight: 700, motion: { in: 'rise', at: 0, dur: 0.5 } },
        { role: 'price', x: 0.08, y: 0.26, w: 0.84, size: 0.034, motion: { in: 'rise', at: 0.2, dur: 0.6 } },
        { role: 'contact', x: 0.08, y: 0.1, w: 0.84, size: 0.026, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      ],
    }],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.16, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.205, w: 0.8, size: 0.072, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.3, dur: 0.55 } },
      { role: 'price', x: 0.1, y: 0.35, w: 0.8, size: 0.031, weight: 600, gap: 2.1, max: 5, motion: { in: 'rise', at: 0.55, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.2, w: 0.54, size: 0.03, weight: 700, treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1.05, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.085, w: 0.84, size: CONTACT, weight: 600, tone: 'muted', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'price-drop',
    label: 'Price Drop',
    desc: 'Was and now, with the old price struck out',
    use: 'marketing', industries: ['Retail & Commerce'],
    styles: ['bold', 'high-contrast'], tags: ['was now', 'reduced', 'discount', 'price'],
    mood: 'bold', scheme: 'light', font: 'sans',
    surface: { kind: 'solid' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.14, tone: 'accent', alpha: 0.95 },
      { kind: 'circle', cx: 0.85, cy: 0.62, r: 0.13, tone: 'accent', alpha: 0.14 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.045, w: 0.5, size: 0.026, weight: 800, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.25, w: 0.76, size: 0.072, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.32, dur: 0.55 } },
      { role: 'subline', x: 0.08, y: 0.43, w: 0.7, size: 0.03, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.45 } },
      // The was/now pair goes through the price row rather than a struck meta
      // slot. Overloading meta meant that any content WITHOUT a price — which
      // is what a generic caller passes — rendered a struck-through sentence.
      // A price slot with no price data simply draws nothing.
      { role: 'price', x: 0.08, y: 0.55, w: 0.84, size: 0.046, weight: 700, gap: 2.1, max: 2, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
      { role: 'cta', x: 0.08, y: 0.22, w: 0.52, size: 0.03, weight: 700, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.09, w: 0.84, size: CONTACT, weight: 600, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'countdown-post',
    photoLed: true,
    label: 'Countdown',
    desc: 'Days to go, huge — then where and when',
    use: 'event',
    styles: ['street', 'bold', 'youth'], tags: ['countdown', 'days to go', 'launch', 'opening'],
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'gradient', angle: 170, intensity: 0.55, vignette: 0.3 },
    shapes: [
      { kind: 'wedge', corner: 'br', w: 0.58, h: 0.28, tone: 'accent', alpha: 0.18 },
      { kind: 'rect', x: 0.08, y: 0.355, w: 0.16, h: 0.008, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.6, size: EYEBROW, upper: true, tracking: 0.24, tone: 'accent', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.42, w: 0.84, size: HEAD_HERO, weight: 800, upper: true, tracking: -0.03, motion: { in: 'pop', at: 0.4, dur: 0.55 } },
      { role: 'subline', x: 0.08, y: 0.63, w: 0.72, size: 0.034, weight: 700, upper: true, tracking: 0.08, motion: { in: 'wipe', at: 0.75, dur: 0.5 } },
      { role: 'meta', x: 0.08, y: 0.72, w: 0.66, size: META, tone: 'muted', motion: { in: 'fade', at: 0.95, dur: 0.45 } },
      { role: 'cta', x: 0.08, y: 0.2, w: 0.56, size: 0.03, weight: 800, upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1.1, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.09, w: 0.84, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'giveaway-steps',
    label: 'Giveaway',
    desc: 'Numbered steps to enter, prize up top',
    use: 'social',
    styles: ['playful', 'bold', 'youth'], tags: ['giveaway', 'competition', 'win', 'steps'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 200, intensity: 0.52, vignette: 0.24 },
    shapes: [
      { kind: 'circle', cx: 0.12, cy: 0.12, r: 0.09, tone: 'accent', alpha: 0.22 },
      { kind: 'circle', cx: 0.9, cy: 0.2, r: 0.06, tone: 'accent', alpha: 0.3 },
      { kind: 'rect', x: 0.06, y: 0.47, w: 0.88, h: 0.34, tone: 'white', alpha: 0.07, radius: 0.035 },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.085, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.6, size: EYEBROW, upper: true, tracking: 0.24, tone: 'accent', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.08, y: 0.25, w: 0.8, size: 0.082, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.32, dur: 0.55 } },
      { role: 'subline', x: 0.08, y: 0.42, w: 0.74, size: 0.03, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.45 } },
      { role: 'services', x: 0.1, y: 0.52, w: 0.78, size: LIST, weight: 700, bullet: 'number', gap: 2.15, max: 3, motion: { in: 'rise', at: 0.75, dur: 0.6 } },
      { role: 'meta', x: 0.08, y: 0.19, w: 0.7, size: META, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 1.05, dur: 0.45 } },
      { role: 'contact', x: 0.08, y: 0.09, w: 0.84, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'testimonial-card',
    look: { palette: 'paper-ink', type: 'editorial', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Client Review',
    desc: 'A quote, who said it, and a rating',
    use: 'marketing',
    styles: ['soft', 'elegant', 'editorial'], tags: ['review', 'testimonial', 'customer', 'quote', 'stars'],
    mood: 'warm', scheme: 'light', font: 'serif',
    surface: { kind: 'solid' },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.06, h: 1, tone: 'accent', alpha: 0.9 },
      { kind: 'circle', cx: 0.86, cy: 0.16, r: 0.1, tone: 'secondary', alpha: 0.12 },
    ],
    slots: [
      { role: 'brand', x: 0.13, y: 0.09, w: 0.5, size: 0.026, weight: 800, upper: true, tracking: 0.18, font: 'sans', motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.13, y: 0.2, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, font: 'sans', motion: { in: 'rise', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.13, y: 0.27, w: 0.76, size: 0.062, weight: 500, tracking: -0.01, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.13, y: 0.6, w: 0.66, size: 0.03, weight: 700, upper: true, tracking: 0.1, font: 'sans', motion: { in: 'fade', at: 0.8, dur: 0.5 } },
      { role: 'meta', x: 0.13, y: 0.67, w: 0.6, size: META, tone: 'muted', font: 'sans', motion: { in: 'fade', at: 0.95, dur: 0.45 } },
      { role: 'stats', x: 0.13, y: 0.8, w: 0.74, size: 0.028, direction: 'row', align: 'left', max: 3, font: 'sans', motion: { in: 'rise', at: 1.05, dur: 0.5 } },
      { role: 'contact', x: 0.13, y: 0.075, w: 0.8, size: CONTACT, weight: 600, direction: 'row', max: 3, fromBottom: true, font: 'sans', motion: { in: 'fade', at: 1.25, dur: 0.4 } },
    ],
  },
  {
    key: 'coming-soon',
    look: { palette: 'twilight-pastel', type: 'statement', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Coming Soon',
    desc: 'One promise, a date, and room to breathe',
    use: 'marketing', industries: ['Technology & Media', 'Retail & Commerce'],
    styles: ['minimal', 'modern', 'premium'], tags: ['coming soon', 'launch', 'teaser', 'opening'],
    mood: 'minimal', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.42, vignette: 0.36 },
    shapes: [
      { kind: 'ring', cx: 0.5, cy: 0.5, r: 0.34, tone: 'accent', alpha: 0.25, thickness: 0.004 },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.09, w: 0.8, size: 0.026, align: 'center', weight: 800, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.15, y: 0.38, w: 0.7, size: EYEBROW, align: 'center', upper: true, tracking: 0.3, tone: 'accent', motion: { in: 'rise', at: 0.3, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.44, w: 0.8, size: 0.088, weight: 800, align: 'center', tracking: -0.03, upper: true, motion: { in: 'pop', at: 0.45, dur: 0.55 } },
      { role: 'subline', x: 0.15, y: 0.62, w: 0.7, size: 0.03, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.8, dur: 0.5 } },
      { role: 'meta', x: 0.25, y: 0.28, w: 0.5, size: META, align: 'center', treatment: 'pill', fromBottom: true, motion: { in: 'pop', at: 1, dur: 0.45 } },
      { role: 'contact', x: 0.1, y: 0.09, w: 0.8, size: CONTACT, weight: 600, tone: 'muted', direction: 'row', max: 3, align: 'center', fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  // --- new archetypes ---------------------------------------------------------
  //
  // The first 27 covered posters, promos and service lists well and covered
  // almost nothing else. These are the layouts a real business asked for and
  // could not find: a property listing, a before-and-after, opening hours, a
  // vacancy, a certificate. Each one is a JOB rather than a look — which is why
  // they are tagged by use and industry, and why the eight styles in
  // design/styles.ts do the work of making each one feel different.

  {
    key: 'property-listing',
    look: { palette: 'graphite', type: 'modern', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Property Listing',
    desc: 'Price badge, spec strip, address — a listing that reads at a glance',
    use: 'industry', industries: ['Professional Services', 'Retail & Commerce'],
    styles: ['luxury', 'editorial', 'premium', 'elegant'], tags: ['property', 'real estate', 'house', 'rent', 'for sale', 'apartment', 'land', 'listing'],
    mood: 'luxe', scheme: 'dark', font: 'serif',
    surface: { kind: 'spotlight', intensity: 0.4, vignette: 0.44 },
    // Every property film pushes in. It is the grammar of the genre.
    camera: { move: 'push', amount: 0.045 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.78, w: 1, h: 0.22, tone: 'black', alpha: 0.42 },
      { kind: 'rect', x: 0.06, y: 0.07, w: 0.3, h: 0.008, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.09, w: 0.5, size: 0.028, weight: 700, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.06, y: 0.17, w: 0.6, size: EYEBROW, upper: true, tracking: 0.24, tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.06, y: 0.24, w: 0.7, size: 0.078, weight: 700, tracking: -0.025, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      // The price is the badge. Nothing on a listing gets looked at first.
      { role: 'cta', x: 0.66, y: 0.09, w: 0.28, size: 0.038, weight: 800, align: 'center', treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.5, dur: 0.5 } },
      { role: 'stats', x: 0.06, y: 0.55, w: 0.86, size: STAT, direction: 'row', max: 4, motion: { in: 'rise', at: 0.7, dur: 0.55 } },
      { role: 'subline', x: 0.06, y: 0.155, w: 0.62, size: SUB, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 0.95, dur: 0.5 } },
      { role: 'contact', x: 0.06, y: 0.075, w: 0.6, size: CONTACT, weight: 600, direction: 'row', max: 2, fromBottom: true, motion: { in: 'fade', at: 1.15, dur: 0.4 } },
      { role: 'qr', x: 0.78, y: 0.075, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 1.2, dur: 0.45 } },
    ],
  },
  {
    key: 'before-after',
    photoLed: true,
    label: 'Before & After',
    desc: 'Split down the middle, one label each side',
    use: 'marketing', industries: ['Fashion & Beauty', 'Trades & Industry', 'Home & Personal Services', 'Logistics & Mobility'],
    styles: ['bold', 'high-contrast', 'modern'], tags: ['before', 'after', 'transformation', 'result', 'repair', 'clean', 'makeover', 'proof'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.35 },
    shapes: [
      // The divider is the design. A hard edge reads as two photographs even
      // when only one has been uploaded.
      { kind: 'rect', x: 0, y: 0, w: 0.5, h: 1, tone: 'black', alpha: 0.34 },
      { kind: 'rect', x: 0.497, y: 0, w: 0.006, h: 1, tone: 'accent' },
      { kind: 'circle', cx: 0.5, cy: 0.5, r: 0.085, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.07, w: 0.5, size: 0.026, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.06, y: 0.44, w: 0.34, size: 0.032, weight: 800, upper: true, align: 'center', tracking: 0.16, treatment: 'plain', motion: { in: 'slide-right', at: 0.3, dur: 0.5 } },
      { role: 'cta', x: 0.6, y: 0.44, w: 0.34, size: 0.032, weight: 800, upper: true, align: 'center', tracking: 0.16, tone: 'accent', motion: { in: 'slide-left', at: 0.3, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.24, w: 0.84, size: 0.056, weight: 800, align: 'center', tracking: -0.02, motion: { in: 'rise', at: 0.6, dur: 0.55 } },
      { role: 'subline', x: 0.12, y: 0.22, w: 0.76, size: SUB, align: 'center', tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 0.9, dur: 0.5 } },
      { role: 'contact', x: 0.08, y: 0.08, w: 0.84, size: CONTACT, weight: 700, align: 'center', direction: 'row', max: 3, fromBottom: true, motion: { in: 'rise', at: 1.1, dur: 0.45 } },
    ],
  },
  {
    key: 'opening-hours',
    look: { palette: 'red-earth', type: 'warmth', pattern: { key: 'dots', role: 'secondary', opacity: 0.06, scale: 0.06 } },
    label: 'Opening Hours',
    desc: 'A week of hours, laid out to be read from a doorway',
    use: 'business',
    styles: ['minimal', 'corporate', 'swiss', 'monochrome'], tags: ['hours', 'open', 'closed', 'times', 'schedule', 'trading', 'when', 'weekend'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'wash', intensity: 0.16, frame: 0.03 },
    shapes: [
      { kind: 'rect', x: 0.08, y: 0.31, w: 0.84, h: 0.005, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.1, w: 0.6, size: 0.034, weight: 800, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.08, y: 0.18, w: 0.6, size: EYEBROW, upper: true, tracking: 0.26, font: 'mono', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.22, w: 0.8, size: 0.062, weight: 800, tracking: -0.02, motion: { in: 'rise', at: 0.3, dur: 0.55 } },
      // Hours are a price list with times where the money goes: label left,
      // value right, leader between. Reusing the row engine rather than
      // inventing a second one.
      { role: 'price', x: 0.08, y: 0.38, w: 0.84, size: 0.03, weight: 600, gap: 1.9, max: 7, motion: { in: 'rise', at: 0.5, dur: 0.7 } },
      { role: 'contact', x: 0.08, y: 0.09, w: 0.84, size: CONTACT, weight: 600, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.15, dur: 0.4 } },
    ],
  },
  {
    key: 'vacancy',
    look: { palette: 'adire-clay', type: 'modern', pattern: { key: 'grid', role: 'primary', opacity: 0.05, scale: 0.08 } },
    label: 'We Are Hiring',
    desc: 'Role, requirements, and exactly how to apply',
    use: 'business', industries: ['Professional Services', 'Education & Community', 'Technology & Media'],
    styles: ['corporate', 'modern', 'bold'], tags: ['hiring', 'vacancy', 'job', 'recruit', 'apply', 'role', 'career', 'staff', 'wanted'],
    mood: 'bold', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'gradient', angle: 165, intensity: 0.7, vignette: 0.2 },
    shapes: [
      { kind: 'wedge', corner: 'tr', w: 0.42, h: 0.2, tone: 'accent', alpha: 0.2 },
      { kind: 'rect', x: 0.07, y: 0.9, w: 0.14, h: 0.006, tone: 'secondary' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.08, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.07, y: 0.17, w: 0.6, size: EYEBROW, upper: true, tracking: 0.24, treatment: 'pill', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.07, y: 0.25, w: 0.8, size: 0.07, weight: 800, tracking: -0.025, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'services', x: 0.07, y: 0.44, w: 0.8, size: LIST, gap: 1.5, bullet: 'check', max: 5, motion: { in: 'rise', at: 0.6, dur: 0.65 } },
      { role: 'cta', x: 0.07, y: 0.045, w: 0.6, size: 0.03, weight: 800, upper: true, tracking: 0.1, fromBottom: true, motion: { in: 'wipe', at: 1, dur: 0.5 } },
      { role: 'qr', x: 0.79, y: 0.16, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 1.15, dur: 0.45 } },
    ],
  },
  {
    key: 'pull-quote',
    photoLed: true,
    label: 'Pull Quote',
    desc: 'One sentence, set like a book, attributed underneath',
    use: 'social',
    styles: ['editorial', 'elegant', 'minimal', 'monochrome'], tags: ['quote', 'saying', 'wisdom', 'scripture', 'motivation', 'thought', 'words'],
    mood: 'editorial', scheme: 'light', font: 'editorial',
    surface: { kind: 'wash', intensity: 0.12, frame: 0.04 },
    shapes: [
      { kind: 'rect', x: 0.1, y: 0.3, w: 0.06, h: 0.006, tone: 'accent' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.16, w: 0.6, size: EYEBROW, upper: true, tracking: 0.26, tone: 'accent', font: 'mono', motion: { in: 'fade', at: 0.1, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.36, w: 0.8, size: 0.062, weight: 400, tracking: -0.02, motion: { in: 'blur', at: 0.3, dur: 0.8 } },
      { role: 'subline', x: 0.1, y: 0.72, w: 0.6, size: 0.028, weight: 700, upper: true, tracking: 0.12, motion: { in: 'rise', at: 0.9, dur: 0.5 } },
      { role: 'brand', x: 0.1, y: 0.1, w: 0.6, size: 0.024, weight: 600, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 1.1, dur: 0.45 } },
    ],
  },
  {
    key: 'team-intro',
    photoLed: true,
    label: 'Meet the Team',
    desc: 'A circular portrait frame, a name and what they do',
    use: 'business',
    styles: ['modern', 'corporate', 'soft'], tags: ['team', 'staff', 'meet', 'new', 'welcome', 'people', 'who we are', 'introduction'],
    mood: 'warm', scheme: 'dark', font: 'sans',
    surface: { kind: 'spotlight', intensity: 0.42, vignette: 0.3 },
    // Opens out from the portrait.
    camera: { move: 'pull', amount: 0.035 },
    shapes: [
      { kind: 'ring', cx: 0.5, cy: 0.36, r: 0.21, tone: 'accent', thickness: 0.008 },
      { kind: 'rect', x: 0.3, y: 0.63, w: 0.4, h: 0.004, tone: 'accent', alpha: 0.6 },
    ],
    slots: [
      { role: 'brand', x: 0.2, y: 0.07, w: 0.6, size: 0.026, weight: 800, upper: true, align: 'center', tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.2, y: 0.66, w: 0.6, size: EYEBROW, upper: true, align: 'center', tracking: 0.24, tone: 'accent', motion: { in: 'pop', at: 0.4, dur: 0.45 } },
      { role: 'headline', x: 0.1, y: 0.71, w: 0.8, size: 0.058, weight: 800, align: 'center', tracking: -0.02, motion: { in: 'rise', at: 0.55, dur: 0.55 } },
      { role: 'subline', x: 0.15, y: 0.17, w: 0.7, size: SUB, align: 'center', tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 0.85, dur: 0.5 } },
      { role: 'contact', x: 0.08, y: 0.07, w: 0.84, size: CONTACT, weight: 600, align: 'center', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.1, dur: 0.4 } },
    ],
  },
  {
    key: 'product-grid',
    label: 'New Arrivals',
    desc: 'A row of products with prices under a single headline',
    use: 'marketing', industries: ['Retail & Commerce', 'Fashion & Beauty'],
    styles: ['fashion', 'modern', 'editorial', 'premium'], tags: ['products', 'new arrivals', 'stock', 'collection', 'catalogue', 'shop', 'range'],
    mood: 'editorial', scheme: 'light', font: 'grotesk',
    surface: { kind: 'wash', intensity: 0.14 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.045, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.1, w: 0.5, size: 0.03, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.07, y: 0.17, w: 0.6, size: EYEBROW, upper: true, tracking: 0.24, tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.07, y: 0.22, w: 0.78, size: 0.066, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.3, dur: 0.55 } },
      // A price row per product. `direction: 'row'` lays them across, which is
      // what makes this read as a shelf rather than a menu.
      { role: 'price', x: 0.07, y: 0.42, w: 0.86, size: 0.026, weight: 700, direction: 'row', max: 3, motion: { in: 'rise', at: 0.55, dur: 0.6 } },
      { role: 'cta', x: 0.07, y: 0.2, w: 0.5, size: 0.03, weight: 800, upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 0.9, dur: 0.45 } },
      { role: 'contact', x: 0.07, y: 0.08, w: 0.86, size: CONTACT, weight: 600, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.1, dur: 0.4 } },
    ],
  },
  {
    key: 'order-delivery',
    look: { palette: 'lagoon', type: 'street' },
    label: 'Order & Delivery',
    desc: 'Big WhatsApp call to action with the delivery area under it',
    use: 'industry', industries: ['Food & Hospitality', 'Logistics & Mobility', 'Local & Everyday Business'],
    styles: ['bold', 'playful', 'high-contrast'], tags: ['order', 'delivery', 'whatsapp', 'call', 'takeaway', 'dispatch', 'we deliver', 'call now'],
    mood: 'warm', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 200, intensity: 0.8, vignette: 0.22 },
    shapes: [
      { kind: 'circle', cx: 0.86, cy: 0.14, r: 0.13, tone: 'accent', alpha: 0.22 },
      { kind: 'rect', x: 0.06, y: 0.58, w: 0.88, h: 0.16, tone: 'white', alpha: 0.1, radius: 0.04 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.09, w: 0.5, size: 0.03, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.07, y: 0.19, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.07, y: 0.28, w: 0.8, size: 0.076, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'cta', x: 0.1, y: 0.62, w: 0.8, size: 0.044, weight: 800, align: 'center', upper: true, tracking: 0.06, motion: { in: 'pop', at: 0.65, dur: 0.55 } },
      { role: 'subline', x: 0.07, y: 0.2, w: 0.7, size: SUB, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 0.95, dur: 0.5 } },
      { role: 'contact', x: 0.07, y: 0.08, w: 0.86, size: CONTACT, weight: 700, direction: 'row', max: 3, fromBottom: true, motion: { in: 'rise', at: 1.15, dur: 0.45 } },
    ],
  },
  {
    key: 'certificate',
    label: 'Certificate',
    desc: 'Awarded to, with a rule for the signature',
    use: 'business', industries: ['Education & Community', 'Professional Services'],
    styles: ['elegant', 'luxury', 'editorial', 'premium'], tags: ['certificate', 'award', 'completion', 'training', 'course', 'recognition', 'appreciation', 'graduation'],
    mood: 'luxe', scheme: 'light', font: 'serif',
    surface: { kind: 'frame', intensity: 0.1, frame: 0.045 },
    shapes: [
      { kind: 'ring', cx: 0.5, cy: 0.2, r: 0.062, tone: 'accent', thickness: 0.005 },
      { kind: 'rect', x: 0.28, y: 0.79, w: 0.44, h: 0.004, tone: 'ink', alpha: 0.5 },
    ],
    slots: [
      { role: 'brand', x: 0.2, y: 0.31, w: 0.6, size: 0.026, weight: 700, upper: true, align: 'center', tracking: 0.24, tone: 'muted', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.2, y: 0.38, w: 0.6, size: EYEBROW, upper: true, align: 'center', tracking: 0.3, tone: 'accent', font: 'mono', motion: { in: 'fade', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.45, w: 0.8, size: 0.07, weight: 400, align: 'center', tracking: -0.015, motion: { in: 'blur', at: 0.4, dur: 0.8 } },
      { role: 'subline', x: 0.15, y: 0.62, w: 0.7, size: 0.028, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.9, dur: 0.5 } },
      { role: 'meta', x: 0.28, y: 0.15, w: 0.44, size: META, align: 'center', tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 1.1, dur: 0.45 } },
    ],
  },
  {
    key: 'company-profile',
    look: { palette: 'navy-mono', type: 'modern' },
    label: 'Company Profile',
    desc: 'Cover for a profile or media kit, services down the side',
    use: 'business', industries: ['Professional Services', 'Technology & Media', 'Trades & Industry'],
    styles: ['corporate', 'swiss', 'minimal', 'premium'], tags: ['company profile', 'media kit', 'about us', 'capability', 'introduction', 'cover', 'document', 'proposal'],
    mood: 'minimal', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'gradient', angle: 190, intensity: 0.55, vignette: 0.26 },
    shapes: [
      { kind: 'rect', x: 0.62, y: 0, w: 0.38, h: 1, tone: 'white', alpha: 0.06 },
      { kind: 'rect', x: 0.07, y: 0.2, w: 0.16, h: 0.006, tone: 'accent' },
    ],
    extraPages: [{
      name: 'Inside',
      slots: [
        { role: 'eyebrow', x: 0.08, y: 0.1, w: 0.6, size: 0.026, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'fade', at: 0, dur: 0.4 } },
        { role: 'headline', x: 0.08, y: 0.17, w: 0.84, size: 0.055, weight: 700, motion: { in: 'rise', at: 0.1, dur: 0.5 } },
        { role: 'services', x: 0.08, y: 0.32, w: 0.84, size: 0.03, motion: { in: 'rise', at: 0.3, dur: 0.6 } },
        { role: 'contact', x: 0.08, y: 0.1, w: 0.84, size: 0.026, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
      ],
    }],
    slots: [
      { role: 'brand', x: 0.07, y: 0.1, w: 0.5, size: 0.032, weight: 700, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.07, y: 0.26, w: 0.5, size: EYEBROW, upper: true, tracking: 0.26, tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.07, y: 0.34, w: 0.5, size: 0.062, weight: 700, tracking: -0.025, motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.07, y: 0.62, w: 0.48, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.7, dur: 0.5 } },
      { role: 'services', x: 0.66, y: 0.24, w: 0.28, size: 0.026, gap: 1.7, bullet: 'bar', max: 6, motion: { in: 'slide-left', at: 0.55, dur: 0.7 } },
      { role: 'contact', x: 0.07, y: 0.09, w: 0.5, size: CONTACT, weight: 600, direction: 'column', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.1, dur: 0.4 } },
      { role: 'qr', x: 0.8, y: 0.09, w: 0.14, fromBottom: true, motion: { in: 'pop', at: 1.2, dur: 0.45 } },
    ],
  },
  {
    key: 'event-lineup',
    look: { palette: 'indigo-dye', type: 'statement', pattern: { key: 'rings', role: 'secondary', opacity: 0.06, scale: 0.3 }, duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Event Lineup',
    desc: 'Numbered lineup with the date and venue pinned to the base',
    use: 'event', industries: ['Arts & Entertainment', 'Education & Community'],
    styles: ['street', 'bold', 'afro-modern', 'youth'], tags: ['event', 'lineup', 'festival', 'concert', 'programme', 'schedule', 'acts', 'agenda', 'conference'],
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'spotlight', intensity: 0.85, vignette: 0.5 },
    // Fast horizontal energy, against the diagonal stripe.
    camera: { move: 'pan-left', amount: 0.06 },
    shapes: [
      // Above the headline, not across it. A rotated bar sweeps a band of the
      // canvas far taller than its own height, which is what the catalogue's
      // shape-clearance test caught the first time this was placed at 0.22.
      { kind: 'stripe', x: -0.1, y: 0.155, w: 1.3, h: 0.02, angle: -6, tone: 'accent', alpha: 0.85 },
      { kind: 'rect', x: 0, y: 0.84, w: 1, h: 0.16, tone: 'black', alpha: 0.5 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.08, w: 0.6, size: 0.03, weight: 700, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'headline', x: 0.07, y: 0.3, w: 0.86, size: 0.1, weight: 400, upper: true, tracking: 0.01, motion: { in: 'wipe', at: 0.25, dur: 0.6 } },
      { role: 'services', x: 0.07, y: 0.45, w: 0.7, size: 0.034, gap: 1.4, bullet: 'number', max: 5, motion: { in: 'rise', at: 0.55, dur: 0.75 } },
      { role: 'eyebrow', x: 0.07, y: 0.12, w: 0.5, size: 0.03, upper: true, tracking: 0.2, treatment: 'bar', tone: 'accent', fromBottom: true, motion: { in: 'wipe', at: 1, dur: 0.5 } },
      { role: 'meta', x: 0.07, y: 0.065, w: 0.6, size: META, upper: true, tracking: 0.12, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
      { role: 'qr', x: 0.8, y: 0.07, w: 0.13, fromBottom: true, motion: { in: 'pop', at: 1.25, dur: 0.45 } },
    ],
  },
  {
    key: 'swiss-grid',
    look: { palette: 'sun-and-ink', type: 'impact' },
    label: 'Swiss Grid',
    desc: 'Hard grid, one rule, everything aligned left',
    use: 'business', industries: ['Technology & Media', 'Professional Services', 'Arts & Entertainment'],
    styles: ['swiss', 'minimal', 'monochrome', 'high-contrast', 'tech'], tags: ['swiss', 'grid', 'international', 'typographic', 'brutalist', 'studio', 'agency', 'portfolio'],
    mood: 'minimal', scheme: 'light', font: 'heavy',
    surface: { kind: 'solid', intensity: 0.04 },
    shapes: [
      { kind: 'rect', x: 0.08, y: 0.135, w: 0.84, h: 0.006, tone: 'ink' },
      { kind: 'rect', x: 0.08, y: 0.7, w: 0.84, h: 0.006, tone: 'ink' },
      { kind: 'rect', x: 0.08, y: 0.72, w: 0.2, h: 0.1, tone: 'secondary' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.4, size: 0.026, weight: 400, upper: true, tracking: 0.2, font: 'mono', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'meta', x: 0.6, y: 0.08, w: 0.32, size: META, align: 'right', upper: true, tracking: 0.14, font: 'mono', tone: 'muted', motion: { in: 'fade', at: 0.1, dur: 0.4 } },
      { role: 'headline', x: 0.08, y: 0.2, w: 0.84, size: 0.108, weight: 400, upper: true, tracking: -0.04, motion: { in: 'slide-right', at: 0.25, dur: 0.65 } },
      { role: 'subline', x: 0.08, y: 0.55, w: 0.56, size: SUB, tone: 'muted', motion: { in: 'rise', at: 0.6, dur: 0.55 } },
      { role: 'eyebrow', x: 0.34, y: 0.235, w: 0.3, size: EYEBROW, upper: true, tracking: 0.24, tone: 'secondary', font: 'mono', fromBottom: true, motion: { in: 'wipe', at: 0.85, dur: 0.5 } },
      { role: 'contact', x: 0.34, y: 0.1, w: 0.58, size: CONTACT, weight: 400, font: 'mono', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.05, dur: 0.4 } },
    ],
  },
  // --- modern promo ------------------------------------------------------------
  //
  // The promo layouts we had were the loud kind: a burst, a disc badge, a
  // countdown. They work, and they all look like 2015. These are the shapes a
  // sale actually takes on a feed now — hard diagonals, a numeral used as the
  // whole composition, stacked panels, a rotated sticker, a full-bleed frame.
  //
  // Every one of them is built from the same five primitives the catalogue
  // already had (wedge, rect, circle, ring, stripe). None of this needed a new
  // renderer; it needed somebody to compose with what was there.

  {
    key: 'promo-mega-number',
    look: { palette: 'royal-orange', type: 'impact', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Mega Number',
    desc: 'The discount is the entire layout',
    use: 'marketing', industries: ['Retail & Commerce', 'Fashion & Beauty', 'Food & Hospitality'],
    styles: ['bold', 'high-contrast', 'modern', 'youth'], tags: ['sale', 'discount', 'percent', 'off', 'promo', 'offer', 'clearance'],
    mood: 'bold', scheme: 'dark', font: 'heavy',
    surface: { kind: 'solid', intensity: 1 },
    shapes: [
      { kind: 'rect', x: 0.07, y: 0.9, w: 0.14, h: 0.006, tone: 'accent' },
      { kind: 'circle', cx: 0.86, cy: 0.14, r: 0.1, tone: 'secondary', alpha: 0.3 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.08, w: 0.5, size: 0.028, weight: 400, upper: true, tracking: 0.2, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.16, w: 0.55, size: EYEBROW, upper: true, tracking: 0.24, font: 'mono', motion: { in: 'wipe', at: 0.18, dur: 0.45 } },
      // 0.2 of the short edge. Nothing else on the canvas competes, and nothing
      // is allowed to sit inside its box.
      { role: 'headline', x: 0.06, y: 0.3, w: 0.88, size: 0.2, weight: 400, upper: true, tracking: -0.05, motion: { in: 'scale-out', at: 0.3, dur: 0.6, ease: 'spring' } },
      /*
       * Lowered from 0.62. This template sets its headline at 0.2 of the short
       * edge — 216px on a square — because it exists for "50% OFF". A headline
       * of ordinary length therefore needs three lines even after fitting, and
       * 0.32 of room held two. The type stays mega; the room now matches it.
       */
      { role: 'subline', x: 0.07, y: 0.78, w: 0.72, size: SUB, tone: 'muted', motion: { in: 'rise', at: 0.75, dur: 0.5 } },
      { role: 'cta', x: 0.07, y: 0.045, w: 0.6, size: 0.032, weight: 400, upper: true, tracking: 0.12, fromBottom: true, motion: { in: 'slide-right', at: 0.95, dur: 0.5 } },
    ],
  },
  {
    key: 'promo-diagonal',
    label: 'Diagonal Cut',
    desc: 'One hard diagonal, offer above and details below',
    use: 'marketing', industries: ['Retail & Commerce', 'Logistics & Mobility', 'Trades & Industry'],
    styles: ['modern', 'bold', 'tech', 'high-contrast'], tags: ['sale', 'offer', 'launch', 'promo', 'new', 'deal', 'diagonal'],
    mood: 'bold', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'gradient', angle: 160, intensity: 0.85 },
    shapes: [
      { kind: 'wedge', corner: 'br', w: 1, h: 0.46, tone: 'black', alpha: 0.4 },
      // The wedge already IS the diagonal. A rotated stripe on top of it swept
      // a band far taller than its own height straight through the headline —
      // which the catalogue's shape-clearance test caught immediately.
      { kind: 'rect', x: 0.07, y: 0.245, w: 0.12, h: 0.006, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.08, w: 0.5, size: 0.03, weight: 700, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.18, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      /*
        ── MADE TO MATCH ITS OWN NAME ─────────────────────────────────────

        MEASURED: this shared a signature with `product-grid` — same anchor,
        same md/heavy headline, same pill. It is called Diagonal Cut and its
        wedge runs bottom-right, but nothing in the type followed the
        diagonal: the headline sat in the same place as every other promo and
        the prices ran down the LEFT, against the wedge rather than with it.

        Now the eye travels the way the artwork does — oversized uppercase
        claim at the top-left, prices landing inside the wedge at the
        bottom-right. The composition and the shape finally agree.
      */
      { role: 'headline', x: 0.07, y: 0.27, w: 0.74, size: 0.135, weight: 800, upper: true, tracking: -0.04, motion: { in: 'slide-right', at: 0.32, dur: 0.55 } },
      { role: 'price', x: 0.46, y: 0.63, w: 0.47, size: 0.028, weight: 700, align: 'right', gap: 1.9, max: 3, motion: { in: 'rise', at: 0.65, dur: 0.6 } },
      { role: 'cta', x: 0.62, y: 0.2, w: 0.31, size: 0.03, weight: 700, align: 'center', upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 0.95, dur: 0.5 } },
      { role: 'contact', x: 0.07, y: 0.07, w: 0.5, size: CONTACT, weight: 600, direction: 'row', max: 2, fromBottom: true, motion: { in: 'fade', at: 1.15, dur: 0.4 } },
    ],
  },
  {
    key: 'promo-sticker',
    photoLed: true,
    label: 'Sticker',
    desc: 'A rotated offer sticker over a plain field',
    use: 'marketing', industries: ['Food & Hospitality', 'Retail & Commerce', 'Local & Everyday Business'],
    styles: ['playful', 'youth', 'street', 'bold'], tags: ['sticker', 'sale', 'offer', 'today only', 'special', 'promo', 'fun'],
    mood: 'street', scheme: 'light', font: 'condensed',
    surface: { kind: 'wash', intensity: 0.22 },
    shapes: [
      /*
       * The sticker is a BADGE, not a disc behind the headline.
       *
       * The first version centred a filled accent circle under the headline,
       * which is the obvious way to draw a sticker and is unsafe: styleColours
       * guarantees the ink is readable on the BASE, never on the accent. So on
       * some brand colours that headline would have been dark type on a dark
       * disc. The shape-clearance test refused it, correctly.
       */
      { kind: 'circle', cx: 0.78, cy: 0.19, r: 0.145, tone: 'accent' },
      { kind: 'ring', cx: 0.78, cy: 0.19, r: 0.168, tone: 'ink', alpha: 0.22, thickness: 0.004 },
      { kind: 'stripe', x: 0.1, y: 0.83, w: 0.8, h: 0.014, angle: -3, tone: 'ink', alpha: 0.85 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.09, w: 0.5, size: 0.03, weight: 400, upper: true, tracking: 0.24, motion: { in: 'fade', at: 0, dur: 0.4 } },
      // Inside the badge. Short copy only — it is a stamp, not a sentence.
      { role: 'cta', x: 0.665, y: 0.165, w: 0.23, size: 0.038, weight: 400, upper: true, align: 'center', tracking: 0.02, tone: 'onSurface', motion: { in: 'pop', at: 0.3, dur: 0.55, ease: 'elastic' } },
      { role: 'eyebrow', x: 0.07, y: 0.42, w: 0.5, size: 0.026, upper: true, tracking: 0.2, tone: 'accent', motion: { in: 'drop', at: 0.35, dur: 0.45 } },
      { role: 'headline', x: 0.07, y: 0.48, w: 0.78, size: 0.096, weight: 400, upper: true, tracking: 0, motion: { in: 'rise', at: 0.45, dur: 0.55 } },
      { role: 'subline', x: 0.07, y: 0.72, w: 0.7, size: SUB, motion: { in: 'rise', at: 0.8, dur: 0.5 } },
      { role: 'contact', x: 0.1, y: 0.075, w: 0.8, size: CONTACT, weight: 400, align: 'center', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.05, dur: 0.4 } },
    ],
  },
  {
    key: 'promo-stack',
    label: 'Panel Stack',
    desc: 'Layered translucent panels, offer on the top card',
    use: 'marketing', industries: ['Technology & Media', 'Professional Services', 'Health & Wellness'],
    styles: ['modern', 'premium', 'tech', 'soft'], tags: ['offer', 'plan', 'bundle', 'launch', 'app', 'subscription', 'glass'],
    mood: 'minimal', scheme: 'dark', font: 'grotesk',
    surface: { kind: 'spotlight', intensity: 0.55, vignette: 0.3 },
    shapes: [
      { kind: 'rect', x: 0.12, y: 0.28, w: 0.76, h: 0.5, tone: 'white', alpha: 0.06, radius: 0.05 },
      { kind: 'rect', x: 0.09, y: 0.32, w: 0.82, h: 0.5, tone: 'white', alpha: 0.09, radius: 0.05 },
      { kind: 'rect', x: 0.06, y: 0.36, w: 0.88, h: 0.5, tone: 'white', alpha: 0.13, radius: 0.05 },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.09, w: 0.5, size: 0.028, weight: 700, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.45 } },
      { role: 'eyebrow', x: 0.07, y: 0.18, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.07, y: 0.23, w: 0.7, size: 0.062, weight: 700, tracking: -0.025, motion: { in: 'rise', at: 0.3, dur: 0.55 } },
      { role: 'services', x: 0.11, y: 0.42, w: 0.72, size: LIST, gap: 1.6, bullet: 'check', max: 4, motion: { in: 'rise', at: 0.55, dur: 0.7 } },
      { role: 'cta', x: 0.11, y: 0.16, w: 0.5, size: 0.032, weight: 700, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 1, dur: 0.5 } },
      { role: 'meta', x: 0.11, y: 0.09, w: 0.6, size: META, tone: 'muted', font: 'mono', fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'promo-frame',
    photoLed: true,
    label: 'Bold Frame',
    desc: 'Thick accent border, everything inside it',
    use: 'marketing',
    styles: ['bold', 'swiss', 'high-contrast', 'monochrome'], tags: ['offer', 'notice', 'announcement', 'sale', 'poster', 'frame', 'border'],
    mood: 'bold', scheme: 'light', font: 'heavy',
    surface: { kind: 'solid', intensity: 0.05 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.035, tone: 'accent' },
      { kind: 'rect', x: 0, y: 0.965, w: 1, h: 0.035, tone: 'accent' },
      { kind: 'rect', x: 0, y: 0, w: 0.035, h: 1, tone: 'accent' },
      { kind: 'rect', x: 0.965, y: 0, w: 0.035, h: 1, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.11, w: 0.5, size: 0.026, weight: 400, upper: true, tracking: 0.22, font: 'mono', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.1, y: 0.2, w: 0.6, size: EYEBROW, upper: true, tracking: 0.26, tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.3, w: 0.8, size: 0.098, weight: 400, upper: true, tracking: -0.04, motion: { in: 'mask-up', at: 0.3, dur: 0.6 } },
      { role: 'subline', x: 0.1, y: 0.66, w: 0.66, size: SUB, tone: 'muted', motion: { in: 'rise', at: 0.7, dur: 0.55 } },
      { role: 'cta', x: 0.1, y: 0.2, w: 0.52, size: 0.034, weight: 400, upper: true, tracking: 0.06, treatment: 'panel', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 0.95, dur: 0.5 } },
      { role: 'contact', x: 0.1, y: 0.1, w: 0.8, size: CONTACT, weight: 400, font: 'mono', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.15, dur: 0.4 } },
    ],
  },
  {
    key: 'promo-ticker',
    label: 'Ticker Band',
    desc: 'Repeating band top and bottom, offer between',
    use: 'marketing', industries: ['Retail & Commerce', 'Arts & Entertainment', 'Food & Hospitality'],
    styles: ['street', 'youth', 'bold', 'afro-modern'], tags: ['sale', 'now on', 'promo', 'urgent', 'today', 'band', 'marquee', 'drop'],
    mood: 'street', scheme: 'dark', font: 'condensed',
    surface: { kind: 'solid', intensity: 0.9 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.13, w: 1, h: 0.075, tone: 'accent' },
      { kind: 'rect', x: 0, y: 0.795, w: 1, h: 0.075, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.06, y: 0.055, w: 0.6, size: 0.03, weight: 400, upper: true, tracking: 0.24, motion: { in: 'fade', at: 0, dur: 0.4 } },
      // Sits inside the top band, so it is the band's own text rather than
      // something floating over it.
      { role: 'eyebrow', x: 0.06, y: 0.148, w: 0.88, size: 0.036, upper: true, align: 'center', tracking: 0.34, tone: 'onSurface', motion: { in: 'wipe', at: 0.2, dur: 0.55 } },
      { role: 'headline', x: 0.06, y: 0.31, w: 0.88, size: 0.13, weight: 400, upper: true, align: 'center', tracking: -0.015, motion: { in: 'scale-out', at: 0.35, dur: 0.6 } },
      { role: 'subline', x: 0.12, y: 0.63, w: 0.76, size: SUB, align: 'center', tone: 'muted', motion: { in: 'rise', at: 0.75, dur: 0.5 } },
      { role: 'cta', x: 0.06, y: 0.812, w: 0.88, size: 0.036, weight: 400, upper: true, align: 'center', tracking: 0.3, tone: 'onSurface', motion: { in: 'wipe', at: 0.95, dur: 0.55 } },
      { role: 'contact', x: 0.06, y: 0.05, w: 0.88, size: CONTACT, weight: 400, align: 'center', direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.2, dur: 0.4 } },
    ],
  },
  {
    key: 'promo-half-photo',
    photoLed: true,
    label: 'Half Photo',
    desc: 'Picture on top, the offer on a solid block below',
    use: 'marketing', industries: ['Food & Hospitality', 'Fashion & Beauty', 'Health & Wellness'],
    styles: ['modern', 'editorial', 'premium', 'soft'], tags: ['photo', 'product', 'offer', 'menu', 'dish', 'launch', 'new', 'promo'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', intensity: 0.5 },
    shapes: [
      // The block is the layout: it gives the type a guaranteed ground even
      // when somebody drops a bright photograph behind it.
      { kind: 'rect', x: 0, y: 0.52, w: 1, h: 0.48, tone: 'base' },
      { kind: 'rect', x: 0.07, y: 0.575, w: 0.14, h: 0.006, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.07, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.18, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.615, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, tone: 'accent', font: 'mono', motion: { in: 'wipe', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.07, y: 0.66, w: 0.74, size: 0.07, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.35, dur: 0.55 } },
      { role: 'cta', x: 0.68, y: 0.575, w: 0.25, size: 0.03, weight: 800, align: 'center', upper: true, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.6, dur: 0.5 } },
      { role: 'subline', x: 0.07, y: 0.145, w: 0.7, size: SUB, tone: 'muted', fromBottom: true, motion: { in: 'fade', at: 0.85, dur: 0.5 } },
      { role: 'contact', x: 0.07, y: 0.07, w: 0.86, size: CONTACT, weight: 600, direction: 'row', max: 3, fromBottom: true, motion: { in: 'fade', at: 1.1, dur: 0.4 } },
    ],
  },
  {
    key: 'promo-two-for',
    label: 'Two For One',
    desc: 'Split field for a bundle, deal or pair of offers',
    use: 'marketing', industries: ['Food & Hospitality', 'Retail & Commerce', 'Home & Personal Services'],
    styles: ['bold', 'playful', 'high-contrast'], tags: ['bundle', 'two for one', 'bogo', 'deal', 'combo', 'pair', 'offer', 'meal'],
    mood: 'warm', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 120, intensity: 0.8 },
    shapes: [
      { kind: 'rect', x: 0.5, y: 0.3, w: 0.5, h: 0.44, tone: 'black', alpha: 0.28 },
      // Marks the join between the two halves. Kept small and BELOW the
      // headline line: at a square format a larger disc reached into it.
      { kind: 'circle', cx: 0.5, cy: 0.6, r: 0.055, tone: 'accent' },
    ],
    slots: [
      { role: 'brand', x: 0.07, y: 0.08, w: 0.5, size: 0.028, weight: 800, upper: true, tracking: 0.16, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.07, y: 0.17, w: 0.6, size: EYEBROW, upper: true, tracking: 0.22, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.2, dur: 0.45 } },
      { role: 'headline', x: 0.06, y: 0.32, w: 0.4, size: 0.066, weight: 800, tracking: -0.03, motion: { in: 'slide-right', at: 0.35, dur: 0.55 } },
      { role: 'subline', x: 0.56, y: 0.36, w: 0.38, size: 0.032, motion: { in: 'slide-left', at: 0.35, dur: 0.55 } },
      { role: 'price', x: 0.06, y: 0.76, w: 0.88, size: 0.028, weight: 800, direction: 'row', max: 2, motion: { in: 'rise', at: 0.7, dur: 0.55 } },
      { role: 'cta', x: 0.24, y: 0.09, w: 0.52, size: 0.032, weight: 800, align: 'center', upper: true, treatment: 'pill', tone: 'accent', fromBottom: true, motion: { in: 'pop', at: 0.95, dur: 0.5 } },
    ],
  },
  /*
   * ── A SECOND WAVE OF LAYOUTS ─────────────────────────────────────────
   *
   * Composed from this system's own grid, type scale and slot vocabulary.
   * Nothing here is traced from Canva, Freepik, Pinterest or Behance: those
   * are licensed works, and a directory that redistributes them hands its
   * customers a legal problem dressed as a template. What follows are
   * arrangements of margin, hierarchy and negative space — the parts of
   * design that belong to nobody.
   *
   * Each one answers a brief the catalogue could not: a strict grid, a
   * price-led offer, a ticket, a quote, a numbered story, a stats strip.
   */

  {
    key: 'grid-baseline',
    photoLed: true,
    label: 'Grid Baseline',
    desc: 'Strict column, hairline rules, headline on the baseline',
    use: 'marketing',
    styles: ['editorial', 'minimal', 'tech'], tags: ['grid', 'minimal', 'corporate'],
    mood: 'editorial', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', angle: 0, intensity: 0.12 },
    camera: { move: 'none', amount: 0 },
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.4, size: 0.034, upper: true, tracking: 0.18, font: 'mono', motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.08, y: 0.16, w: 0.5, size: EYEBROW, upper: true, tracking: 0.26, tone: 'accent', treatment: 'underline', motion: { in: 'wipe', at: 0.25, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.52, w: 0.78, size: HEAD_HERO, weight: 800, tracking: -0.035, motion: { in: 'rise', at: 0.45, dur: 0.7 } },
      { role: 'subline', x: 0.08, y: 0.76, w: 0.56, size: SUB, tone: 'muted', motion: { in: 'rise', at: 0.8, dur: 0.6 } },
      { role: 'meta', x: 0.08, y: 0.1, w: 0.5, size: META, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1, dur: 0.5 } },
    ],
  },

  {
    key: 'ultra-stack',
    photoLed: true,
    label: 'Ultra Stack',
    desc: 'Centred stack, wide tracking, nothing else',
    use: 'social',
    styles: ['minimal', 'elegant', 'high-contrast'], tags: ['minimal', 'centred', 'statement'],
    mood: 'minimal', scheme: 'dark', font: 'sans',
    surface: { kind: 'solid', angle: 0, intensity: 0.9 },
    camera: { move: 'none', amount: 0 },
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.3, w: 0.8, size: EYEBROW, upper: true, tracking: 0.42, align: 'center', tone: 'accent', motion: { in: 'fade', at: 0.1, dur: 0.6 } },
      { role: 'headline', x: 0.1, y: 0.42, w: 0.8, size: HEAD_HERO, weight: 300, tracking: -0.01, align: 'center', motion: { in: 'rise', at: 0.4, dur: 0.8 } },
      { role: 'subline', x: 0.16, y: 0.62, w: 0.68, size: SUB, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.8, dur: 0.6 } },
      { role: 'cta', x: 0.3, y: 0.16, w: 0.4, size: 0.03, fromBottom: true, align: 'center', treatment: 'outline', upper: true, tracking: 0.2, motion: { in: 'pop', at: 1.05, dur: 0.5 } },
    ],
  },

  {
    key: 'corner-anchor',
    photoLed: true,
    label: 'Corner Anchor',
    desc: 'Opposite corners, the middle left empty on purpose',
    use: 'marketing',
    styles: ['elegant', 'minimal', 'soft'], tags: ['negative-space', 'photo', 'modern'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'spotlight', angle: 135, intensity: 0.35 },
    camera: { move: 'drift', amount: 0.04 },
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.36, size: 0.038, motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.56, y: 0.09, w: 0.36, size: EYEBROW, upper: true, tracking: 0.2, align: 'right', tone: 'accent', motion: { in: 'fade', at: 0.3, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.3, w: 0.62, size: HEAD, weight: 700, tracking: -0.025, fromBottom: true, motion: { in: 'rise', at: 0.5, dur: 0.7 } },
      { role: 'contact', x: 0.56, y: 0.1, w: 0.36, size: META, fromBottom: true, align: 'right', tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.95, dur: 0.5 } },
    ],
  },

  {
    key: 'band-poster',
    look: { palette: 'forest-mono', type: 'street', duotone: ['ground', 'primary'] },
    photoLed: true,
    label: 'Band Poster',
    desc: 'Full-width accent band carrying the headline',
    use: 'event',
    styles: ['bold', 'cinematic', 'corporate'], tags: ['event', 'bold', 'poster'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 0, intensity: 0.6 },
    camera: { move: 'push', amount: 0.06 },
    shapes: [
      { kind: 'rect', x: 0, y: 0.985, w: 0.6, h: 0.015, tone: 'accent' },
      { kind: 'rect', x: 0.6, y: 0.985, w: 0.4, h: 0.015, tone: 'secondary' },
    ],
    slots: [
      { role: 'eyebrow', x: 0.08, y: 0.12, w: 0.6, size: EYEBROW, upper: true, tracking: 0.3, treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 0.1, dur: 0.5 } },
      { role: 'headline', x: 0.06, y: 0.38, w: 0.88, size: HEAD_HERO, weight: 900, upper: true, tracking: -0.04, treatment: 'panel', motion: { in: 'wipe', at: 0.4, dur: 0.7 } },
      { role: 'subline', x: 0.08, y: 0.62, w: 0.7, size: SUB, motion: { in: 'rise', at: 0.8, dur: 0.6 } },
      { role: 'meta', x: 0.08, y: 0.18, w: 0.5, size: META, fromBottom: true, upper: true, tracking: 0.14, font: 'mono', motion: { in: 'fade', at: 1, dur: 0.5 } },
      { role: 'cta', x: 0.62, y: 0.16, w: 0.3, size: 0.03, fromBottom: true, align: 'right', treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 1.1, dur: 0.5 } },
    ],
  },

  {
    key: 'offer-price',
    look: { palette: 'saffron-market', type: 'warmth' },
    label: 'Offer Price',
    desc: 'Price does the shouting; everything else gets out of the way',
    use: 'business',
    styles: ['bold', 'corporate', 'playful'], tags: ['offer', 'retail', 'promotion'],
    mood: 'bold', scheme: 'light', font: 'sans',
    surface: { kind: 'gradient', angle: 20, intensity: 0.5 },
    camera: { move: 'none', amount: 0 },
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.014, h: 1, tone: 'primary' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.4, size: 0.036, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.08, y: 0.2, w: 0.5, size: EYEBROW, upper: true, tracking: 0.24, treatment: 'bar', motion: { in: 'wipe', at: 0.25, dur: 0.5 } },
      /*
        ── max, which this slot alone was missing ─────────────────────────

        SEEN on the gallery: four price rows at 0.072 ran straight down
        through the headline below them. Every other `price` slot in this
        file caps its rows (2, 3, 5, 7); this one did not, so it drew however
        many the content happened to carry — five, in the sample.

        One row, because that is the template's own stated idea: "Price does
        the shouting; everything else gets out of the way." A list of five is
        a price LIST, and `price-list` already exists for that.
      */
      /*
        Sized to fit a REAL row, not an ideal one.

        A price row draws its label and its figure at the slot's own size, so
        "Your first item  ₦2,500" is about 22 characters wide. At 0.072 in a
        0.72 box that is ~0.79 of the page — it ran off the edge, which the
        overflow guard did not catch because that guard measures text slots
        and this is a list.

        0.06 across 0.86 leaves room for a genuine item name. The headline
        steps down to stay the supporting line, so the price still shouts —
        which is the whole idea of this template.
      */
      { role: 'price', x: 0.08, y: 0.34, w: 0.86, size: 0.06, weight: 900, tracking: -0.04, max: 1, tone: 'secondary', motion: { in: 'pop', at: 0.45, dur: 0.6 } },
      { role: 'headline', x: 0.08, y: 0.6, w: 0.72, size: 0.046, weight: 700, motion: { in: 'rise', at: 0.7, dur: 0.6 } },
      { role: 'cta', x: 0.08, y: 0.16, w: 0.44, size: 0.032, fromBottom: true, treatment: 'pill', motion: { in: 'pop', at: 1, dur: 0.5 } },
      { role: 'contact', x: 0.56, y: 0.17, w: 0.36, size: META, fromBottom: true, align: 'right', tone: 'muted', motion: { in: 'fade', at: 1.05, dur: 0.5 } },
    ],
  },

  {
    key: 'ticket-stub',
    look: { palette: 'lagos-sunset', type: 'modern', pattern: { key: 'halftone', role: 'primary', opacity: 0.06, scale: 0.08 } },
    label: 'Ticket Stub',
    desc: 'Ticket geometry: a torn edge and the details in a row',
    use: 'event',
    styles: ['editorial', 'tech', 'cinematic'], tags: ['ticket', 'event', 'admission'],
    mood: 'editorial', scheme: 'dark', font: 'mono',
    surface: { kind: 'frame', angle: 0, intensity: 0.3 },
    camera: { move: 'none', amount: 0 },
    shapes: [
      { kind: 'rect', x: 0.08, y: 0.2, w: 0.84, h: 0.004, tone: 'secondary', alpha: 0.6 },
    ],
    slots: [
      { role: 'eyebrow', x: 0.08, y: 0.12, w: 0.5, size: EYEBROW, upper: true, tracking: 0.3, tone: 'accent', font: 'mono', motion: { in: 'fade', at: 0.05, dur: 0.4 } },
      { role: 'headline', x: 0.08, y: 0.26, w: 0.84, size: 0.085, weight: 800, upper: true, tracking: -0.02, motion: { in: 'rise', at: 0.3, dur: 0.7 } },
      { role: 'meta', x: 0.08, y: 0.52, w: 0.84, size: 0.026, upper: true, tracking: 0.16, tone: 'muted', font: 'mono', motion: { in: 'wipe', at: 0.6, dur: 0.5 } },
      { role: 'subline', x: 0.08, y: 0.64, w: 0.6, size: SUB, tone: 'muted', motion: { in: 'fade', at: 0.8, dur: 0.5 } },
      { role: 'qr', x: 0.74, y: 0.12, w: 0.18, fromBottom: true, motion: { in: 'pop', at: 1, dur: 0.5 } },
      { role: 'contact', x: 0.08, y: 0.14, w: 0.56, size: META, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 1.05, dur: 0.5 } },
    ],
  },

  {
    key: 'menu-column',
    look: { palette: 'terracotta-clay', type: 'editorial', pattern: { key: 'diamond-weave', role: 'secondary', opacity: 0.06, scale: 0.14, zone: 'top' } },
    label: 'Menu Column',
    desc: 'A list that reads like a menu, rules between the lines',
    use: 'industry',
    styles: ['organic', 'editorial', 'minimal'], tags: ['menu', 'services', 'pricing'],
    mood: 'warm', scheme: 'light', font: 'serif',
    surface: { kind: 'solid', angle: 0, intensity: 0.2 },
    camera: { move: 'none', amount: 0 },
    extraPages: [{
      name: 'Page 2',
      slots: [
        { role: 'eyebrow', x: 0.1, y: 0.1, w: 0.8, size: 0.028, upper: true, tracking: 0.3, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0, dur: 0.4 } },
        { role: 'headline', x: 0.1, y: 0.17, w: 0.8, size: 0.058, weight: 600, align: 'center', motion: { in: 'rise', at: 0.1, dur: 0.5 } },
        { role: 'services', x: 0.12, y: 0.3, w: 0.76, size: 0.034, motion: { in: 'rise', at: 0.3, dur: 0.6 } },
        { role: 'contact', x: 0.1, y: 0.1, w: 0.8, size: 0.026, fromBottom: true, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
      ],
    }],
    shapes: [
      { kind: 'rect', x: 0.44, y: 0.955, w: 0.12, h: 0.005, tone: 'secondary' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.09, w: 0.8, size: 0.042, align: 'center', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.1, y: 0.17, w: 0.8, size: EYEBROW, upper: true, tracking: 0.3, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.25, w: 0.8, size: 0.07, weight: 600, align: 'center', motion: { in: 'rise', at: 0.35, dur: 0.6 } },
      { role: 'services', x: 0.12, y: 0.4, w: 0.76, size: 0.034, motion: { in: 'rise', at: 0.55, dur: 0.7 } },
      { role: 'contact', x: 0.1, y: 0.1, w: 0.8, size: META, fromBottom: true, align: 'center', tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.5 } },
    ],
  },

  {
    key: 'quote-frame',
    photoLed: true,
    label: 'Quote Frame',
    desc: 'One sentence, given the room it deserves',
    use: 'social',
    styles: ['elegant', 'minimal', 'soft'], tags: ['testimonial', 'quote', 'review'],
    mood: 'minimal', scheme: 'light', font: 'serif',
    surface: { kind: 'spotlight', angle: 0, intensity: 0.25 },
    camera: { move: 'drift', amount: 0.03 },
    slots: [
      { role: 'eyebrow', x: 0.12, y: 0.16, w: 0.5, size: EYEBROW, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'fade', at: 0.1, dur: 0.5 } },
      { role: 'headline', x: 0.12, y: 0.3, w: 0.76, size: 0.068, weight: 400, tracking: -0.01, motion: { in: 'rise', at: 0.35, dur: 0.8 } },
      { role: 'subline', x: 0.12, y: 0.66, w: 0.5, size: 0.03, upper: true, tracking: 0.16, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.9, dur: 0.5 } },
      { role: 'brand', x: 0.12, y: 0.12, w: 0.5, size: 0.032, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.5 } },
    ],
  },

  {
    key: 'stat-strip',
    label: 'Stat Strip',
    desc: 'Numbers in a row, with one line to explain them',
    use: 'business',
    styles: ['tech', 'editorial', 'corporate'], tags: ['stats', 'report', 'results'],
    mood: 'editorial', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 90, intensity: 0.35 },
    camera: { move: 'none', amount: 0 },
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.44, size: 0.034, motion: { in: 'fade', at: 0, dur: 0.4 } },
      { role: 'eyebrow', x: 0.08, y: 0.18, w: 0.6, size: EYEBROW, upper: true, tracking: 0.24, tone: 'accent', motion: { in: 'wipe', at: 0.2, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.28, w: 0.8, size: 0.072, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.4, dur: 0.7 } },
      { role: 'stats', x: 0.08, y: 0.52, w: 0.84, size: 0.05, motion: { in: 'pop', at: 0.7, dur: 0.6 } },
      { role: 'subline', x: 0.08, y: 0.16, w: 0.66, size: SUB, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 1, dur: 0.5 } },
    ],
  },

  {
    key: 'story-steps',
    label: 'Story Steps',
    desc: 'Three beats down the page, built for a vertical story',
    use: 'social',
    styles: ['high-contrast', 'bold', 'playful'], tags: ['story', 'vertical', 'steps'],
    mood: 'bold', scheme: 'dark', font: 'sans',
    surface: { kind: 'gradient', angle: 160, intensity: 0.5 },
    camera: { move: 'push', amount: 0.05 },
    slots: [
      { role: 'eyebrow', x: 0.1, y: 0.1, w: 0.8, size: EYEBROW, upper: true, tracking: 0.28, tone: 'accent', treatment: 'pill', motion: { in: 'pop', at: 0.05, dur: 0.5 } },
      { role: 'headline', x: 0.1, y: 0.22, w: 0.8, size: 0.082, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.3, dur: 0.7 } },
      { role: 'services', x: 0.12, y: 0.44, w: 0.76, size: 0.036, motion: { in: 'rise', at: 0.6, dur: 0.8 } },
      { role: 'cta', x: 0.1, y: 0.18, w: 0.8, size: 0.034, fromBottom: true, align: 'center', treatment: 'pill', tone: 'accent', motion: { in: 'pop', at: 1.05, dur: 0.5 } },
      { role: 'contact', x: 0.1, y: 0.1, w: 0.8, size: META, fromBottom: true, align: 'center', tone: 'muted', motion: { in: 'fade', at: 1.15, dur: 0.4 } },
    ],
  },

  {
    key: 'photo-foot',
    photoLed: true,
    label: 'Photo Foot',
    desc: 'Picture on top, the words weighted into the bottom third',
    use: 'marketing',
    styles: ['elegant', 'high-contrast', 'cinematic'], tags: ['photo', 'overlay', 'product'],
    mood: 'minimal', scheme: 'dark', font: 'sans',
    surface: { kind: 'wash', angle: 180, intensity: 0.55, vignette: 0.4 },
    camera: { move: 'drift', amount: 0.05 },
    slots: [
      { role: 'brand', x: 0.08, y: 0.08, w: 0.4, size: 0.034, tone: 'onSurface', motion: { in: 'fade', at: 0, dur: 0.5 } },
      { role: 'eyebrow', x: 0.08, y: 0.4, w: 0.5, size: EYEBROW, upper: true, tracking: 0.22, fromBottom: true, tone: 'accent', motion: { in: 'fade', at: 0.4, dur: 0.5 } },
      { role: 'headline', x: 0.08, y: 0.28, w: 0.8, size: HEAD, weight: 800, tracking: -0.03, fromBottom: true, tone: 'onSurface', motion: { in: 'rise', at: 0.55, dur: 0.7 } },
      { role: 'subline', x: 0.08, y: 0.12, w: 0.64, size: SUB, fromBottom: true, tone: 'muted', motion: { in: 'rise', at: 0.85, dur: 0.6 } },
    ],
  },

  {
    key: 'card-front',
    look: { palette: 'paper-ink', type: 'modern' },
    label: 'Card Front',
    desc: 'Business-card proportions: name, trade, and how to reach you',
    use: 'business',
    styles: ['minimal', 'editorial', 'tech'], tags: ['card', 'stationery', 'identity'],
    mood: 'editorial', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', angle: 0, intensity: 0.1 },
    camera: { move: 'none', amount: 0 },
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.09, y: 0.18, w: 0.8, size: 0.05, weight: 700, motion: { in: 'fade', at: 0, dur: 0.4 } },
        { role: 'contact', x: 0.09, y: 0.36, w: 0.82, size: 0.032, tone: 'muted', font: 'mono', motion: { in: 'rise', at: 0.15, dur: 0.5 } },
        { role: 'cta', x: 0.09, y: 0.14, w: 0.6, size: 0.03, fromBottom: true, upper: true, tracking: 0.2, tone: 'accent', motion: { in: 'fade', at: 0.35, dur: 0.4 } },
      ],
    }],
    shapes: [
      { kind: 'rect', x: 0, y: 0.94, w: 0.72, h: 0.06, tone: 'primary' },
      { kind: 'rect', x: 0.72, y: 0.94, w: 0.28, h: 0.06, tone: 'highlight' },
    ],
    slots: [
      { role: 'headline', x: 0.09, y: 0.18, w: 0.6, size: 0.072, weight: 700, tracking: -0.02, motion: { in: 'rise', at: 0.1, dur: 0.6 } },
      { role: 'brand', x: 0.09, y: 0.3, w: 0.6, size: 0.03, upper: true, tracking: 0.2, tone: 'muted', motion: { in: 'fade', at: 0.3, dur: 0.5 } },
      { role: 'eyebrow', x: 0.09, y: 0.42, w: 0.6, size: 0.03, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'wipe', at: 0.45, dur: 0.5 } },
      { role: 'contact', x: 0.09, y: 0.14, w: 0.56, size: 0.028, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.6, dur: 0.5 } },
      { role: 'qr', x: 0.74, y: 0.14, w: 0.17, fromBottom: true, motion: { in: 'pop', at: 0.8, dur: 0.5 } },
    ],
  },

  /*
   * ── BUSINESS CARDS ───────────────────────────────────────────────────
   *
   * A request for "a business card" used to return one layout and three
   * covers, because one layout is all the library had. These are seven
   * genuinely different cards — different composition, different hierarchy,
   * different use of the ground — not one design in seven colours.
   *
   * What makes them different is structural: where the name sits relative to
   * the company, whether the type or the logo leads, whether the ground is
   * paper or ink, and whether a QR is part of the composition or absent.
   *
   * Portrait and landscape are NOT separate layouts. They are a canvas
   * choice, and the editor refits a design between them — inventing a second
   * copy of each card for the other orientation would be exactly the
   * duplication this catalogue is supposed to avoid.
   */

  {
    key: 'card-minimal',
    look: { palette: 'harbour-blue', type: 'modern' },
    label: 'Minimal Corporate Card',
    desc: 'Name left, role beneath, contact along the foot',
    use: 'business',
    styles: ['minimal', 'corporate'], tags: ['business card', 'visiting card', 'contact', 'stationery', 'corporate'],
    industries: ['Professional Services'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.08 },
    camera: { move: 'none', amount: 0 },
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.09, y: 0.18, w: 0.8, size: 0.05, weight: 700, motion: { in: 'fade', at: 0, dur: 0.4 } },
        { role: 'contact', x: 0.09, y: 0.36, w: 0.82, size: 0.032, tone: 'muted', font: 'mono', motion: { in: 'rise', at: 0.15, dur: 0.5 } },
        { role: 'cta', x: 0.09, y: 0.14, w: 0.6, size: 0.03, fromBottom: true, upper: true, tracking: 0.2, tone: 'accent', motion: { in: 'fade', at: 0.35, dur: 0.4 } },
      ],
    }],
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.02, h: 1, tone: 'primary' },
      { kind: 'circle', cx: 0.9, cy: 0.16, r: 0.05, tone: 'secondary' },
    ],
    slots: [
      { role: 'headline', x: 0.08, y: 0.2, w: 0.66, size: 0.085, weight: 700, tracking: -0.02, motion: { in: 'rise', at: 0.1, dur: 0.5 } },
      { role: 'eyebrow', x: 0.08, y: 0.4, w: 0.6, size: 0.036, upper: true, tracking: 0.2, tone: 'accent', motion: { in: 'fade', at: 0.3, dur: 0.4 } },
      { role: 'brand', x: 0.08, y: 0.54, w: 0.6, size: 0.042, weight: 600, motion: { in: 'fade', at: 0.4, dur: 0.4 } },
      { role: 'contact', x: 0.08, y: 0.12, w: 0.84, size: 0.03, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
    ],
  },

  {
    key: 'card-centred',
    look: { palette: 'kente-field', type: 'editorial', pattern: { key: 'diamond-weave', role: 'secondary', opacity: 0.06, scale: 0.16, zone: 'top' } },
    label: 'Clean Centre Card',
    desc: 'Everything centred, generous margins',
    use: 'business',
    styles: ['minimal', 'elegant'], tags: ['business card', 'visiting card', 'centred', 'clean', 'stationery'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'frame', frame: 0.06, intensity: 0.2 },
    camera: { move: 'none', amount: 0 },
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.1, y: 0.42, w: 0.8, size: 0.07, weight: 700, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
        { role: 'eyebrow', x: 0.1, y: 0.56, w: 0.8, size: 0.028, upper: true, tracking: 0.3, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      ],
    }],
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.022, tone: 'highlight' },
    ],
    slots: [
      { role: 'brand', x: 0.1, y: 0.22, w: 0.8, size: 0.04, upper: true, tracking: 0.3, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.1, dur: 0.4 } },
      { role: 'headline', x: 0.1, y: 0.36, w: 0.8, size: 0.082, weight: 600, align: 'center', motion: { in: 'rise', at: 0.25, dur: 0.5 } },
      { role: 'eyebrow', x: 0.1, y: 0.55, w: 0.8, size: 0.032, upper: true, tracking: 0.24, align: 'center', tone: 'accent', motion: { in: 'fade', at: 0.45, dur: 0.4 } },
      { role: 'contact', x: 0.1, y: 0.14, w: 0.8, size: 0.028, fromBottom: true, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
    ],
  },

  {
    key: 'card-luxe-dark',
    look: { palette: 'forest-brass', type: 'luxury', pattern: { key: 'grain', role: 'ink', opacity: 0.07, scale: 0.2 } },
    label: 'Luxury Dark Card',
    desc: 'Ink ground, serif name, restrained accent',
    use: 'business',
    styles: ['luxury', 'premium', 'elegant'], tags: ['business card', 'luxury', 'premium', 'dark', 'stationery'],
    industries: ['Fashion & Beauty', 'Professional Services'],
    mood: 'luxe', scheme: 'dark', font: 'serif',
    surface: { kind: 'solid', intensity: 0.9 },
    camera: { move: 'none', amount: 0 },
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.1, y: 0.42, w: 0.8, size: 0.07, weight: 700, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
        { role: 'eyebrow', x: 0.1, y: 0.56, w: 0.8, size: 0.028, upper: true, tracking: 0.3, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      ],
    }],
    shapes: [
      { kind: 'rect', x: 0.09, y: 0.4, w: 0.12, h: 0.006, tone: 'primary' },
    ],
    slots: [
      { role: 'headline', x: 0.09, y: 0.26, w: 0.7, size: 0.088, weight: 400, tracking: -0.01, motion: { in: 'rise', at: 0.15, dur: 0.6 } },
      { role: 'eyebrow', x: 0.09, y: 0.46, w: 0.6, size: 0.03, upper: true, tracking: 0.3, tone: 'accent', motion: { in: 'wipe', at: 0.35, dur: 0.5 } },
      { role: 'brand', x: 0.09, y: 0.2, w: 0.5, size: 0.034, fromBottom: true, upper: true, tracking: 0.22, motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      { role: 'contact', x: 0.09, y: 0.1, w: 0.82, size: 0.026, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.65, dur: 0.4 } },
    ],
  },

  {
    key: 'card-type-led',
    look: { palette: 'cobalt-pop', type: 'impact' },
    label: 'Typography Card',
    desc: 'The name is the design; everything else gets out of the way',
    use: 'business',
    styles: ['editorial', 'bold', 'modern'], tags: ['business card', 'typographic', 'bold', 'name', 'stationery'],
    mood: 'editorial', scheme: 'light', font: 'grotesk',
    surface: { kind: 'solid', intensity: 0.1 },
    camera: { move: 'none', amount: 0 },
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.1, y: 0.42, w: 0.8, size: 0.07, weight: 700, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
        { role: 'eyebrow', x: 0.1, y: 0.56, w: 0.8, size: 0.028, upper: true, tracking: 0.3, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      ],
    }],
    shapes: [
      { kind: 'rect', x: 0.955, y: 0, w: 0.045, h: 0.72, tone: 'secondary' },
      { kind: 'rect', x: 0.955, y: 0.72, w: 0.045, h: 0.28, tone: 'highlight' },
    ],
    slots: [
      { role: 'headline', x: 0.07, y: 0.18, w: 0.86, size: 0.13, weight: 800, tracking: -0.045, upper: true, motion: { in: 'rise', at: 0.1, dur: 0.6 } },
      { role: 'eyebrow', x: 0.07, y: 0.52, w: 0.5, size: 0.03, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'fade', at: 0.4, dur: 0.4 } },
      { role: 'brand', x: 0.57, y: 0.52, w: 0.36, size: 0.03, upper: true, tracking: 0.26, align: 'right', tone: 'muted', motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      { role: 'contact', x: 0.07, y: 0.12, w: 0.86, size: 0.028, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.65, dur: 0.4 } },
    ],
  },

  {
    key: 'card-logo-led',
    look: { palette: 'adire-clay', type: 'warmth', pattern: { key: 'rings', role: 'primary', opacity: 0.06, scale: 0.25, zone: 'right' } },
    label: 'Logo-Led Card',
    desc: 'Company first, person second, details at the foot',
    use: 'business',
    styles: ['corporate', 'modern'], tags: ['business card', 'logo', 'company', 'brand', 'stationery'],
    industries: ['Professional Services', 'Technology & Media'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'gradient', angle: 160, intensity: 0.22 },
    camera: { move: 'none', amount: 0 },
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.09, y: 0.18, w: 0.8, size: 0.05, weight: 700, motion: { in: 'fade', at: 0, dur: 0.4 } },
        { role: 'contact', x: 0.09, y: 0.36, w: 0.82, size: 0.032, tone: 'muted', font: 'mono', motion: { in: 'rise', at: 0.15, dur: 0.5 } },
        { role: 'cta', x: 0.09, y: 0.14, w: 0.6, size: 0.03, fromBottom: true, upper: true, tracking: 0.2, tone: 'accent', motion: { in: 'fade', at: 0.35, dur: 0.4 } },
      ],
    }],
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 0.018, h: 1, tone: 'secondary' },
    ],
    slots: [
      { role: 'brand', x: 0.08, y: 0.18, w: 0.7, size: 0.075, weight: 800, tracking: -0.03, motion: { in: 'rise', at: 0.1, dur: 0.5 } },
      { role: 'eyebrow', x: 0.08, y: 0.38, w: 0.6, size: 0.028, upper: true, tracking: 0.26, tone: 'accent', motion: { in: 'wipe', at: 0.3, dur: 0.4 } },
      { role: 'headline', x: 0.08, y: 0.26, w: 0.6, size: 0.048, weight: 600, fromBottom: true, motion: { in: 'fade', at: 0.45, dur: 0.4 } },
      { role: 'contact', x: 0.08, y: 0.1, w: 0.84, size: 0.027, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
    ],
  },

  {
    key: 'card-colour-block',
    look: { palette: 'royal-orange', type: 'street' },
    label: 'Colour Block Card',
    desc: 'A band of brand colour carrying the name',
    use: 'business',
    styles: ['bold', 'high-contrast', 'modern'], tags: ['business card', 'colour', 'block', 'bold', 'stationery'],
    mood: 'bold', scheme: 'light', font: 'sans',
    surface: { kind: 'wash', angle: 0, intensity: 0.65 },
    camera: { move: 'none', amount: 0 },
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'brand', x: 0.1, y: 0.42, w: 0.8, size: 0.07, weight: 700, align: 'center', motion: { in: 'fade', at: 0, dur: 0.4 } },
        { role: 'eyebrow', x: 0.1, y: 0.56, w: 0.8, size: 0.028, upper: true, tracking: 0.3, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.2, dur: 0.4 } },
      ],
    }],
    shapes: [
      { kind: 'rect', x: 0, y: 0, w: 1, h: 0.44, tone: 'primary' },
      { kind: 'rect', x: 0, y: 0.44, w: 1, h: 0.014, tone: 'highlight' },
    ],
    slots: [
      { role: 'headline', x: 0.08, y: 0.16, w: 0.8, size: 0.09, weight: 800, tracking: -0.03, on: 'primary', motion: { in: 'wipe', at: 0.1, dur: 0.5 } },
      { role: 'eyebrow', x: 0.08, y: 0.52, w: 0.6, size: 0.03, upper: true, tracking: 0.24, tone: 'secondary', treatment: 'pill', motion: { in: 'pop', at: 0.35, dur: 0.4 } },
      { role: 'brand', x: 0.08, y: 0.24, w: 0.6, size: 0.04, weight: 700, fromBottom: true, motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      { role: 'contact', x: 0.08, y: 0.1, w: 0.84, size: 0.027, fromBottom: true, tone: 'muted', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
    ],
  },

  {
    key: 'card-qr',
    look: { palette: 'moss-stone', type: 'modern', pattern: { key: 'grid', role: 'primary', opacity: 0.05, scale: 0.08 } },
    label: 'QR Contact Card',
    desc: 'A scannable code sized as part of the composition',
    use: 'business',
    styles: ['tech', 'modern', 'minimal'], tags: ['business card', 'qr', 'scan', 'contact', 'digital', 'stationery'],
    industries: ['Technology & Media', 'Professional Services'],
    mood: 'minimal', scheme: 'light', font: 'sans',
    surface: { kind: 'solid', intensity: 0.08 },
    camera: { move: 'none', amount: 0 },
    extraPages: [{
      name: 'Back',
      slots: [
        { role: 'qr', x: 0.36, y: 0.24, w: 0.28, motion: { in: 'pop', at: 0, dur: 0.4 } },
        { role: 'cta', x: 0.1, y: 0.2, w: 0.8, size: 0.03, fromBottom: true, upper: true, tracking: 0.24, align: 'center', motion: { in: 'fade', at: 0.25, dur: 0.4 } },
        { role: 'brand', x: 0.1, y: 0.12, w: 0.8, size: 0.028, fromBottom: true, align: 'center', tone: 'muted', motion: { in: 'fade', at: 0.35, dur: 0.4 } },
      ],
    }],
    shapes: [
      { kind: 'rect', x: 0, y: 0.95, w: 1, h: 0.05, tone: 'secondary' },
    ],
    slots: [
      /*
        ── THE CODE LEADS, BECAUSE THAT IS THE CARD ───────────────────────

        MEASURED: this shared a signature with `card-front`. Both put the
        name top-left at the same size and tucked a small QR into the right
        edge — so the card called "QR Contact Card" was a standard card with
        an accessory, not a card built around a code.

        Inverted. The code is now the largest element and holds the left of
        the composition; the name and role sit beside it. Somebody choosing
        this over card-front is choosing a different object, which is what
        the two entries in the gallery are promising.
      */
      { role: 'qr', x: 0.07, y: 0.18, w: 0.33, motion: { in: 'pop', at: 0.1, dur: 0.45 } },
      { role: 'headline', x: 0.47, y: 0.21, w: 0.45, size: 0.066, weight: 700, tracking: -0.02, motion: { in: 'rise', at: 0.25, dur: 0.5 } },
      { role: 'eyebrow', x: 0.47, y: 0.4, w: 0.45, size: 0.026, upper: true, tracking: 0.22, motion: { in: 'fade', at: 0.4, dur: 0.4 } },
      { role: 'brand', x: 0.47, y: 0.52, w: 0.45, size: 0.032, weight: 600, motion: { in: 'fade', at: 0.5, dur: 0.4 } },
      { role: 'contact', x: 0.47, y: 0.1, w: 0.45, size: 0.024, fromBottom: true, tone: 'muted', font: 'mono', motion: { in: 'fade', at: 0.6, dur: 0.4 } },
    ],
  },

  // Branding, campaign, social, banner and print layouts from the Template
  // Catalogue canvas. Their own file because there are 38 of them.
  ...CATALOGUE_TEMPLATES,

  // The pilot collection (Task 18): eight directed business cards, six
  // Instagram portrait posts and six 48-sheet billboards.
  ...PILOT_TEMPLATES,
];


export const templateByKey = (key: string): DesignTemplate =>
  DESIGN_TEMPLATES.find(t => t.key === key) ?? DESIGN_TEMPLATES[0];

export const slotOf = (tpl: DesignTemplate, role: SlotRole): SlotSpec | undefined =>
  tpl.slots.find(s => s.role === role);

/**
 * Which list roles a template actually uses.
 *
 * Drives the editor: a template with no services column should not offer a
 * services editor. Showing every field for every template is what turns a
 * design tool into a form.
 */
export function templateListRoles(tpl: DesignTemplate): SlotRole[] {
  const seen = new Set<SlotRole>();
  for (const slot of tpl.slots) if (isListRole(slot.role)) seen.add(slot.role);
  return [...seen];
}
