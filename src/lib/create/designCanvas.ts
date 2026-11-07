/**
 * Reading a Claude Design artboard (`.dc.html`) into something Create Media
 * can measure.
 *
 * ── WHAT AN ARTBOARD ACTUALLY IS ─────────────────────────────────────────
 *
 * The NowOpen Africa Creative System is a Design canvas: 134 artboards, each
 * a self-contained `.dc.html` page. Inside `<x-dc>` sits ONE root element
 * at a fixed pixel size, laid out with **flexbox and grid**, with
 * `{{token}}` holes resolved from a `data-props` JSON block.
 *
 * Create Media's templates are a different model: a surface plus role-based
 * slots at FRACTIONAL coordinates. The two do not map by inspection, and
 * that is the whole difficulty of this import:
 *
 *   A slot's y position in an artboard is decided by `margin-top: auto`,
 *   `gap`, `justify-content: space-between` and how the text wrapped. You
 *   cannot read it off the markup. You have to lay it out.
 *
 * So this module does NOT guess coordinates. It resolves the tokens,
 * strips everything that is not the design, and hands back markup a browser
 * can lay out for real — the same principle the PDF import follows, where
 * the text is READ rather than regenerated.
 *
 * ── WHY SANITISING IS NOT OPTIONAL ───────────────────────────────────────
 *
 * This file arrives from outside the application and its markup is rendered.
 * The brief these templates come under is explicit: do not execute untrusted
 * HTML or JavaScript inside the main NowOpen origin. So every script, event
 * handler, stylesheet link, frame and remote reference is removed HERE,
 * before anything renders, and the measuring step then renders what is left
 * inside a sandbox that cannot run scripts either. Two barriers, because one
 * of them is a regex and regexes are not a security model.
 */

/** A `data-props` declaration: the levers the artboard exposes. */
export interface CanvasProp {
  editor: string;
  default: unknown;
}

export interface ParsedArtboard {
  /** The `<title>`, which is the artboard's human name. */
  title: string;
  width: number;
  height: number;
  /** The root's own background, as authored. */
  background: string;
  /** The root's own text colour. */
  ink: string;
  /** Sanitised markup for the root element, tokens resolved. */
  html: string;
  props: Record<string, CanvasProp>;
  /** Which prop each `{{token}}` filled, by the text it produced. */
  tokenText: Record<string, string>;
  /** What was removed and why. Shown, never swallowed. */
  notes: string[];
}

export type CanvasParse =
  | { ok: true; board: ParsedArtboard }
  | { ok: false; reason: string };

/** Elements whose presence means this is not a single static artboard. */
const DYNAMIC_TAGS = ['sc-for', 'dc-import', 'x-import'];

/** Removed outright, content and all. */
const STRIP_WITH_CONTENT = ['script', 'style', 'helmet', 'iframe', 'object', 'embed', 'template', 'noscript'];

/** Kept out of the measured markup but not a reason to refuse. */
const DROP_ELEMENT = ['svg', 'canvas', 'video', 'audio', 'link', 'meta', 'picture', 'source'];

/**
 * Pictures become an empty box of the same size, not nothing.
 *
 * The artwork itself lives in the design canvas and is unreachable here, so
 * it cannot come across. Its BOX can, and must: an artboard built around a
 * 760px photograph with the headline underneath is a photo-led layout, and
 * deleting the picture outright moves everything up and turns it into a
 * plain text poster. Keeping the box preserves the composition and lets the
 * import mark the template as one that wants a photograph.
 */
const IMAGE_MARKER = 'data-noa-image';

