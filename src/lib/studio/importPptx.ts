/**
 * Bringing a PowerPoint deck in as editable pages.
 *
 * ── WHY THIS ONE CAN BE HONEST ABOUT "EDITABLE" ──────────────────────────
 *
 * A PDF is a page description: by the time it exists the text is positioned
 * glyphs and the layout is gone. A .pptx is the opposite — it is still the
 * authoring format. Every text frame is XML with its words, its box, its
 * point size and its colour intact. So this import produces real text
 * objects you can retype, not a picture of a slide.
 *
 * ── THE PART EVERY NAIVE IMPORTER GETS WRONG ─────────────────────────────
 *
 * Most shapes in a real deck have NO position of their own. A title typed
 * into the title box carries `<p:ph type="title"/>` and inherits its geometry
 * from the slide layout, which may in turn inherit from the master. An
 * importer that only reads `<a:xfrm>` off the slide finds nothing on an
 * ordinary deck and imports an empty page.
 *
 * So the geometry is resolved down the real chain — slide, then layout, then
 * master — matching placeholders by type and index the way PowerPoint does.
 * Colours are resolved the same way: `<a:schemeClr val="tx1"/>` is not a
 * colour, it is a lookup through the master's colour map into the theme.
 *
 * Anything whose box cannot be resolved is COUNTED and reported, never
 * dropped quietly and never placed at a guessed position — a title landing in
 * the wrong corner is worse than a title the user is told about.
 *
 * ── WHAT DOES NOT COME ACROSS ────────────────────────────────────────────
 *
 * Charts, tables, SmartArt, animations, transitions and speaker notes. This
 * document model has no equivalent for any of them, and the count says so.
 */

import type {
  DesignDocument, DesignObject, DesignPage, ImageObject, ShapeObject, TextObject,
} from './designDocument';
import { SCHEMA_VERSION, objectId } from './designDocument';
import { clampPageSize } from './formats';

/** EMU — English Metric Units — are what a .pptx measures in. */
const EMU_PER_INCH = 914400;
const EMU_PER_POINT = 12700;
/** The size a slide is rendered at here. 96dpi keeps a 10in slide at 960px. */
const RENDER_DPI = 96;

/** More than this and a deck becomes a document nobody can navigate. */
export const MAX_SLIDES = 20;

export interface PptxPicture {
  /** The object to attach the uploaded asset to. */
  objectId: string;
  /** The part name inside the archive, e.g. `ppt/media/image2.png`. */
  part: string;
}

export interface PptxPage {
  name: string;
  width: number;
  height: number;
  background?: string;
  objects: DesignObject[];
  pictures: PptxPicture[];
}

export interface PptxImport {
  pages: PptxPage[];
  /** Text frames and shapes that came across as editable objects. */
  editable: number;
  /** Shapes whose box could not be resolved, so were left out rather than guessed. */
  unplaced: number;
  /** Charts, tables, SmartArt and the like, which have no equivalent here. */
  unsupported: number;
  /** Slides beyond the ceiling, if the deck was longer. */
  droppedSlides: number;
}

export type ParseXml = (text: string) => Document;

/* ── small XML helpers, by LOCAL name ──────────────────────────────────────
 *
 * Never by prefix. `p:` and `a:` are conventions, not guarantees — a deck
 * exported by another tool may bind the same namespaces to other prefixes,
 * and a selector written against the prefix then matches nothing at all while
 * looking like it worked.
 */

const kids = (el: Element, name: string): Element[] =>
  [...el.children].filter((c) => c.localName === name);

const kid = (el: Element | null, name: string): Element | null =>
  el ? kids(el, name)[0] ?? null : null;

/** First descendant at any depth. */
const deep = (el: Element | null, name: string): Element | null => {
  if (!el) return null;
  for (const node of el.getElementsByTagName('*')) {
    if (node.localName === name) return node;
  }
  return null;
};

const deepAll = (el: Element | null, name: string): Element[] =>
  el ? [...el.getElementsByTagName('*')].filter((n) => n.localName === name) : [];

const int = (v: string | null | undefined, fallback = 0): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

/** `../slideLayouts/slideLayout1.xml` relative to `ppt/slides/slide1.xml`. */
export function resolvePart(from: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = from.split('/').slice(0, -1);
  for (const step of target.split('/')) {
    if (step === '.' || step === '') continue;
    if (step === '..') parts.pop();
    else parts.push(step);
  }
  return parts.join('/');
}

