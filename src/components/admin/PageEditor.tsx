import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlignCenter, AlignLeft, AlignRight, Eye, EyeOff, History, RotateCcw, Save, Send, Type,
} from 'lucide-react';

import About from '../../pages/About';
import { EditorSessionContext } from '../editor/PageContent';
import { EDITABLE_PAGES, LINK_TARGETS, slotsForPage } from '../../lib/visualEditor/registry';
import { isSafeHref } from '../../lib/visualEditor/resolve';
import {
  discardDraft, fetchVersions, openDraft, publishPage, revertToVersion, saveDraft,
  type PageVersion,
} from '../../lib/visualEditor/store';
import {
  ALIGN_TOKENS, SIZE_TOKENS,
  type PageOverrides, type SlotDef, type SlotOverride,
} from '../../lib/visualEditor/types';

/**
 * The Visual Editor — click a piece of copy on the page, change it, publish it.
 *
 * The preview is the real page component, mounted with the draft supplied
 * through EditorSessionContext. Not a mock, not a re-implementation: the same
 * code path the public gets. A preview that can diverge from the live page is
 * worse than no preview, because it is believed.
 *
 * Publishing is a two-step by design. Typing edits a draft that only staff can
 * read; publish_page() is the only thing that reaches the public site, and it
 * writes a version row and an audit entry in the same transaction.
 */

/** Only pages that have been adopted can be previewed here. */
const PAGE_COMPONENTS: Record<string, () => JSX.Element> = {
  about: About,
};

const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

