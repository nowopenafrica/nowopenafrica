import type { FontKey } from '../design/typefaces';
import type { PageBackground } from './pageBackground';
import type { DesignTemplate, SlotSpec, SurfaceLayer } from '../designTemplates';
import { estimateLines, fitSlotSize, hexAlpha, lineHeightFor, shapeColor } from '../designTemplates';
import { gradientCss, pairingFace, resolveLook, type Look, type PatternSpec, type ResolvedLook } from '../design/look';
import type { Palette, PaletteRole } from '../design/palettes';
import type { Harmony } from '../design/remix';
import type { TemplateContent } from '../../components/studio/TemplateSurface';
import { dressTemplate, toneColour } from './templateDressing';

/**
 * The editable document a Creative Studio project is made of.
 *
 * ── WHY THIS SHAPE, AND WHY NOT A CANVAS LIBRARY ─────────────────────────
 *
 * AUDITED 2026-10-14 before choosing anything:
 *
 *   - 47 templates x 11 styles already exist as STRUCTURED slot documents.
 *     Every slot carries a role, normalised x/y/w, a size, a weight and a
 *     motion spec. They were never flattened pictures.
 *   - `TemplateSurface` draws them with absolutely positioned DOM. Not
 *     canvas, not SVG — and `package.json` contains no canvas library at all.
 *   - Export already runs from that DOM through html-to-image and jsPDF.
 *
 * So the recommendation is to extend THIS model rather than adopt Fabric.js
 * or Konva, for reasons that are about the product and not about taste:
 *
 *   1. Adopting a canvas engine means rewriting the renderer that 47
 *      templates, 11 styles, the gallery, the Studio, the motion renderer and
 *      the export pipeline all depend on. That is a rewrite priced as a
 *      feature.
 *   2. Canvas text is pixels. It cannot be selected, searched, translated or
 *      read by a screen reader, and the same specification demands keyboard
 *      operation and screen-reader descriptions. DOM text is text.
 *   3. Running both engines is what the specification itself warns against.
 *
 * A canvas engine earns its place when the work is pixel compositing —
 * filters, blend modes, freehand drawing. If that arrives, it belongs behind
 * an image-object renderer, not under the whole document.
 *
 * ── COORDINATES ──────────────────────────────────────────────────────────
 *
 * Normalised 0..1 of the page, exactly as the template slots already are. A
 * design therefore survives being resized from an Instagram square to an A3
 * poster without every number being rewritten, and one document renders at
 * any pixel size.
 */

/** Bumped when a reader must upgrade an older document. */
export const SCHEMA_VERSION = 2;

export type ObjectType = 'text' | 'image' | 'shape' | 'group';

export interface DesignObjectBase {
  id: string;
  type: ObjectType;
  /** What the user sees in the layers list. */
  name: string;
  /** Normalised to the page: 0 is the left/top edge, 1 the right/bottom. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** Higher draws later. Contiguous ordering is not assumed. */
  z: number;
  /** Set when this object belongs to a group. */
  parentId?: string | null;
  /**
   * The template slot this came from, when it did.
   *
   * Keeps a converted template linked to its origin, so re-applying a style
   * knows which object is the headline rather than guessing from position.
   */
  slotRole?: string;
}

export interface TextObject extends DesignObjectBase {
  type: 'text';
  text: string;
  /**
   * A key from the type system, resolved to a real face at render time.
   *
   * The whole library rather than the original four roles: the faces are
   * self-hosted and already loaded for the catalogue, so limiting the editor
   * to four of them withheld work that was sitting there.
   */
  font?: FontKey;
  size: number;
  weight?: number;
  tracking?: number;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  upper?: boolean;
  colour?: string;
}

export interface ImageObject extends DesignObjectBase {
  type: 'image';
  /**
   * A reference, never the bytes.
   *
   * A document that embeds base64 images grows without limit, makes autosave
   * expensive and makes version history unaffordable. The migration note says
   * the same thing from the database side.
   */
  assetId: string;
  fit?: 'cover' | 'contain';
  radius?: number;
}

export interface ShapeObject extends DesignObjectBase {
  type: 'shape';
  /*
   * `polygon` exists so a template's geometry survives conversion.
   *
   * A wedge, a skewed panel and a rotated stripe are triangles and
   * quadrilaterals, and the catalogue is full of them — losing the diagonal
   * out of a template called "Diagonal Cut" is losing the template. The
   * renderer draws one with `clip-path`, which is the same mechanism
   * TemplateSurface already uses, so the two cannot disagree.
   */
  shape: 'rect' | 'ellipse' | 'line' | 'polygon';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  /** Polygon only: corners as fractions of the object's own box. */
  points?: [number, number][];
}

