// The SVG stripping rules, in one place that both the Studio importer
// (importSvg.ts, which works on a parsed Document) and the asset intake script
// (scripts/assets/intake-lib.mjs, plain Node with no DOM) can import.
//
// It is a .mjs with a .d.mts beside it because a Node script cannot import
// TypeScript. Pure: no DOM, no I/O.

/** Elements removed outright. Compared by lowercased name, never by selector. */
export const DANGEROUS_TAGS = ['script', 'foreignobject', 'iframe', 'object', 'embed', 'animate', 'set', 'handler'];

/**
 * True when an attribute must be removed: an event handler, a reference that
 * would fetch from elsewhere (anything but a same-document `#id`), or a CSS
 * url() pointing at http(s).
 */
export function isUnsafeAttribute(name, value) {
  const n = String(name).toLowerCase();
  if (/^on/.test(n)) return true;
  if ((n === 'href' || n === 'xlink:href') && !String(value).startsWith('#')) return true;
  return /url\(\s*['"]?\s*http/i.test(String(value));
}

const TAG = /<\/?[a-zA-Z][^\s>/]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g;
const ATTR = /(\s+)([^\s=/>"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s>]*))?/g;

function stripAttributes(tag, removed) {
  // Closing tags carry no attributes.
  if (tag.startsWith('</')) return tag;
  const nameEnd = /^<[^\s>/]+/.exec(tag)[0].length;
  const head = tag.slice(0, nameEnd);
  const rest = tag.slice(nameEnd);
  const cleaned = rest.replace(ATTR, (whole, _sp, name, _raw, dq, sq) => {
    const value = dq ?? sq ?? (whole.includes('=') ? whole.slice(whole.indexOf('=') + 1).trim() : '');
    if (isUnsafeAttribute(name, value)) {
      removed.push(name.toLowerCase());
      return '';
    }
    return whole;
  });
  return head + cleaned;
}

function stripDangerousElements(text, removed) {
  let out = text;
  for (const tag of DANGEROUS_TAGS) {
    // A paired element (and everything inside it), repeated for nesting.
    const paired = new RegExp(`<${tag}(?![\w:-])(?:"[^"]*"|'[^']*'|[^>"'])*?(?:/>|>[\s\S]*?</${tag}\s*>)`, 'gi');
    // A stray opening or closing tag with no partner.
    const stray = new RegExp(`</?${tag}(?![\w:-])(?:"[^"]*"|'[^']*'|[^>"'])*>`, 'gi');
    for (let i = 0; i < 20; i += 1) {
      const next = out.replace(paired, () => { removed.push(tag); return ''; });
      if (next === out) break;
      out = next;
    }
    out = out.replace(stray, () => { removed.push(tag); return ''; });
  }
  return out;
}

/**
 * Strip everything in an SVG that could execute or fetch, from its text.
 *
 * Returns the cleaned text and what was removed, or a reason it cannot be
 * used. Anything dangerous that survives stripping (`<script`, an `on*=`
 * handler, `javascript:`) is a rejection, not a pass: a sanitiser that is
 * wrong must fail loudly.
 */
export function sanitiseSvg(text) {
  if (typeof text !== 'string' || !/<svg[\s>]/i.test(text)) {
    return { ok: false, reason: 'not an SVG document' };
  }
  const removed = [];
  let svg = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[\s\S]*?(?:\]\s*)?>/gi, () => { removed.push('doctype'); return ''; })
    .replace(/<\?(?!xml\b)[\s\S]*?\?>/gi, () => { removed.push('processing-instruction'); return ''; });
  svg = stripDangerousElements(svg, removed);
  svg = svg.replace(TAG, (tag) => stripAttributes(tag, removed));

  if (/<script/i.test(svg)) return { ok: false, reason: 'still contains <script after sanitising' };
  if (/[\s"'/]on[a-z]+\s*=/i.test(svg)) return { ok: false, reason: 'still contains an on*= event handler after sanitising' };
  if (/javascript:/i.test(svg)) return { ok: false, reason: 'still contains javascript: after sanitising' };
  return { ok: true, svg, removed: [...new Set(removed)] };
}
