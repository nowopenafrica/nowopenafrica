import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, Copy, FileUp, Loader2, X } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { track } from '../../lib/telemetry';
import type { CatalogueItem } from '../../lib/create/catalogue';
import {
  DESIGN_ROUTES, defaultConfiguration, optionGroupsFor, orderVerb,
  quoteFor, specLine, type Configuration,
} from '../../lib/create/configure';
import { generateOrderReference, orderTrackPath } from '../../lib/create/reference';
import {
  ARTWORK_BUCKET, ARTWORK_TYPES, artworkPath, checkArtwork, safeArtworkName,
} from '../../lib/create/artwork';

/**
 * Choose → Customise → Price → Order, in one panel.
 *
 * This is what the Create page was missing: it showed a catalogue and every
 * button went somewhere else, so a visitor who knew exactly what they wanted
 * had no way to say so.
 *
 * The price updates as the configuration changes and is itemised, because a
 * customer comparing NowOpen against a printer needs to see which part is the
 * printing and which is the design — and because an unexplained total is the
 * fastest way to lose trust in a price that is already an estimate.
 *
 * IT ENDS IN A REQUEST, NOT A PAYMENT, for printed work. Every printed price is
 * a market estimate with no supplier quote behind it, so a Pay button would be
 * charging against a number nobody agreed to. The panel says so rather than
 * implying the total is final. A SKU whose basis is 'quoted' already reads
 * "Place this order" instead — the flow does not need rebuilding when real
 * quotes arrive.
 */

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

