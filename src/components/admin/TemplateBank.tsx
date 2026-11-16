import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, PackageOpen, RefreshCw, Upload, XCircle } from 'lucide-react';

import TemplateSurface from '../studio/TemplateSurface';
import type { DesignTemplate } from '../../lib/designTemplates';
import { applyStyle, styleColours, styleOf } from '../../lib/design/styles';
import { ensureTypefacesReady } from '../../lib/design/typefaces';
import { INDUSTRY_GROUPS } from '../../lib/design/taxonomy';
import {
  DIVISIONS, MIN_QUALITY_SCORE, QUALITY_CRITERIA, importable, readPackageZip, validatePackage,
  type BankSample, type PackageReport, type QualityCriterion,
} from '../../lib/templateBank/package';
import { auditFit, type FitIssue, type Measure } from '../../lib/templateBank/fit';
import {
  importCollection, listCollections, listTemplates, publishCollection, reviewTemplate, sha256Hex,
  unpublishTemplate, usableDefinition, type CollectionRow, type ReviewStatus, type TemplateRow,
} from '../../lib/templateBank/store';

/**
 * The Template Bank: where a package becomes part of the live library.
 *
 * Upload -> validate -> import -> review -> publish, in that order, and each
 * step is a separate decision. Importing only stores templates as pending.
 * Nothing reaches a customer until a reviewer has scored it at the gate or
 * above and the collection has been published; the database enforces that, so
 * this screen cannot skip it.
 *
 * A score that arrives inside a package is shown as the author's claim. It is
 * never used as the review.
 */

const CRITERIA = Object.entries(QUALITY_CRITERIA) as [QualityCriterion, number][];

const CRITERION_LABELS: Record<QualityCriterion, string> = {
  originality: 'Originality',
  artDirection: 'Art direction',
  typography: 'Typography',
  composition: 'Composition',
  imagery: 'Imagery',
  colour: 'Colour',
  brandAdaptability: 'Brand adaptability',
  commercialEffectiveness: 'Commercial effectiveness',
  technicalExecution: 'Technical execution',
};

const STATUS_TONE: Record<ReviewStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  rejected: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

const CARD = 208;

function measureWithCanvas(): Measure | null {
  const ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!ctx || typeof ctx.measureText !== 'function') return null;
  return (text, font, spacing) => {
    ctx.font = font;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
    return ctx.measureText(text).width;
  };
}

function Preview({ definition, sample, styleKey, accent, width, height }: {
  definition: DesignTemplate; sample: BankSample; styleKey: string; accent: string; width: number; height: number;
}) {
  const style = styleOf(styleKey);
  const styled = useMemo(() => applyStyle(definition, style), [definition, style]);
  const tone = styleColours(style, accent, styled.scheme);
  const scale = CARD / Math.max(width, height);
  return (
    <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-900" style={{ width: CARD, height: CARD }}>
      <div className="overflow-hidden" style={{ width: width * scale, height: height * scale }}>
        <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <TemplateSurface
            template={styled}
            content={{ logoUrl: null, qrUrl: null, ...sample }}
            width={width}
            height={height}
            accent={tone.accent}
            base={tone.base}
          />
        </div>
      </div>
    </div>
  );
}

interface Staged {
  fileName: string;
  bytes: Uint8Array;
  report: PackageReport;
  fit: Record<string, FitIssue[]>;
}