export default function PageEditor() {
  const [page, setPage] = useState<string>(EDITABLE_PAGES[0]?.page ?? 'about');
  const [draft, setDraft] = useState<PageOverrides>({});
  const [saved, setSaved] = useState<string>('{}');
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const slots = useMemo(() => slotsForPage(page), [page]);
  const dirty = JSON.stringify(draft) !== saved;

  const load = useCallback(async (p: string) => {
    setLoading(true);
    const content = await openDraft(p);
    setDraft(content);
    setSaved(JSON.stringify(content));
    setSelected(null);
    setVersions(await fetchVersions(p));
    setLoading(false);
  }, []);

  useEffect(() => { void load(page); }, [page, load]);

  // Leaving with unsaved work is almost always a mistake, and the draft is not
  // recoverable from anywhere else.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onDefault = useCallback((slotId: string, text: string) => {
    setDefaults((d) => (d[slotId] === text ? d : { ...d, [slotId]: text }));
  }, []);

  const patch = useCallback((slotId: string, change: Record<string, unknown>) => {
    setDraft((d) => {
      const next = { ...d, [slotId]: { ...d[slotId], ...change } };
      // An override with nothing left in it is not an override — drop it so the
      // page falls back to the code rather than storing an empty object forever.
      const entry = next[slotId] as Record<string, unknown>;
      for (const k of Object.keys(entry)) {
        if (entry[k] === undefined || entry[k] === '' || entry[k] === false) delete entry[k];
      }
      if (!Object.keys(entry).length) delete next[slotId];
      return next;
    });
  }, []);

  const resetSlot = useCallback((slotId: string) => {
    setDraft((d) => {
      const next = { ...d };
      delete next[slotId];
      return next;
    });
  }, []);

  const session = useMemo(() => ({
    page, overrides: draft, selected, onSelect: setSelected, onDefault,
  }), [page, draft, selected, onDefault]);

  const doSave = async () => {
    setBusy(true);
    const res = await saveDraft(page, draft);
    setBusy(false);
    if (!res.ok) return toast.error(res.message ?? 'Could not save the draft');
    setSaved(JSON.stringify(draft));
    toast.success('Draft saved. Not live yet.');
  };

  const doPublish = async () => {
    setBusy(true);
    // Save first, always. Publishing what is on screen rather than whatever was
    // last saved is the only behaviour that matches what the button says.
    const savedRes = await saveDraft(page, draft);
    if (!savedRes.ok) { setBusy(false); return toast.error(savedRes.message ?? 'Could not save'); }
    const res = await publishPage(page);
    setBusy(false);
    if (!res.ok) return toast.error(res.message ?? 'Could not publish');
    setSaved(JSON.stringify(draft));
    setVersions(await fetchVersions(page));
    toast.success('Published. This is live now.');
  };

  const doDiscard = async () => {
    setBusy(true);
    const res = await discardDraft(page);
    setBusy(false);
    if (!res.ok) return toast.error(res.message ?? 'Could not discard');
    await load(page);
    toast.success('Draft discarded — back to what is live.');
  };

  const doRevert = async (v: PageVersion) => {
    setBusy(true);
    const res = await revertToVersion(v.id);
    setBusy(false);
    if (!res.ok) return toast.error(res.message ?? 'Could not restore');
    await load(page);
    toast.success('Restored into the draft. Review it, then publish.');
  };

  const Preview = PAGE_COMPONENTS[page];
  const def = selected ? slots.find((s) => s.id === selected) ?? null : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={page}
          onChange={(e) => setPage(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        >
          {EDITABLE_PAGES.map((p) => (
            <option key={p.page} value={p.page}>{p.label} — {p.path}</option>
          ))}
        </select>

        <span className={`text-xs px-2 py-1 rounded-full ${dirty ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
          {dirty ? 'Unsaved changes' : 'Draft saved'}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => setShowHistory((v) => !v)} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm">
            <History size={15} /> History ({versions.length})
          </button>
          <button onClick={doDiscard} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm">
            <RotateCcw size={15} /> Discard draft
          </button>
          <button onClick={doSave} disabled={busy || !dirty}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-40">
            <Save size={15} /> Save draft
          </button>
          <button onClick={doPublish} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
            <Send size={15} /> Publish
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h4 className="font-semibold text-sm mb-2">Published versions</h4>
          {versions.length === 0 ? (
            <p className="text-sm text-gray-500">This page has never been published from the editor.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{new Date(v.created_at).toLocaleString()}{v.note ? ` — ${v.note}` : ''}</span>
                  <button onClick={() => doRevert(v)} disabled={busy}
                    className="text-blue-600 hover:underline">Restore into draft</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        {/* Preview — the real page, rendered from the draft */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
          <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <Type size={13} /> Click any highlighted text to edit it. Nothing else on the page is editable.
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading || !Preview ? (
              <p className="p-8 text-sm text-gray-500">Loading…</p>
            ) : (
              <EditorSessionContext.Provider value={session}>
                <Preview />
              </EditorSessionContext.Provider>
            )}
          </div>
        </div>

        {/* Inspector */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 lg:sticky lg:top-4">
          {!def ? (
            <div className="text-sm text-gray-500">
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Nothing selected</p>
              <p>Click a piece of copy in the preview, or pick one:</p>
              <ul className="mt-3 space-y-1">
                {slots.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => setSelected(s.id)} className="text-blue-600 hover:underline text-left">
                      {s.label}{draft[s.id] ? ' •' : ''}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <SlotInspector
              def={def}
              value={draft[def.id] ?? {}}
              defaultText={defaults[def.id] ?? ''}
              onPatch={(c) => patch(def.id, c)}
              onReset={() => resetSlot(def.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SlotInspector({ def, value, defaultText, onPatch, onReset }: {
  def: SlotDef;
  value: SlotOverride;
  defaultText: string;
  onPatch: (change: Record<string, unknown>) => void;
  onReset: () => void;
}) {
  const text = value.text ?? '';
  const href = value.href ?? '';
  const style = value.style ?? {};
  const hidden = value.hidden === true;
  const hrefValid = !href || isSafeHref(href, LINK_TARGETS);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h4 className="font-semibold text-gray-900 dark:text-white">{def.label}</h4>
        <p className="text-xs text-gray-500 font-mono">{def.id}</p>
        {def.note && <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{def.note}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Text <span className="font-normal">({text.length}/{def.maxLength})</span>
        </label>
        <textarea
          value={text}
          maxLength={def.maxLength}
          rows={def.maxLength > 200 ? 6 : 3}
          placeholder={defaultText}
          onChange={(e) => onPatch({ text: e.target.value })}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2"
        />
        <p className="mt-1 text-xs text-gray-500">Empty means the wording written into the page is used.</p>
      </div>

      {def.kind === 'link' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Goes to</label>
          <select
            value={LINK_TARGETS.includes(href) ? href : ''}
            onChange={(e) => onPatch({ href: e.target.value })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2"
          >
            <option value="">As written in the page</option>
            {LINK_TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {!hrefValid && (
            <p className="mt-1 text-xs text-red-600">
              That destination is not a page on this site, so it will be ignored.
            </p>
          )}
        </div>
      )}

      {def.sizes && (
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Size</span>
          <div className="flex gap-1">
            {SIZE_TOKENS.map((s) => (
              <button key={s} onClick={() => onPatch({ style: { ...style, size: style.size === s ? undefined : s } })}
                className={`px-3 py-1.5 rounded-lg border text-xs uppercase ${style.size === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {def.alignable && (
        <div>
          <span className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Alignment</span>
          <div className="flex gap-1">
            {ALIGN_TOKENS.map((a) => {
              const Icon = ALIGN_ICON[a];
              return (
                <button key={a} onClick={() => onPatch({ style: { ...style, align: style.align === a ? undefined : a } })}
                  className={`px-3 py-1.5 rounded-lg border ${style.align === a ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600'}`}>
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {def.hideable && (
        <button onClick={() => onPatch({ hidden: !hidden })}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 w-full justify-center">
          {hidden ? <><Eye size={14} /> Show on the page</> : <><EyeOff size={14} /> Hide from the page</>}
        </button>
      )}

      <button onClick={onReset} className="text-xs text-gray-500 hover:text-red-600 hover:underline">
        Reset this back to what the page says
      </button>
    </div>
  );
}
