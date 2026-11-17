import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, Archive, ClipboardCheck, Download, EyeOff, FileJson, Loader2, Send, Trash2, Upload, X,
} from 'lucide-react';

import TemplateSurface from '../studio/TemplateSurface';
import ConfirmDialog from '../ConfirmDialog';
import AssetReview from './AssetReview';
import TemplateReviewPanel from './TemplateReviewPanel';
import { checkUpload, gateFor, readTemplateZip, PUBLISH_SCORE, type ZipFile } from '../../lib/create/templateReview';
import { supabase } from '../../lib/supabase';
import { DESIGN_TEMPLATES } from '../../lib/designTemplates';
import { DESIGN_FORMATS } from '../../data/studioPresets';
import { DELIVERABLE_CATEGORIES } from '../../lib/design/deliverables';
import { DESIGN_STYLES } from '../../lib/design/styles';
import { sampleFor } from '../../lib/create/sampleCopy';
import { templateToUploadJson, withCleanClassification, EDITABILITY_LABEL } from '../../lib/create/templateUpload';
import TemplateDetailsFields from './TemplateDetailsFields';
import type { DesignTemplate } from '../../lib/designTemplates';
import { ingestFiles, type Ingested, type TemplateDraft } from '../../lib/create/ingestTemplates';
import { measureArtboard } from '../../lib/create/measureArtboard';
import {
  entryFromRow, fetchTemplateRows, STATUS_LABEL,
  type TemplateRow, type TemplateStatus,
} from '../../lib/create/templateCatalogue';
import { invalidateCatalogue, useDesignCatalogue } from '../../hooks/useDesignCatalogue';

/**
 * Onboarding a design into Create Media, from the dashboard.
 *
 * ── THE QUESTION THIS ANSWERS ────────────────────────────────────────────
 *
 * "How do we upload templates to Create Media?" The honest answer until now
 * was: you cannot. The shipped layouts are a 2,780-line TypeScript file, so
 * adding one meant a code change and a deploy.
 *
 * ── TWO WAYS IN, ONE CATALOGUE ───────────────────────────────────────────
 *
 * A **Claude Design artboard** (`.dc.html`) is laid out here, at its real
 * size, in the faces Create Media ships — and the boxes are MEASURED. That
 * is the only honest way: an artboard positions itself with flexbox, so
 * where the headline sits is decided by the layout engine, not written in
 * the markup. Guessing is what made the old PDF import unrecognisable.
 *
 * A **template JSON** is already the slot shape and is simply validated.
 *
 * ── WHY A PICTURE IS REFUSED ─────────────────────────────────────────────
 *
 * A PNG could be stored and called a template, and then everything
 * downstream — resize, restyle, edit the headline — would do nothing to it.
 * So it is refused with the reason, and pointed at the Brand Asset Manager.
 */
