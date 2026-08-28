import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Printer, Plus, Trash2, MessageCircle, Loader2, Receipt as ReceiptIcon } from 'lucide-react';

import { Business } from '../../types';
import {
  RECEIPT_TEMPLATES, PAYMENT_METHODS, templateForCategory, receiptTemplate,
  receiptTotals, formatMoney, receiptText, createReceipt, emptyReceiptItem,
  loadReceipts, saveReceipts, nextReceiptNumber,
  type Receipt, type ReceiptLayout, type PaymentMethod,
} from '../../lib/receipts';
import {
  ThermalReceiptNode, RetailReceiptNode, ServiceReceiptNode,
  ProfessionalReceiptNode, HospitalityReceiptNode, DeliveryReceiptNode,
} from './ReceiptNodes';
import { generateQr, profileUrl, downloadNodePng, exportNodeToPng, printImage, slugForFile } from '../../lib/studio';
import { detectRegionCurrency } from '../../lib/currency';
import { whatsappHref } from '../../lib/phone';

/** Layout id → the node that draws it. Kept here rather than exported from the
 *  node file, where a non-component export would break fast refresh. */
const RECEIPT_NODES = {
  thermal: ThermalReceiptNode,
  retail: RetailReceiptNode,
  service: ServiceReceiptNode,
  professional: ProfessionalReceiptNode,
  hospitality: HospitalityReceiptNode,
  delivery: DeliveryReceiptNode,
} as const;

interface Props {
  business: Business;
  accent?: string;
}

/**
 * Branded receipts, in the shape each trade's customers expect.
 *
 * The template is preselected from the business's category rather than asked
 * for — a buka should not have to know it wants a "thermal" layout — but every
 * template stays switchable, because plenty of businesses do two things.
 *
 * Receipts live in localStorage like the rest of the Studio's on-device data.
 * That is a deliberate limit worth knowing: they are on this device, not in an
 * account, so clearing site data loses the history. The exported PNG or print
 * is the durable copy, which is how a paper receipt book works anyway.
 */
