import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, Loader2, CheckCircle2, AlertTriangle, XCircle, Copy, Download, Undo2 } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  autoMap, applyMapping, missingRequired, DATASET_FIELDS,
  type ColumnMatch, type Dataset,
} from '../../lib/imports/mapping';
import {
  buildReference, validateRow, summarise, findInternalDuplicates, errorReportCsv,
  type ValidatedRow, type ReferenceData,
} from '../../lib/imports/validate';

/**
 * Admin → Data Operations → Import Center.
 *
 * Upload, see what the file was understood to contain, correct the mapping,
 * then approve. Nothing is written until the admin has seen the counts — which
 * is the whole point: a spreadsheet with a shifted column can create ten
 * thousand wrong businesses in a minute, and the preview is the last cheap
 * place to notice.
 *
 * Approved rows become Radar candidates rather than businesses, so a bulk
 * import inherits the same duplicate detection and publish gate as anything
 * Radar discovers. There is one review queue and one set of rules.
 */

/** CSV reader that copes with quoted commas and newlines inside fields. */
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const table: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); table.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); table.push(row); }

  const headers = (table.shift() ?? []).map((h) => h.trim());
  const rows = table
    .filter((r) => r.some((v) => v.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows };
}

type Step = 'upload' | 'map' | 'preview' | 'done';

