// SVG safety rules shared by two callers that cannot share code any other way:
//
//   - Studio's importer (importSvg.ts) works on a parsed DOM Document and uses
//     DANGEROUS_TAGS and isUnsafeAttribute to STRIP. That path is unchanged.
//   - The asset intake script (scripts/assets/intake-lib.mjs, plain Node, no
//     DOM) uses validateLibrarySvg, an ALLOWLIST VALIDATOR that FAILS CLOSED
//     (Ruling V). Library SVGs are staff-curated, so anything unusual is
//     refused rather than repaired: a stripper that is wrong ships an exploit,
//     a validator that is wrong refuses a file and staff re-export it.
//
// It is a .mjs with a .d.mts beside it because a Node script cannot import
// TypeScript. Pure: no DOM, no I/O.

/** Elements the DOM stripper removes outright. Compared by lowercased name. */
export const DANGEROUS_TAGS = ['script', 'foreignobject', 'iframe', 'object', 'embed', 'animate', 'set', 'handler'];

/**
 * True when the DOM stripper must remove an attribute: an event handler, a
 * reference that would fetch from elsewhere (anything but a same-document
 * `#id`), or a CSS url() pointing at http(s).
 */
export function isUnsafeAttribute(name, value) {
  const n = String(name).toLowerCase();
  if (/^on/.test(n)) return true;
  if ((n === 'href' || n === 'xlink:href') && !String(value).startsWith('#')) return true;
  return /url\(\s*['"]?\s*http/i.test(String(value));
}

/* ── the library allowlist validator ──────────────────────────────────────── */

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

const ELEMENTS = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'symbol', 'use',
  'title', 'desc',
]);

/** Elements whose children may be character data. */
const TEXT_PARENTS = new Set(['text', 'tspan', 'title', 'desc']);

const ATTRIBUTES = new Set([
  // identity and document
  'id', 'version', 'baseprofile', 'viewbox', 'preserveaspectratio', 'width', 'height', 'xml:space',
  'role', 'aria-hidden', 'aria-label',
  // geometry
  'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'dx', 'dy', 'rotate',
  'transform', 'refx', 'refy', 'overflow',
  // presentation
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'clip-rule',
  'clip-path', 'mask', 'color', 'display', 'visibility', 'vector-effect', 'shape-rendering',
  // text
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'letter-spacing', 'word-spacing',
  'text-anchor', 'text-decoration', 'dominant-baseline', 'alignment-baseline', 'baseline-shift',
  'textlength', 'lengthadjust',
  // gradients, stops, patterns, masks, clips, links
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'fx', 'fy', 'fr', 'spreadmethod',
  'patternunits', 'patterncontentunits', 'patterntransform', 'maskunits', 'maskcontentunits', 'clippathunits',
  'href', 'xlink:href',
]);

const NAMED_REFS = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const codePoint = (n) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

/** Decodes numeric and the five XML named character references. */
function decodeRefs(s) {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/gi, (_, n) => NAMED_REFS[n.toLowerCase()]);
}

/** Decoded, with whitespace and control characters removed, lowercased. */
const squash = (s) => decodeRefs(s).replace(/[\s\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028\u2029\ufeff]/g, '').toLowerCase();

