import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import TemplateSurface from '../studio/TemplateSurface';
import { supabase } from '../../lib/supabase';
import type { DesignTemplate } from '../../lib/designTemplates';
import { sampleFor } from '../../lib/create/sampleCopy';
import { cleanClassification } from '../../lib/create/templateUpload';
import {
  checkUpload, PUBLISH_SCORE, RUBRIC, rubricProblems, rubricTotal,
  type ReviewDecision, type RubricLines,
} from '../../lib/create/templateReview';
import TemplateDetailsFields, { type TemplateDetails } from './TemplateDetailsFields';
import type { TemplateRow } from '../../lib/create/templateCatalogue';

/**
 * Score one uploaded template on the founder's rubric.
 *
 * ── WHAT IS AUTOMATIC AND WHAT IS A JUDGEMENT ────────────────────────────
 *
 * The house criticals that can run in a browser (criticalCore.ts: C1, C2,
 * C4, C5, C7, C9, C11, C12, C13) run here on the stored layout, and any
 * finding is recorded with the review and blocks publication. They cannot be
 * waved through from this screen: a false finding is fixed in the layout or
 * in the check, where it is visible, not by a tick box.
 *
 * C10, an invented claim, is the reviewer's call. C3 (glyphs) reads font
 * files and runs only in Node, C6 needs the preview harness, and C8 is not
 * built anywhere yet; the panel says so rather than implying a clean bill.
 *
 * The total is shown as the reviewer types, but the score of record is the
 * one the database computes from the lines.
 */
