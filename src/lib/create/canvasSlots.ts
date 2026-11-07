/**
 * Turning a measured artboard into a Create Media template.
 *
 * ── WHAT IS IMPORTED, AND WHAT IS DELIBERATELY LEFT BEHIND ───────────────
 *
 * The COMPOSITION comes across: where each line sits, how big it is relative
 * to the canvas, its weight, its case, its tracking, its alignment, and
 * whether it is anchored to the top or pinned to the bottom.
 *
 * The WORDS and the COLOURS do not. That is not a shortcoming, it is the
 * point of the catalogue: a Create Media template is drawn in the user's
 * brand colour with the user's own copy. An artboard that reads "NOWOPEN
 * AFRICA · Discover NowOpen" becomes a layout with a brand slot and a call
 * to action, which the business owner fills with their own name. Copying
 * NowOpen's words into a public template would hand every business on the
 * platform a flyer for somebody else.
 *
 * ── WHY SOME ARTBOARDS ARE REFUSED ───────────────────────────────────────
 *
 * Create Media's model is eleven roles, each appearing once. A presentation
 * board showing four packaging mockups, or a 2027 calendar, carries dozens
 * of independent text runs with no such structure. Those can be rendered as
 * a picture; they cannot be rebuilt as a slot template, and a lossy import
 * would produce a layout the designer would not recognise.
 *
 * So the rule is the same one the upload validator already follows: refuse,
 * with the reason and the count, rather than import a half.
 */

import type {
  SlotRole, SlotSpec, DesignTemplate, SurfaceSpec, ShapeSpec, ShapeTone,
} from '../designTemplates';
import type { MeasuredRun, MeasuredShape } from './measureArtboard';
import type { ParsedArtboard } from './designCanvas';

/**
 * What an author's own token name says the text is for.
 *
 * Read first and trusted most: the person who built the artboard declared
 * `{{kicker}}` and `{{cta}}`, and that is better evidence than any amount of
 * inference from font size.
 */
const TOKEN_ROLE: { match: RegExp; role: SlotRole }[] = [
  { match: /^(kicker|eyebrow|label|series|badge|tag|overline)/i, role: 'eyebrow' },
  { match: /^(headline|title|head|claim|line1|line2|number|numeral|stat)/i, role: 'headline' },
  { match: /^(sub|blurb|intro|lead|body|copy|desc)/i, role: 'subline' },
  { match: /^(cta|button|action|link)/i, role: 'cta' },
  { match: /^(brand|logo|company|org)/i, role: 'brand' },
  { match: /^(phone|email|contact|handle|web|site|address)/i, role: 'contact' },
  { match: /^(price|amount|cost|rate|fee)/i, role: 'price' },
  { match: /^(terms|note|meta|footnote|legal|small|date|when|where|total)/i, role: 'meta' },
];

/** A run that is clearly a brand lockup rather than somebody's headline. */
const LOCKUP = /^(nowopen\s*africa|nowopen|now\s*open)$/i;

export interface SlotDraft {
  role: SlotRole;
  run: MeasuredRun;
  /** Why this role, in the words shown to whoever reviews the import. */
  because: string;
}

export interface CanvasTemplateResult {
  ok: true;
  template: Omit<DesignTemplate, 'key'>;
  /** Runs that found no role. Named, never silently dropped. */
  skipped: { text: string; why: string }[];
  notes: string[];
}

export type CanvasTemplateOutcome = CanvasTemplateResult | { ok: false; reason: string };

/**
 * Above this many text runs an artboard is a presentation board, not a
 * deliverable.
 *
 * Eleven roles exist, and a design that genuinely uses all of them is already
 * unusually dense; sixteen separate runs means several designs on one sheet,
 * which is how this canvas presents a packaging set or a sign family.
 */