export interface GroupObject extends DesignObjectBase {
  type: 'group';
  childIds: string[];
}

export type DesignObject = TextObject | ImageObject | ShapeObject | GroupObject;

export interface DesignPage {
  id: string;
  name: string;
  /** Pixels. The page's own size; object coordinates stay normalised. */
  width: number;
  height: number;
  /** The page colour. Unchanged, so older documents render as they did. */
  background?: string;
  /**
   * A picture or a film behind the design.
   *
   * Optional and additive: a document saved before this existed has none and
   * renders exactly as before. See lib/studio/pageBackground.ts — including
   * why a video cannot appear in an exported file.
   */
  backgroundMedia?: PageBackground;
  /**
   * The look's pattern, drawn over `background` and under every object.
   *
   * Stored as the finished SVG rather than as a pattern key, so a saved design
   * reopens exactly as it was saved even if the pattern library changes. The
   * SVG is drawn at the page's own pixel size and is already clipped to its
   * zone; opacity is the renderer's job, as in TemplateSurface. (Schema 2.)
   */
  pattern?: { svg: string; opacity: number; zone?: PatternSpec['zone'] };
  /**
   * The look's duotone as resolved colours, dark then light, applied to the
   * background photo or film (see DesignSurface). On the page rather than
   * inside `backgroundMedia` because the editor replaces backgroundMedia
   * wholesale whenever a photo is picked or removed, and the duotone belongs
   * to the design, not to whichever photo is in it. Resolved hex rather than
   * role names for the reason the background and pattern are: a page draws
   * exactly as saved even if the palette it came from is later removed.
   * (Schema 2, additive.)
   */
  duotone?: [string, string];
  objects: DesignObject[];
}

/**
 * Where a design's colours came from. Provenance only: the pages already hold
 * resolved colours, so this is what lets a later Remix or re-brand start from
 * the same place, never something a page needs in order to draw. (Schema 2.)
 */
export interface DocumentLook {
  /** The palette the pages were resolved from: a PALETTES key or a brand palette's key. */
  palette: string;
  /** What the customer changed on top of the template's own look. */
  override?: Partial<Look>;
  /** The Remix seed, when the look came from Remix. */
  seed?: number;
  /** The brand colours a brand palette was built from. */
  brand?: { primary: string; secondary?: string; harmony?: Harmony };
}

export interface DesignDocument {
  schemaVersion: number;
  title: string;
  /** Which template this began from, for provenance and re-styling. */
  sourceTemplateKey?: string;
  styleKey?: string;
  /** The brand colour the style derives from. */
  accent?: string;
  look?: DocumentLook;
  pages: DesignPage[];
}

/* ── creating ───────────────────────────────────────────────────────────── */

let counter = 0;
/**
 * Stable-enough ids without pulling in a uuid dependency.
 *
 * Only has to be unique within one document; the row's primary key is the
 * database's business.
 */
export function objectId(prefix = 'o'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export function blankDocument(width: number, height: number, title = 'Untitled design'): DesignDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    title,
    pages: [{ id: objectId('p'), name: 'Page 1', width, height, objects: [] }],
  };
}

/**
 * Turn one of the 517 catalogue designs into an editable document.
 *
 * This is the join between the existing catalogue and the editor, and it is
 * why no template needs re-authoring: a slot already has a role, a position,
 * a width and a size, which is most of a text object.
 *
 * Slots carrying no content are skipped rather than created empty — an
 * invisible object in the layers list is a thing to delete, not a feature.
 */
