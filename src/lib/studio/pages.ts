import type { DesignDocument, DesignPage } from './designDocument';
import { objectId } from './designDocument';
import { refitPage, shapeChangesMuch } from './formats';

/**
 * Pages within one design.
 *
 * A document has always held an array of pages; until now the editor only
 * ever touched the first. These are the operations that make the rest of the
 * array reachable, kept pure so the rules below are checked rather than
 * hoped for.
 *
 * ── TWO RULES THAT MATTER ────────────────────────────────────────────────
 *
 * A document may never end up with ZERO pages. `readDocument` refuses one as
 * unopenable, so deleting the last page would save a project that can never
 * be opened again — data loss with a delay on it.
 *
 * A duplicated page must carry FRESH object ids. Copying them verbatim gives
 * two objects the same id in one document, and from then on selecting one
 * selects both, editing one edits both, and undo puts back the wrong one.
 */

/** A new, empty page the same size as the one it follows. */
export function blankPageLike(page: DesignPage, name: string): DesignPage {
  return { id: objectId('pg'), name, width: page.width, height: page.height, objects: [], background: page.background };
}

const renumber = (pages: DesignPage[]): DesignPage[] =>
  pages.map((p, i) => (p.name?.trim() ? p : { ...p, name: `Page ${i + 1}` }));

export function addPage(doc: DesignDocument, afterIndex: number): DesignDocument {
  const at = Math.min(Math.max(0, afterIndex), doc.pages.length - 1);
  const source = doc.pages[at] ?? doc.pages[0];
  if (!source) return doc;
  const next = [...doc.pages];
  next.splice(at + 1, 0, blankPageLike(source, `Page ${doc.pages.length + 1}`));
  return { ...doc, pages: renumber(next) };
}

/**
 * Copy a page, objects and all, with new ids throughout.
 *
 * Ids are regenerated rather than reused — see the note above. Everything
 * else is carried across unchanged, because a duplicate that differs from its
 * source is not a duplicate.
 */
export function duplicatePage(doc: DesignDocument, index: number): DesignDocument {
  const source = doc.pages[index];
  if (!source) return doc;
  const copy: DesignPage = {
    ...source,
    id: objectId('pg'),
    name: `${source.name} copy`,
    objects: source.objects.map((o) => ({ ...o, id: objectId(o.type.charAt(0)) })),
  };
  const next = [...doc.pages];
  next.splice(index + 1, 0, copy);
  return { ...doc, pages: next };
}

/** Remove a page, unless it is the only one left. */
export function removePage(doc: DesignDocument, index: number): DesignDocument {
  if (doc.pages.length <= 1) return doc;
  if (!doc.pages[index]) return doc;
  return { ...doc, pages: doc.pages.filter((_, i) => i !== index) };
}

/** True when removing is allowed, so a button can be disabled rather than fail. */
export const canRemovePage = (doc: DesignDocument, index: number): boolean =>
  doc.pages.length > 1 && index >= 0 && index < doc.pages.length;

export function movePage(doc: DesignDocument, from: number, to: number): DesignDocument {
  if (from === to) return doc;
  if (!doc.pages[from] || to < 0 || to >= doc.pages.length) return doc;
  const next = [...doc.pages];
  next.splice(to, 0, ...next.splice(from, 1));
  return { ...doc, pages: next };
}

/**
 * Keep a selected index inside the document after it changes.
 *
 * Undo can restore a document with fewer pages than the one on screen. An
 * index past the end renders nothing at all — a blank editor with no error,
 * which reads as the project having been lost.
 */
export const clampPageIndex = (doc: DesignDocument | null, index: number): number => {
  if (!doc || doc.pages.length === 0) return 0;
  return Math.min(Math.max(0, index), doc.pages.length - 1);
};

/** What a page is called in the strip. */
export const pageLabel = (page: DesignPage, index: number): string =>
  page.name?.trim() || `Page ${index + 1}`;

/**
 * The same design again, at another size, beside the original.
 *
 * "Make a Story version" is a page, not an edit: the square one still has to
 * exist afterwards. So this duplicates — with fresh object ids, for the
 * reason stated at the top of this file — and refits the copy.
 *
 * ── WHY THE MODE IS CHOSEN AND NOT ASKED ─────────────────────────────────
 *
 * `refitPage` offers `stretch` (every object keeps its share of the page)
 * and `fit` (the whole design scales uniformly and centres). Stretch is
 * right for a small change and wrong for a large one — it turns a round logo
 * into an oval taking a square to a story.
 *
 * `shapeChangesMuch` already measures exactly that, so the honest default is
 * to let it decide: stretch while the proportions are close, fit once they
 * are not. Somebody who wants the other one still has the Size panel.
 */
export function variantPage(
  doc: DesignDocument,
  index: number,
  width: number,
  height: number,
  label: string,
): DesignDocument {
  const source = doc.pages[index];
  if (!source) return doc;

  const mode = shapeChangesMuch(source, width, height) ? 'fit' : 'stretch';
  const copy: DesignPage = refitPage(
    {
      ...source,
      id: objectId('pg'),
      name: label,
      objects: source.objects.map((o) => ({ ...o, id: objectId(o.type.charAt(0)) })),
    },
    width,
    height,
    mode,
  );

  const next = [...doc.pages];
  next.splice(index + 1, 0, copy);
  return { ...doc, pages: next };
}
