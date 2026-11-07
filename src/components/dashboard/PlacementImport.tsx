import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';

import { loadRates } from '../../lib/currency';
import { formatLocalDate } from '../../lib/dates';
import {
  cityOf, listMyImports, type ImportErrorEntry, type MyMediaOwner, type PlacementImportRecord,
} from '../../lib/promote/partner';
import {
  readSpreadsheet, guessMapping, validateRows, findDuplicates, loadDuplicateCandidates, runImport,
  FIELDS, FIELD_LABELS, IMPORT_LIMITS, TEMPLATE_PATH,
  type Decision, type Draft, type ImportResult, type Mapping,
} from '../../lib/promote/placementImport';
import type { Advertisement } from '../../types';

/**
 * "Import from a spreadsheet" in the Media owner tab: download the template,
 * upload a CSV or XLSX, check the column mapping, see which rows have
 * problems, decide each possible duplicate, then confirm.
 *
 * WHAT HAPPENS WHERE
 *
 * Everything up to Confirm happens in the browser and writes nothing. Confirm
 * runs runImport, which uses the same owner paths as the placement form. A
 * row matched to a placement NOT linked to this owner becomes a claim that an
 * admin decides, never an edit; the owner is told so next to the choice, and
 * gives one statement for those claims.
 *
 * WHY CONFIRM WAITS FOR EVERY CHOICE
 *
 * A possible duplicate has no safe default. "New" would list the same
 * billboard twice; "same" would claim or overwrite a site that may be a
 * different one. So each match must be answered before Confirm is enabled.
 *
 * The import's record (counts and error report) is shown in the history
 * below, which reads placement_imports for this owner only.
 *
 * Touch targets are in explicit px: the app's root font is below 16px.
 */

const FIELD = 'min-h-[44px] w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm';
const BTN = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white hover:bg-blue-700`;
const BTN_PLAIN = `${BTN} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

function ErrorList({ errors, label }: { errors: ImportErrorEntry[]; label: string }) {
  if (!errors.length) return null;
  return (
    <ul aria-label={label} className="max-h-60 overflow-y-auto list-disc pl-5 text-sm text-rose-800 dark:text-rose-200 space-y-1">
      {errors.map((e, i) => <li key={`${e.row}-${i}`}>{e.message}</li>)}
    </ul>
  );
}

