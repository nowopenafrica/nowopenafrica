import {
  ALIGN_TOKENS, SIZE_TOKENS,
  type AlignToken, type PageOverrides, type SizeToken,
  type SlotDef, type SlotOverride, type SlotStyle,
} from './types';

/**
 * Turning stored JSON into something a page may render.
 *
 * Everything here is a whitelist. The stored value is treated as hostile — not
 * because the editor is untrusted, but because a row can be hand-edited, can
 * predate a slot's definition, or can survive a slot being renamed. The page
 * must render correctly in all three cases, and the answer is always the same:
 * anything not understood is dropped and the coded default stands.
 */

/** Where a CTA may point. */
const SAFE_EXTERNAL = /^https:\/\/[^\s<>"']+$/;
const SAFE_MAILTO = /^mailto:[^\s<>"',;]+@[^\s<>"',;]+$/;
const SAFE_TEL = /^tel:\+?[0-9\s-]{5,20}$/;

/**
 * Internal links are checked against the router's own paths.
 *
 * Not cosmetic: `middleware.ts` treats a single-segment path as a business
 * username, so an editor typing `/spceial-offer` would not 404 — it would be
 * looked up as a business. A typo must be refused at the point of entry.
 */
export function isInternalPath(href: string, routes: readonly string[]): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  const path = href.split(/[?#]/)[0];
  return routes.includes(path);
}

export function isSafeHref(href: string, routes: readonly string[]): boolean {
  const v = href.trim();
  if (!v) return false;
  // Anything with a scheme we did not name is refused, `javascript:` included.
  if (v.startsWith('/')) return isInternalPath(v, routes);
  return SAFE_EXTERNAL.test(v) || SAFE_MAILTO.test(v) || SAFE_TEL.test(v);
}

/**
 * Clean one editable string.
 *
 * Markup is stripped rather than escaped. React escapes on render, so this is
 * not the XSS boundary — it is a product decision: these slots are plain text,
 * and a stray `<div>` pasted from a document should not appear on the homepage
 * as literal angle brackets.
 */
export function cleanText(raw: unknown, maxLength: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw
    .replace(/<[^>]*>/g, '')
    // Control characters and zero-width joiners — invisible in the editor,
    // visible in a diff, and a known trick for hiding text in plain sight.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u200b-\u200f\u2028\u2029\ufeff]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!v) return undefined;
  return v.slice(0, maxLength);
}

function cleanStyle(def: SlotDef, raw: unknown): SlotStyle | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  const out: SlotStyle = {};
  // A size is only accepted when the slot itself declared what each size means.
  if (def.sizes && SIZE_TOKENS.includes(v.size as SizeToken)) out.size = v.size as SizeToken;
  if (def.alignable && ALIGN_TOKENS.includes(v.align as AlignToken)) out.align = v.align as AlignToken;
  return Object.keys(out).length ? out : undefined;
}

/** Validate one slot's stored override against its definition. */
export function cleanOverride(
  def: SlotDef,
  raw: unknown,
  routes: readonly string[],
): SlotOverride | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  const out: SlotOverride = {};

  const text = cleanText(v.text, def.maxLength);
  if (text !== undefined) out.text = text;

  if (def.kind === 'link' && typeof v.href === 'string' && isSafeHref(v.href, routes)) {
    out.href = v.href.trim();
  }

  // Hiding is a capability the page author grants per slot. A legal notice or a
  // load-bearing CTA simply never becomes hideable, so no rule has to remember.
  if (def.hideable && v.hidden === true) out.hidden = true;

  const style = cleanStyle(def, v.style);
  if (style) out.style = style;

  return Object.keys(out).length ? out : undefined;
}

/**
 * Validate a whole page's stored content.
 *
 * Unknown slot ids are dropped. That is what makes deleting a slot from the code
 * safe: the override becomes inert immediately rather than reappearing if the id
 * is ever reused.
 */
export function cleanPageOverrides(
  defs: readonly SlotDef[],
  raw: unknown,
  routes: readonly string[],
): PageOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const stored = raw as Record<string, unknown>;
  const out: PageOverrides = {};
  for (const def of defs) {
    const cleaned = cleanOverride(def, stored[def.id], routes);
    if (cleaned) out[def.id] = cleaned;
  }
  return out;
}

export interface ResolvedSlot {
  text: string | null;
  href: string | null;
  hidden: boolean;
  /** Classes contributed by the style tokens. Never author-supplied strings. */
  className: string;
  /** True when anything about this slot differs from the code. */
  overridden: boolean;
}

/**
 * What the page should render for one slot.
 *
 * `defaultText` is what the component was written with. A `null` result means
 * "use the coded children" — the caller does not have to know whether an
 * override existed.
 */
export function resolveSlot(
  def: SlotDef,
  override: SlotOverride | undefined,
  defaultHref?: string,
): ResolvedSlot {
  const classes: string[] = [];
  if (def.sizes) classes.push(def.sizes[override?.style?.size ?? def.defaultSize ?? 'md']);
  if (override?.style?.align) classes.push(`text-${override.style.align}`);

  return {
    text: override?.text ?? null,
    href: override?.href ?? defaultHref ?? null,
    hidden: override?.hidden === true,
    className: classes.join(' '),
    overridden: !!override && Object.keys(override).length > 0,
  };
}

/** Remove the base alignment utilities so an align token is not fighting them. */
export function stripAlign(className: string | undefined): string {
  if (!className) return '';
  return className
    .split(/\s+/)
    .filter((c) => !/^(?:[a-z]+:)?text-(?:left|center|right)$/.test(c))
    .join(' ');
}
