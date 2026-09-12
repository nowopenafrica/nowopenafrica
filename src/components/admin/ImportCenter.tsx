import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, Loader2, CheckCircle2, AlertTriangle, XCircle, Copy, Download, Undo2, RefreshCw } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  autoMap, applyMapping, missingRequired, DATASET_FIELDS,
  type ColumnMatch, type Dataset,
} from '../../lib/imports/mapping';
import {
  buildReference, validateRow, summarise, findInternalDuplicates, errorReportCsv,
  type ValidatedRow, type ReferenceData,
} from '../../lib/imports/validate';
import {
  matchExisting, summariseMatches, updatePatch, EXISTING_SELECT,
  type ExistingBusiness,
} from '../../lib/imports/matchExisting';
import { importTemplateCsv, importTemplateFilename } from '../../lib/imports/template';
import { normalizeName, normalizePlace, normalizePhone, normalizeDomain } from '../../lib/radar/normalize';

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

/**
 * CSV reader that copes with quoted commas and newlines inside fields.
 *
 * Exported because two of its rules are load-bearing and worth proving rather
 * than trusting: quoted fields containing commas, and comment rows, which stop
 * the downloadable template importing its own data dictionary as businesses.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
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
    /*
     * Skip comment rows.
     *
     * The downloadable template carries its data dictionary in the same file
     * as `#` lines, because a separate document is a document nobody opens.
     * Without this filter those lines import as businesses named
     * "# FIELD  REQUIRED  NOTES" — the template manufacturing junk listings
     * out of its own instructions.
     *
     * A HASH IS NOT ENOUGH. The first version dropped any row whose first cell
     * began with `#`, and its own test disproved it: "#1 Best Suya" is a real
     * business name, and the name is usually column one — so that rule would
     * have silently dropped it from every import.
     *
     * A comment is a hash followed by SPACE, DASH or end-of-cell. "#1" is a
     * name; "# note" is a comment. Cheap to state and it separates the two
     * cases without guessing.
     */
    .filter((r) => !/^#(\s|-|$)/.test((r[0] ?? '').trim()))
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
  /**
   * Everything NowOpen already has, reduced to match keys.
   *
   * Fetched once rather than queried per row: a per-row lookup is 10,000 round
   * trips on a large file. The keys are small (~120 bytes each), so this is
   * comfortable well past the current scale — at six figures of businesses it
   * should move server-side into the match itself.
   */
  const [existing, setExisting] = useState<ExistingBusiness[]>([]);
  const [updating, setUpdating] = useState(false);
  const [updated, setUpdated] = useState<number | null>(null);
  /** Set when the existing-business read failed, so the preview can say so. */
  const [existingFailed, setExistingFailed] = useState(false);

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

  // What NowOpen already has, so the file can be compared against it.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select(EXISTING_SELECT);
      /*
       * LOUD, not silent.
       *
       * The first version of this named `city`, `cover_image_url`, `latitude`
       * and `longitude` — none of which exist on `businesses`. PostgREST
       * rejected the whole query, this line returned, and the matcher then
       * compared the file against nothing: a CSV containing a business
       * NowOpen already had was offered as "2 new businesses".
       *
       * A silent failure here is worse than an error, because the admin is
       * shown a create count for rows that are duplicates and has no way to
       * tell. So the preview says so instead of quietly degrading.
       */
      if (error || !data) { setExistingFailed(true); return; }
      setExistingFailed(false);

      /*
       * Cast because the select list is a constant rather than a literal, so
       * supabase-js cannot infer the row shape. Keeping the columns in one
       * exported constant is worth more than the inference: it is what stops
       * this query and the matcher drifting apart again.
       */
      setExisting((data as unknown as Record<string, unknown>[]).map((b) => ({
        id: String(b.id),
        name: String(b.name ?? ''),
        nameKey: normalizeName(b.name as string),
        // `businesses` has no city column; location is the free-text place.
        cityKey: normalizePlace(b.location as string),
        phone: normalizePhone(b.phone as string),
        domain: normalizeDomain(b.website as string),
        /*
         * An owner has claimed it. Their own edits must never be overwritten
         * by a spreadsheet, so these are reported and left alone.
         */
        ownedByUser: Boolean(b.user_id) || b.claim_status === 'claimed',
        claimStatus: (b.claim_status as string) ?? null,
        /*
         * The jsonb and array columns, raw. The matcher only ever FILLS these
         * when empty, so it needs to see what is there — passing them through
         * `fields` would diff them as text and propose an update on every
         * re-import.
         */
        json: {
          social_links: b.social_links,
          core_values: b.core_values,
          why_us: b.why_us,
          languages: b.languages,
          payment_methods: b.payment_methods,
          faqs: b.faqs,
          secondary_categories: b.secondary_categories,
        },
        fields: {
          description: (b.description as string) ?? null,
          category: (b.category as string) ?? null,
          address: (b.address as string) ?? null,
          location: (b.location as string) ?? null,
          phone: normalizePhone(b.phone as string),
          whatsapp: normalizePhone(b.whatsapp as string),
          email: (b.email as string) ?? null,
          website: (b.website as string) ?? null,
          logo_url: (b.logo_url as string) ?? null,
          // The businesses column is image_url; cover_image_url is the
          // import field name. See BUSINESS_COLUMN.
          image_url: (b.image_url as string) ?? null,
          opening_hours: ((b.opening_hours as string) ?? (b.hours as string)) ?? null,
          // The scalar half of the profile. Present here so an import can
          // fill a missing tagline or founding year on a business that is
          // already listed — the enrichment case, which is most of them.
          tagline: (b.tagline as string) ?? null,
          about: (b.about as string) ?? null,
          story: (b.story as string) ?? null,
          mission: (b.mission as string) ?? null,
          vision: (b.vision as string) ?? null,
          subcategory: (b.subcategory as string) ?? null,
          business_type: (b.business_type as string) ?? null,
          employees: (b.employees as string) ?? null,
          service_area: (b.service_area as string) ?? null,
          timezone: (b.timezone as string) ?? null,
          founded_year: b.founded_year == null ? null : String(b.founded_year),
        },
      })));
    })().catch(() => { setExistingFailed(true); });
  }, []);

  const onFile = useCallback(async (file: File) => {
    /*
     * Say WHICH problem it is.
     *
     * A spreadsheet dropped here used to produce "That file has no rows we can
     * read", which blames the file's contents for a format the importer simply
     * does not parse — so an admin re-exports the same xlsx, gets the same
     * message, and concludes the importer is broken.
     *
     * XLSX is a ZIP of XML, so reading it needs an inflate implementation this
     * project does not carry (11 dependencies total, deliberately). Until that
     * is a decision somebody has made, the honest answer is to name the
     * format and give the one-step fix.
     */
    const looksBinary = /\.(xlsx|xls|xlsm|ods|numbers)$/i.test(file.name);
    if (looksBinary) {
      toast.error(
        `${file.name.split('.').pop()!.toUpperCase()} files are not supported yet. ` +
        'In Excel or Sheets choose File → Save as / Download → CSV, then upload that.',
        { duration: 8000 },
      );
      return;
    }

    const text = await file.text();
    const { headers: h, rows } = parseCsv(text);

    if (!h.length || !rows.length) {
      /*
       * Distinguish "no rows" from "not a CSV". A file whose first bytes are
       * PK is a zip — usually an xlsx renamed rather than exported —
       * and saying so is more use than reporting an empty parse.
       */
      const zipMagic = text.slice(0, 2) === 'PK';
      toast.error(
        zipMagic
          ? 'That looks like a spreadsheet renamed to .csv, not a CSV. Export it as CSV from Excel or Sheets.'
          : 'That file has no rows we can read. Check it has a header row and at least one data row.',
        { duration: 8000 },
      );
      return;
    }
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

  /*
   * Rows that are a business NowOpen already has.
   *
   * Computed after internal duplicates, and reported separately: "twice in
   * this file" and "already in the directory" need different answers, and
   * collapsing them into one "duplicates" number tells an admin nothing about
   * which action to take.
   */
  const dbMatches = useMemo(
    () => matchExisting(
      validated.filter((r) => !internalDupes.has(r.lineNo)).map((r) => ({
        lineNo: r.lineNo, normalized: r.normalized, mapped: r.mapped,
      })),
      existing,
    ),
    [validated, internalDupes, existing],
  );
  const matchStats = useMemo(() => summariseMatches(dbMatches), [dbMatches]);

  /*
   * Rows that would genuinely create something new.
   *
   * A matched row is not a new business, whatever its validation status — so
   * it is excluded here even when it is otherwise perfectly valid.
   */
  const newRowCount = useMemo(
    () => validated.filter(
      (r) => (r.status === 'valid' || r.status === 'review')
        && !internalDupes.has(r.lineNo)
        && !dbMatches.has(r.lineNo),
    ).length,
    [validated, internalDupes, dbMatches],
  );
  const summary = useMemo(() => summarise(validated, internalDupes.size), [validated, internalDupes]);
  const missing = useMemo(() => missingRequired(mapping, dataset), [mapping, dataset]);

  /**
   * Apply the proposed updates.
   *
   * Only rows the matcher marked `update` — never `review` (matched on name
   * and city alone, which two different businesses can share) and never
   * `leave_alone` (its owner has claimed it, or nothing in the file is new).
   *
   * One statement per business rather than an upsert: an upsert needs the full
   * row and would write NULL over every column the file does not carry, which
   * is how an enriching import becomes a destructive one.
   */
  const applyUpdates = async () => {
    const toApply = [...dbMatches.values()].filter((m) => m.action === 'update');
    if (!toApply.length) return;

    setUpdating(true);
    let done = 0;
    let failed = 0;

    for (const match of toApply) {
      const patch = updatePatch(match);
      if (!Object.keys(patch).length) continue;
      const { error } = await supabase.from('businesses').update(patch).eq('id', match.businessId);
      // `error`, not a catch: supabase-js resolves with { error } on failure,
      // so a try/catch here would report success on every failed write.
      if (error) failed += 1; else done += 1;
    }

    setUpdating(false);
    setUpdated(done);
    if (failed) toast.error(`${done} updated, ${failed} could not be saved.`);
    else toast.success(`${done} existing ${done === 1 ? 'business' : 'businesses'} updated.`);
  };

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

  /**
   * Hand the admin a correct file to start from.
   *
   * `import_batches.column_mapping` exists because the first guess at a
   * spreadsheet's headers is expected to be wrong. A template removes the
   * guess entirely for anyone starting from scratch, which is the cheapest
   * fix for the most expensive failure this screen has: a shifted column
   * creating thousands of wrong businesses in a minute.
   */
  const downloadTemplate = () => {
    const blob = new Blob([importTemplateCsv(dataset)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = importTemplateFilename(dataset);
    a.click();
    URL.revokeObjectURL(url);
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

          {/* Starting from a correct file beats correcting a wrong one. The
              template's headers are generated from the same field definitions
              autoMap reads, so the two cannot drift apart. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-400 hover:underline"
            >
              <Download size={13} /> Download the {dataset} template
            </button>
            {/* Said here rather than discovered at upload: an XLSX dropped on
                this control is refused, and an admin should know before they
                spend time exporting one. */}
            <span className="text-gray-500 dark:text-gray-400">
              CSV only — in Excel or Sheets use File → Save as → CSV.
            </span>
          </div>
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

            {/*
              * Already on NowOpen.
              *
              * Reported separately from "repeats in file": those two need
              * different actions, and a single "duplicates" count tells an
              * admin nothing about which to take. Before this existed, a
              * re-uploaded export simply created every business again.
              */}
            {/* If the comparison could not run, say so. An admin who is shown
                a create count for rows that are duplicates has no way to know
                the check was skipped. */}
            {existingFailed && (
              <div className="mb-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4" role="alert">
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  Could not check this file against what NowOpen already has
                </p>
                <p className="mt-1 text-[12px] text-gray-700 dark:text-gray-300">
                  Every row below is counted as new, which may not be true. Importing now
                  could create businesses that already exist. Reload and try again before approving.
                </p>
              </div>
            )}

            {matchStats.matched > 0 && (
              <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/15 p-4">
                <p className="text-sm font-bold text-gray-900 dark:text-white">
                  {matchStats.matched.toLocaleString()} of these {matchStats.matched === 1 ? 'is' : 'are'} already on NowOpen
                </p>
                <ul className="mt-2 space-y-1 text-[12px] text-gray-700 dark:text-gray-300">
                  {matchStats.toUpdate > 0 && (
                    <li><strong>{matchStats.toUpdate}</strong> can be updated with new details from this file.</li>
                  )}
                  {matchStats.toReview > 0 && (
                    <li>
                      <strong>{matchStats.toReview}</strong> matched on name and city only — two different
                      businesses can share those, so these are left for a person to confirm.
                    </li>
                  )}
                  {matchStats.ownerClaimed > 0 && (
                    <li>
                      <strong>{matchStats.ownerClaimed}</strong> {matchStats.ownerClaimed === 1 ? 'has' : 'have'} been
                      claimed by the owner. An import never overwrites what an owner wrote.
                    </li>
                  )}
                  {matchStats.unchanged > 0 && (
                    <li><strong>{matchStats.unchanged}</strong> already {matchStats.unchanged === 1 ? 'has' : 'have'} the same details — nothing new.</li>
                  )}
                </ul>

                {/* What would actually change, so nothing is approved blind. */}
                {matchStats.toUpdate > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[12px] font-semibold text-blue-700 dark:text-blue-300">
                      See what would change
                    </summary>
                    <div className="mt-2 space-y-2 max-h-56 overflow-y-auto">
                      {[...dbMatches.values()].filter((m) => m.action === 'update').slice(0, 25).map((m) => (
                        <div key={m.businessId} className="rounded-lg bg-white dark:bg-gray-800 p-2.5 border border-gray-200 dark:border-gray-700">
                          <p className="text-[12px] font-semibold text-gray-900 dark:text-white">
                            {m.businessName} <span className="font-normal text-gray-500">· line {m.lineNo}</span>
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {m.changes.slice(0, 5).map((c) => (
                              <li key={c.field} className="text-[11px] text-gray-600 dark:text-gray-400">
                                <span className="font-medium">{c.field.replace(/_/g, ' ')}</span>:{' '}
                                <span className="line-through text-gray-400">{c.from || '(blank)'}</span>{' → '}
                                <span className="text-green-700 dark:text-green-400">{c.to.slice(0, 60)}</span>
                              </li>
                            ))}
                            {m.changes.length > 5 && (
                              <li className="text-[11px] text-gray-500">and {m.changes.length - 5} more fields</li>
                            )}
                          </ul>
                        </div>
                      ))}
                      {matchStats.toUpdate > 25 && (
                        <p className="text-[11px] text-gray-500">and {matchStats.toUpdate - 25} more businesses</p>
                      )}
                    </div>
                  </details>
                )}

                {matchStats.toUpdate > 0 && (
                  <button
                    onClick={applyUpdates}
                    disabled={updating || updated !== null}
                    className="mt-3 inline-flex items-center gap-2 px-4 min-h-[44px] rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-40"
                  >
                    {updating ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {updated !== null
                      ? `${updated} updated`
                      : `Update ${matchStats.toUpdate} existing instead of creating`}
                  </button>
                )}
              </div>
            )}

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
                disabled={busy || missing.length > 0 || newRowCount === 0 || dataset !== 'businesses'}
                className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold disabled:opacity-40"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {/* The count EXCLUDES rows already on NowOpen. Offering to
                    import every valid row is precisely how the duplicates got
                    made — the button used to promise the thing to avoid. */}
                Import {newRowCount.toLocaleString()} new {newRowCount === 1 ? 'business' : 'businesses'}
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
