import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, Tag } from 'lucide-react';
import toast from 'react-hot-toast';

import { supabase } from '../../lib/supabase';
import {
  listAllProducts, formatPrice, parsePriceToMinor, type RevenueProduct,
} from '../../lib/revenue/products';

/**
 * What NowOpen charges, set by the person who owns the decision.
 *
 * Every other price on this platform lives in src/data/pricingPlans.ts and
 * ships in the bundle, so changing one takes an engineer, a build and a
 * deploy. These seven do not work that way, and this is where they are set.
 *
 * ── WHY EVERYTHING STARTS UNPRICED ───────────────────────────────────────
 *
 * The products were created with no price and `active = false`, and the
 * database refuses to activate one without a price:
 *
 *   check (not active or (price_minor is not null and price_minor > 0))
 *
 * Seeding plausible numbers would have been inventing commercial terms —
 * the same class of error as inventing a business's services. So the catalogue
 * is deliberately empty of prices until somebody decides, and this screen says
 * so rather than showing a placeholder.
 */
export default function RevenueProductsTab() {
  const [products, setProducts] = useState<RevenueProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { products: rows, failed: bad } = await listAllProducts();
    setProducts(rows);
    setFailed(bad);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const savePrice = async (p: RevenueProduct) => {
    const typed = drafts[p.id] ?? '';
    const minor = parsePriceToMinor(typed);
    if (minor === null) {
      toast.error('Enter a price, for example 2500.');
      return;
    }
    if (minor === 0) {
      // Zero is a real commercial choice, but it must be a deliberate one —
      // not the result of an empty box or a stray character.
      toast.error('A price of zero would make this free. Deactivate it instead.');
      return;
    }
    setSaving(p.id);
    const { error } = await supabase
      .from('revenue_products')
      .update({ price_minor: minor, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null })
      .eq('id', p.id);
    setSaving(null);
    if (error) { toast.error(`Could not save the price: ${error.message}`); return; }
    toast.success(`${p.name} priced at ${formatPrice(minor, p.currency)}`);
    setDrafts((d) => ({ ...d, [p.id]: '' }));
    void load();
  };

  const toggleActive = async (p: RevenueProduct) => {
    if (!p.active && p.priceMinor === null) {
      // The database would refuse this anyway; saying so here is faster and
      // explains why rather than surfacing a constraint name.
      toast.error('Set a price before putting this on sale.');
      return;
    }
    setSaving(p.id);
    const { error } = await supabase
      .from('revenue_products')
      .update({ active: !p.active })
      .eq('id', p.id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(p.active ? `${p.name} taken off sale` : `${p.name} is now on sale`);
    void load();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-gray-500">
        <Loader2 size={16} className="animate-spin" /> Loading the catalogue…
      </div>
    );
  }

  const unpriced = products.filter((p) => p.priceMinor === null).length;
  const onSale = products.filter((p) => p.active).length;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Products &amp; pricing</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          What businesses can buy. A product cannot go on sale until it has a price — the database
          enforces that, not just this screen.
        </p>
      </header>

      {failed && (
        /* A failed read and an empty catalogue look identical unless somebody
           says which happened. */
        <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          The catalogue could not be loaded, so this list may be incomplete.
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-gray-700 dark:text-gray-300">
          {onSale} on sale
        </span>
        {unpriced > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 px-3 py-1 font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle size={13} /> {unpriced} not priced yet — nothing can be sold until they are
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Runs for</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Set a new price</th>
              <th className="px-4 py-3">On sale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {products.map((p) => (
              <tr key={p.id} className="bg-white dark:bg-gray-900">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 dark:text-white">{p.name}</div>
                  {p.description && (
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{p.description}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                  {p.durationDays ? `${p.durationDays} days` : '—'}
                </td>
                <td className="px-4 py-3">
                  {p.priceMinor === null ? (
                    <span className="text-amber-700 dark:text-amber-400">Not priced</span>
                  ) : (
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {formatPrice(p.priceMinor, p.currency)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`New price for ${p.name}`}
                      value={drafts[p.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      placeholder={p.currency === 'NGN' ? '2500' : '25'}
                      className="w-28 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => savePrice(p)}
                      disabled={saving === p.id || !(drafts[p.id] ?? '').trim()}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {saving === p.id ? '…' : 'Save'}
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleActive(p)}
                    disabled={saving === p.id}
                    aria-pressed={p.active}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      p.active
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {p.active ? <><Check size={12} /> On sale</> : <><Tag size={12} /> Draft</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