/** The relationship file that belongs to a part. */
export const relsPart = (part: string): string => {
  const at = part.lastIndexOf('/');
  return `${part.slice(0, at)}/_rels${part.slice(at)}.rels`;
};

/** rId → part name, already resolved against the owning part. */
export function readRels(xml: Document | null, owner: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!xml) return out;
  for (const rel of deepAll(xml.documentElement, 'Relationship')) {
    /*
     * External relationships point at a URL, not a part. Resolving one as a
     * path would invent a part name; following one would fetch from wherever
     * the file says, which is not something an opened document gets to do.
     */
    if (rel.getAttribute('TargetMode') === 'External') continue;
    const target = rel.getAttribute('Target');
    const id = rel.getAttribute('Id');
    if (id && target) out.set(id, resolvePart(owner, target));
  }
  return out;
}

/* ── colour ──────────────────────────────────────────────────────────────── */

/** dk1/lt1/accent1… → hex, read from the theme. */
export function readTheme(xml: Document | null): Map<string, string> {
  const out = new Map<string, string>();
  const scheme = deep(xml?.documentElement ?? null, 'clrScheme');
  if (!scheme) return out;
  for (const slot of [...scheme.children]) {
    const srgb = kid(slot, 'srgbClr');
    const sys = kid(slot, 'sysClr');
    const hex = srgb?.getAttribute('val') ?? sys?.getAttribute('lastClr');
    if (hex) out.set(slot.localName ?? '', `#${hex}`);
  }
  return out;
}

/** The master's clrMap: tx1→dk1 and friends. Standard mapping when absent. */
export function readColourMap(master: Document | null): Map<string, string> {
  const out = new Map<string, string>([
    ['bg1', 'lt1'], ['tx1', 'dk1'], ['bg2', 'lt2'], ['tx2', 'dk2'],
  ]);
  const map = deep(master?.documentElement ?? null, 'clrMap');
  if (!map) return out;
  for (const attr of [...map.attributes]) out.set(attr.name, attr.value);
  return out;
}

export interface Palette {
  theme: Map<string, string>;
  map: Map<string, string>;
}

/** Any `<a:solidFill>`-ish element down to a hex colour, or null. */
export function colourOf(holder: Element | null, palette: Palette): string | undefined {
  if (!holder) return undefined;
  const srgb = kid(holder, 'srgbClr');
  if (srgb?.getAttribute('val')) return `#${srgb.getAttribute('val')}`;
  const scheme = kid(holder, 'schemeClr');
  const name = scheme?.getAttribute('val');
  if (!name) return undefined;
  /* A scheme colour is a lookup, not a colour: name → colour map → theme. */
  const resolved = palette.map.get(name) ?? name;
  return palette.theme.get(resolved) ?? palette.theme.get(name);
}

/* ── geometry ────────────────────────────────────────────────────────────── */

export interface Box { x: number; y: number; w: number; h: number; rot: number }

/** `<a:xfrm>` on a shape, in EMU. */
export function readXfrm(sp: Element): Box | null {
  const xfrm = deep(kid(sp, 'spPr') ?? kid(sp, 'grpSpPr') ?? sp, 'xfrm');
  const off = kid(xfrm, 'off');
  const ext = kid(xfrm, 'ext');
  if (!off || !ext) return null;
  const w = int(ext.getAttribute('cx'));
  const h = int(ext.getAttribute('cy'));
  if (w <= 0 || h <= 0) return null;
  return {
    x: int(off.getAttribute('x')),
    y: int(off.getAttribute('y')),
    w,
    h,
    /* Stored in 60,000ths of a degree. */
    rot: int(xfrm?.getAttribute('rot')) / 60000,
  };
}

/** The key a placeholder is matched on: its type and its index. */
export const placeholderKey = (ph: Element | null): string | null => {
  if (!ph) return null;
  const type = ph.getAttribute('type') ?? 'body';
  const idx = ph.getAttribute('idx') ?? '';
  return `${type}:${idx}`;
};

const phOf = (sp: Element): Element | null => deep(kid(sp, 'nvSpPr') ?? kid(sp, 'nvPicPr') ?? sp, 'ph');

