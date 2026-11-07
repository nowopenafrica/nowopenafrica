import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Pencil, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { supabase } from '../../lib/supabase';
import { formatMinor, minorPerMajor, BASIS_NOTE } from '../../lib/create/money';
import {
  chargeableWarning, draftFrom, turnsChargeable, validate,
  type Draft, type EditableService, type PriceBasis, type PublicationStatus,
} from '../../lib/create/adminCatalogue';
import ConfirmDialog from '../ConfirmDialog';

/**
 * The service catalogue, editable.
 *
 * ── WHY THIS SCREEN EXISTS ───────────────────────────────────────────────
 *
 * The Create Media prices lived in a TypeScript constant, so moving one
 * needed an engineer, a build and a deploy. In practice that means prices do
 * not get corrected — they get worked around. This is the screen that makes
 * the database catalogue worth having.
 *
 * ── THE PART THAT IS NOT LIKE A CMS ──────────────────────────────────────
 *
 * One field here is different from all the others. `price_basis` is what
 * turns a working guess into a number NowOpen will be held to: set it to
 * "Quoted" on a published service with a price, and `is_orderable` becomes
 * true and a customer can pay it. So that save is confirmed, by name and by
 * amount, every time it would newly make something chargeable.
 *
 * The rule is in lib/create/adminCatalogue.ts, mirroring the generated
 * column, with a test that reads the migration and fails if the two drift —
 * a warning that fires on the wrong edits is one people learn to dismiss.
 */

interface Category { id: string; slug: string; name: string; sort_order: number }

const COLUMNS =
  'sku, name, short_description, price_minor, currency, price_unit, price_basis,'
  + ' pricing_model, quote_required, publication_status, turnaround_min_days,'
  + ' turnaround_max_days, revisions_included, is_orderable, category_id, sort_order';

const BASIS_LABEL: Record<PriceBasis, string> = {
  proposed: 'Proposed',
  indicative: 'Benchmarked',
  quoted: 'Quoted',
};