export default function TemplateReviewPanel({
  row, template, siblings, onSaved, onClose,
}: {
  row: TemplateRow;
  template: DesignTemplate;
  /** The listed catalogue, for C13's "too close to another design". */
  siblings: DesignTemplate[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<Partial<RubricLines>>(() => ({ ...(row.review_lines ?? {}) }));
  const [decision, setDecision] = useState<ReviewDecision | ''>(row.review_decision ?? '');
  const [c10, setC10] = useState((row.review_criticals ?? []).includes('C10'));
  const [notes, setNotes] = useState(row.review_notes ?? '');
  const [saving, setSaving] = useState(false);
  /*
   * Product, direction and demo copy, editable here because the 71 rows
   * listed before the gate never had them. Saved separately and before the
   * review: they change the stored layout, so the findings a review records
   * must be the findings of what is stored.
   */
  const stored = useMemo<TemplateDetails>(
    () => cleanClassification(template), [template],
  );
  const [details, setDetails] = useState<TemplateDetails>(stored);
  const [savingDetails, setSavingDetails] = useState(false);
  const live = useMemo(() => ({ ...template, ...details }), [template, details]);
  const dirty = JSON.stringify(cleanClassification(details)) !== JSON.stringify(stored);

  const findings = useMemo(
    () => checkUpload(live, row, siblings),
    [live, row, siblings],
  );

  const automaticCodes = findings.ok ? [...new Set(findings.list.map((f) => f.code))] : [];
  const criticals = [...automaticCodes, ...(c10 ? ['C10'] : [])];
  const total = rubricTotal(lines);
  const problems = rubricProblems(lines);
  const canSave = problems.length === 0 && decision !== '' && findings.ok && !saving && !dirty;

  const saveDetails = async () => {
    if (!dirty || savingDetails) return;
    setSavingDetails(true);
    const doc: Record<string, unknown> = { ...(row.document as Record<string, unknown>) };
    delete doc.subcategory; delete doc.direction; delete doc.sample;
    const { error } = await supabase
      .from('design_templates')
      .update({ document: { ...doc, ...cleanClassification(details) }, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    setSavingDetails(false);
    if (error) { toast.error(`The details were not saved: ${error.message}`); return; }
    toast.success('Details saved. Score it now: any earlier review no longer covers this layout.');
    onSaved();
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    /*
     * No `.select()` after the update: on an RLS table it turns a successful
     * write into a failed read. Score, reviewer and time are set by the
     * trigger from these four fields and the session.
     */
    const { error } = await supabase
      .from('design_templates')
      .update({
        review_lines: lines,
        review_decision: decision,
        review_criticals: criticals,
        review_notes: notes.trim() || null,
      })
      .eq('id', row.id);
    setSaving(false);
    if (error) { toast.error(`The review was not saved: ${error.message}`); return; }
    toast.success(`Review saved: ${total} of 100.`);
    onSaved();
  };

  const W = 260;
  const field = 'w-14 rounded-lg border border-gray-300 bg-white px-2 py-1 text-right text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white';
  const meets = total >= PUBLISH_SCORE && criticals.length === 0 && decision === 'approve';

  return (
    <div className="mt-2 rounded-xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-800 dark:bg-purple-900/10">
      <div className="flex flex-wrap gap-5">
        <div className="shrink-0">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700" style={{ width: W, height: W }}>
            <div style={{ transform: `scale(${W / 1080})`, transformOrigin: 'top left' }}>
              <TemplateSurface template={live} content={sampleFor(live)} width={1080} height={1080} accent="#4f46e5" />
            </div>
          </div>
          <p className="mt-1 text-[10px] text-gray-500">Drawn with the demo copy, as the gallery card is.</p>
        </div>

        <div className="min-w-[240px] flex-1 space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold text-gray-900 dark:text-white">Details</legend>
            <TemplateDetailsFields template={live} idPrefix={`review-${row.id}`} onChange={setDetails} />
            {dirty && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveDetails()}
                  disabled={savingDetails}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-purple-600 px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {savingDetails && <Loader2 size={13} className="animate-spin" />} Save details
                </button>
                <span className="text-[10px] text-gray-500">
                  Save these before scoring: they change the stored layout{row.status === 'published' ? ', and the live gallery card' : ''}.
                </span>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-xs font-bold text-gray-900 dark:text-white">Rubric</legend>
            <ul className="mt-1.5 space-y-1">
              {RUBRIC.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <label htmlFor={`rubric-${row.id}-${r.key}`}>{r.label}</label>
                  <span className="flex items-center gap-1">
                    <input
                      id={`rubric-${row.id}-${r.key}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={r.max}
                      step={1}
                      value={lines[r.key] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((l) => {
                          const next = { ...l };
                          if (v === '') delete next[r.key];
                          else next[r.key] = Number(v);
                          return next;
                        });
                      }}
                      className={field}
                    />
                    <span className="w-8 text-[10px] text-gray-400">/ {r.max}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className={`mt-2 text-sm font-bold ${meets ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-900 dark:text-white'}`}>
              {total} of 100 · publication needs {PUBLISH_SCORE}, an approval and no criticals
            </p>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-bold text-gray-900 dark:text-white">Critical failures</legend>
            {!findings.ok ? (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                The automatic checks could not run on this layout ({findings.reason}). It cannot be reviewed until they can.
              </p>
            ) : findings.list.length === 0 ? (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={13} /> No automatic findings (C1, C2, C4, C5, C7, C9, C11, C12, C13).
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {findings.list.map((f, i) => (
                  <li key={`${f.code}-${i}`} className="flex items-start gap-1.5 text-xs text-red-800 dark:text-red-200">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span><span className="font-bold">{f.code}</span> {f.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <label className="mt-2 flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={c10} onChange={(e) => setC10(e.target.checked)} className="mt-0.5" />
              <span><span className="font-bold">C10</span> It claims something invented: a product, price, award or fact no business gave us.</span>
            </label>
            <p className="mt-1 text-[10px] text-gray-500">
              Not checked here: C3 (glyph coverage, needs the font files), C6 (preview harness), C8 (export comparison, not built).
            </p>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-bold text-gray-900 dark:text-white">Decision</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-700 dark:text-gray-200">
              {([['approve', 'Approve'], ['revise', 'Revise'], ['reject', 'Reject']] as const).map(([v, label]) => (
                <label key={v} className="flex items-center gap-1.5">
                  <input type="radio" name={`decision-${row.id}`} checked={decision === v} onChange={() => setDecision(v)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-xs text-gray-700 dark:text-gray-200">
            <span className="font-bold text-gray-900 dark:text-white">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 2000))}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            <span className="text-[10px] text-gray-500">Readable by anyone once the template is published: write them for the designer, not about them.</span>
          </label>

          {problems.length > 0 && Object.keys(lines).length > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">{problems[0]}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
            >
              {saving && <Loader2 size={13} className="animate-spin" />} Save review
            </button>
            <button type="button" onClick={onClose} className="min-h-[40px] px-3 text-xs font-semibold text-gray-600 dark:text-gray-300">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