const sizeOf = (style: string, prop: 'width' | 'height'): number | null => {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([0-9.]+)px`, 'i').exec(style);
  return m ? Number(m[1]) : null;
};

const declaration = (style: string, prop: string): string => {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(style);
  return m ? m[1].trim() : '';
};

/**
 * The `data-props` block.
 *
 * It is single-quoted JSON in an HTML attribute, so the value arrives with
 * `&quot;` and friends already decoded by the parser — but only when read
 * through `getAttribute`, which is why this takes the element rather than
 * the raw source.
 */
function readProps(doc: Document): Record<string, CanvasProp> {
  const holder = doc.querySelector('[data-props]');
  const raw = holder?.getAttribute('data-props');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, CanvasProp> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith('$')) continue; // $preview is metadata, not a lever
      if (value && typeof value === 'object' && 'default' in (value as object)) {
        const v = value as { editor?: unknown; default: unknown };
        out[key] = { editor: typeof v.editor === 'string' ? v.editor : 'text', default: v.default };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Resolve `{{token}}` holes against the declared defaults.
 *
 * A hole with no declared default is left as literal text rather than blanked:
 * an artboard that renders "{{price}}" tells the person importing it exactly
 * which lever is missing, and a silent empty string does not.
 */
export function resolveTokens(
  html: string,
  props: Record<string, CanvasProp>,
): { html: string; used: Record<string, string> } {
  const used: Record<string, string> = {};
  const out = html.replace(/\{\{\s*([A-Za-z0-9_$.]+)\s*\}\}/g, (whole, name: string) => {
    const prop = props[name];
    if (!prop) return whole;
    const value = prop.default;
    if (typeof value === 'boolean' || value === null || value === undefined) return '';
    const text = String(value);
    used[name] = text;
    return text;
  });
  return { html: out, used };
}

/** Walk the tree once, removing everything that is not the design. */
function sanitise(root: Element, notes: string[]): void {
  const doomed: Element[] = [];
  let images = 0;
  const walk = (el: Element) => {
    const tag = el.tagName.toLowerCase();

    if (STRIP_WITH_CONTENT.includes(tag) || DROP_ELEMENT.includes(tag)) {
      doomed.push(el);
      return;
    }

    /*
     * A picture keeps its box and loses its source. Nothing loads, nothing
     * is fetched, and the layout is exactly what the designer drew.
     */
    if (tag === 'img') {
      const box = el.ownerDocument.createElement('div');
      box.setAttribute(IMAGE_MARKER, '1');
      const style = el.getAttribute('style');
      if (style) box.setAttribute('style', style);
      el.replaceWith(box);
      images += 1;
      return;
    }
    /*
     * A conditional. In this system it carries the annotation badge that
     * labels an artboard on the canvas ("T15 · L1 · D Registration"), which
     * is studio furniture and must never become a slot in somebody's flyer.
     */
    if (tag === 'sc-if') { doomed.push(el); return; }

    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
      if ((name === 'href' || name === 'src' || name === 'xlink:href')
          && /^\s*(javascript|data|vbscript):/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }

    for (const child of [...el.children]) walk(child);
  };
  walk(root);

  for (const el of doomed) el.remove();

  if (images) {
    notes.push(images === 1
      ? 'One picture kept its place but not its artwork — the file lives in the design canvas. The space is reserved; drop your own photograph into it.'
      : `${images} pictures kept their places but not their artwork — the files live in the design canvas. The spaces are reserved; drop your own photographs in.`);
  }
}

/**
 * Read one `.dc.html` file.
 *
 * Refuses rather than half-imports. A template that arrives missing the half
 * that could not be read is worse than one that did not arrive, because the
 * missing half is invisible.
 */
export function parseDesignCanvas(source: string): CanvasParse {
  if (!source.trim()) return { ok: false, reason: 'That file is empty.' };
  if (!/<x-dc[\s>]/i.test(source)) {
    return { ok: false, reason: 'That is not a Design artboard — it has no <x-dc> block. Export the artboard from the canvas rather than the page around it.' };
  }

  const doc = new DOMParser().parseFromString(source, 'text/html');
  const stage = doc.querySelector('x-dc');
  if (!stage) return { ok: false, reason: 'That artboard could not be read.' };

  for (const tag of DYNAMIC_TAGS) {
    if (stage.querySelector(tag)) {
      return {
        ok: false,
        reason: `This artboard uses <${tag}>, which repeats or imports content at render time. A catalogue template is a fixed set of slots, so importing it would freeze whatever happened to be showing. Flatten it in the canvas first.`,
      };
    }
  }

  const props = readProps(doc);

  /*
   * The root is the first element inside <x-dc> that DRAWS something.
   *
   * Not simply the first child: the helmet sits there, and so does anything
   * a hostile or merely untidy file put ahead of the artboard. Picking the
   * first child blindly means a stray <script> is read as the artboard and
   * the file is refused for having no size, which blames the wrong thing.
   */
  const INVISIBLE = new Set(['helmet', 'script', 'style', 'link', 'meta', 'template', 'noscript']);
  const root = [...stage.children].find((el) => !INVISIBLE.has(el.tagName.toLowerCase())) ?? null;
  if (!root) return { ok: false, reason: 'That artboard has no content.' };

  const style = root.getAttribute('style') ?? '';
  const width = sizeOf(style, 'width');
  const height = sizeOf(style, 'height');
  if (!width || !height) {
    return {
      ok: false,
      reason: 'That artboard has no fixed size. It is a page layout that reflows, and a catalogue template has to be a fixed canvas — a poster, a post or a print piece.',
    };
  }
  if (width < 40 || height < 40 || width > 8000 || height > 8000) {
    return { ok: false, reason: `That artboard is ${width}×${height}, which is outside what a design canvas holds.` };
  }

  const notes: string[] = [];
  sanitise(root, notes);

  const resolved = resolveTokens(root.outerHTML, props);
  const unresolved = [...resolved.html.matchAll(/\{\{\s*([A-Za-z0-9_$.]+)\s*\}\}/g)].map((m) => m[1]);
  if (unresolved.length) {
    notes.push(`${[...new Set(unresolved)].join(', ')} had no default, so ${unresolved.length === 1 ? 'it was' : 'they were'} left showing as written.`);
  }

  /*
   * The ground is read from the RESOLVED markup, not from the authored
   * style. Several artboards declare `background: {{bg}}` with the real
   * colour sitting in the props — reading it first yields the literal text
   * "{{bg}}", which no luminance test can judge, so every one of them would
   * have been filed as a dark design whatever colour it actually is.
   */
  const resolvedStyle = new DOMParser()
    .parseFromString(resolved.html, 'text/html')
    .body.firstElementChild?.getAttribute('style') ?? style;

  return {
    ok: true,
    board: {
      title: (doc.querySelector('title')?.textContent ?? '').trim() || 'Untitled artboard',
      width,
      height,
      background: declaration(resolvedStyle, 'background') || declaration(resolvedStyle, 'background-color') || '#ffffff',
      ink: declaration(resolvedStyle, 'color') || '#000000',
      html: resolved.html,
      props,
      tokenText: resolved.used,
      notes,
    },
  };
}