/** Every placeholder box a layout or master defines, by key. */
export function placeholderBoxes(xml: Document | null): Map<string, Box> {
  const out = new Map<string, Box>();
  if (!xml) return out;
  for (const sp of deepAll(xml.documentElement, 'sp')) {
    const key = placeholderKey(phOf(sp));
    const box = readXfrm(sp);
    if (key && box && !out.has(key)) out.set(key, box);
  }
  return out;
}

/* ── text ────────────────────────────────────────────────────────────────── */

const ALIGN: Record<string, 'left' | 'center' | 'right'> = {
  l: 'left', ctr: 'center', r: 'right', just: 'left', dist: 'left',
};

interface SlideText {
  text: string;
  sizePt: number | null;
  weight: number;
  align?: 'left' | 'center' | 'right';
  colour?: string;
  upper: boolean;
}

/** Read a `<p:txBody>` into words and the style of its first run. */
export function readTextBody(body: Element | null, palette: Palette): SlideText | null {
  if (!body) return null;
  const paragraphs: string[] = [];
  let first: Element | null = null;
  let align: string | null = null;
  let upper = false;

  for (const p of kids(body, 'p')) {
    const runs = [...p.children].filter((c) => c.localName === 'r' || c.localName === 'br');
    const line = runs.map((r) => (r.localName === 'br' ? '\n' : kid(r, 't')?.textContent ?? '')).join('');
    paragraphs.push(line);
    if (!first) {
      const run = kids(p, 'r')[0] ?? null;
      first = kid(run, 'rPr');
      align = kid(p, 'pPr')?.getAttribute('algn') ?? null;
      if (first?.getAttribute('cap') === 'all') upper = true;
    }
  }

  const text = paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return null;

  const sz = int(first?.getAttribute('sz'), 0);
  return {
    text,
    /* `sz` is hundredths of a point. Absent means inherited — resolved later. */
    sizePt: sz > 0 ? sz / 100 : null,
    weight: first?.getAttribute('b') === '1' ? 700 : 400,
    align: align ? ALIGN[align] : undefined,
    colour: colourOf(kid(first, 'solidFill'), palette),
    upper,
  };
}

/**
 * The point size to use when the deck inherits it from a layout we have not
 * resolved to the run level.
 *
 * PowerPoint's own defaults, by placeholder role. A guess, but a declared
 * one, and one that lands in the right order of magnitude rather than
 * rendering a 44pt title at body size.
 */
export function defaultSizePt(key: string | null): number {
  if (!key) return 18;
  if (key.startsWith('ctrTitle') || key.startsWith('title')) return 44;
  if (key.startsWith('subTitle')) return 24;
  return 18;
}

/* ── the import ──────────────────────────────────────────────────────────── */

const SHAPE_FOR: Record<string, 'rect' | 'ellipse'> = {
  rect: 'rect', roundRect: 'rect', snipRoundRect: 'rect',
  ellipse: 'ellipse', circle: 'ellipse',
};

/**
 * Read a deck's XML parts into editable pages.
 *
 * `parts` is part name → XML text, as read out of the archive. `parse` is
 * injected so this can be tested against hand-written slide XML without a
 * browser or a real .pptx.
 */