const TAG_AT = /<(\/?)([^\s<>/]+)((?:"[^"]*"|'[^']*'|[^<>"'])*)>/y;
const ATTR_AT = /\s+([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;

function checkAttributes(el, raw) {
  let rest = raw;
  let selfClose = false;
  if (/\/\s*$/.test(rest)) { selfClose = true; rest = rest.replace(/\/\s*$/, ''); }
  let pos = 0;
  while (pos < rest.length) {
    if (/^\s*$/.test(rest.slice(pos))) break;
    ATTR_AT.lastIndex = pos;
    const m = ATTR_AT.exec(rest);
    if (!m) return { error: `<${el}> has a malformed or unquoted attribute` };
    pos = ATTR_AT.lastIndex;
    const name = m[1];
    const value = m[2] ?? m[3] ?? '';
    const lower = name.toLowerCase();

    if (lower === 'xmlns') {
      if (value !== SVG_NS) return { error: `xmlns "${value}" is not the SVG namespace` };
      continue;
    }
    if (lower.startsWith('xmlns:')) {
      if (lower === 'xmlns:xlink' && value === XLINK_NS) continue;
      return { error: `namespace declaration "${name}" is not allowed` };
    }
    if (lower.includes(':') && lower !== 'xlink:href' && lower !== 'xml:space') {
      return { error: `prefixed attribute "${name}" is not allowed` };
    }
    if (!ATTRIBUTES.has(lower)) return { error: `attribute "${name}" is not on the allowlist` };

    const flat = squash(value);
    if (flat.includes('<')) return { error: `attribute "${name}" contains "<"` };
    if (lower === 'href' || lower === 'xlink:href') {
      if (!/^#[^#]+$/.test(flat)) return { error: `${name} must be a same-document #fragment` };
    }
    for (const m2 of flat.matchAll(/url\(/g)) {
      if (!/^url\(['"]?#/.test(flat.slice(m2.index))) return { error: `attribute "${name}" has a url() that is not a #fragment` };
    }
    if (/(javascript|vbscript|data):/.test(flat)) return { error: `attribute "${name}" contains a script or data URL` };
  }
  return { selfClose };
}

/**
 * Validate an SVG for the design asset library. Never edits the artwork
 * (comments aside): returns { ok: true, svg } when EVERY element and attribute
 * is on the allowlist, otherwise { ok: false, reason }. It refuses rather than
 * strips: no style, class, script, event handlers, foreignObject, images,
 * external references, namespace prefixes, DOCTYPE, ENTITY, CDATA or
 * processing instructions (apart from a leading <?xml ...?> declaration).
 */
export function validateLibrarySvg(text) {
  const fail = (reason) => ({ ok: false, reason });
  if (typeof text !== 'string' || text.length === 0) return fail('not an SVG document');
  if (text.length > 26214400) return fail('SVG is too large');

  // Comments are removed, not rejected. An unterminated one is.
  let src = text.replace(/<!--[\s\S]*?-->/g, '');
  if (src.includes('<!--')) return fail('unterminated comment');

  if (/<!DOCTYPE/i.test(src)) return fail('contains a DOCTYPE');
  if (/<!ENTITY/i.test(src)) return fail('contains an ENTITY declaration');
  if (/<!\[CDATA\[/i.test(src)) return fail('contains a CDATA section');
  if (/<!/.test(src)) return fail('contains a markup declaration');

  // One leading <?xml ...?> is fine. Any other <? is not.
  const decl = /^\ufeff?\s*<\?xml\s[^?]*\?>/.exec(src);
  if (decl) src = src.slice(decl[0].length);
  if (/<\?/.test(src)) return fail('contains a processing instruction');

  const stack = [];
  let pos = 0;
  let sawRoot = false;
  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    const chunk = src.slice(pos, lt < 0 ? undefined : lt);
    if (chunk.trim() !== '') {
      const parent = stack[stack.length - 1];
      if (!parent || !TEXT_PARENTS.has(parent)) return fail('text content outside text, tspan, title or desc');
      if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(chunk)) return fail('unknown entity reference in text');
    }
    if (lt < 0) break;
    TAG_AT.lastIndex = lt;
    const m = TAG_AT.exec(src);
    if (!m) return fail('malformed tag');
    pos = TAG_AT.lastIndex;
    const closing = m[1] === '/';
    const rawName = m[2];
    if (rawName.includes(':')) return fail(`prefixed element "${rawName}" is not allowed`);
    const name = rawName.toLowerCase();
    if (!ELEMENTS.has(name)) return fail(`element "${rawName}" is not on the allowlist`);

    if (closing) {
      if (m[3].trim() !== '') return fail('closing tag carries attributes');
      if (stack.pop() !== name) return fail(`unbalanced closing tag </${rawName}>`);
      continue;
    }
    if (stack.length === 0) {
      if (sawRoot) return fail('more than one root element');
      if (name !== 'svg') return fail('root element is not <svg>');
      sawRoot = true;
    }
    const attrs = checkAttributes(rawName, m[3]);
    if (attrs.error) return fail(attrs.error);
    if (!attrs.selfClose) stack.push(name);
  }
  if (!sawRoot) return fail('not an SVG document');
  if (stack.length) return fail('unclosed element');
  return { ok: true, svg: (decl ? decl[0] : '') + src };
}