export default function ImportCenter() {
  const [dataset, setDataset] = useState<Dataset>('businesses');
  const [step, setStep] = useState<Step>('upload');
  const [filename, setFilename] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMatch[]>([]);
  const [reference, setReference] = useState<ReferenceData>(() => buildReference([], []));
  const [sourceName, setSourceName] = useState('');
  const [sourceLicence, setSourceLicence] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reference: string; created: number } | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  // Reference data decides what counts as a known category or town.
  useEffect(() => {
    (async () => {
      const [cats, locs] = await Promise.all([
        supabase.from('ref_categories').select('category,slug').eq('active', true),
        supabase.from('ref_locations').select('city').eq('active', true),
      ]);
      setReference(buildReference(cats.data ?? [], locs.data ?? []));
    })().catch(() => { /* validation still runs; unknowns just go to review */ });
  }, []);

  const onFile = useCallback(async (file: File) => {
    const text = await file.text();
    const { headers: h, rows } = parseCsv(text);
    if (!h.length || !rows.length) { toast.error('That file has no rows we can read.'); return; }
    setFilename(file.name);
    setHeaders(h);
    setRaw(rows);
    setMapping(autoMap(h, dataset));
    setStep('map');
  }, [dataset]);

  const validated: ValidatedRow[] = useMemo(() => {
    if (step === 'upload') return [];
    return raw.map((r, i) => validateRow(applyMapping(r, mapping), i + 2, dataset, reference));
  }, [raw, mapping, dataset, reference, step]);

  const internalDupes = useMemo(() => findInternalDuplicates(validated), [validated]);
  const summary = useMemo(() => summarise(validated, internalDupes.size), [validated, internalDupes]);
  const missing = useMemo(() => missingRequired(mapping, dataset), [mapping, dataset]);

  const setField = (header: string, field: string) => {
    setMapping((m) => m.map((x) => {
      if (x.header === header) return { ...x, field: field || null, confidence: field ? 'alias' : 'none' };
      // One field, one column — clear whoever held it before.
      if (field && x.field === field) return { ...x, field: null, confidence: 'none' };
      return x;
    }));
  };

  const runImport = async () => {
    if (dataset !== 'businesses') {
      toast.error('Only the businesses dataset publishes so far. Placements and media validate but do not import yet.');
      return;
    }
    setBusy(true);
    try {
      const { data: refData } = await supabase.rpc('next_import_reference');
      const batchRef = String(refData ?? '');

      const { data: batch, error: bErr } = await supabase.from('import_batches').insert({
        reference: batchRef, dataset, filename,
        column_mapping: Object.fromEntries(mapping.filter((m) => m.field).map((m) => [m.header, m.field])),
        source_name: sourceName.trim() || 'Admin CSV import',
        source_type: 'admin_import',
        source_license: sourceLicence.trim() || null,
        status: 'approved',
        total_rows: summary.total, valid_rows: summary.valid,
        review_rows: summary.review, invalid_rows: summary.invalid,
        duplicate_rows: summary.duplicates,
      }).select('id').single();
      if (bErr) throw bErr;

      const id = (batch as { id: string }).id;
      setBatchId(id);

      // Rows in chunks — a 12,000-row file in one insert times out.
      const importable = validated.filter((v) => v.status !== 'invalid' && !internalDupes.has(v.lineNo));
      for (let i = 0; i < importable.length; i += 500) {
        const chunk = importable.slice(i, i + 500).map((v) => ({
          batch_id: id, line_no: v.lineNo,
          raw: raw[v.lineNo - 2] ?? {},
          mapped: { ...v.mapped, nameKey: v.normalized?.nameKey, cityKey: v.normalized?.cityKey,
                    phone: v.normalized?.phone, domain: v.normalized?.domain },
          status: v.status, issues: v.issues, confidence: v.confidence,
        }));
        const { error } = await supabase.from('import_rows').insert(chunk);
        if (error) throw error;
      }

      const { data: created, error: pErr } = await supabase.rpc('import_batch_to_candidates', { p_batch: id });
      if (pErr) throw pErr;

      setResult({ reference: batchRef, created: Number(created ?? 0) });
      setStep('done');
      toast.success(`${created} rows queued for review`);
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? 'The import failed.');
    } finally {
      setBusy(false);
    }
  };

  const rollback = async () => {
    if (!batchId) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('rollback_import_batch', { p_batch: batchId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const r = data as { businesses_removed: number; kept_because_claimed: number };
    toast.success(`Rolled back. ${r.businesses_removed} removed, ${r.kept_because_claimed} kept because they were claimed.`);
    reset();
  };

  const reset = () => {
    setStep('upload'); setRaw([]); setHeaders([]); setMapping([]);
    setFilename(''); setResult(null); setBatchId(null);
  };

  const downloadErrors = () => {
    const blob = new Blob([errorReportCsv(validated)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename.replace(/\.csv$/i, '')}-errors.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const card = 'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4';
  const input = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white';

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import Center</h2>
        <p className="text-[12px] text-gray-500 dark:text-gray-400">
          Nothing is written until you approve the preview. Imported rows land unclaimed and
          unverified — a spreadsheet never assigns ownership.
        </p>
      </header>

      {step === 'upload' && (
        <div className={card}>
          <div className="flex flex-wrap gap-2 mb-3">
            {(['businesses', 'placements', 'media'] as const).map((d) => (
              <button key={d} onClick={() => setDataset(d)}
                className={`px-3 min-h-[36px] rounded-lg text-sm font-semibold capitalize ${
                  dataset === d ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                                : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'}`}>
                {d}
              </button>
            ))}
          </div>
          {dataset !== 'businesses' && (
            <p className="mb-3 text-[12px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
              {dataset} files are checked and mapped, but publishing is not wired yet — the preview is
              accurate, the import button is not available.
            </p>
          )}
          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 py-10 cursor-pointer hover:border-gray-400">
            <Upload size={22} className="text-gray-400" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Choose a CSV file</span>
            <span className="text-[11px] text-gray-500">Any column names — we will work out what they mean.</span>
            <input type="file" accept=".csv,text/csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
          </label>
        </div>
      )}

      {(step === 'map' || step === 'preview') && (
        <>
          <div className={card}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{filename}</p>
                <p className="text-[11px] text-gray-500">{raw.length.toLocaleString()} rows · {headers.length} columns</p>
              </div>
              <button onClick={reset} className="text-[12px] font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                Start over
              </button>
            </div>

            {missing.length > 0 && (
              <p className="mb-3 text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                Still needed: {missing.map((f) => f.label).join(', ')}. Pick the matching column below.
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400">
                    <th className="py-1.5 pr-3 font-semibold">Column in your file</th>
                    <th className="py-1.5 pr-3 font-semibold">Example</th>
                    <th className="py-1.5 font-semibold">NowOpen field</th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((m) => (
                    <tr key={m.header} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-white">{m.header}</td>
                      <td className="py-1.5 pr-3 text-gray-500 truncate max-w-[180px]">{raw[0]?.[m.header] || '—'}</td>
                      <td className="py-1.5">
                        <select
                          value={m.field ?? ''}
                          onChange={(e) => setField(m.header, e.target.value)}
                          aria-label={`NowOpen field for ${m.header}`}
                          className="px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-[12px]"
                        >
                          <option value="">— ignore this column —</option>
                          {DATASET_FIELDS[dataset].map((f) => (
                            <option key={f.field} value={f.field}>{f.label}{f.required ? ' *' : ''}</option>
                          ))}
                        </select>
                        {m.confidence === 'hint' && m.field && (
                          <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400">guessed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Preview */}
          <div className={card}>
            <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">Import preview</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {([
                ['Ready', summary.valid, 'text-green-700 dark:text-green-400', CheckCircle2],
                ['Need review', summary.review, 'text-amber-700 dark:text-amber-400', AlertTriangle],
                ['Cannot use', summary.invalid, 'text-red-700 dark:text-red-400', XCircle],
                ['Repeats in file', summary.duplicates, 'text-gray-600 dark:text-gray-300', Copy],
              ] as const).map(([label, n, tone, Icon]) => (
                <div key={label} className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                  <span className={`flex items-center gap-1.5 text-lg font-bold tabular-nums ${tone}`}>
                    <Icon size={14} /> {n.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-gray-500">{label}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mb-3">
              Average confidence {summary.averageConfidence}%. Rows needing review still import — they
              queue for a person rather than publishing straight away.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label htmlFor="src-name" className="block text-[12px] font-semibold text-gray-900 dark:text-white">Where did this file come from?</label>
                <input id="src-name" value={sourceName} onChange={(e) => setSourceName(e.target.value)}
                  placeholder="Lagos Chamber of Commerce directory" className={`${input} mt-1`} />
              </div>
              <div>
                <label htmlFor="src-lic" className="block text-[12px] font-semibold text-gray-900 dark:text-white">Under what permission?</label>
                <input id="src-lic" value={sourceLicence} onChange={(e) => setSourceLicence(e.target.value)}
                  placeholder="Written permission, 12 Aug 2026" className={`${input} mt-1`} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={runImport}
                disabled={busy || missing.length > 0 || summary.valid + summary.review === 0 || dataset !== 'businesses'}
                className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold disabled:opacity-40"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                Import {(summary.valid + summary.review).toLocaleString()} rows
              </button>
              {summary.invalid + summary.review > 0 && (
                <button onClick={downloadErrors}
                  className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  <Download size={15} /> Download issues
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <div className={card}>
          <p className="text-sm font-bold text-gray-900 dark:text-white">Batch {result.reference}</p>
          <p className="text-[12px] text-gray-600 dark:text-gray-300 mt-1">
            {result.created.toLocaleString()} rows queued for review. They are not public yet — publish
            them from the Review Queue.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={reset} className="px-4 min-h-[40px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold">
              Import another file
            </button>
            <button onClick={rollback} disabled={busy}
              className="inline-flex items-center gap-2 px-4 min-h-[40px] rounded-lg border border-red-300 dark:border-red-700 text-sm font-semibold text-red-700 dark:text-red-300 disabled:opacity-50">
              <Undo2 size={15} /> Roll this batch back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