export function importPptx(
  parts: Map<string, string>,
  parse: ParseXml,
): PptxImport | { error: string } {
  const doc = (name: string): Document | null => {
    const text = parts.get(name);
    if (!text) return null;
    try {
      const parsed = parse(text);
      return parsed.querySelector('parsererror') ? null : parsed;
    } catch {
      return null;
    }
  };

  const presentation = doc('ppt/presentation.xml');
  if (!presentation) return { error: 'That file is not a PowerPoint presentation, or it is damaged.' };

  const sldSz = deep(presentation.documentElement, 'sldSz');
  const slideCx = int(sldSz?.getAttribute('cx'), 12192000);
  const slideCy = int(sldSz?.getAttribute('cy'), 6858000);
  if (slideCx <= 0 || slideCy <= 0) return { error: 'That presentation does not declare a slide size.' };

  const page = clampPageSize(
    Math.round((slideCx / EMU_PER_INCH) * RENDER_DPI),
    Math.round((slideCy / EMU_PER_INCH) * RENDER_DPI),
  );

  /* Slide ORDER comes from the presentation's relationships, not from the
   * file names — a reordered deck keeps slide3.xml in third place only by
   * coincidence. */
  const presRels = readRels(doc(relsPart('ppt/presentation.xml')), 'ppt/presentation.xml');
  const ordered: string[] = [];
  for (const sldId of deepAll(deep(presentation.documentElement, 'sldIdLst'), 'sldId')) {
    const rId = [...sldId.attributes].find((a) => a.name.endsWith('id') && a.value.startsWith('rId'))?.value
      ?? sldId.getAttribute('r:id');
    const part = rId ? presRels.get(rId) : undefined;
    if (part && parts.has(part)) ordered.push(part);
  }
  if (ordered.length === 0) {
    for (const name of [...parts.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) ordered.push(name);
    ordered.sort((a, b) => int(a.match(/(\d+)/)?.[1]) - int(b.match(/(\d+)/)?.[1]));
  }
  if (ordered.length === 0) return { error: 'That presentation has no slides in it.' };

  const droppedSlides = Math.max(0, ordered.length - MAX_SLIDES);
  const pages: PptxPage[] = [];
  let editable = 0;
  let unplaced = 0;
  let unsupported = 0;

  for (const [index, part] of ordered.slice(0, MAX_SLIDES).entries()) {
    const slide = doc(part);
    if (!slide) { unsupported += 1; continue; }

    const rels = readRels(doc(relsPart(part)), part);
    const layoutPart = [...rels.values()].find((p) => p.includes('slideLayout')) ?? '';
    const layout = layoutPart ? doc(layoutPart) : null;
    const layoutRels = layoutPart ? readRels(doc(relsPart(layoutPart)), layoutPart) : new Map<string, string>();
    const masterPart = [...layoutRels.values()].find((p) => p.includes('slideMaster')) ?? '';
    const master = masterPart ? doc(masterPart) : null;
    const masterRels = masterPart ? readRels(doc(relsPart(masterPart)), masterPart) : new Map<string, string>();
    const themePart = [...masterRels.values()].find((p) => p.includes('theme')) ?? 'ppt/theme/theme1.xml';

    const palette: Palette = { theme: readTheme(doc(themePart)), map: readColourMap(master) };
    const layoutBoxes = placeholderBoxes(layout);
    const masterBoxes = placeholderBoxes(master);

    const objects: DesignObject[] = [];
    const pictures: PptxPicture[] = [];
    let z = 1;

    const tree = deep(slide.documentElement, 'cSld');
    const spTree = deep(tree, 'spTree');

    const background = colourOf(deep(kid(tree, 'bg'), 'solidFill'), palette)
      ?? colourOf(deep(kid(deep(layout?.documentElement ?? null, 'cSld'), 'bg'), 'solidFill'), palette)
      ?? colourOf(deep(kid(deep(master?.documentElement ?? null, 'cSld'), 'bg'), 'solidFill'), palette);

    for (const node of [...(spTree?.children ?? [])]) {
      const tag = node.localName;

      /*
       * Charts, tables and SmartArt arrive as a graphicFrame. There is no
       * table or chart object in this document model, so they are counted,
       * not approximated — a chart redrawn as four rectangles is a lie about
       * what was imported.
       */
      if (tag === 'graphicFrame' || tag === 'grpSp') { unsupported += 1; continue; }
      if (tag !== 'sp' && tag !== 'pic') continue;

      const key = placeholderKey(phOf(node));
      const box = readXfrm(node)
        ?? (key ? layoutBoxes.get(key) ?? masterBoxes.get(key) : null)
        /* A placeholder with no index still matches its type on the layout. */
        ?? (key ? layoutBoxes.get(`${key.split(':')[0]}:`) ?? masterBoxes.get(`${key.split(':')[0]}:`) : null)
        ?? null;

      if (!box) { unplaced += 1; continue; }

      const common = {
        x: box.x / slideCx,
        y: box.y / slideCy,
        w: Math.min(1, box.w / slideCx),
        h: Math.min(1, box.h / slideCy),
        rotation: box.rot,
        opacity: 1,
        visible: true,
        locked: false,
        z: (z += 1),
      };

      if (tag === 'pic') {
        const embed = [...(deep(node, 'blip')?.attributes ?? [])]
          .find((a) => a.name.endsWith('embed') || a.name.endsWith('link'))?.value;
        const target = embed ? rels.get(embed) : undefined;
        if (!target) { unsupported += 1; continue; }
        const id = objectId('i');
        objects.push({
          ...common,
          id,
          type: 'image',
          name: target.split('/').pop() ?? 'Picture',
          /* Filled in once the bytes have been uploaded; see the editor. */
          assetId: '',
          fit: 'contain',
        } as ImageObject);
        pictures.push({ objectId: id, part: target });
        editable += 1;
        continue;
      }

      const body = readTextBody(deep(node, 'txBody'), palette);
      if (body) {
        const sizePt = body.sizePt ?? defaultSizePt(key);
        objects.push({
          ...common,
          id: objectId('t'),
          type: 'text',
          name: body.text.slice(0, 40),
          text: body.text,
          /* Normalised to the page width, which is how this model sizes text. */
          size: (sizePt * EMU_PER_POINT) / slideCx,
          weight: body.weight,
          align: body.align,
          upper: body.upper,
          colour: body.colour,
          slotRole: key?.split(':')[0],
        } as TextObject);
        editable += 1;
        continue;
      }

      /* A shape with no words is still a shape, if it is one this can draw. */
      const preset = deep(kid(node, 'spPr'), 'prstGeom')?.getAttribute('prst') ?? 'rect';
      const shape = SHAPE_FOR[preset];
      if (!shape) { unsupported += 1; continue; }
      const fill = colourOf(deep(kid(node, 'spPr'), 'solidFill'), palette);
      const line = kid(kid(node, 'spPr'), 'ln');
      objects.push({
        ...common,
        id: objectId('s'),
        type: 'shape',
        shape,
        name: shape === 'rect' ? 'Rectangle' : 'Ellipse',
        fill,
        stroke: colourOf(deep(line, 'solidFill'), palette),
      } as ShapeObject);
      editable += 1;
    }

    pages.push({
      name: `Slide ${index + 1}`,
      width: page.width,
      height: page.height,
      background,
      objects,
      pictures,
    });
  }

  if (pages.length === 0) return { error: 'None of the slides in that file could be read.' };
  return { pages, editable, unplaced, unsupported, droppedSlides };
}

/** What the user is told, in the order it matters to them. */
export function pptxSummary(result: PptxImport): string {
  const parts: string[] = [];
  const pages = result.pages.length;
  parts.push(`${pages} ${pages === 1 ? 'slide' : 'slides'} imported`);
  parts.push(result.editable === 1 ? '1 editable object' : `${result.editable} editable objects`);
  if (result.unplaced > 0) {
    parts.push(`${result.unplaced} ${result.unplaced === 1 ? 'shape' : 'shapes'} had no position to read`);
  }
  if (result.unsupported > 0) {
    parts.push(`${result.unsupported} (charts, tables or groups) could not come across`);
  }
  if (result.droppedSlides > 0) parts.push(`${result.droppedSlides} further slides were left out`);
  return `${parts.join(', ')}.`;
}

/**
 * Assemble the parsed deck into a document.
 *
 * `assets` maps a picture's object id to the storage path its bytes were
 * uploaded to. A picture missing from that map is REMOVED rather than kept
 * with an empty reference: an image object pointing at nothing renders as a
 * broken box the user cannot fix, and is counted instead so they are told.
 */
export function documentFromPptx(
  result: PptxImport,
  assets: Map<string, string>,
  title: string,
): { doc: DesignDocument; droppedPictures: number } {
  let droppedPictures = 0;

  const pages: DesignPage[] = result.pages.map((page) => ({
    id: objectId('p'),
    name: page.name,
    width: page.width,
    height: page.height,
    background: page.background,
    objects: page.objects.flatMap((object): DesignObject[] => {
      if (object.type !== 'image') return [object];
      const assetId = assets.get(object.id);
      if (!assetId) { droppedPictures += 1; return []; }
      return [{ ...object, assetId }];
    }),
  }));

  return {
    doc: { schemaVersion: SCHEMA_VERSION, title: title.slice(0, 80) || 'Imported deck', pages },
    droppedPictures,
  };
}

/** The parts worth inflating: the XML that describes the deck, plus media. */
export const WANTED_PART = (name: string): boolean =>
  name === 'ppt/presentation.xml'
  || name.startsWith('ppt/slides/')
  || name.startsWith('ppt/slideLayouts/')
  || name.startsWith('ppt/slideMasters/')
  || name.startsWith('ppt/theme/')
  || name.startsWith('ppt/_rels/')
  || name.startsWith('ppt/media/');