export default function ReceiptStudio({ business, accent = '#4f46e5' }: Props) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [qr, setQr] = useState<string>('');
  const [busy, setBusy] = useState<'png' | 'print' | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const businessId = String(business.id);

  useEffect(() => {
    const stored = loadReceipts(businessId);
    setReceipts(stored);
    setReceipt(createReceipt(
      { layout: templateForCategory(business.category).id },
      stored,
      detectRegionCurrency(),
    ));
  }, [businessId, business.category]);

  useEffect(() => {
    generateQr(profileUrl(business), { size: 256 }).then(setQr).catch(() => setQr(''));
  }, [business]);

  const totals = useMemo(
    () => receiptTotals(receipt?.items ?? [], receipt?.taxPct ?? 0, receipt?.discountPct ?? 0, receipt?.amountPaid ?? 0),
    [receipt],
  );

  if (!receipt) return null;

  const template = receiptTemplate(receipt.layout);
  const Node = RECEIPT_NODES[receipt.layout];
  const patch = (next: Partial<Receipt>) => setReceipt((r) => (r ? { ...r, ...next } : r));

  const setItem = (id: string, next: Partial<Receipt['items'][number]>) =>
    patch({ items: receipt.items.map((i) => (i.id === id ? { ...i, ...next } : i)) });

  const removeItem = (id: string) =>
    // Never leave the sheet with no rows at all — an empty table reads as broken
    // rather than as a fresh start.
    patch({ items: receipt.items.length > 1 ? receipt.items.filter((i) => i.id !== id) : [emptyReceiptItem()] });

  const fileBase = `${slugForFile(business.name)}-${receipt.number}`;

  /**
   * Record this receipt in the day's history.
   *
   * IDEMPOTENT BY ID, which matters: exporting and then printing the same sale
   * is an ordinary thing to do, and an earlier version advanced the number on
   * both — so one sale consumed two receipt numbers and left a gap in a
   * sequence whose whole purpose is not to have gaps.
   *
   * Starting the next receipt is a separate, deliberate action.
   */
  const commit = () => {
    setReceipts((prev) => {
      if (prev.some((r) => r.id === receipt.id)) return prev;
      const kept = [receipt, ...prev].slice(0, 200);
      saveReceipts(businessId, kept);
      return kept;
    });
  };

  const startNext = () => {
    const history = receipts.some((r) => r.id === receipt.id) ? receipts : [receipt, ...receipts];
    setReceipt(createReceipt(
      { layout: receipt.layout, servedBy: receipt.servedBy, number: nextReceiptNumber(history) },
      history,
      receipt.currency,
    ));
  };

  const savePng = async () => {
    if (!nodeRef.current) return;
    setBusy('png');
    try {
      await downloadNodePng(nodeRef.current, `${fileBase}.png`, {
        pixelRatio: 3,
        backgroundColor: '#ffffff',
        // Fixed to the template's own width, so a receipt issued on a phone is
        // the same document as one issued at a desk.
        designWidth: template.designWidth,
      });
      commit();
      toast.success(`Receipt ${receipt.number} saved`);
    } catch {
      toast.error('Could not export the receipt — try again.');
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    if (!nodeRef.current) return;
    setBusy('print');
    try {
      const dataUrl = await exportNodeToPng(nodeRef.current, {
        pixelRatio: 3,
        backgroundColor: '#ffffff',
        designWidth: template.designWidth,
      });
      // 80mm is the real width of a till roll; the sheets print at 150mm so
      // they land at a readable size on A4 without filling it.
      const ok = printImage(dataUrl, `${business.name} — ${receipt.number}`, template.id === 'thermal' ? 80 : 150);
      if (!ok) { toast.error('Please allow pop-ups to print.'); return; }
      commit();
    } catch {
      toast.error('Could not prepare the receipt for printing.');
    } finally {
      setBusy(null);
    }
  };

  const sendWhatsapp = () => {
    const text = receiptText(business.name, receipt, totals);
    // whatsappHref returns null for a number it cannot normalise, which is
    // common enough — people type "0801 234" or leave it blank. Falling back to
    // the chooser lets the owner pick the chat themselves rather than nothing
    // happening.
    const direct = receipt.customerPhone.trim()
      ? whatsappHref(receipt.customerPhone.trim(), business.location, text)
      : null;
    window.open(direct || `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white min-h-[44px]';
  const label = 'block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Editor */}
      <div className="lg:col-span-2 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ReceiptIcon size={15} /> Receipt generator
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Numbered {receipt.number} · saved on this device when you export or print.
          </p>
        </div>

        <div>
          <span className={label}>Layout</span>
          <div className="grid grid-cols-2 gap-2">
            {RECEIPT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => patch({ layout: t.id as ReceiptLayout })}
                aria-pressed={receipt.layout === t.id}
                title={t.blurb}
                className={`text-left rounded-xl border p-2.5 min-h-[44px] transition ${
                  receipt.layout === t.id
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <p className="text-xs font-semibold text-gray-900 dark:text-white">{t.label}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2">{t.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div><label className={label} htmlFor="r-cust">Customer</label>
            <input id="r-cust" className={field} value={receipt.customerName} maxLength={80}
              onChange={(e) => patch({ customerName: e.target.value })} placeholder="Walk-in" /></div>
          <div><label className={label} htmlFor="r-phone">Phone</label>
            <input id="r-phone" className={field} value={receipt.customerPhone} maxLength={24}
              onChange={(e) => patch({ customerPhone: e.target.value })} placeholder="0801…" /></div>
        </div>

        {receipt.layout === 'hospitality' && (
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label} htmlFor="r-in">Check-in</label>
              <input id="r-in" type="date" className={field} value={receipt.checkIn} onChange={(e) => patch({ checkIn: e.target.value })} /></div>
            <div><label className={label} htmlFor="r-out">Check-out</label>
              <input id="r-out" type="date" className={field} value={receipt.checkOut} onChange={(e) => patch({ checkOut: e.target.value })} /></div>
          </div>
        )}

        {receipt.layout === 'delivery' && (
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label} htmlFor="r-from">From</label>
              <input id="r-from" className={field} value={receipt.fromLabel} maxLength={120}
                onChange={(e) => patch({ fromLabel: e.target.value })} placeholder={business.location || 'Pickup'} /></div>
            <div><label className={label} htmlFor="r-to">To</label>
              <input id="r-to" className={field} value={receipt.toLabel} maxLength={120}
                onChange={(e) => patch({ toLabel: e.target.value })} placeholder="Delivery address" /></div>
          </div>
        )}

        <div>
          <span className={label}>Items</span>
          <div className="space-y-2">
            {receipt.items.map((i) => (
              <div key={i.id} className="flex gap-1.5">
                <input aria-label="Description" className={`${field} flex-1`} value={i.description} maxLength={120}
                  onChange={(e) => setItem(i.id, { description: e.target.value })} placeholder="What was sold or done" />
                <input aria-label="Quantity" type="number" min={0} className={`${field} w-16`} value={i.qty}
                  onChange={(e) => setItem(i.id, { qty: Number(e.target.value) })} />
                <input aria-label="Unit price" type="number" min={0} className={`${field} w-24`} value={i.unitPrice}
                  onChange={(e) => setItem(i.id, { unitPrice: Number(e.target.value) })} />
                <button onClick={() => removeItem(i.id)} aria-label="Remove line"
                  className="w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 transition">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => patch({ items: [...receipt.items, emptyReceiptItem()] })}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 min-h-[44px]">
            <Plus size={13} /> Add line
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div><label className={label} htmlFor="r-disc">Discount %</label>
            <input id="r-disc" type="number" min={0} max={100} className={field} value={receipt.discountPct}
              onChange={(e) => patch({ discountPct: Number(e.target.value) })} /></div>
          <div><label className={label} htmlFor="r-tax">Tax %</label>
            <input id="r-tax" type="number" min={0} max={100} className={field} value={receipt.taxPct}
              onChange={(e) => patch({ taxPct: Number(e.target.value) })} /></div>
          <div><label className={label} htmlFor="r-paid">Paid</label>
            <input id="r-paid" type="number" min={0} className={field} value={receipt.amountPaid}
              onChange={(e) => patch({ amountPaid: Number(e.target.value) })} /></div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div><label className={label} htmlFor="r-method">Method</label>
            <select id="r-method" className={field} value={receipt.method}
              onChange={(e) => patch({ method: e.target.value as PaymentMethod })}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select></div>
          <div><label className={label} htmlFor="r-served">Served by</label>
            <input id="r-served" className={field} value={receipt.servedBy} maxLength={60}
              onChange={(e) => patch({ servedBy: e.target.value })} placeholder="Staff name" /></div>
        </div>

        <div><label className={label} htmlFor="r-notes">Note on the receipt</label>
          <input id="r-notes" className={field} value={receipt.notes} maxLength={160}
            onChange={(e) => patch({ notes: e.target.value })} placeholder="Optional" /></div>

        <div className="rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-800 text-sm">
          <div className="flex justify-between font-bold text-gray-900 dark:text-white">
            <span>Total</span><span>{formatMoney(totals.total, receipt.currency)}</span>
          </div>
          {totals.outstanding > 0 && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Balance due {formatMoney(totals.outstanding, receipt.currency)}
            </p>
          )}
          {totals.change > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Change {formatMoney(totals.change, receipt.currency)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={savePng} disabled={busy !== null}
            className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 min-h-[44px]">
            {busy === 'png' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Save receipt
          </button>
          <button onClick={print} disabled={busy !== null}
            className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 min-h-[44px]">
            {busy === 'print' ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />} Print
          </button>
          <button onClick={sendWhatsapp}
            className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium bg-[#25D366] text-white hover:brightness-95 min-h-[44px]">
            <MessageCircle size={15} /> Send
          </button>
          <button onClick={startNext}
            className="inline-flex items-center gap-2 px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 min-h-[44px]">
            <Plus size={15} /> New receipt
          </button>
        </div>

        {receipts.length > 0 && (
          <p className="text-[11px] text-gray-400">
            {receipts.length} receipt{receipts.length === 1 ? '' : 's'} issued on this device.
          </p>
        )}
      </div>

      {/* Live preview — this exact node is what gets exported. */}
      <div className="lg:col-span-3">
        <div className="rounded-2xl bg-gray-100 dark:bg-gray-800 p-4 sm:p-6 flex justify-center overflow-x-auto">
          <div className="shadow-xl rounded-2xl overflow-hidden" style={{ background: '#fff' }}>
            <Node ref={nodeRef} business={business} receipt={receipt} accent={accent} qr={qr} />
          </div>
        </div>
      </div>
    </div>
  );
}
