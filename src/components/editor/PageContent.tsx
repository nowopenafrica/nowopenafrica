import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';

import { applySeo } from '../../lib/seo';
import { slotById } from '../../lib/visualEditor/registry';
import { resolveSlot, stripAlign } from '../../lib/visualEditor/resolve';
import { fetchPublished } from '../../lib/visualEditor/store';
import type { PageOverrides } from '../../lib/visualEditor/types';

/**
 * The rendering half of the Visual Editor.
 *
 * A page wraps itself in <PageContentProvider page="about"> and wraps its copy
 * in <Editable slot="about.hero.title">. The text stays in the component — it
 * is the default, and it is what renders when there is no override, when the
 * fetch fails, and when the tables do not exist yet.
 *
 * The provider does two different jobs depending on where it is mounted:
 *
 *   on the live site   fetch the published overrides for this page
 *   inside the editor  use the draft the editor is holding, and light up
 *
 * The page component does not know which, and does not have an editing mode of
 * its own. That is what keeps "what the editor previews" and "what the public
 * gets" the same code path — the failure mode this platform has been bitten by
 * before is a preview that diverges from the live page.
 */

interface EditorSession {
  page: string;
  overrides: PageOverrides;
  selected: string | null;
  onSelect: (slotId: string) => void;
  /** Lets the editor panel show what the code says, not just what is stored. */
  onDefault: (slotId: string, text: string) => void;
}

/** Set by the admin editor. Absent everywhere else, which is the normal case. */
export const EditorSessionContext = createContext<EditorSession | null>(null);

interface PageContentValue {
  overrides: PageOverrides;
  editing: boolean;
  selected: string | null;
  select: (slotId: string) => void;
  reportDefault: (slotId: string, text: string) => void;
}

const noop = () => {};

const PageContentContext = createContext<PageContentValue>({
  overrides: {}, editing: false, selected: null, select: noop, reportDefault: noop,
});

export function PageContentProvider({ page, children }: { page: string; children: ReactNode }) {
  const session = useContext(EditorSessionContext);
  const live = session?.page === page;
  const [published, setPublished] = useState<PageOverrides>({});

  useEffect(() => {
    // Inside the editor the draft is the source of truth; no fetch, and no
    // flash of published content over what someone is in the middle of typing.
    if (live) return;
    let cancelled = false;
    void fetchPublished(page).then((o) => { if (!cancelled) setPublished(o); });
    return () => { cancelled = true; };
  }, [page, live]);

  const value = useMemo<PageContentValue>(() => (
    live && session
      ? {
        overrides: session.overrides,
        editing: true,
        selected: session.selected,
        select: session.onSelect,
        reportDefault: session.onDefault,
      }
      : { overrides: published, editing: false, selected: null, select: noop, reportDefault: noop }
  ), [live, session, published]);

  return <PageContentContext.Provider value={value}>{children}</PageContentContext.Provider>;
}

export const usePageContent = () => useContext(PageContentContext);

type TextTag = 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div';

interface EditableProps {
  slot: string;
  /** The element to render. Ignored for link slots. */
  as?: TextTag;
  className?: string;
  /** The default copy. A plain string, because these slots are plain text. */
  children: string;
  /** Link slots only: where it points when nobody has changed it. */
  to?: string;
  /** Link slots only: an icon or badge that is part of the button, not the copy. */
  after?: ReactNode;
}

/**
 * One editable piece of copy.
 *
 * Wrapping something in this is the ONLY way it becomes editable. Nothing is
 * editable by default, so everything that must stay system-controlled —
 * verification, Open Now, prices, trust claims, canonical URLs, anything read
 * live from the database — is protected by never being wrapped, rather than by
 * a rule somebody has to remember when writing the next component.
 */
export function Editable({ slot, as = 'span', className = '', children, to, after }: EditableProps) {
  const { overrides, editing, selected, select, reportDefault } = usePageContent();
  const def = slotById(slot);
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    if (reported.current === children) return;
    reported.current = children;
    reportDefault(slot, children);
  }, [editing, slot, children, reportDefault]);

  const onClick = useCallback((e: React.MouseEvent) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    select(slot);
  }, [editing, select, slot]);

  // An undeclared slot renders its coded copy untouched. A typo in a slot name
  // should look like "this text is not editable yet", never like a broken page.
  if (!def) return <>{children}</>;

  const r = resolveSlot(def, overrides[slot], to);
  if (r.hidden && !editing) return null;

  const base = r.className.includes('text-left') || r.className.includes('text-center') || r.className.includes('text-right')
    ? stripAlign(className)
    : className;

  const editorClasses = editing
    ? ` cursor-pointer rounded-sm outline-offset-2 transition ${
      selected === slot
        ? 'outline outline-2 outline-blue-500'
        : 'hover:outline hover:outline-2 hover:outline-blue-300'
    }${r.hidden ? ' opacity-40 line-through' : ''}`
    : '';

  const cls = `${base} ${r.className}${editorClasses}`.replace(/\s+/g, ' ').trim();
  const text = r.text ?? children;
  const marker = editing ? { 'data-slot': slot } : {};

  if (def.kind === 'link') {
    const href = r.href ?? '/';
    const inner = <>{text}{after}</>;
    // An external destination is a real anchor; react-router would treat it as
    // an in-app path and route to a page that does not exist.
    if (href.startsWith('/')) {
      return <Link to={href} className={cls} onClick={onClick} {...marker}>{inner}</Link>;
    }
    return (
      <a href={href} className={cls} onClick={onClick} rel="noopener noreferrer" {...marker}>
        {inner}
      </a>
    );
  }

  const Tag = as;
  return <Tag className={cls} onClick={onClick} {...marker}>{text}</Tag>;
}

/** The resolved text for a slot, where a string is needed rather than an element. */
export function useEditableText(slot: string, fallback: string): string {
  const { overrides } = usePageContent();
  const def = slotById(slot);
  if (!def) return fallback;
  return resolveSlot(def, overrides[slot]).text ?? fallback;
}

interface EditableSeoInput {
  titleSlot: string;
  descriptionSlot: string;
  title: string;
  description: string;
  path: string;
  image?: string;
}

/**
 * The page's title and meta description, editable as copy.
 *
 * What is editable stops there. The canonical path, the robots directive,
 * JSON-LD and sitemap membership are decided by code on provenance grounds
 * (see isIndexable / isIndexableProfile) and are not reachable from here.
 *
 * The other job this does is skip applySeo() entirely while the page is being
 * previewed inside the admin console. The preview mounts the real page
 * component, and without this the editor would rewrite the console's own title
 * and canonical tag as a side effect of looking at a draft.
 */
export function useEditableSeo(input: EditableSeoInput): { title: string; description: string } {
  const { editing } = usePageContent();
  const title = useEditableText(input.titleSlot, input.title);
  const description = useEditableText(input.descriptionSlot, input.description);
  const { path, image } = input;

  useEffect(() => {
    if (editing) return;
    return applySeo({ title, description, path, image });
  }, [editing, title, description, path, image]);

  return { title, description };
}
