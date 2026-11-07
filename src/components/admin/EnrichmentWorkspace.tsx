import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, Check, Eye, Loader2, RefreshCw, Sparkles, X,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { enrichBusinesses, summariseRun, type RunOutcome } from '../../lib/enrichment/runner';
import { templateFor } from '../../data/categoryTemplates';
import { confirmationLabel } from '../../lib/contentProvenance';

/**
 * Admin → Enrichment workspace.
 *
 * Generate category suggestions for unclaimed profiles, then review them one at
 * a time before anything is shown to anybody.
 *
 * NOTHING HERE CAN PUBLISH BY ACCIDENT. The engine writes rows `suggested` and
 * unpublished, and a database trigger refuses generated content that arrives
 * published at all. The only way a suggestion becomes visible is the Publish
 * button below, which calls a staff-gated function. Approving does NOT change
 * the status, so a published suggestion still reads as a suggestion on the
 * profile — an admin saying "worth showing" is not the business saying "yes, we
 * do that".
 */

interface BusinessRow {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  claim_status: string | null;
  pending: number;
}

interface SuggestionRow {
  id: string;
  business_id: string;
  name: string;
  content_status: string;
  published: boolean;
  source_name: string | null;
  kind: 'service' | 'product';
}

/**
 * How many businesses arrive per page.
 *
 * 50 rather than 25 because the work here is bulk work — an operator picking
 * targets for a category wants to see the category, not a quarter of it — and
 * the row is cheap: six columns and a count, no images.
 */
const PAGE = 50;

/** How many extra businesses each subsequent "Load more" adds. */
const PAGE_MORE = 500;