export function documentFromTemplate(
  template: DesignTemplate,
  content: TemplateContent,
  opts: {
    width: number; height: number; styleKey?: string; accent?: string; title?: string;
    /** The customer's changes to the template's look (Remix, a picked palette). */
    look?: Partial<Look>;
    /** The owner's brand as a palette; wins over the look's own palette. */
    brandPalette?: Palette;
    /** Recorded on the document only, so a later Remix can continue from it. */
    seed?: number;
    brand?: DocumentLook['brand'];
  },
): DesignDocument {
  const dressing = dressTemplate(template, opts);
  const styled = dressing.template;

  /*
    ── THE LOOK, RESOLVED ONCE, BY THE RESOLVER THE GALLERY USES ─────────

    A template with a look must open in the editor as the card that was
    clicked: gradient ground, pattern, role-coloured geometry, palette ink and
    the look's type. All of it comes from resolveLook, the call TemplateSurface
    and the canvas painter make, so the three cannot drift.

    The fallback path (no look, or a look naming a palette that no longer
    exists) leaves everything below exactly as it was before looks existed:
    `dressing` keeps owning the background, the shapes and the text colours.
  */
  const resolved: ResolvedLook = resolveLook(styled, {
    override: opts.look,
    brandPalette: opts.brandPalette,
    accent: dressing.accent,
    base: dressing.base,
    styleKey: opts.styleKey,
    width: opts.width,
    height: opts.height,
  });
  const hasLook = resolved.source === 'look';
  const { roles, inkOn } = resolved;

  /*
   * The layer strings TemplateSurface paints; the flat ground fills beneath.
   * groundLayers run bottom to top (TemplateSurface stacks them as sibling
   * divs, the canvas paints them in order), and a CSS background list paints
   * its FIRST value on top, so the list is reversed. Unreversed, a mesh's
   * opaque base sat over its own radials and the editor showed a flat ground.
   */
  const background = hasLook
    ? `${[...resolved.groundLayers].reverse().map(layerCss).join(', ')}, ${roles.ground}`
    : dressing.background;

  /*
   * Shapes re-coloured from the roles. dressTemplate builds them in the
   * template's own order, so index i is styled.shapes[i]; its geometry is kept
   * and only the paint changes. A gradient fill becomes a CSS gradient, which
   * DesignSurface draws as the object's background.
   */
  const shapes = hasLook
    ? dressing.shapes.map((obj, i) => {
      const spec = styled.shapes?.[i];
      if (!spec) return obj;
      const flat = shapeColor(spec.tone, roles.primary, roles.ink, roles.ground, roles);
      if (spec.kind === 'ring') return { ...obj, stroke: flat };
      const fill = (spec.kind === 'rect' || spec.kind === 'circle') && spec.fill
        ? gradientCss(spec.fill, roles)
        : flat;
      return { ...obj, fill };
    })
    : dressing.shapes;

  /* TemplateSurface's slotTone: a role tone is the role, muted is the ink held back. */
  const lookColour = (slot: SlotSpec): string => {
    const ink = inkOn[slot.on ?? 'ground'];
    const role: PaletteRole | null = slot.tone === 'accent' || slot.tone === 'primary'
      ? 'primary'
      : slot.tone === 'secondary' || slot.tone === 'highlight' ? slot.tone : null;
    if (role) return roles[role];
    if (slot.tone === 'muted') return hexAlpha(ink, 0.72);
    return ink;
  };

  /* TemplateSurface's lookFamily: display face for big type, accent face for the eyebrow. */
  const lookFont = (slot: SlotSpec): TextObject['font'] => pairingFace(slot, resolved.pairing);

  /**
   * The words for a slot.
   *
   * ── THE SIX THAT WERE CARRIED, AND THE REST THAT WERE NOT ────────────
   *
   * This used to handle brand, eyebrow, headline, subline, meta and cta, and
   * return null for everything else — so a menu's prices, a consultancy's
   * services, a report's statistics and a card's contact details were
   * silently dropped. The layouts built around those lists opened empty,
   * which is how a price list arrived in the editor as a headline and
   * nothing else.
   *
   * Lists join with newlines, which render correctly now that the canvas
   * honours a line break (see DesignSurface's `pre-wrap`). Before that fix
   * they would have collapsed into one run, which is presumably part of why
   * they were never carried.
   */
  const textFor = (role: string): string | null => {
    switch (role) {
      case 'brand': return content.brand ?? null;
      case 'eyebrow': return content.eyebrow ?? null;
      case 'headline': return content.headline ?? null;
      case 'subline': return content.subline ?? null;
      case 'meta': return content.meta ?? null;
      case 'cta': return content.cta ?? null;
      case 'services': return content.services?.length ? content.services.join('\n') : null;
      case 'contact': return content.contact?.length ? content.contact.join('\n') : null;
      case 'stats':
        return content.stats?.length
          ? content.stats.map((s) => `${s.value}  ${s.label}`).join('\n')
          : null;
      case 'price':
        return content.price?.length
          ? content.price.map((p) => `${p.label}  ${p.price}`).join('\n')
          : null;
      default: return null;
    }
  };

  /*
   * One page per slot set — see `extraPages` in designTemplates.ts. The back
   * of a card, the second page of a menu and a brochure panel are the same
   * mechanism, so the editor and the PDF exporter need no special case.
   */
  const buildObjects = (slots: typeof template.slots, withShapes: boolean): DesignObject[] => {
  /* Geometry first: the template paints it between surface and type. */
  const objects: DesignObject[] = withShapes ? [...shapes] : [];
  let z = objects.length;

  for (const slot of slots) {
    const text = textFor(slot.role);
    if (!text) continue;

    /*
      ── THE SIZE THE GALLERY WOULD HAVE USED ───────────────────────────

      This copied `slot.size` straight across, and that is why a template
      opened in the editor looked nothing like the card that was clicked.
      Two separate faults in one assignment:

      1. NO FITTING. The gallery runs every slot through `fitSlotSize`,
         which shrinks type until it stops colliding with the slot below.
         The editor did not, so a long headline overflowed its box and ran
         through the subline underneath. MEASURED on editorial-split: "What
         you are announcing" clipped its own descenders and collided with
         the line below it.

      2. THE WRONG UNIT. `slot.size` is a fraction of the SHORT edge
         (typePx multiplies by `min(w, h)`), but the document renders it as
         `cqw` — a fraction of the WIDTH. Identical on a portrait page,
         where width IS the short edge, and badly wrong on a landscape one:
         a 1920x1080 banner drew every word 78% too large.

      Fitting in pixels and dividing by the width fixes both at once.
    */
    const fittedPx = fitSlotSize(slot, slots, text, opts.width, opts.height);
    const size = fittedPx / opts.width;

    z += 1;
    objects.push({
      id: objectId('t'),
      type: 'text',
      // The role is the most useful name a layers list can show.
      name: slot.role.charAt(0).toUpperCase() + slot.role.slice(1),
      slotRole: slot.role,
      x: slot.x,
      /*
       * `fromBottom` slots are measured up from the foot of the page. The
       * document has one origin, so it is resolved here rather than leaving
       * two coordinate conventions for every later reader to remember.
       */
      y: slot.fromBottom ? 1 - slot.y : slot.y,
      /* `y` is re-clamped below, once the height it needs is known. */
      w: slot.w,
      /*
        Slots do not carry a height, so the box is sized from its type — and
        from HOW MANY LINES it holds.

        Sizing every box for one line was right while only single-line roles
        were carried. The moment the lists came across it silently clipped
        them: a four-item services column rendered two items and the renderer
        hides the overflow, so nothing said so. Measured on consulting-clean,
        which showed two of four.
      */
      /*
        Tall enough for the lines this text will ACTUALLY take.

        It counted explicit newlines only, so a headline that WRAPPED to two
        lines was drawn into a one-line box and clipped by the renderer's
        `overflow: hidden` — seen on editorial-split, where "What you are
        announcing" lost the bottom of its own descenders and ran into the
        line beneath it. `estimateLines` is the same estimate the fitter
        shrinks against, so the box and the type now agree.
      */
      /*
        1.55 was a FOURTH copy of a number that has one home.

        `lineHeightFor` is 1.03 for display type and 1.25 for body, and its
        own comment says why it exists: "Three copies of one number is how a
        preview stops matching an export." This line was the fourth, and it
        was half again too large — so every box in the editor stood 24-50%
        taller than the words inside it.

        MEASURED: 27 slots across 21 layouts had boxes reaching past the top
        of the slot beneath them. Six pairs overlapped by 100% — one text box
        entirely inside another — so clicking a headline in the editor
        selected and dragged a different object. That is what "opening a
        template scatters it" was.
      */
      /*
        And the height is a fraction of the HEIGHT.

        `size` is px/width, because the renderer sets type in cqw. Multiplying
        it by a line count gives a fraction of the WIDTH, and `h` is read as a
        fraction of the height — the same unit confusion that drew type 78%
        too large on a landscape banner, wearing a different hat.

        Square pages hid it completely. On a 1080x1920 story every box came
        out 1.78x too tall, which put seven more pairs of boxes on top of each
        other on exactly the format most of this library is made for.
      */
      h: Math.min(1, (fittedPx * lineHeightFor(slot.size)
        * estimateLines(text, slot, fittedPx, opts.width)
        * (text.includes(String.fromCharCode(10)) ? (slot.gap ?? 1.4) / 1.4 : 1)) / opts.height),
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      z,
      text,
      size,
      weight: slot.weight,
      tracking: slot.tracking,
      upper: slot.upper,
      /*
        Carried, and previously not: a centred headline arrived left-aligned,
        and every tone resolved to the renderer's near-black default — white
        type on a dark ground included.
      */
      align: slot.align,
      colour: hasLook ? lookColour(slot) : toneColour(slot.tone, dressing),
      font: hasLook
        ? lookFont(slot)
        : slot.font === 'mono' ? 'mono' : slot.font === 'serif' ? 'serif' : undefined,
    });

    /*
      A box may not hang off the bottom of the page.

      `fromBottom` slots are anchored near the foot — a three-line contact
      block sits at y 0.95 — and the box then grows DOWNWARD from there, so
      its last line fell outside the frame. The export is a flat image, so
      anything past the edge is not clipped, it is gone.

      Measured on agency-services, why-choose-us, flash-sale and
      promo-ticker: all four contact blocks ended at 1.03 of the page.
      Nudging the box up is the smallest honest fix; the slot keeps its
      anchor, the words stay on the paper.
    */
    const placed = objects[objects.length - 1];
    if (placed.y + placed.h > 1) placed.y = Math.max(0, 1 - placed.h);
  }

  return objects;
  };

  const sets: { name: string; slots: typeof template.slots }[] = [
    { name: styled.extraPages?.length ? 'Front' : 'Page 1', slots: styled.slots },
    ...(styled.extraPages ?? []),
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    title: opts.title ?? template.label,
    sourceTemplateKey: template.key,
    styleKey: opts.styleKey,
    accent: opts.accent,
    ...(hasLook ? { look: lookRecord(opts, styled) } : {}),
    pages: sets.map((set, i) => ({
      id: objectId('p'),
      name: set.name,
      width: opts.width,
      height: opts.height,
      /*
        The surface the gallery showed. Without it every template opened on
        white, whatever it looked like on the card.
      */
      background,
      /* Every page shares the ground, so every page shares its pattern. */
      ...(resolved.pattern
        ? { pattern: { svg: resolved.pattern.svg, opacity: resolved.pattern.opacity, zone: resolved.pattern.zone } }
        : {}),
      /* So a photo added in the editor is toned as the customiser toned it. */
      ...(resolved.duotone ? { duotone: [resolved.duotone[0], resolved.duotone[1]] as [string, string] } : {}),
      /* Shapes belong to the front; a card's back has its own composition. */
      objects: buildObjects(set.slots, i === 0),
    })),
  };
}

