import { useState } from 'react';
import toast from 'react-hot-toast';
import { Receipt, Plus, Trash2, Send, CheckCircle2, Clock, FileText, Share2, AlertCircle, X } from 'lucide-react';
import { Business } from '../../types';
import {
  Invoice, InvoiceItem, InvoiceDisplayStatus,
  itemTotal, subtotal, discountAmount, taxAmount, total, formatNaira,
  invoiceDisplayStatus, invoiceCounts, nextInvoiceNumber, createInvoice,
  suggestDates, dateLabel, invoiceText, reminderText,
  loadInvoices, saveInvoices,
} from '../../lib/invoices';

interface Props {
  business: Business;
}

const STATUS_STYLES: Record<InvoiceDisplayStatus, { label: string; chip: string; dot: string }> = {
  draft: { label: 'Draft', chip: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300', dot: 'bg-gray-400' },
  sent: { label: 'Sent', chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  paid: { label: 'Paid', chip: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  overdue: { label: 'Overdue', chip: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300', dot: 'bg-red-500' },
};

function emptyItem(): InvoiceItem {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, description: '', qty: 1, unitPrice: 0 };
}

export default function InvoicesStudio({ business }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>(() => loadInvoices(business.id));
  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
  const [taxPct, setTaxPct] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [notes, setNotes] = useState('');
  const dates = suggestDates(7);

  const persist = (next: Invoice[]) => { setInvoices(next); saveInvoices(business.id, next); };

  const draft = (): Invoice => ({
    id: 'draft',
    number: nextInvoiceNumber(invoices),
    customerName,
    customerPhone,
    items,
    taxPct,
    discountPct,
    notes,
    issueDate: dates.issueDate,
    dueDate: dates.dueDate,
    status: 'draft',
    createdAt: new Date().toISOString(),
  });

  const updateItem = (id: string, patch: Partial<InvoiceItem>) => {
    setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const addInvoice = () => {
    if (!customerName.trim()) return toast.error('Add the customer name.');
    if (!items.some((i) => i.description.trim() && Number(i.qty) > 0)) return toast.error('Add at least one item.');
    const inv = createInvoice({ ...draft(), items }, invoices);
    persist([inv, ...invoices]);
    setCustomerName(''); setCustomerPhone(''); setItems([emptyItem()]); setTaxPct(0); setDiscountPct(0); setNotes('');
    setShowForm(false);
    toast.success(`Invoice ${inv.number} created`);
  };

  const setStatus = (id: string, status: Invoice['status']) => {
    persist(invoices.map((inv) => (inv.id === id ? { ...inv, status } : inv)));
    toast.success(status === 'paid' ? 'Marked as paid' : 'Marked as sent');
  };

  const sendInvoice = (inv: Invoice) => {
    const text = invoiceText(business, inv);
    if (inv.customerPhone) {
      const digits = inv.customerPhone.replace(/[^\d]/g, '').replace(/^0/, '234');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    } else toast.success('Copy the message and send it from your phone.');
  };

  const remind = (inv: Invoice) => {
    const text = reminderText(business, inv);
    if (inv.customerPhone) {
      const digits = inv.customerPhone.replace(/[^\d]/g, '').replace(/^0/, '234');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    } else toast.success('Copy the reminder and send it from your phone.');
  };

  const removeInvoice = (id: string) => persist(invoices.filter((inv) => inv.id !== id));

  const counts = invoiceCounts(invoices);
  const ordered = [...invoices].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {([
          ['Drafts', counts.draft, 'text-gray-500 dark:text-gray-400'],
          ['Sent', counts.sent, 'text-blue-600 dark:text-blue-400'],
          ['Paid', counts.paid, 'text-green-600 dark:text-green-400'],
          ['Overdue', counts.overdue, 'text-red-600 dark:text-red-400'],
          ['Total', counts.total, 'text-purple-600 dark:text-purple-400'],
          ['Outstanding', formatNaira(counts.outstanding), 'text-amber-600 dark:text-amber-400'],
        ] as [string, string, string][]).map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5 text-center">
            <p className={`text-lg font-black truncate ${color}`}>{value}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Receipt size={16} className="text-purple-600 dark:text-purple-400" /> New invoice
          </h3>
          <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
            {showForm ? <><X size={15} /> Close</> : <><Plus size={15} /> New invoice</>}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Your next invoice will be numbered <span className="font-semibold">{nextInvoiceNumber(invoices)}</span> automatically.</p>

        {showForm && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Customer phone / WhatsApp (optional)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Line items</p>
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-1 sm:grid-cols-[1fr,80px,120px,36px] gap-2 items-center">
                  <input value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} placeholder="Description (e.g. Service fee)"
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm" />
                  <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) })} placeholder="Qty"
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm" />
                  <input type="number" min="0" step="50" value={item.unitPrice} onChange={(e) => updateItem(item.id, { unitPrice: Number(e.target.value) })} placeholder="Unit price (₦)"
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm" />
                  <button onClick={() => setItems(items.filter((i) => i.id !== item.id))} className="text-gray-400 hover:text-red-500 transition flex justify-center">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button onClick={() => setItems([...items, emptyItem()])} className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline">
                <Plus size={13} /> Add item
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Tax (%)</label>
                <input type="number" min="0" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Discount (%)</label>
                <input type="number" min="0" value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Thanks for your business!"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-900 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Subtotal <span className="font-semibold">{formatNaira(subtotal(draft()))}</span>
                {discountPct > 0 && <> · Discount <span className="font-semibold text-red-500">−{formatNaira(discountAmount(draft()))}</span></>}
                {taxPct > 0 && <> · Tax <span className="font-semibold">{formatNaira(taxAmount(draft()))}</span></>}
              </div>
              <p className="text-lg font-black text-purple-600 dark:text-purple-400">{formatNaira(total(draft()))}</p>
            </div>

            <div className="flex justify-end">
              <button onClick={addInvoice} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
                <Plus size={15} /> Create invoice
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice list */}
      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <FileText size={24} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No invoices yet. Create your first one and send it on WhatsApp.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((inv) => {
            const st = invoiceDisplayStatus(inv);
            const style = STATUS_STYLES[st];
            return (
              <div key={inv.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${style.chip}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} /> {style.label}
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{inv.number}</span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white mt-1.5">{inv.customerName}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {dateLabel(inv.issueDate)} → due {dateLabel(inv.dueDate)}
                      {inv.customerPhone && <span> · {inv.customerPhone}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-gray-900 dark:text-white">{formatNaira(total(inv))}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{inv.items.length} item{inv.items.length === 1 ? '' : 's'}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-xl bg-gray-50 dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {inv.items.map((i) => (
                    <div key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{i.description} <span className="text-gray-400">× {i.qty}</span></span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{formatNaira(itemTotal(i))}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2 text-sm font-bold text-gray-900 dark:text-white">
                    <span>Total</span>
                    <span>{formatNaira(total(inv))}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {inv.status !== 'paid' && (
                    <button onClick={() => setStatus(inv.id, 'paid')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition">
                      <CheckCircle2 size={13} /> Mark paid
                    </button>
                  )}
                  {inv.status === 'draft' && (
                    <button onClick={() => setStatus(inv.id, 'sent')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition">
                      <Clock size={13} /> Mark sent
                    </button>
                  )}
                  <button onClick={() => sendInvoice(inv)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition">
                    <Send size={13} /> Send on WhatsApp
                  </button>
                  {st === 'overdue' && (
                    <button onClick={() => remind(inv)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-amber-950 hover:bg-amber-400 transition">
                      <AlertCircle size={13} /> Payment reminder
                    </button>
                  )}
                  <button onClick={() => removeInvoice(inv.id)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-red-500 transition">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Share2 size={12} /> Invoices are saved on this device for {business.name}. Overdue invoices can be chased with a one-tap WhatsApp reminder.
      </p>
    </div>
  );
}