export default function TemplateManager() {
  const [tab, setTab] = useState<'templates' | 'assets'>('templates');
  const [assetsSeen, setAssetsSeen] = useState(false);
  return (
    <div className="space-y-5">
      <div role="tablist" className="flex gap-2">
        {([['templates', 'Templates'], ['assets', 'Assets']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => { setTab(key); if (key === 'assets') setAssetsSeen(true); }}
            className={`min-h-[40px] rounded-lg px-4 text-xs font-bold ${
              tab === key
                ? 'bg-purple-600 text-white'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Both stay mounted so staged uploads survive a visit to the other tab. */}
      <div hidden={tab !== 'templates'}><TemplatesTab /></div>
      {assetsSeen && <div hidden={tab !== 'assets'}><AssetReview /></div>}
    </div>
  );
}

function TemplatesTab() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<{ fileName: string; draft: TemplateDraft }[]>([]);
  const [refused, setRefused] = useState<{ fileName: string; reason: string }[]>([]);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState<TemplateRow | null>(null);
  /** False when the database predates the review migration. */
  const [reviewGate, setReviewGate] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** The listed catalogue, which C13 compares a layout against. */
  const { templates: listed } = useDesignCatalogue();
  const codeKeys = useMemo(() => new Set(DESIGN_TEMPLATES.map((t) => t.key)), []);
  /** Each stored row read back as a template once per load, not on every keystroke. */
  const entries = useMemo(
    () => new Map(rows.map((r) => [r.id, entryFromRow(r, codeKeys)])),
    [rows, codeKeys],
  );

  const load = useCallback(async () => {
    const read = await fetchTemplateRows();
    /*
     * Empty and unavailable are different answers. This product has eleven
     * panels on record that reported an empty table as a missing migration;
     * the mirror of that is a failed read that reads as an empty library and
     * invites somebody to upload everything again.
     */
    if (read.state === 'unavailable') { setProblem(read.reason); setRows([]); }
    else { setProblem(null); setRows(read.rows); setReviewGate(read.reviewGate); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Every key the catalogue already answers to — shipped layouts included. */
  const taken = useMemo(
    () => new Set([...DESIGN_TEMPLATES.map((t) => t.key), ...rows.map((r) => r.key)]),
    [rows],
  );

  const onFiles = async (picked: File[]) => {
    setRefused([]);
    setDrafts([]);

    /*
     * A ZIP is opened here and its template files join the selection, so
     * every one goes through the same validation as a file picked alone.
     * What it held that is not a template is counted in the report.
     */
    const files: (File | ZipFile)[] = [];
    const notes: { fileName: string; reason: string }[] = [];
    for (const f of picked) {
      if (!/\.zip$/i.test(f.name) && f.type !== 'application/zip' && f.type !== 'application/x-zip-compressed') {
        files.push(f);
        continue;
      }
      try {
        const zip = readTemplateZip(new Uint8Array(await f.arrayBuffer()), f.name);
        files.push(...zip.files.map((z) => ({ ...z, name: `${f.name} › ${z.name}` })));
        if (!zip.files.length) notes.push({ fileName: f.name, reason: 'This ZIP holds no template JSON or artboards.' });
        if (zip.skipped.length) {
          notes.push({
            fileName: f.name,
            reason: `${zip.skipped.length} other file${zip.skipped.length > 1 ? 's were' : ' was'} not a template and ${zip.skipped.length > 1 ? 'were' : 'was'} left out: ${zip.skipped.slice(0, 4).join(', ')}${zip.skipped.length > 4 ? '…' : ''}`,
          });
        }
      } catch (e) {
        notes.push({ fileName: f.name, reason: `This ZIP could not be opened: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    setReading({ done: 0, total: files.length });
    const results: Ingested[] = await ingestFiles(
      files, taken, measureArtboard,
      (done, total) => setReading({ done, total }),
    );

    setReading(null);
    setDrafts(results.filter((r): r is Extract<Ingested, { ok: true }> => r.ok)
      .map((r) => ({ fileName: r.fileName, draft: r.draft })));
    setRefused([
      ...notes,
      ...results.filter((r): r is Extract<Ingested, { ok: false }> => !r.ok)
        .map((r) => ({ fileName: r.fileName, reason: r.reason })),
    ]);
  };

  /*
   * An import is filed for review, never published. Publication needs a
   * review of record (85 or more, approved, no criticals): the founder's
   * rule, enforced by design_templates_publish_gate. "Publish all" used to
   * sit here and put unreviewed layouts straight into the public gallery.
   */
  const saveAll = async () => {
    if (!drafts.length) return;
    setBusy(true);
    const who = await currentStaffId();
    if ('why' in who) { setBusy(false); toast.error(who.why); return; }

    const payload = drafts.map(({ draft }) => ({
      key: draft.template.key,
      label: draft.template.label,
      description: draft.template.desc || null,
      category: draft.category,
      styles: draft.styles,
      industries: draft.industries,
      tags: draft.tags,
      /* Tidied as the validator reads it, so the stored document is what a review hashes. */
      document: withCleanClassification(draft.template),
      editability: draft.editability,
      source_format: draft.sourceFormat,
      format: draft.format || null,
      status: 'in_review',
      created_by: who.id,
    }));

    /*
     * No `.select()` after the insert. On an RLS table that turns a
     * successful write into a failed read and blames the insert — the trap
     * already on record here against public-submit tables.
     */
    const { error } = await supabase.from('design_templates').insert(payload);
    setBusy(false);
    if (error) { toast.error(`Could not save those: ${error.message}`); return; }

    toast.success(`${payload.length} filed for review. Each can be published once it is scored ${PUBLISH_SCORE} or more.`);
    invalidateCatalogue();
    setDrafts([]);
    if (fileRef.current) fileRef.current.value = '';
    void load();
  };

  const setStatus = async (row: TemplateRow, status: TemplateStatus) => {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'published') {
      /*
       * The screen's copy of the gate, so the refusal names its reason. The
       * database checks the same rule, and a stale review, on the write.
       */
      if (!reviewGate) {
        toast.error('Publishing needs the review migration (20261117000000) applied to this database first.');
        return;
      }
      const gate = gateFor(row);
      if (!gate.publishable) { toast.error(`${row.label} cannot be published: ${gate.reasons.join('; ')}.`); return; }
      /*
       * Publishing is an approval, and an approval with no approver is not
       * one. If we cannot say who pressed it, nothing is published.
       */
      const who = await currentStaffId();
      if ('why' in who) { toast.error(who.why); return; }
      patch.published_at = new Date().toISOString();
      patch.approved_by = who.id;
    }
    const { error } = await supabase.from('design_templates').update(patch).eq('id', row.id);
    if (error) {
      /*
       * The one refusal the screen cannot predict: the layout changed after
       * it was scored, so the database holds the review stale.
       */
      toast.error(/design_templates_publish_gate/.test(error.message)
        ? `${row.label} was not published: its review does not cover this version of the layout. Review it again.`
        : `Could not change that: ${error.message}`);
      return;
    }
    toast.success(`${row.label} — ${STATUS_LABEL[status].toLowerCase()}.`);
    invalidateCatalogue();
    void load();
  };

  const drop = async (row: TemplateRow) => {
    setConfirmDrop(null);
    const { error } = await supabase.from('design_templates').delete().eq('id', row.id);
    if (error) { toast.error(`Could not remove that: ${error.message}`); return; }
    toast.success('Removed.');
    invalidateCatalogue();
    void load();
  };

  const downloadStarter = () => {
    const template = DESIGN_TEMPLATES[0];
    const json = templateToUploadJson(template, DELIVERABLE_CATEGORIES[0].id);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `nowopen-template-${template.key}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const published = rows.filter((r) => r.status === 'published').length;

  return (
    <div className="space-y-5">
      {/* ── What this is, and the honest count ───────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {DESIGN_TEMPLATES.length} shipped layouts · {published} published from here
            </p>
            <p className="mt-1 max-w-2xl text-xs text-gray-500 dark:text-gray-400">
              Drop in artboards from a Claude Design canvas (<span className="font-semibold">.dc.html</span>) and
              they are laid out here at full size, measured, and turned into real slot templates — the gallery,
              the editor, the exporter and Motion Studio then read them exactly as they read the shipped ones.
              Template JSON works too, and so does a ZIP of either. Select as many files as you like.
            </p>
            <p className="mt-1 max-w-2xl text-xs text-gray-500 dark:text-gray-400">
              Imports are filed for review. A template is published only after an admin scores it {PUBLISH_SCORE} or
              more on the 100-point rubric, approves it, and no critical failure is recorded.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadStarter}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Download size={14} /> Starter file
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-purple-600 px-4 text-xs font-bold text-white hover:bg-purple-700">
            <Upload size={14} /> Import designs
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".json,.html,.dc.html,.zip,application/json,text/html,application/zip,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const picked = [...(e.target.files ?? [])];
                if (picked.length) void onFiles(picked);
              }}
            />
          </label>
          <span className="text-[11px] text-gray-500">
            Artboards (.dc.html), template JSON and ZIPs of them become editable templates. A picture cannot.
          </span>
        </div>

        {!loading && !problem && !reviewGate && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            This database has no review gate yet (migration 20261117000000). Imports can be filed for review, but
            nothing can be scored or published from here until it is applied.
          </p>
        )}

        {reading && (
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-purple-700 dark:text-purple-300">
            <Loader2 size={14} className="animate-spin" />
            Laying out and measuring {reading.done} of {reading.total}…
          </p>
        )}

        {refused.length > 0 && (
          /*
           * Every refusal, named, with its reason. A bulk import that says
           * "48 imported" and nothing about the other 12 is how a design
           * quietly never arrives.
           */
          <ul className="mt-3 space-y-1.5 rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
            <li className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
              {refused.length} not imported
            </li>
            {refused.map((r) => (
              <li key={r.fileName} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span><span className="font-semibold">{r.fileName}</span> — {r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {drafts.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-800 dark:bg-purple-900/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {drafts.length} ready to review
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveAll()}
                disabled={busy}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />}
                File all {drafts.length} for review
              </button>
              <button
                type="button"
                onClick={() => { setDrafts([]); if (fileRef.current) fileRef.current.value = ''; }}
                aria-label="Discard this import"
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map(({ fileName, draft }, i) => (
              <DraftCard
                key={draft.template.key}
                fileName={fileName}
                draft={draft}
                siblings={listed}
                onChange={(next) => setDrafts((d) => d.map((row, j) => (j === i ? { ...row, draft: next } : row)))}
                onRemove={() => setDrafts((d) => d.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── The library ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin text-gray-400" size={20} /></div>
      ) : problem ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{problem}</p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            This is a failed read, not an empty library — nothing has been lost.
          </p>
          <button onClick={() => void load()} className="mt-2 text-xs font-bold text-amber-900 underline dark:text-amber-200">
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500 dark:border-gray-700">
          Nothing uploaded yet. The {DESIGN_TEMPLATES.length} shipped layouts are unaffected — they
          live in the code and are always in the gallery.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const gate = gateFor(row);
            const entry = entries.get(row.id) ?? entryFromRow(row, codeKeys);
            return (
            <li key={row.id} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-wrap items-center gap-3">
              <FileJson size={16} className="shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{row.label}</p>
                <p className="truncate text-[11px] text-gray-500">
                  {row.key} · {row.category}
                  {row.format ? ` · ${row.format}` : ''} · {EDITABILITY_LABEL[row.editability]}
                  {row.source_format ? ` · from ${row.source_format}` : ''}
                </p>
                {reviewGate && (
                  <p className="truncate text-[11px] text-gray-500">
                    {row.legacy_listing
                      ? 'Listed before the review gate: never scored'
                      : row.reviewed_at
                        ? `Scored ${row.review_score ?? '?'} · ${row.review_decision ?? 'no decision'}${(row.review_criticals ?? []).length ? ` · critical ${(row.review_criticals ?? []).join(', ')}` : ''}`
                        : 'Not reviewed'}
                  </p>
                )}
              </div>
              {row.legacy_listing && (
                <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  Legacy
                </span>
              )}
              <StatusPill status={row.status} />
              <div className="flex shrink-0 items-center gap-1">
                {reviewGate && entry.ok && (
                  <IconButton
                    label={`Review ${row.label}`}
                    onClick={() => setReviewing(reviewing === row.id ? null : row.id)}
                  >
                    <ClipboardCheck size={14} />
                  </IconButton>
                )}
                {row.status !== 'published' ? (
                  <IconButton
                    label={gate.publishable ? `Publish ${row.label}` : `Cannot publish ${row.label} yet: ${gate.reasons.join('; ')}`}
                    onClick={() => void setStatus(row, 'published')}
                    tone={gate.publishable && reviewGate ? 'go' : undefined}
                  >
                    <Send size={14} />
                  </IconButton>
                ) : (
                  <IconButton label={`Unpublish ${row.label}`} onClick={() => void setStatus(row, 'draft')}>
                    <EyeOff size={14} />
                  </IconButton>
                )}
                <IconButton label={`Archive ${row.label}`} onClick={() => void setStatus(row, 'archived')}>
                  <Archive size={14} />
                </IconButton>
                <IconButton label={`Remove ${row.label}`} onClick={() => setConfirmDrop(row)} tone="danger">
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
            {reviewing === row.id && entry.ok && (
              <TemplateReviewPanel
                row={row}
                template={entry.entry.template}
                siblings={listed}
                onClose={() => setReviewing(null)}
                onSaved={() => { setReviewing(null); void load(); }}
              />
            )}
            </li>
            );
          })}
        </ul>
      )}

      {confirmDrop && (
        <ConfirmDialog
          open
          title={`Remove “${confirmDrop.label}”?`}
          message="The template and its document are deleted. Designs already made from it are unaffected. This cannot be undone."
          confirmLabel="Remove"
          tone="danger"
          onConfirm={() => void drop(confirmDrop)}
          onCancel={() => setConfirmDrop(null)}
        />
      )}
    </div>
  );
}

/**
 * Who is doing this.
 *
 * The `error` from `getUser` is read rather than dropped: a template filed
 * against nobody still lands in the public catalogue, and the audit trail —
 * who uploaded it, who approved it — is most of the reason these columns
 * exist. An unanswerable session refuses the write instead.
 */
async function currentStaffId(): Promise<{ id: string } | { why: string }> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { why: `We could not confirm who you are signed in as: ${error.message}` };
  const id = data.user?.id;
  if (!id) return { why: 'You are signed out. Sign in again before publishing a template.' };
  return { id };
}

/**
 * One import, drawn before it is filed.
 *
 * Rendered through the SAME `TemplateSurface` the gallery and the exporter
 * use, so this is not an impression of the import — it is the import. A
 * review screen that shows a filename is a screen where nobody notices a
 * headline that landed off the page.
 */
function DraftCard({
  fileName, draft, siblings, onChange, onRemove,
}: {
  fileName: string;
  draft: TemplateDraft;
  /** The listed catalogue, for C13. */
  siblings: DesignTemplate[];
  onChange: (d: TemplateDraft) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<TemplateDraft>) => onChange({ ...draft, ...patch });
  /*
   * The same browser-safe criticals the review panel runs, on the card as it
   * stands, so whoever imports sees what a reviewer will see before filing.
   */
  const check = useMemo(
    () => checkUpload(draft.template, { category: draft.category, label: draft.template.label, format: draft.format }, siblings),
    [draft.template, draft.category, draft.format, siblings],
  );
  const field = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[11px] dark:border-gray-600 dark:bg-gray-800 dark:text-white';
  const W = 220;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        {/* Editable: this is the name a business owner reads in the gallery,
            and the artboard was named for a canvas, not for them. */}
        <input
          value={draft.template.label}
          onChange={(e) => onChange({ ...draft, template: { ...draft.template, label: e.target.value.slice(0, 60) } })}
          aria-label={`Name for ${fileName}`}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-bold text-gray-900 hover:border-gray-300 focus:border-purple-500 focus:outline-none dark:text-white dark:hover:border-gray-600"
        />
        <button type="button" onClick={onRemove} aria-label={`Leave out ${fileName}`} className="shrink-0 text-gray-400 hover:text-gray-700">
          <X size={14} />
        </button>
      </div>
      <p className="truncate text-[10px] text-gray-400">{fileName}</p>

      <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700">
        <div style={{ width: W, height: W, overflow: 'hidden' }}>
          <div style={{ transform: `scale(${W / 1080})`, transformOrigin: 'top left' }}>
            <TemplateSurface
              template={draft.template}
              content={sampleFor(draft.template)}
              width={1080}
              height={1080}
              accent="#4f46e5"
            />
          </div>
        </div>
      </div>

      <p className="mt-1.5 text-[10px] text-gray-500">
        {draft.template.slots.length} slots · {EDITABILITY_LABEL[draft.editability]}
        {draft.because ? ` · filed under ${draft.category} because ${draft.because}` : ''}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <select value={draft.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category" className={field}>
          {DELIVERABLE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={draft.format} onChange={(e) => set({ format: e.target.value })} aria-label="Canvas" className={field}>
          <option value="">Square, the default</option>
          {DESIGN_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {DESIGN_STYLES.map((s) => {
          const on = draft.styles.includes(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => set({ styles: on ? draft.styles.filter((k) => k !== s.key) : [...draft.styles, s.key] })}
              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${on ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2">
        <TemplateDetailsFields
          template={draft.template}
          idPrefix={`draft-${draft.template.key}`}
          compact
          onChange={(details) => onChange({ ...draft, template: { ...draft.template, ...details } })}
        />
      </div>

      <CheckSummary check={check} />

      {draft.notes.length > 0 && (
        /* Corrections and losses, said out loud rather than absorbed. */
        <ul className="mt-2 space-y-1">
          {draft.notes.map((note) => (
            <li key={note} className="text-[10px] leading-snug text-gray-500 dark:text-gray-400">· {note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The card's line on the house criticals: clear, or the first few findings. */
function CheckSummary({ check }: { check: ReturnType<typeof checkUpload> }) {
  if (!check.ok) {
    return <p className="mt-2 text-[10px] text-red-700 dark:text-red-300">The house checks could not run: {check.reason}</p>;
  }
  if (!check.list.length) {
    return <p className="mt-2 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">House checks clear (all but C3, C6, C8, C10).</p>;
  }
  return (
    <ul className="mt-2 space-y-0.5 rounded-lg bg-red-50 p-2 dark:bg-red-950/30">
      <li className="text-[10px] font-bold text-red-800 dark:text-red-200">
        {check.list.length} finding{check.list.length > 1 ? 's' : ''}: a reviewer cannot pass it until these are fixed
      </li>
      {check.list.slice(0, 4).map((f, i) => (
        <li key={`${f.code}-${i}`} className="text-[10px] leading-snug text-red-800 dark:text-red-200">
          <span className="font-bold">{f.code}</span> {f.detail}
        </li>
      ))}
      {check.list.length > 4 && <li className="text-[10px] text-red-700 dark:text-red-300">…and {check.list.length - 4} more</li>}
    </ul>
  );
}

const STATUS_TONE: Record<TemplateStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  in_review: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  approved: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  published: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  archived: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

function StatusPill({ status }: { status: TemplateStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function IconButton({
  label, onClick, tone, children,
}: {
  label: string;
  onClick: () => void;
  tone?: 'go' | 'danger';
  children: React.ReactNode;
}) {
  const colour = tone === 'danger'
    ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
    : tone === 'go'
      ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950'
      : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700';
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`grid h-9 w-9 place-items-center rounded-lg transition ${colour}`}>
      {children}
    </button>
  );
}