/** What documentFromTemplate records about the look it resolved. */
function lookRecord(
  opts: { look?: Partial<Look>; brandPalette?: Palette; seed?: number; brand?: DocumentLook['brand'] },
  styled: DesignTemplate,
): DocumentLook {
  // An explicit undefined is "not overridden", exactly as resolveLook reads it.
  const override = Object.fromEntries(
    Object.entries(opts.look ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<Look>;
  return {
    palette: opts.brandPalette?.key ?? override.palette ?? styled.look?.palette ?? '',
    ...(Object.keys(override).length ? { override } : {}),
    ...(typeof opts.seed === 'number' ? { seed: opts.seed } : {}),
    ...(opts.brand ? { brand: opts.brand } : {}),
  };
}

/** The string TemplateSurface's layerCss produces, so the editor paints the gallery's ground. */
function layerCss(l: SurfaceLayer): string {
  const stops = l.stops.map((st) => `${st.color} ${Math.round(st.at * 100)}%`).join(', ');
  return l.kind === 'linear'
    ? `linear-gradient(${l.angle}deg, ${stops})`
    : `radial-gradient(${Math.round(l.r * 100)}% ${Math.round(l.r * 100)}% at ${Math.round(l.cx * 100)}% ${Math.round(l.cy * 100)}%, ${stops})`;
}

/* ── reading what was saved ─────────────────────────────────────────────── */

/**
 * Accept a stored document, or say why not.
 *
 * Runs before anything is rendered or written. A project row is JSONB and
 * therefore anything at all; this is the only place that decides a document
 * is usable, so a corrupt or hand-edited row fails here rather than halfway
 * through a render.
 */
export function readDocument(raw: unknown): { ok: true; doc: DesignDocument } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'Not a document.' };
  const d = raw as Partial<DesignDocument>;

  if (typeof d.schemaVersion !== 'number') return { ok: false, reason: 'No schema version.' };
  if (d.schemaVersion > SCHEMA_VERSION) {
    /*
     * Newer than this build understands. Refuse rather than render a document
     * missing whatever the newer version added — a half-drawn design that the
     * user then saves would destroy the parts this build cannot see.
     */
    return { ok: false, reason: 'This design was made in a newer version of Studio. Reload the page.' };
  }
  if (!Array.isArray(d.pages) || d.pages.length === 0) return { ok: false, reason: 'No pages.' };

  for (const page of d.pages) {
    if (!page || typeof page !== 'object') return { ok: false, reason: 'A page is not an object.' };
    if (!(page.width > 0) || !(page.height > 0)) return { ok: false, reason: 'A page has no size.' };
    if (!Array.isArray(page.objects)) return { ok: false, reason: 'A page has no objects array.' };
  }

  /*
    ── UPGRADING, AND THE LOOK ────────────────────────────────────────────

    Version 1 had no look and no page pattern, and version 2 only ADDED
    optional fields, so a version 1 document is already a valid version 2 one:
    the upgrade is the number and nothing else. Nothing it draws moves.

    The look and the pattern are decoration, so damage to either costs the
    decoration, not the design: a malformed one is dropped rather than refusing
    everything the person made. A look naming a palette that no longer exists
    is KEPT as written. The pages hold resolved colours, so the design still
    draws exactly as saved, and anything that re-resolves it goes through
    resolveLook, whose fallback answers a stale key with the template's own
    colours instead of nothing.
  */
  const { look: rawLook, ...rest } = d as DesignDocument & { look?: unknown };
  const look = readLook(rawLook);
  const pages = (d.pages as DesignPage[]).map((page) => {
    if (!('pattern' in page) && !('duotone' in page)) return page;
    const { pattern: rawPattern, duotone: rawDuotone, ...bare } =
      page as DesignPage & { pattern?: unknown; duotone?: unknown };
    const pattern = 'pattern' in page ? readPattern(rawPattern) : null;
    const duotone = 'duotone' in page ? readDuotone(rawDuotone) : null;
    return { ...bare, ...(pattern ? { pattern } : {}), ...(duotone ? { duotone } : {}) };
  });

  return {
    ok: true,
    doc: {
      ...(rest as DesignDocument),
      schemaVersion: SCHEMA_VERSION,
      title: d.title ?? 'Untitled design',
      ...(look ? { look } : {}),
      pages,
    },
  };
}