const SHEET_RUNS = 16;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Relative luminance of a hex colour, for deciding light ink or dark. */
export function luminance(colour: string): number | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
  if (!hex) return null;
  let body = hex[1];
  if (body.length === 3) body = body.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(body.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Which brand role a measured colour plays.
 *
 * ── WHY A TONE AND NOT THE COLOUR ────────────────────────────────────────
 *
 * The renderer paints a shape in one of five roles, not in a hex. That is
 * the whole reason an imported design can belong to somebody else: the blue
 * pill and the rainbow rule both read as ACCENT, so they come out in the
 * user's brand colour rather than NowOpen's. Carrying the literal hex across
 * would hand every business a blue flyer and call it theirs.
 */
export function toneOf(colour: string | null, gradient: boolean, board: ParsedArtboard): ShapeTone {
  /* A gradient is decoration in the brand colour, whatever its stops are. */
  if (gradient) return 'accent';
  if (!colour) return 'accent';

  const lum = luminance(hexOf(colour));
  if (lum === null) return 'accent';

  /* Near-white and near-black are structural, not brand: a white card on a
     dark ground stays a white card whatever colour the business picks. */
  if (lum > 0.88) return 'white';
  if (lum < 0.035) return 'black';

  const ground = luminance(board.background.trim().split(/\s+/)[0]);
  if (ground !== null && Math.abs(lum - ground) < 0.02) return 'base';

  return 'accent';
}

/** `rgb(37, 99, 235)` as `#2563eb`, so one luminance test serves both. */
export function hexOf(colour: string): string {
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(colour);
  if (!rgb) return colour.trim();
  const hex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
}

/** The alpha a browser reported, folded in with the element's own opacity. */
function alphaOf(shape: MeasuredShape): number {
  const rgba = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(shape.fill ?? '');
  const fillAlpha = rgba ? Number(rgba[1]) : 1;
  return Math.max(0, Math.min(1, fillAlpha * shape.opacity));
}

/**
 * A measured box as geometry the renderer can draw.
 *
 * Returns null for a box that would add nothing — one covering the whole
 * canvas is the ground, not a shape on it, and drawing it as a rectangle
 * would paint over the surface the template already has.
 */
export function shapeFrom(box: MeasuredShape, board: ParsedArtboard): ShapeSpec | null {
  const { width: W, height: H } = board;
  const short = Math.min(W, H);
  const tone = toneOf(box.fill, box.gradient, board);
  const alpha = alphaOf(box);
  if (alpha < 0.04) return null;

  /* The ground itself, re-drawn. The surface already paints it. */
  if (box.w >= W * 0.98 && box.h >= H * 0.98) return null;

  /*
   * A picture's box is a HOLE, not a fill.
   *
   * MEASURED: painting it filled the top half of a photo-led poster with
   * solid accent, directly over the photograph the template exists to show.
   * The box still earns its keep — it holds the composition open and sets
   * `photoLed` — but it is not a shape. An outlined one is different: that
   * is a frame drawn round the picture, and the frame is part of the design.
   */
  if (box.isImage && !box.stroke) return null;

  const common = { tone, ...(alpha < 1 ? { alpha } : {}) };

  /* A disc: rounded to at least half its shortest side, and roughly square. */
  const roundness = box.radius / Math.max(1, Math.min(box.w, box.h) / 2);
  const square = Math.abs(box.w - box.h) <= Math.max(box.w, box.h) * 0.12;
  if (roundness >= 0.98 && square) {
    const r = Math.min(box.w, box.h) / 2;
    const circle = {
      kind: 'circle' as const,
      cx: (box.x + box.w / 2) / W,
      cy: (box.y + box.h / 2) / H,
      r: r / short,
      ...common,
    };
    /* Outline only: a photo frame or an orbit, not a filled disc. */
    if (!box.fill && box.stroke) {
      return { ...circle, kind: 'ring', thickness: box.strokeWidth / short };
    }
    return circle;
  }

  /*
   * A rotated bar is a stripe. Unrotated it would be a rectangle, and the
   * renderer has no rotation on one — losing the angle loses the gesture.
   */
  if (Math.abs(box.rotation) > 1) {
    return {
      kind: 'stripe',
      x: box.x / W,
      y: box.y / H,
      w: box.w / W,
      h: box.h / H,
      angle: box.rotation,
      ...common,
    };
  }

  return {
    kind: 'rect',
    x: box.x / W,
    y: box.y / H,
    w: box.w / W,
    h: box.h / H,
    ...(box.radius > 1 ? { radius: box.radius / short } : {}),
    ...common,
  };
}

/** The ground the artboard was drawn on, as a surface this renderer knows. */
export function surfaceFrom(background: string): SurfaceSpec {
  const value = background.toLowerCase();
  if (value.includes('linear-gradient')) {
    const angle = /(-?\d+(?:\.\d+)?)deg/.exec(value);
    return { kind: 'gradient', ...(angle ? { angle: ((Number(angle[1]) % 360) + 360) % 360 } : {}) };
  }
  if (value.includes('radial-gradient')) return { kind: 'spotlight' };
  return { kind: 'solid' };
}

/**
 * Assign roles.
 *
 * One pass per role in confidence order rather than one pass per run: a
 * single greedy walk gives the headline to whichever big line happened to be
 * first in the DOM, and in a flex column with `margin-top: auto` that is
 * regularly the eyebrow.
 */
export function assignRoles(runs: readonly MeasuredRun[], board: ParsedArtboard): SlotDraft[] {
  const taken = new Set<SlotRole>();
  const used = new Set<MeasuredRun>();
  const drafts: SlotDraft[] = [];
  const claim = (role: SlotRole, run: MeasuredRun, because: string) => {
    if (taken.has(role) || used.has(run)) return;
    taken.add(role);
    used.add(run);
    drafts.push({ role, run, because });
  };

  const free = () => runs.filter((r) => !used.has(r));

  /*
   * 0. Repeating groups take the LIST roles first.
   *
   * A services column, a price list, a stat strip and a contact block are
   * what a real business flyer is mostly made of, and they are the roles a
   * single-line rule can never claim. Measured before anything else so a
   * three-row menu is not broken up into three competing headlines.
   */
  for (const run of free()) {
    if (!run.rows || run.rows.length < 3) continue;
    claim(listRoleFor(run.rows), run, `${run.rows.length} like rows, measured as one list`);
  }

  /* 1. A brand lockup is named, not inferred: it must not become a headline. */
  for (const run of free()) {
    if (LOCKUP.test(run.text)) claim('brand', run, 'it is a brand lockup, so the business name goes here');
  }

  /*
   * 2. The headline is the BIGGEST line, not the one the author happened to
   *    call `{{headline}}`.
   *
   *    Measured on the real boards: a milestone poster declares `{{number}}`
   *    at 300px above `{{headline}}` at 92px. Honouring the token name would
   *    put the user's own headline in the 92px slot and their supporting
   *    line in the 300px one — the layout inverted. Size is what the reader
   *    sees first, so size is what the headline role follows.
   */
  const biggest = [...free()].sort((a, b) => b.fontSize - a.fontSize);
  if (biggest.length) claim('headline', biggest[0], 'it is the largest line on the board');

  /* 3. Everything else goes by what the author declared it to be. */
  for (const rule of TOKEN_ROLE) {
    for (const run of free()) {
      if (run.token && rule.match.test(run.token)) {
        claim(rule.role, run, `the artboard declares {{${run.token}}}`);
      }
    }
  }

  const headSize = drafts.find((d) => d.role === 'headline')?.run.fontSize ?? board.height * 0.08;

  /* 4. An eyebrow announces itself: small, upper case, widely tracked. */
  for (const run of free()) {
    if (run.upper && run.tracking >= 0.08 && run.fontSize <= headSize * 0.45) {
      claim('eyebrow', run, 'small, upper case and widely tracked');
    }
  }

  /* 5. A run carrying its own ground is a control, not prose. */
  for (const run of free()) {
    if (run.chip && run.text.length <= 40) claim('cta', run, 'it is drawn as a button');
  }

  /* 6. Contact details identify themselves by what they contain. */
  for (const run of free()) {
    if (/@|\+\d|\bwww\.|\.com\b|\.africa\b/i.test(run.text)) {
      claim('contact', run, 'it carries contact details');
    }
  }

  /* 7. The longest remaining middle-sized line is the supporting sentence. */
  const prose = [...free()].filter((r) => r.fontSize < headSize * 0.6)
    .sort((a, b) => b.text.length - a.text.length);
  if (prose.length) claim('subline', prose[0], 'the longest supporting line');

  /* 8. Whatever small print is left, lowest on the board. */
  const rest = [...free()].sort((a, b) => b.y - a.y);
  if (rest.length) claim('meta', rest[0], 'the remaining small print');

  return drafts;
}

/** A measured run as a slot, in fractions of the canvas. */
export function slotFrom(draft: SlotDraft, board: ParsedArtboard): SlotSpec {
  const { run, role } = draft;
  const short = Math.min(board.width, board.height);

  /*
   * Anything in the bottom third is anchored from the BOTTOM.
   *
   * Our renderer resizes a template across a square post, a 9:16 story and an
   * A3 poster from one definition. A footer measured as "y = 0.91 from the
   * top" drifts off a taller canvas; the same footer pinned to the bottom
   * stays where the designer put it. This is the one place the import
   * deliberately reinterprets rather than copies.
   */
  const fromBottom = run.y + run.h > board.height * 0.66;
  const y = fromBottom
    ? clamp((board.height - (run.y + run.h)) / board.height, 0, 0.98)
    : clamp(run.y / board.height, 0, 0.98);

  const slot: SlotSpec = {
    role,
    x: clamp(run.x / board.width, 0, 0.98),
    y,
    w: clamp(run.w / board.width, 0.02, 1),
    size: clamp(run.fontSize / short, 0.008, 0.4),
  };

  if (fromBottom) slot.fromBottom = true;
  if (run.align !== 'left') slot.align = run.align;
  if (run.upper) slot.upper = true;
  if (run.fontWeight !== 400) slot.weight = clamp(Math.round(run.fontWeight / 100) * 100, 100, 900);
  if (Math.abs(run.tracking) > 0.01) slot.tracking = clamp(run.tracking, -0.1, 0.5);
  if (run.chip) slot.treatment = 'pill';
  if (run.display) slot.font = 'coolvetica';

  if (run.rows?.length) {
    /*
     * A list slot is capped at the rows that were actually measured. Left
     * uncapped, a user's longer list would run past where the design ends,
     * which is the thing fractional geometry cannot rescue.
     */
    slot.max = run.rows.length;
    if (run.flow === 'row') slot.direction = 'row';
  }

  return slot;
}

/**
 * Which list role a measured group is.
 *
 * Read off the rows themselves rather than their position: a column of
 * prices and a column of services sit in the same place on different
 * designs, and only the words tell them apart.
 */
export function listRoleFor(rows: readonly string[]): SlotRole {
  const all = rows.join(' ');
  if (/[₦$€£]\s?\d|\d{3,}(?:[.,]\d{2})?\s*(?:naira|ngn|usd)/i.test(all)) return 'price';
  if (/@|\+\d{6,}|\bwww\.|\.com\b|\bstreet\b|\broad\b/i.test(all)) return 'contact';
  /*
   * A stat row is a number with a word under it. Two thirds of the rows
   * having to start with a figure keeps a numbered list — "01 Logo",
   * "02 Print" — out of it, because that is a sequence of services.
   */
  const numeric = rows.filter((r) => /^[^A-Za-z]*\d[\d.,%]*\s*[A-Za-z]{0,3}$/.test(r.split(/\s{2,}|·/)[0] ?? ''));
  if (numeric.length >= Math.ceil(rows.length * 0.66)) return 'stats';
  return 'services';
}

/**
 * The whole conversion.
 *
 * `title` is the artboard's own `<title>`; the caller supplies the key,
 * because only it knows what the catalogue already answers to.
 */
export function templateFromArtboard(
  board: ParsedArtboard,
  runs: readonly MeasuredRun[],
  boxes: readonly MeasuredShape[] = [],
): CanvasTemplateOutcome {
  if (!runs.length) {
    return { ok: false, reason: 'Nothing could be measured on that artboard. If it is a mockup made of images, there is no text to turn into a template.' };
  }
  if (runs.length > SHEET_RUNS) {
    return {
      ok: false,
      reason: `That artboard holds ${runs.length} separate pieces of text. It is a presentation sheet showing several designs at once, not one deliverable — a template has eleven slots, so importing it would lose most of it. Split it into one artboard per design first.`,
    };
  }

  const drafts = assignRoles(runs, board);
  const headline = drafts.find((d) => d.role === 'headline');
  if (!headline) {
    return { ok: false, reason: 'No line on that artboard reads as a headline, and every template needs one — it is what the gallery previews and what the type fitter sizes against.' };
  }

  const placed = new Set(drafts.map((d) => d.run));
  const skipped = runs
    .filter((r) => !placed.has(r))
    .map((r) => ({
      text: r.text.length > 60 ? `${r.text.slice(0, 57)}…` : r.text,
      why: 'no slot left for it — every role it could fill was already used',
    }));

  /*
   * More left out than brought in is not an import, it is a sketch of one.
   * Said with the count, so the person can decide rather than discover it
   * later in the editor.
   */
  if (skipped.length > drafts.length) {
    return {
      ok: false,
      reason: `Only ${drafts.length} of ${runs.length} lines could be placed — this artboard is richer than a slot template can hold. The ones with nowhere to go: ${skipped.slice(0, 4).map((s) => `“${s.text}”`).join(', ')}.`,
    };
  }

  const lum = luminance(board.background.trim().split(/\s+/)[0]);
  const scheme: 'dark' | 'light' = lum === null ? 'dark' : (lum < 0.35 ? 'dark' : 'light');

  /*
   * The painted layer, back to front as measured, capped.
   *
   * Twelve is already more geometry than any shipped layout carries, and a
   * design that measures forty boxes is a nested flex tree rather than forty
   * decisions — importing all of them would bury the type under wrappers and
   * fill the layers list with things nobody placed. The biggest are kept
   * because those are the ones that read.
   */
  const painted = [...boxes]
    .map((box) => ({ box, spec: shapeFrom(box, board) }))
    .filter((s): s is { box: MeasuredShape; spec: ShapeSpec } => s.spec !== null)
    .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h))
    .slice(0, 12);

  /*
   * A layout built around a photograph says so, so the gallery previews it
   * with one and the editor offers the frame. The threshold is a twelfth of
   * the canvas: smaller than that is a logo or an avatar, not the subject.
   */
  const photo = boxes.filter((b) => b.isImage && b.w * b.h > board.width * board.height / 12);

  const notes: string[] = [...board.notes];
  notes.push(
    'Colours are not imported. A Create Media template is drawn in the brand colour of whoever uses it, so the composition came across and the palette did not.',
  );
  if (painted.length) {
    notes.push(`${painted.length} painted shape${painted.length === 1 ? '' : 's'} came across — bars, panels and discs, each in a brand role rather than a fixed colour.`);
  }
  if (photo.length) {
    notes.push('Built around a photograph, so the gallery previews it with one and the editor keeps the frame.');
  }
  if (drafts.some((d) => d.role === 'brand')) {
    notes.push('The brand lockup became a brand slot, which fills with the business’s own name rather than NowOpen’s.');
  }
  if (skipped.length) {
    notes.push(`${skipped.length} line${skipped.length === 1 ? '' : 's'} had no slot: ${skipped.map((s) => `“${s.text}”`).join(', ')}.`);
  }

  return {
    ok: true,
    template: {
      label: board.title.slice(0, 60),
      desc: `Imported from the NowOpen Africa Creative System · ${board.width}×${board.height}`.slice(0, 160),
      mood: scheme === 'dark' ? 'bold' : 'editorial',
      scheme,
      surface: surfaceFrom(board.background),
      ...(painted.length ? { shapes: painted.map((p) => p.spec) } : {}),
      ...(photo.length ? { photoLed: true } : {}),
      slots: drafts.map((d) => slotFrom(d, board)),
    },
    skipped,
    notes,
  };
}
