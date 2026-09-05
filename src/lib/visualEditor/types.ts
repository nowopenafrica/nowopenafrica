/**
 * The Visual Editor's data model.
 *
 * The design in one line: pages stay React, and the database stores overrides
 * only. The copy written in the component is the default and always renders;
 * `page_content` holds `slot id -> override`; the resolver returns
 * override-or-default.
 *
 * Why this and not a block tree: a block tree would mean rewriting working,
 * SEO-critical pages into data, and would let an editor type a trust claim into
 * a paragraph or drop a canonical tag. Here the editable surface is exactly the
 * set of slots a developer declared — so business verification, Open Now,
 * prices, JSON-LD and indexability are not "protected by a rule someone can
 * forget", they are simply unreachable.
 *
 * See docs/visual-editor-audit.md.
 */

/** What a slot holds. Plain text and links only — no markup, ever. */
export type SlotKind = 'text' | 'link';

/** The presentation axes an editor may touch. Fixed vocabulary, no free CSS. */
export type SizeToken = 'sm' | 'md' | 'lg';
export type AlignToken = 'left' | 'center' | 'right';

export const SIZE_TOKENS: SizeToken[] = ['sm', 'md', 'lg'];
export const ALIGN_TOKENS: AlignToken[] = ['left', 'center', 'right'];

export interface SlotStyle {
  size?: SizeToken;
  align?: AlignToken;
}

/**
 * A declared editable slot. Declaring one is the only way to make anything on
 * the platform editable — the registry is the allowlist.
 */
export interface SlotDef {
  /** Stable id, `page.section.name`. Renaming one orphans its override. */
  id: string;
  /** The page key this belongs to, e.g. `about`. Derived from the id prefix. */
  page: string;
  /** What the editor calls it. */
  label: string;
  kind: SlotKind;
  /** Hard cap on the stored value. Layouts are designed, not infinitely elastic. */
  maxLength: number;
  /** May the editor hide this? Off unless the page author says otherwise. */
  hideable?: boolean;
  /** May the editor re-align it? */
  alignable?: boolean;
  /**
   * The exact classes each size option produces for THIS slot.
   *
   * Per-slot rather than a global scale because a heading and a paragraph do not
   * share one. Omitted means the size axis is not offered here, which is the
   * default.
   */
  sizes?: Record<SizeToken, string>;
  /**
   * Which size the page is written at. Emitted when nobody has chosen one, so
   * an un-edited page keeps exactly the type scale it has today — making a slot
   * size-tunable must not change how it looks.
   */
  defaultSize?: SizeToken;
  /** Shown in the editor panel — what this text is for, what not to put in it. */
  note?: string;
}

/** What is stored for one slot. Every field optional; absent means "as coded". */
export interface SlotOverride {
  text?: string;
  href?: string;
  hidden?: boolean;
  style?: SlotStyle;
}

/** Everything stored for one page. */
export type PageOverrides = Record<string, SlotOverride>;

/** A page's content record: what is live, and what is being worked on. */
export interface PageContent {
  page: string;
  published: PageOverrides;
  draft: PageOverrides;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
}

export const EMPTY_PAGE_CONTENT = (page: string): PageContent => ({
  page,
  published: {},
  draft: {},
  draftUpdatedAt: null,
  publishedAt: null,
});

/** Which copy of a page's content a surface is rendering. */
export type ContentMode = 'published' | 'draft';