export default function EnrichmentWorkspace() {
  const [rows, setRows] = useState<BusinessRow[]>([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** How many exist in total behind the filter, so "load more" is not a guess. */
  const [total, setTotal] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<RunOutcome[] | null>(null);
  const [reviewing, setReviewing] = useState<BusinessRow | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  /**
   * `offset` 0 replaces the list; anything else appends to it.
   *
   * One function for both so the filters, the visibility rules and the pending
   * counts cannot drift between the first page and the rest — which is the
   * usual way a "load more" starts returning subtly different rows.
   */
  const load = useCallback(async (offset = 0, size = PAGE) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    /*
     * Unclaimed only. A claimed business writes its own content, and the engine
     * refuses them anyway — listing them here would only invite a click that
     * does nothing.
     */
    let q = supabase
      .from('businesses')
      .select('id,name,category,location,claim_status', { count: 'exact' })
      .eq('is_listable', true)
      // A profile still awaiting its own review is not worth enriching yet —
      // and the codebase rule is that `is_listable` never travels alone.
      .eq('profile_state', 'published')
      .eq('claim_status', 'unclaimed')
      /*
       * A stable tiebreaker after the score. Without `id`, two businesses on
       * the same listing_score can swap places between pages, so one is shown
       * twice and another never appears — the classic offset-paging fault.
       */
      .order('listing_score', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + size - 1);
    if (category !== 'all') q = q.eq('category', category);

    const { data, error: e, count } = await q;
    if (e) {
      setError(e.message);
      if (offset === 0) setRows([]);
      setLoading(false); setLoadingMore(false);
      return;
    }
    if (typeof count === 'number') setTotal(count);

    const list = ((data as Omit<BusinessRow, 'pending'>[] | null) ?? []);
    // How many unreviewed suggestions each already has, so a second run is
    // visibly unnecessary rather than merely harmless.
    const ids = list.map((b) => b.id);
    const { data: pend } = ids.length
      ? await supabase.from('business_services')
          .select('business_id')
          .in('business_id', ids)
          .eq('content_status', 'suggested')
          .eq('published', false)
      : { data: [] };
    const counts = new Map<string, number>();
    for (const r of ((pend as Array<{ business_id: string }> | null) ?? [])) {
      counts.set(r.business_id, (counts.get(r.business_id) ?? 0) + 1);
    }

    setError(null);
    const page = list.map((b) => ({ ...b, pending: counts.get(b.id) ?? 0 }));
    setRows((prev) => {
      if (offset === 0) return page;
      // Guard against a duplicate slipping in if a row moved between fetches.
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...page.filter((r) => !seen.has(r.id))];
    });
    setLoading(false);
    setLoadingMore(false);
  }, [category]);

  useEffect(() => { setSelected(new Set()); void load(0); }, [load]);

  /*
   * Reload what is ALREADY on screen, rather than snapping back to page one.
   *
   * After generating for a business on the third page, an operator wants the
   * pending counts updated — not to lose their place and scroll back down.
   */
  const refreshLoaded = useCallback(
    (count: number) => load(0, Math.max(PAGE, count)),
    [load],
  );

  const categories = useMemo(() => {
    const set = new Set(rows.map((r) => r.category).filter(Boolean) as string[]);
    return ['all', ...[...set].sort()];
  }, [rows]);

  /**
   * The rows "select all" may actually take.
   *
   * Only those with a category template: a business without one generates
   * nothing, its checkbox is disabled, and including it would make the count on
   * the button a promise the run cannot keep.
   */
  const selectableRows = useMemo(
    () => rows.filter((b) => templateFor(b.category)),
    [rows],
  );
  const allSelected = selectableRows.length > 0
    && selectableRows.every((b) => selected.has(b.id));

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableRows.map((b) => b.id)));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const run = async (targets: BusinessRow[]) => {
    if (!targets.length) return;
    setOutcomes(null);
    setRunning(`0 of ${targets.length}`);
    const results = await enrichBusinesses(
      targets.map((b) => ({ id: b.id, name: b.name, category: b.category, claim_status: b.claim_status })),
      (p) => setRunning(`${p.done} of ${p.total}${p.current ? ` · ${p.current}` : ''}`),
    );
    setRunning(null);
    setOutcomes(results);
    const s = summariseRun(results);
    toast.success(`${s.written} suggestion(s) written for ${s.businesses} business(es) — none published.`);
    setSelected(new Set());
    void refreshLoaded(rows.length);
  };

  const openReview = async (b: BusinessRow) => {
    setReviewing(b);
    setSuggestions([]);
    const [s, p] = await Promise.all([
      supabase.from('business_services').select('id,business_id,name,content_status,published,source_name')
        .eq('business_id', b.id).eq('content_status', 'suggested'),
      supabase.from('business_products').select('id,business_id,name,content_status,published,source_name')
        .eq('business_id', b.id).eq('content_status', 'suggested'),
    ]);
    setSuggestions([
      ...(((s.data as SuggestionRow[] | null) ?? []).map((r) => ({ ...r, kind: 'service' as const }))),
      ...(((p.data as SuggestionRow[] | null) ?? []).map((r) => ({ ...r, kind: 'product' as const }))),
    ]);
  };

  const review = async (action: 'publish' | 'reject', items: SuggestionRow[]) => {
    if (!items.length) return;
    setBusyIds(new Set(items.map((i) => i.id)));
    const fn = action === 'publish' ? 'publish_suggested_content' : 'reject_suggested_content';
    let touched = 0;
    for (const kind of ['service', 'product'] as const) {
      const ids = items.filter((i) => i.kind === kind).map((i) => i.id);
      if (!ids.length) continue;
      const table = kind === 'service' ? 'business_services' : 'business_products';
      // eslint-disable-next-line no-await-in-loop
      const { data, error: e } = await supabase.rpc(fn, { p_table: table, p_ids: ids });
      if (e) { toast.error(e.message); setBusyIds(new Set()); return; }
      touched += typeof data === 'number' ? data : 0;
    }
    setBusyIds(new Set());
    toast.success(action === 'publish'
      ? `${touched} now visible on the profile, labelled as unconfirmed.`
      : `${touched} rejected. They will not be proposed again.`);
    if (reviewing) void openReview(reviewing);
    void refreshLoaded(rows.length);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Enrichment workspace</h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Propose the services and offerings typical of a business's category, then review each one.
            Nothing generated here is visible to anybody until you publish it, and a published
            suggestion still tells the reader it is a suggestion.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
          ))}
        </select>

        <button
          disabled={!selected.size || !!running}
          onClick={() => void run(rows.filter((r) => selected.has(r.id)))}
          className="inline-flex items-center gap-2 rounded-lg bg-nowopen-500 px-4 py-2 text-sm font-semibold text-white hover:bg-nowopen-600 disabled:opacity-40"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {running ? `Generating ${running}` : `Generate for ${selected.size || 0} selected`}
        </button>

        <button
          onClick={toggleAll}
          disabled={!selectableRows.length}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
        >
          {allSelected ? 'Clear selection' : `Select all ${selectableRows.length} with a template`}
        </button>

        <span className="text-[12px] text-gray-500 dark:text-gray-400">
          Unclaimed profiles only — a claimed business writes its own content.
          {selectableRows.length < rows.length && (
            <> {rows.length - selectableRows.length} on this page have no template and cannot be selected.</>
          )}
        </span>
      </div>

      {outcomes && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-[13px] font-semibold text-gray-900 dark:text-white">Last run</p>
          {(() => {
            const s = summariseRun(outcomes);
            return (
              <p className="mt-1 text-[12px] text-gray-600 dark:text-gray-300">
                {s.businesses} business(es) · <strong>{s.written} suggestions written</strong> ·{' '}
                {s.skipped} produced nothing · {s.failed} failed
                {s.blocked > 0 && (
                  <> · <span className="text-amber-700 dark:text-amber-300">{s.blocked} blocked as unsupportable claims</span></>
                )}
              </p>
            );
          })()}
          <ul className="mt-2 max-h-40 overflow-auto divide-y divide-gray-100 dark:divide-gray-700 text-[12px]">
            {outcomes.map((o) => (
              <li key={o.businessId} className="flex flex-wrap gap-x-3 py-1.5">
                <span className="font-semibold text-gray-800 dark:text-gray-100">{o.businessName}</span>
                <span className={o.error ? 'text-rose-600' : 'text-gray-500 dark:text-gray-400'}>
                  {o.error ?? o.summary}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">Loading unclaimed profiles…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          No unclaimed profiles match this filter.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={allSelected ? 'Clear selection' : 'Select every business on this page that has a template'}
                    checked={allSelected}
                    onChange={toggleAll}
                    disabled={selectableRows.length === 0}
                    className="h-4 w-4 rounded border-gray-300 text-nowopen-500 focus:ring-nowopen-500"
                  />
                </th>
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2">Awaiting review</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {rows.map((b) => {
                const template = templateFor(b.category);
                return (
                  <tr key={b.id}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${b.name}`}
                        checked={selected.has(b.id)}
                        onChange={() => toggle(b.id)}
                        disabled={!template}
                        className="h-4 w-4 rounded border-gray-300 text-nowopen-500 focus:ring-nowopen-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-gray-900 dark:text-white">{b.name}</span>
                      {b.location && <span className="ml-2 text-gray-400">{b.location}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{b.category ?? '—'}</td>
                    <td className="px-3 py-2">
                      {template ? (
                        <span className="text-emerald-700 dark:text-emerald-300">{template.industry}</span>
                      ) : (
                        /*
                         * Said plainly rather than hidden. A category with no
                         * vocabulary produces nothing, and an operator should
                         * know that is a gap in the templates, not a failure.
                         */
                        <span className="text-gray-400" title="No vocabulary for this category — nothing would be generated.">
                          none
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-600 dark:text-gray-300">
                      {b.pending || '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          disabled={!template || !!running}
                          onClick={() => void run([b])}
                          className="rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                        >
                          Generate
                        </button>
                        <button
                          disabled={!b.pending}
                          onClick={() => void openReview(b)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                        >
                          <Eye size={12} /> Review
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <span className="text-[12px] text-gray-500 dark:text-gray-400">
            Showing {rows.length}{typeof total === 'number' ? ` of ${total}` : ''}
          </span>
          {typeof total === 'number' && rows.length < total && (
            <button
              onClick={() => void load(rows.length, PAGE_MORE)}
              disabled={loadingMore || !!running}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-[13px] font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              {loadingMore && <Loader2 size={14} className="animate-spin" />}
              {loadingMore ? 'Loading…' : `Load ${Math.min(PAGE_MORE, total - rows.length)} more`}
            </button>
          )}
        </div>
      )}

      {reviewing && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">{reviewing.name}</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {suggestions.length} awaiting review · published items appear on the profile labelled
                “{confirmationLabel({ content_status: 'suggested', published: true })}”
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                disabled={!suggestions.length}
                onClick={() => void review('publish', suggestions)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <Check size={13} /> Publish all
              </button>
              <button
                onClick={() => setReviewing(null)}
                className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-[12px] font-semibold text-gray-600 dark:text-gray-300"
              >
                Close
              </button>
            </div>
          </header>

          {suggestions.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-gray-500 dark:text-gray-400">
              Nothing awaiting review for this business.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {suggestions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-[13px]">
                  <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600 dark:text-gray-300">
                    {s.kind}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">{s.name}</span>
                  {s.published && (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      live
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400">{s.source_name ?? 'category template'}</span>
                  <div className="ml-auto flex gap-1.5">
                    <button
                      disabled={s.published || busyIds.has(s.id)}
                      onClick={() => void review('publish', [s])}
                      className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                      Publish
                    </button>
                    <button
                      disabled={busyIds.has(s.id)}
                      onClick={() => void review('reject', [s])}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-gray-700 disabled:opacity-40"
                    >
                      <X size={11} /> Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