export default function PlacementImport({ owner, onImported }: { owner: MyMediaOwner; onImported?: () => void }) {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [checked, setChecked] = useState<{ valid: Draft[]; errors: ImportErrorEntry[] } | null>(null);
  const [candidates, setCandidates] = useState<Advertisement[]>([]);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [statement, setStatement] = useState('');
  const [rates, setRates] = useState<Record<string, number> | undefined>(undefined);
  const [busy, setBusy] = useState<'reading' | 'checking' | 'importing' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PlacementImportRecord[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const importingRef = useRef(false);

  const loadHistory = useCallback(async () => {
    const r = await listMyImports(owner.id);
    if (r.ok) { setHistory(r.imports); setHistoryError(null); } else setHistoryError(r.error);
  }, [owner.id]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);
  useEffect(() => {
    let alive = true;
    void loadRates().then((r) => { if (alive) setRates(r.rates); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const reset = () => {
    setChecked(null); setDecisions({}); setResult(null); setProgress(null); setError(null);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setMapping(null); setHeaders([]); setRows([]);
    setBusy('reading');
    const r = await readSpreadsheet(file);
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    const head = r.rows[0].map((h) => String(h ?? ''));
    setFileName(file.name);
    setHeaders(head);
    setRows(r.rows.slice(1));
    setMapping(guessMapping(head));
  };

  const check = async () => {
    if (!mapping) return;
    setError(null); setResult(null); setDecisions({});
    setBusy('checking');
    const c = validateRows(rows, mapping, rates);
    // Reading candidates is a plain read; a failure means duplicates cannot
    // be shown, so the import does not go ahead blind.
    const cand = await loadDuplicateCandidates(owner.id);
    setBusy(null);
    if (!cand.ok) { setError(`Could not check for placements already listed: ${cand.error}`); return; }
    setCandidates(cand.adverts);
    setChecked(c);
  };

  const matches = useMemo(() => {
    const m = new Map<number, Advertisement[]>();
    for (const d of checked?.valid ?? []) {
      const found = findDuplicates(d, candidates);
      if (found.length) m.set(d.row, found);
    }
    return m;
  }, [checked, candidates]);

  const tooMany = checked?.errors.some((e) => e.row === 0) ?? false;
  const undecided = [...matches.keys()].filter((row) => !decisions[row]).length;
  const claims = Object.values(decisions).filter((d) => {
    if (d.kind !== 'same') return false;
    return candidates.find((a) => a.id === d.advertId)?.owner_id !== owner.id;
  }).length;
  const canConfirm = Boolean(checked && checked.valid.length && !tooMany && undecided === 0 && (claims === 0 || statement.trim()))
    && busy === null && !result;

  const confirm = async () => {
    if (!checked || !canConfirm || importingRef.current) return;
    importingRef.current = true;
    setBusy('importing'); setError(null);
    setProgress({ done: 0, total: checked.valid.length });
    try {
      const r = await runImport(owner.id, checked.valid, decisions, {
        fileName, existing: candidates, invalid: checked.errors, claimStatement: statement,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(r);
      await loadHistory();
      onImported?.();
    } finally {
      setBusy(null);
      importingRef.current = false;
    }
  };

  const invalidRowCount = new Set((checked?.errors ?? []).filter((e) => e.row > 0).map((e) => e.row)).size;

  return (
    <section aria-labelledby="placement-import-title" className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <FileSpreadsheet size={20} className="mt-1 text-blue-600 dark:text-blue-400 shrink-0" />
        <div>
          <h3 id="placement-import-title" className="text-base font-semibold text-gray-900 dark:text-white">Import from a spreadsheet</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Add many placements at once from a CSV or XLSX file, up to {IMPORT_LIMITS.maxRows.toLocaleString('en-US')} rows and 5MB.
            Nothing is saved until you confirm.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a className={BTN_PLAIN} href={TEMPLATE_PATH} download="nowopen-placements-template.csv">
          <Download size={15} /> Download the template
        </a>
        <label className={`${BTN_PLAIN} cursor-pointer`}>
          {busy === 'reading' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Choose a file
          <input
            aria-label="Choose a spreadsheet"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            disabled={busy !== null}
            onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 text-sm p-3">{error}</p>
      )}

      {mapping && !result && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-gray-900 dark:text-white">
            Columns in {fileName} ({plural(rows.length, 'row', 'rows')})
          </legend>
          <p className="text-xs text-gray-500">Check which column holds each detail. Leave a detail as “Not in this file” if the file has no such column.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f} className="block text-sm text-gray-700 dark:text-gray-300 space-y-1">
                <span>{FIELD_LABELS[f]}</span>
                <select
                  aria-label={FIELD_LABELS[f]}
                  className={FIELD}
                  value={mapping[f] === null ? '' : String(mapping[f])}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value);
                    setMapping((m) => (m ? { ...m, [f]: v } : m));
                    setChecked(null); setDecisions({});
                  }}
                >
                  <option value="">Not in this file</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button type="button" className={BTN_PRIMARY} disabled={busy !== null} onClick={() => void check()}>
            {busy === 'checking' && <Loader2 size={15} className="animate-spin" />} Check the rows
          </button>
        </fieldset>
      )}

      {checked && !result && (
        <div className="space-y-4">
          <p className="text-sm text-gray-900 dark:text-white">
            {tooMany ? 'This file cannot be imported.' : `${plural(checked.valid.length, 'row is', 'rows are')} ready.`}
            {invalidRowCount > 0 && ` ${plural(invalidRowCount, 'row has', 'rows have')} problems and will be left out:`}
          </p>
          <ErrorList errors={checked.errors} label="Rows left out" />

          {matches.size > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Possibly already on NowOpen</h4>
              <p className="text-xs text-gray-500">Choose for each row. A site that is not linked to you yet is sent to NowOpen as a claim; it is not changed until the claim is approved.</p>
              {[...matches.entries()].map(([row, found]) => {
                const draft = checked.valid.find((d) => d.row === row)!;
                const name = `dup-${row}`;
                return (
                  <fieldset key={row} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
                    <legend className="text-sm font-medium text-gray-900 dark:text-white px-1">Row {row}: {draft.input.title}, {draft.input.city}</legend>
                    {found.map((a) => {
                      const mine = a.owner_id === owner.id;
                      return (
                        <label key={a.id} className="flex items-center gap-3 min-h-[44px] text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                          <input
                            type="radio"
                            name={name}
                            className="w-[20px] h-[20px]"
                            checked={decisions[row]?.kind === 'same' && (decisions[row] as { advertId: string }).advertId === a.id}
                            onChange={() => setDecisions((d) => ({ ...d, [row]: { kind: 'same', advertId: a.id } }))}
                          />
                          <span>
                            Same site as “{a.title}”{cityOf(a.location) ? ` in ${cityOf(a.location)}` : ''}:{' '}
                            {mine ? 'update it' : 'claim it (not linked to you yet)'}
                          </span>
                        </label>
                      );
                    })}
                    <label className="flex items-center gap-3 min-h-[44px] text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name={name}
                        className="w-[20px] h-[20px]"
                        checked={decisions[row]?.kind === 'new'}
                        onChange={() => setDecisions((d) => ({ ...d, [row]: { kind: 'new' } }))}
                      />
                      <span>A different site: add it as new</span>
                    </label>
                  </fieldset>
                );
              })}
            </div>
          )}

          {claims > 0 && (
            <label className="block text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <span>How are these sites yours? (sent with {plural(claims, 'claim', 'claims')})</span>
              <textarea aria-label="How are these sites yours?" rows={3} className={FIELD} value={statement}
                onChange={(e) => setStatement(e.target.value)} placeholder="e.g. We built these structures and hold the signage permits" />
            </label>
          )}

          {!tooMany && checked.valid.length > 0 && (
            <div className="space-y-2">
              {undecided > 0 && <p className="text-xs text-gray-500">Choose for {plural(undecided, 'more row', 'more rows')} before importing.</p>}
              <button type="button" className={BTN_PRIMARY} disabled={!canConfirm} onClick={() => void confirm()}>
                {busy === 'importing' && <Loader2 size={15} className="animate-spin" />}
                Import {plural(checked.valid.length, 'row', 'rows')}
              </button>
              {progress && busy === 'importing' && (
                <p className="text-xs text-gray-500" aria-live="polite">Saved {progress.done} of {progress.total}…</p>
              )}
            </div>
          )}
        </div>
      )}

      {result && (
        <div role="status" className="space-y-2">
          <p className="text-sm text-gray-900 dark:text-white">
            Done. {plural(result.created, 'placement added', 'placements added')}, {plural(result.updated, 'updated', 'updated')},{' '}
            {plural(result.claimed, 'claim sent', 'claims sent')}, {plural(result.failed, 'row left out', 'rows left out')}.
          </p>
          <ErrorList errors={result.errors} label="Import problems" />
          {!result.recorded && (
            <p className="text-sm text-amber-800 dark:text-amber-200">The rows were saved, but this import could not be added to your history: {result.recordError}</p>
          )}
          <button type="button" className={BTN_PLAIN} onClick={() => { reset(); setMapping(null); setHeaders([]); setRows([]); setFileName(''); }}>
            Import another file
          </button>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Past imports</h4>
        {historyError && <p className="text-sm text-rose-700 dark:text-rose-300">Could not load past imports: {historyError}</p>}
        {!historyError && history.length === 0 && <p className="text-sm text-gray-500">No imports yet.</p>}
        {history.length > 0 && (
          <ul aria-label="Past imports" className="space-y-2">
            {history.map((h) => {
              const report = Array.isArray(h.error_report) ? h.error_report : [];
              const updated = Math.max(0, h.rows_total - h.rows_created - h.rows_claimed - h.rows_failed);
              return (
                <li key={h.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm">
                  <p className="font-medium text-gray-900 dark:text-white">{h.file_name} · {h.created_at ? formatLocalDate(h.created_at) : ''}</p>
                  <p className="text-gray-600 dark:text-gray-400">
                    {plural(h.rows_total, 'row', 'rows')}: {h.rows_created} added, {updated} updated, {h.rows_claimed} claimed, {h.rows_failed} left out
                  </p>
                  {report.length > 0 && (
                    <details>
                      <summary className="min-h-[44px] flex items-center cursor-pointer text-blue-700 dark:text-blue-300">See the problems</summary>
                      <ErrorList errors={report} label={`Problems in ${h.file_name}`} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