export default function TemplateBank() {
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staged, setStaged] = useState<Staged | null>(null);
  const [busy, setBusy] = useState(false);
  const [division, setDivision] = useState('');
  const [industry, setIndustry] = useState('');
  const [status, setStatus] = useState<ReviewStatus | ''>('');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, t] = await Promise.all([listCollections(), listTemplates()]);
      setCollections(c);
      setRows(t);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not read the Template Bank.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); void ensureTypefacesReady(); }, [load]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const report = validatePackage(readPackageZip(bytes), rows.map((r) => ({ key: r.key, version: r.version })));
      await ensureTypefacesReady();
      const measure = measureWithCanvas();
      const fit: Record<string, FitIssue[]> = {};
      if (measure) {
        for (const t of importable(report)) {
          const styled = applyStyle(t.definition, styleOf(t.recommendedStyle));
          const issues = auditFit(styled, t.sample, t.dimensions.width, t.dimensions.height, measure);
          if (issues.length) fit[t.key] = issues;
        }
      }
      setStaged({ fileName: file.name, bytes, report, fit });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That file could not be read as a ZIP.');
      setStaged(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const runImport = async () => {
    if (!staged?.report.manifest) return;
    const templates = importable(staged.report);
    setBusy(true);
    try {
      const checksum = await sha256Hex(staged.bytes);
      await importCollection(staged.report.manifest.name, staged.report.manifest.version, checksum, templates);
      toast.success(`${templates.length} template${templates.length === 1 ? '' : 's'} imported as pending.`);
      setStaged(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? `Nothing was imported. ${err.message}` : 'Nothing was imported.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const shown = rows.filter((r) =>
    (!division || r.division === division)
    && (!status || r.review_status === status)
    && (!industry || !r.meta.industries?.length || r.meta.industries.includes(industry)));

  const willImport = staged ? importable(staged.report) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="max-w-2xl">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Template Bank</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Upload a template package, check it, import it, then review each template. A template goes
            live only after a reviewer scores it {MIN_QUALITY_SCORE} or more and its collection is published.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => void load()} disabled={busy} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-600">
            <RefreshCw size={15} /> Refresh
          </button>
          <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg bg-pink-600 px-3 text-sm font-semibold text-white hover:bg-pink-700">
            <Upload size={15} /> Upload package
            <input ref={input} type="file" accept=".zip,application/zip" className="sr-only" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {staged && (
        <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700" aria-label="Package check">
          <div className="flex flex-wrap items-center gap-3">
            <PackageOpen size={18} className="text-gray-500" />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {staged.report.manifest ? `${staged.report.manifest.name} ${staged.report.manifest.version}` : staged.fileName}
              </p>
              <p className="text-xs text-gray-500">
                {staged.report.counts.new} new · {staged.report.counts.update} updates · {staged.report.counts.duplicate} already in the bank · {staged.report.counts.rejected} rejected
              </p>
            </div>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setStaged(null)} disabled={busy} className="min-h-[40px] rounded-lg border border-gray-300 px-3 text-sm dark:border-gray-600">Discard</button>
              <button
                onClick={() => void runImport()}
                disabled={busy || !staged.report.ok || !willImport.length}
                className="min-h-[40px] rounded-lg bg-gray-900 px-3 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-900"
              >
                Import {willImport.length} as pending
              </button>
            </div>
          </div>

          {staged.report.errors.map((e) => (
            <p key={e} className="mt-3 flex gap-2 text-sm text-red-700 dark:text-red-300"><XCircle size={16} className="mt-0.5 shrink-0" /> {e}</p>
          ))}
          {staged.report.warnings.map((w) => (
            <p key={w} className="mt-2 flex gap-2 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {w}</p>
          ))}

          {staged.report.templates.some((t) => t.verdict === 'rejected') && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Rejected — these will not be imported</p>
              <ul className="mt-1 space-y-1 text-sm text-gray-700 dark:text-gray-300">
                {staged.report.templates.filter((t) => t.verdict === 'rejected').map((t) => (
                  <li key={t.source}><span className="font-mono text-xs">{t.key}</span> — {t.errors.join('; ')}</li>
                ))}
              </ul>
            </div>
          )}

          {willImport.length > 0 && (
            <ul className="mt-4 grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CARD}px, 1fr))` }}>
              {willImport.map((t) => (
                <li key={t.key} style={{ width: CARD }}>
                  <Preview definition={t.definition} sample={t.sample} styleKey={t.recommendedStyle} accent={t.previewAccent} width={t.dimensions.width} height={t.dimensions.height} />
                  <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.id} · v{t.version} · {t.category}</p>
                  {t.quality && <p className="text-xs text-gray-500">Claimed score {t.quality.total} — provisional</p>}
                  {staged.fit[t.key]?.map((issue) => (
                    <p key={issue.detail} className="mt-1 flex gap-1 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> Sample copy: {issue.detail}</p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {loadError && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
          The Template Bank tables could not be read ({loadError}). If the migration has not been applied
          to this project yet, apply <span className="font-mono text-xs">20261116000000_template_bank.sql</span> first.
        </p>
      )}

      {!loadError && (
        <section aria-label="Bank contents">
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Division" value={division} onChange={(e) => setDivision(e.target.value)} className="min-h-[40px] rounded-lg border border-gray-300 bg-transparent px-2 text-sm dark:border-gray-600">
              <option value="">All divisions</option>
              {DIVISIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <select aria-label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} className="min-h-[40px] rounded-lg border border-gray-300 bg-transparent px-2 text-sm dark:border-gray-600">
              <option value="">All industries</option>
              {INDUSTRY_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select aria-label="Review status" value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus | '')} className="min-h-[40px] rounded-lg border border-gray-300 bg-transparent px-2 text-sm dark:border-gray-600">
              <option value="">Any status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <span className="text-sm text-gray-500">{shown.length} of {rows.length} templates · {rows.filter((r) => r.published).length} live</span>
          </div>

          {loading && <p className="mt-4 text-sm text-gray-500">Loading…</p>}
          {!loading && !rows.length && <p className="mt-4 text-sm text-gray-500">The bank is empty. Upload a package to begin.</p>}

          {collections.map((c) => {
            const mine = shown.filter((r) => r.collection_id === c.id);
            if (!mine.length) return null;
            const ready = rows.filter((r) => r.collection_id === c.id && r.review_status === 'approved' && !r.published).length;
            return (
              <div key={c.id} className="mt-6">
                <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 pb-2 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.name} {c.version}</p>
                  <p className="text-xs text-gray-500">imported {new Date(c.imported_at).toLocaleDateString('en-NG')} · {c.template_count} templates</p>
                  <button
                    onClick={() => void act(() => publishCollection(c.id), 'Approved templates are now live.')}
                    disabled={busy || !ready}
                    className="ml-auto min-h-[36px] rounded-lg bg-green-700 px-3 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    Publish {ready} approved
                  </button>
                </div>
                <ul className="mt-3 grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CARD}px, 1fr))` }}>
                  {mine.map((row) => (
                    <TemplateCard
                      key={row.id}
                      row={row}
                      busy={busy}
                      open={reviewing === row.id}
                      onToggle={() => setReviewing(reviewing === row.id ? null : row.id)}
                      onReview={(s, score, scores, note) => void act(async () => { await reviewTemplate(row.id, s, score, scores, note); setReviewing(null); }, s === 'approved' ? 'Approved.' : 'Review recorded.')}
                      onUnpublish={() => void act(() => unpublishTemplate(row.id), 'Withdrawn from the live library.')}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function TemplateCard({ row, busy, open, onToggle, onReview, onUnpublish }: {
  row: TemplateRow;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onReview: (status: ReviewStatus, score: number | null, scores: Partial<Record<QualityCriterion, number>> | null, note: string | null) => void;
  onUnpublish: () => void;
}) {
  const definition = useMemo(() => usableDefinition(row.definition), [row.definition]);
  const [scores, setScores] = useState<Partial<Record<QualityCriterion, number>>>(row.review_scores ?? {});
  const [note, setNote] = useState(row.review_note ?? '');
  const complete = CRITERIA.every(([name]) => typeof scores[name] === 'number');
  const total = CRITERIA.reduce((sum, [name]) => sum + (scores[name] ?? 0), 0);
  const dim = row.meta.dimensions ?? { width: 1080, height: 1080 };

  return (
    <li style={{ width: CARD }}>
      {definition ? (
        <Preview
          definition={definition}
          sample={row.meta.sample ?? { headline: row.meta.name ?? row.key }}
          styleKey={row.meta.recommendedStyle ?? 'signature'}
          accent={row.meta.previewAccent ?? '#2563eb'}
          width={dim.width}
          height={dim.height}
        />
      ) : (
        <div className="flex items-center justify-center bg-red-50 p-3 text-center text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200" style={{ width: CARD, height: CARD }}>
          This definition no longer passes validation and will not be shown to customers.
        </div>
      )}
      <p className="mt-1.5 text-sm font-semibold text-gray-900 dark:text-white">{row.meta.name ?? row.key}</p>
      <p className="text-xs text-gray-500">{row.template_id} · v{row.version} · {row.category}</p>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_TONE[row.review_status]}`}>{row.review_status}</span>
        {row.review_score !== null && <span className="text-gray-600 dark:text-gray-300">{row.review_score}/100</span>}
        {row.published && <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300"><CheckCircle2 size={13} /> live</span>}
      </p>
      {row.meta.quality && <p className="text-xs text-gray-500">Package claimed {row.meta.quality.total} — provisional</p>}

      <div className="mt-2 flex gap-2">
        <button onClick={onToggle} className="min-h-[36px] rounded-lg border border-gray-300 px-2.5 text-xs font-semibold dark:border-gray-600">
          {open ? 'Close' : 'Review'}
        </button>
        {row.published && (
          <button onClick={onUnpublish} disabled={busy} className="min-h-[36px] rounded-lg border border-gray-300 px-2.5 text-xs font-semibold dark:border-gray-600">Unpublish</button>
        )}
      </div>

      {open && (
        <form
          className="mt-2 space-y-1.5 rounded-lg border border-gray-200 p-2 dark:border-gray-700"
          onSubmit={(e) => { e.preventDefault(); onReview('approved', total, scores, note || null); }}
        >
          {CRITERIA.map(([name, max]) => (
            <label key={name} className="flex items-center justify-between gap-2 text-xs text-gray-700 dark:text-gray-300">
              <span>{CRITERION_LABELS[name]} <span className="text-gray-400">/{max}</span></span>
              <input
                type="number" min={0} max={max} step={1} inputMode="numeric"
                value={scores[name] ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? undefined : Math.max(0, Math.min(max, Math.round(Number(e.target.value))));
                  setScores((s) => ({ ...s, [name]: v }));
                }}
                className="w-14 rounded border border-gray-300 bg-transparent px-1 py-1 text-right dark:border-gray-600"
              />
            </label>
          ))}
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Total {complete ? total : '—'} / 100</p>
          <textarea
            aria-label="Review note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note (optional)"
            className="w-full rounded border border-gray-300 bg-transparent p-1 text-xs dark:border-gray-600"
          />
          {complete && total < MIN_QUALITY_SCORE && (
            <p className="text-xs text-amber-700 dark:text-amber-300">Below {MIN_QUALITY_SCORE}: this can be recorded as a rejection, not an approval.</p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !complete || total < MIN_QUALITY_SCORE} className="min-h-[36px] flex-1 rounded-lg bg-green-700 px-2 text-xs font-semibold text-white disabled:opacity-40">Approve</button>
            <button type="button" disabled={busy} onClick={() => onReview('rejected', complete ? total : null, complete ? scores : null, note || null)} className="min-h-[36px] flex-1 rounded-lg border border-gray-300 px-2 text-xs font-semibold dark:border-gray-600">Reject</button>
          </div>
        </form>
      )}
    </li>
  );
}