const BASIS_TONE: Record<PriceBasis, string> = {
  proposed: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  indicative: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  quoted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

type Row = EditableService & { category_id: string; sort_order: number };

export default function ServiceCatalogue() {
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ sku: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setProblem(null);
    /*
     * supabase-js RESOLVES with { data, error }; it does not reject. A
     * `.catch()` here would never fire and a failed read would render as an
     * empty catalogue — a screen saying there is nothing to price.
     */
    const [services, cats] = await Promise.all([
      supabase.from('services').select(COLUMNS).order('sort_order').range(0, 999),
      supabase.from('service_categories').select('id, slug, name, sort_order').order('sort_order'),
    ]);
    if (services.error) { setProblem(services.error.message); setLoading(false); return; }
    if (cats.error) { setProblem(cats.error.message); setLoading(false); return; }
    setRows((services.data ?? []) as unknown as Row[]);
    setCategories((cats.data ?? []) as unknown as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (category !== 'all' && row.category_id !== category) return false;
      if (!needle) return true;
      return row.name.toLowerCase().includes(needle) || row.sku.toLowerCase().includes(needle);
    });
  }, [rows, query, category]);

  const orderable = rows.filter((r) => r.is_orderable).length;

  const save = async (sku: string, confirmed: boolean) => {
    if (!draft) return;
    const before = rows.find((r) => r.sku === sku);
    if (!before) return;

    const checked = validate(draft, minorPerMajor(before.currency));
    if (!checked.ok) { toast.error(checked.reason); return; }

    if (!confirmed && turnsChargeable(before, checked.patch)) {
      setConfirm({
        sku,
        message: chargeableWarning(
          checked.patch.name,
          formatMinor(checked.patch.price_minor ?? 0, before.currency),
        ),
      });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('services').update(checked.patch).eq('sku', sku);
    setSaving(false);
    if (error) { toast.error(`Could not save: ${error.message}`); return; }

    setEditing(null);
    setDraft(null);
    setConfirm(null);
    toast.success(`${checked.patch.name} saved.`);
    void load();
  };

  const begin = (row: Row) => {
    setEditing(row.sku);
    setDraft(draftFrom(row, minorPerMajor(row.currency)));
  };

  const field = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-2 text-sm';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Service catalogue</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            {/*
              * Said here rather than in a comment, because it is the single
              * fact somebody opening this screen needs: a price on the site
              * is not a price anyone can pay until it is marked Quoted.
              */}
            {rows.length} services. <strong>{orderable} can be paid for.</strong> A price only
            becomes chargeable when its basis is <em>Quoted</em> — everything else is browsable
            and routes to a conversation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or SKU"
              aria-label="Search the catalogue"
              className={`${field} pl-8 w-56`}
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className={`${field} w-48`}
          >
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </header>

      {problem && (
        <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {/* An empty table and a failed request look identical otherwise. */}
          <span>The catalogue could not be read: {problem}</span>
        </p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 p-6 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the catalogue…
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-gray-200 p-6 text-sm text-gray-500 dark:border-gray-700">
          {rows.length === 0
            ? 'The catalogue table is empty. Run the seed migration.'
            : 'Nothing matches that search.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {visible.map((row) => {
            const open = editing === row.sku;
            return (
              <li key={row.sku} className="bg-white p-3 dark:bg-gray-900">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{row.name}</p>
                    <p className="truncate text-xs text-gray-500">{row.sku}</p>
                  </div>

                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${BASIS_TONE[row.price_basis]}`}>
                    {BASIS_LABEL[row.price_basis]}
                  </span>

                  {row.is_orderable ? (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      <Check className="h-3 w-3" /> Payable
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      Enquiry only
                    </span>
                  )}

                  <span className="w-28 text-right text-sm font-bold text-gray-900 dark:text-white">
                    {row.price_minor === null ? 'Quoted' : formatMinor(row.price_minor, row.currency)}
                  </span>

                  <button
                    onClick={() => (open ? (setEditing(null), setDraft(null)) : begin(row))}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {open ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    {open ? 'Cancel' : 'Edit'}
                  </button>
                </div>

                {open && draft && (
                  <div className="mt-3 grid gap-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="sm:col-span-2">
                      <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">Name</span>
                      <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={field} />
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">
                        Price ({row.currency})
                      </span>
                      <input
                        value={draft.price}
                        onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                        placeholder="7500"
                        inputMode="decimal"
                        className={field}
                      />
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">Unit</span>
                      <input
                        value={draft.price_unit}
                        onChange={(e) => setDraft({ ...draft, price_unit: e.target.value })}
                        placeholder="per screen"
                        className={field}
                      />
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">Price basis</span>
                      <select
                        value={draft.price_basis}
                        onChange={(e) => setDraft({ ...draft, price_basis: e.target.value as PriceBasis })}
                        className={field}
                      >
                        <option value="proposed">Proposed — a guide price</option>
                        <option value="indicative">Benchmarked — from a published rate</option>
                        <option value="quoted">Quoted — a real, payable price</option>
                      </select>
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">Status</span>
                      <select
                        value={draft.publication_status}
                        onChange={(e) => setDraft({ ...draft, publication_status: e.target.value as PublicationStatus })}
                        className={field}
                      >
                        <option value="draft">Draft — hidden from the public</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>

                    <label className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        checked={draft.quote_required}
                        onChange={(e) => setDraft({ ...draft, quote_required: e.target.checked })}
                        className="h-4 w-4"
                      />
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                        Scope must be quoted
                      </span>
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">Fastest (days)</span>
                      <input value={draft.turnaround_min} onChange={(e) => setDraft({ ...draft, turnaround_min: e.target.value })} inputMode="numeric" className={field} />
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">Slowest (days)</span>
                      <input value={draft.turnaround_max} onChange={(e) => setDraft({ ...draft, turnaround_max: e.target.value })} inputMode="numeric" className={field} />
                    </label>

                    <label>
                      <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">Revisions</span>
                      <input value={draft.revisions} onChange={(e) => setDraft({ ...draft, revisions: e.target.value })} inputMode="numeric" className={field} />
                    </label>

                    <label className="sm:col-span-2 lg:col-span-4">
                      <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">What it is</span>
                      <input
                        value={draft.short_description}
                        onChange={(e) => setDraft({ ...draft, short_description: e.target.value })}
                        placeholder="One line a customer reads before deciding."
                        className={field}
                      />
                    </label>

                    <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="max-w-xl text-xs text-gray-500 dark:text-gray-400">
                        {BASIS_NOTE[draft.price_basis]}
                      </p>
                      <button
                        onClick={() => void save(row.sku, false)}
                        disabled={saving}
                        className="flex min-h-[40px] items-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirm}
        title="This makes the service payable"
        message={confirm?.message ?? ''}
        confirmLabel="Yes, it is quoted"
        onConfirm={() => { if (confirm) void save(confirm.sku, true); }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