const ZONES = new Set(['full', 'top', 'bottom', 'left', 'right', 'band']);

/** A stored pattern, or null. The SVG is only ever drawn as a data: URL image, which runs no script. */
function readPattern(raw: unknown): DesignPage['pattern'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.svg !== 'string' || !r.svg.startsWith('<svg')) return null;
  if (typeof r.opacity !== 'number' || !Number.isFinite(r.opacity)) return null;
  return {
    svg: r.svg,
    opacity: Math.max(0, Math.min(1, r.opacity)),
    ...(typeof r.zone === 'string' && ZONES.has(r.zone) ? { zone: r.zone as PatternSpec['zone'] } : {}),
  };
}

/*
 * Hex is allowed here, unlike in a Look: this is the RESOLVED document, whose
 * pages hold finished colours. Strictly two six-digit hexes, because the pair
 * is written into an SVG filter matrix and nothing else may reach it.
 */
const DUOTONE_HEX = /^#[0-9a-f]{6}$/i;

/** A stored duotone pair, or null. */
function readDuotone(raw: unknown): [string, string] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  if (!raw.every((c) => typeof c === 'string' && DUOTONE_HEX.test(c))) return null;
  return [raw[0] as string, raw[1] as string];
}

/** A stored look record, or null. Only its shape is checked; see readDocument. */
function readLook(raw: unknown): DocumentLook | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.palette !== 'string' || !r.palette) return null;
  const brand = r.brand as Record<string, unknown> | null | undefined;
  return {
    palette: r.palette,
    ...(r.override && typeof r.override === 'object' && !Array.isArray(r.override)
      ? { override: r.override as Partial<Look> } : {}),
    ...(typeof r.seed === 'number' && Number.isFinite(r.seed) ? { seed: r.seed } : {}),
    ...(brand && typeof brand === 'object' && typeof brand.primary === 'string'
      ? { brand: brand as DocumentLook['brand'] } : {}),
  };
}

/** Objects in paint order. Ties keep their array order, so a sort is stable. */
export function inPaintOrder(page: DesignPage): DesignObject[] {
  return page.objects.map((o, i) => ({ o, i })).sort((a, b) => a.o.z - b.o.z || a.i - b.i).map((x) => x.o);
}