export default function CreateConfigurator({
  item, onClose,
}: { item: CatalogueItem; onClose: () => void }) {
  const [config, setConfig] = useState<Configuration>(() => defaultConfiguration(item));
  const [contact, setContact] = useState('');
  const [business, setBusiness] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Made once, when the panel opens. The order row declares the artwork path
  // before the file is sent, and the customer needs the same code afterwards.
  const [reference] = useState(generateOrderReference);

  const groups = useMemo(() => optionGroupsFor(item), [item]);
  const quote = useMemo(() => quoteFor(item, config), [item, config]);
  const estimate = quote.basis === 'indicative';

  // Escape closes it. A panel that traps you is worse than no panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setOption = (group: string, choice: string) =>
    setConfig((c) => ({ ...c, options: { ...c.options, [group]: choice } }));

  const pickFile = (chosen: File | null) => {
    if (!chosen) { setFile(null); return; }
    const check = checkArtwork(chosen);
    if (!check.ok) { toast.error(check.reason); if (fileInput.current) fileInput.current.value = ''; return; }
    setFile(chosen);
  };

  const submit = async () => {
    const reach = contact.trim();
    if (!reach) { toast.error('One way to reach you.'); return; }

    // Decided here, not after the upload: the order row is what authorises the
    // upload, so it has to name the file first. See the migration.
    const path = file ? artworkPath(reference, file.name) : null;

    setBusy(true);
    // No .select() — this table is insert-only to the public, and asking for
    // the row back makes RLS refuse the whole statement.
    const { error } = await supabase.from('create_orders').insert({
      reference,
      sku: item.sku,
      product: item.name,
      quantity: config.quantity ?? null,
      options: config.options,
      design_route: config.design,
      spec: specLine(item, config).slice(0, 1000),
      estimate_total: quote.total,
      estimate_basis: quote.basis,
      contact: reach.slice(0, 160),
      business_name: business.trim().slice(0, 160) || null,
      note: note.trim().slice(0, 1000) || null,
      artwork_path: path,
      artwork_name: file ? safeArtworkName(file.name) : null,
    });

    if (error) { setBusy(false); toast.error('That did not send. Please try again.'); return; }

    // The order is placed either way. If the file fails we say so rather than
    // losing the order — the customer can send it against the reference.
    if (file && path) {
      const { error: upErr } = await supabase.storage
        .from(ARTWORK_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) toast.error('Order placed, but the artwork did not upload. We will ask you for it.');
    }

    setBusy(false);
    track('create_order_requested', {
      sku: item.sku, total: quote.total, design: config.design, artwork: Boolean(file),
    });
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Configure ${item.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-800 shadow-2xl"
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{item.name}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{item.blurb}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 -m-2 text-gray-500 hover:text-gray-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </header>

        {done ? (
          <div className="p-8 text-center">
            <CheckCircle2 size={34} className="mx-auto text-green-600" />
            <h3 className="mt-3 font-bold text-gray-900 dark:text-white">
              {estimate ? 'Request received.' : 'Order received.'}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              {estimate
                ? 'We will come back on the contact you gave us with a real price for this exact job, your quantity and your city. Nothing is charged until you accept it.'
                : 'We will confirm on the contact you gave us and start the work.'}
            </p>

            {/* This code is the whole receipt. There is no account behind this
                order, so if the customer loses it they lose the way back in. */}
            <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Your reference</p>
              <p className="mt-1 text-2xl font-extrabold tracking-widest text-gray-900 dark:text-white">{reference}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => {
                    void navigator.clipboard?.writeText(reference)
                      .then(() => toast.success('Reference copied'))
                      .catch(() => toast.error('Copy it down — it is your only way back to this order.'));
                  }}
                  className="inline-flex items-center gap-1.5 min-h-[42px] px-4 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-semibold"
                >
                  <Copy size={15} /> Copy
                </button>
                <Link
                  to={orderTrackPath(reference)}
                  onClick={onClose}
                  className="inline-flex items-center min-h-[42px] px-4 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold"
                >
                  Track this order
                </Link>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Keep it. It is how you check the price and accept it — no account needed.
                {config.design === 'upload' && !file && ' Send your artwork against this reference when you are ready.'}
              </p>
            </div>

            <button onClick={onClose} className="mt-4 min-h-[44px] px-5 text-sm font-semibold text-gray-600 dark:text-gray-400">
              Close
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {item.tiers?.length ? (
              <Section label="How many">
                <div className="flex flex-wrap gap-2">
                  {item.tiers.map((t) => (
                    <Choice
                      key={t.qty}
                      on={config.quantity === t.qty}
                      onClick={() => setConfig((c) => ({ ...c, quantity: t.qty }))}
                      title={String(t.qty)}
                      sub={naira(t.price)}
                    />
                  ))}
                </div>
              </Section>
            ) : null}

            {groups.map((g) => (
              <Section key={g.key} label={g.label}>
                <div className="flex flex-wrap gap-2">
                  {g.choices.map((c) => (
                    <Choice
                      key={c.key}
                      on={config.options[g.key] === c.key}
                      onClick={() => setOption(g.key, c.key)}
                      title={c.label}
                      sub={c.delta === 0 ? c.note ?? 'Included' : `${c.delta > 0 ? '+' : ''}${Math.round(c.delta * 100)}%`}
                    />
                  ))}
                </div>
              </Section>
            ))}

            {/* Hidden where the design is the product: a pack is already a
                creator doing all of it, so offering to add one is nonsense. */}
            {!item.designIncluded && (
            <Section label="The artwork">
              <div className="grid gap-2 sm:grid-cols-2">
                {DESIGN_ROUTES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setConfig((c) => ({ ...c, design: r.key }))}
                    className={`text-left rounded-xl border p-3 transition ${
                      config.design === r.key
                        ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-pink-300'
                    }`}
                  >
                    <span className="block text-sm font-bold text-gray-900 dark:text-white">{r.label}</span>
                    <span className="block text-xs text-gray-600 dark:text-gray-400">{r.blurb}</span>
                  </button>
                ))}
              </div>

              {/* The customer who already has artwork is the one closest to
                  paying. Making them place the order and then email the file
                  separately is exactly where that customer is lost. */}
              {config.design === 'upload' && (
                <div className="mt-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-3">
                  <input
                    ref={fileInput}
                    type="file"
                    id="create-artwork-file"
                    accept={[...ARTWORK_TYPES, '.pdf', '.png', '.jpg', '.jpeg', '.webp'].join(',')}
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                  <label
                    htmlFor="create-artwork-file"
                    className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-gray-900 dark:text-white"
                  >
                    <FileUp size={17} className="text-pink-600 shrink-0" />
                    {file ? file.name : 'Attach your print-ready file'}
                  </label>
                  <p className="mt-1 text-xs text-gray-500">
                    {file
                      ? `${(file.size / 1024 / 1024).toFixed(1)}MB · sent privately, only NowOpen sees it`
                      : 'PDF, PNG, JPG or WEBP, up to 25MB. Optional — you can send it later against your reference.'}
                  </p>
                  {file && (
                    <button
                      onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ''; }}
                      className="mt-1 text-xs font-semibold text-gray-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </Section>
            )}

            {/* The price, itemised. */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
              <ul className="space-y-1 text-sm">
                {quote.lines.map((l, i) => (
                  <li key={`${l.label}-${i}`} className="flex justify-between gap-3 text-gray-700 dark:text-gray-300">
                    <span>{l.label}</span>
                    <span className="tabular-nums shrink-0">{l.amount === 0 ? 'Free' : naira(l.amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-baseline">
                <span className="font-bold text-gray-900 dark:text-white">
                  {estimate ? 'Estimated total' : 'Total'}
                </span>
                <span className="text-xl font-extrabold text-gray-900 dark:text-white tabular-nums">
                  {quote.total === 0 ? 'Free' : naira(quote.total)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {quote.turnaround[1] > 0
                  ? `${quote.turnaround[0]}–${quote.turnaround[1]} working days`
                  : 'Available immediately'}
                {estimate && ' · price confirmed on quote'}
              </p>
            </div>

            {estimate && (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                This total is a market estimate. No production partner has quoted this job yet, so
                nothing is charged — we come back with a real price and you decide then.
              </p>
            )}

            <Section label="Where to reach you">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={contact} onChange={(e) => setContact(e.target.value)} maxLength={160} required
                  aria-label="WhatsApp, phone or email" placeholder="WhatsApp, phone or email"
                  className="min-h-[46px] px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                />
                <input
                  value={business} onChange={(e) => setBusiness(e.target.value)} maxLength={160}
                  aria-label="Business name (optional)" placeholder="Business name (optional)"
                  className="min-h-[46px] px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
                />
              </div>
              <textarea
                value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2}
                aria-label="Anything else" placeholder="Anything else — deadline, delivery city, wording…"
                className="mt-2 w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm"
              />
            </Section>

            <button
              onClick={submit}
              disabled={busy}
              className="w-full min-h-[50px] rounded-xl bg-pink-600 text-white font-bold hover:bg-pink-700 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={17} className="animate-spin" />}
              {orderVerb(quote)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">{label}</h3>
      {children}
    </section>
  );
}

function Choice({ on, onClick, title, sub }: { on: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[46px] px-3.5 rounded-xl border text-left transition ${
        on ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-pink-300'
      }`}
    >
      <span className="block text-sm font-bold text-gray-900 dark:text-white">{title}</span>
      {sub && <span className="block text-[11px] text-gray-600 dark:text-gray-400">{sub}</span>}
    </button>
  );
}
