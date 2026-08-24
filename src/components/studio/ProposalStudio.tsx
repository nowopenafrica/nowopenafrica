import { useState } from 'react';
import toast from 'react-hot-toast';
import { FileSignature, Plus, Trash2, Send, Download, Copy, X, CheckCircle2, WalletCards } from 'lucide-react';
import { Business } from '../../types';
import {
  Proposal, ProposalItem, ProposalStatus, PROPOSAL_STATUSES,
  proposalTotals, formatMoney, proposalStatusLabel,
  suggestItems, proposalDocumentText, proposalBroadcastText,
  proposalNumber, createProposal,
  loadProposals, saveProposals,
} from '../../lib/proposals';
import { downloadText, slugForFile } from '../../lib/studio';

interface Props {
  business: Business;
}

const STATUS_STYLES: Record<ProposalStatus, string> = {
  draft: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  sent: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  accepted: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  declined: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

function emptyItem(): ProposalItem {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title: '', description: '', qty: 1, unit: 'pkg', price: 0 };
}

export default function ProposalStudio({ business }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>(() => loadProposals(business.id));
  const [showForm, setShowForm] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [validUntil, setValidUntil] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [items, setItems] = useState<ProposalItem[]>(suggestItems(business));
  const [note, setNote] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const persist = (next: Proposal[]) => { setProposals(next); saveProposals(business.id, next); };

  const draft = (): Proposal => createProposal(proposals.length, { name: clientName, phone: clientPhone, email: clientEmail, validUntil });

  const updateItem = (id: string, patch: Partial<ProposalItem>) => {
    setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const addProposal = () => {
    if (!items.some((i) => i.title.trim() && Number(i.qty) > 0)) return toast.error('Add at least one item.');
    const p = { ...draft(), items, note, status: 'draft' as ProposalStatus };
    persist([p, ...proposals]);
    setClientName(''); setClientPhone(''); setClientEmail('');
    setValidUntil(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
    setItems(suggestItems(business)); setNote('');
    setShowForm(false);
    toast.success(`Proposal ${p.number} created`);
  };

  const setStatus = (id: string, status: ProposalStatus) => {
    persist(proposals.map((p) => (p.id === id ? { ...p, status } : p)));
    toast.success(`Marked as ${proposalStatusLabel(status).toLowerCase()}`);
  };

  const send = (p: Proposal) => {
    const text = proposalBroadcastText(p, business);
    if (p.clientPhone) {
      const digits = p.clientPhone.replace(/[^\d]/g, '').replace(/^0/, '234');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
      setStatus(p.id, 'sent');
    } else toast.success('Copy the message and send it from your phone.');
  };

  const download = (p: Proposal) => {
    downloadText(proposalDocumentText(p, business), `${slugForFile(business.name)}-${p.number}.txt`);
    toast.success('Proposal downloaded');
  };

  const copyDoc = (p: Proposal) => {
    navigator.clipboard?.writeText(proposalDocumentText(p, business)).then(() => {
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1200);
    }).catch(() => toast.error('Could not copy.'));
  };

  const removeProposal = (id: string) => persist(proposals.filter((p) => p.id !== id));

  const totalValue = proposals.filter((p) => p.status !== 'declined' && p.status !== 'draft').reduce((s, p) => s + proposalTotals(p.items).total, 0);
  const counts = PROPOSAL_STATUSES.map((s) => [s.label, proposals.filter((p) => p.status === s.key).length] as [string, number]);
  const ordered = [...proposals].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {([
          ...counts,
          ['Total', proposals.length],
          ['Open value', formatMoney(totalValue)],
        ] as [string, string | number, string?][]).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5 text-center">
            <p className="text-lg font-black truncate text-purple-600 dark:text-purple-400">{typeof value === 'number' ? value : value}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileSignature size={16} className="text-purple-600 dark:text-purple-400" /> New proposal / quote
          </h3>
          <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
            {showForm ? <><X size={15} /> Close</> : <><Plus size={15} /> New proposal</>}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Your next proposal will be numbered <span className="font-semibold">{proposalNumber(proposals.length)}</span> automatically. VAT of 7.5% is added to the total.</p>

        {showForm && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
              <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Client phone / WhatsApp (optional)"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
              <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="Client email (optional)"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Line items</p>
                <span className="text-[11px] text-gray-400">Valid until: <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="inline-flex items-center px-2 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-xs min-h-[44px]" /></span>
              </div>
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,64px,110px,110px,36px] gap-2 items-center">
                  <input value={item.title} onChange={(e) => updateItem(item.id, { title: e.target.value })} placeholder="Item / service"
                    className="inline-flex items-center px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
                  <input value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} placeholder="Description"
                    className="inline-flex items-center px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
                  <input type="number" min="1" value={item.qty} onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) })} placeholder="Qty"
                    className="inline-flex items-center px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
                  <input value={item.unit} onChange={(e) => updateItem(item.id, { unit: e.target.value })} placeholder="Unit"
                    className="inline-flex items-center px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
                  <input type="number" min="0" step="50" value={item.price} onChange={(e) => updateItem(item.id, { price: Number(e.target.value) })} placeholder="Unit price (₦)"
                    className="inline-flex items-center px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
                  <button onClick={() => setItems(items.filter((i) => i.id !== item.id))} className="text-gray-400 hover:text-red-500 transition flex justify-center">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button onClick={() => setItems([...items, emptyItem()])} className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline">
                <Plus size={13} /> Add item
              </button>
            </div>

            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes (optional) — e.g. Includes delivery, valid for 7 days."
              className="w-full min-h-[60px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm" />

            <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-900 p-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Subtotal <span className="font-semibold">{formatMoney(proposalTotals(items).subtotal)}</span>
                {' · '}VAT <span className="font-semibold">{formatMoney(proposalTotals(items).vat)}</span>
              </div>
              <p className="text-lg font-black text-purple-600 dark:text-purple-400">{formatMoney(proposalTotals(items).total)}</p>
            </div>

            <div className="flex justify-end">
              <button onClick={addProposal} className="inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                <Plus size={15} /> Create proposal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Proposal list */}
      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <WalletCards size={24} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No proposals yet. Quote your next job and send it on WhatsApp.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((p) => {
            const t = proposalTotals(p.items);
            return (
              <div key={p.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[p.status]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.status === 'accepted' ? 'bg-green-500' : p.status === 'declined' ? 'bg-red-500' : p.status === 'sent' ? 'bg-blue-500' : 'bg-gray-400'}`} /> {proposalStatusLabel(p.status)}
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{p.number}</span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white mt-1.5">{p.clientName || 'No client name'}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Valid until {new Date(`${p.validUntil}T00:00:00`).toLocaleDateString()}
                      {p.clientPhone && <span> · {p.clientPhone}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-gray-900 dark:text-white">{formatMoney(t.total)}</p>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{p.items.length} item{p.items.length === 1 ? '' : 's'}</p>
                  </div>
                </div>

                {p.items.length > 0 && (
                  <div className="mt-3 rounded-xl bg-gray-50 dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {p.items.map((i) => (
                      <div key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{i.title} <span className="text-gray-400">× {i.qty} {i.unit}</span></span>
                        <span className="font-medium text-gray-800 dark:text-gray-200">{formatMoney(i.qty * i.price)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-3 py-2 text-sm font-bold text-gray-900 dark:text-white">
                      <span>Total (incl. VAT)</span>
                      <span>{formatMoney(t.total)}</span>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {p.status !== 'sent' && p.status !== 'accepted' && p.status !== 'declined' && (
                    <button onClick={() => send(p)} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition min-h-[44px]">
                      <Send size={13} /> Send on WhatsApp
                    </button>
                  )}
                  {p.status !== 'accepted' && p.status !== 'declined' && (
                    <button onClick={() => setStatus(p.id, 'accepted')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition min-h-[44px]">
                      <CheckCircle2 size={13} /> Accept
                    </button>
                  )}
                  {p.status !== 'accepted' && p.status !== 'declined' && (
                    <button onClick={() => setStatus(p.id, 'declined')} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition min-h-[44px]">
                      Decline
                    </button>
                  )}
                  <button onClick={() => copyDoc(p)} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 transition min-h-[44px]">
                    {copiedId === p.id ? 'Copied!' : 'Copy doc'} <Copy size={13} />
                  </button>
                  <button onClick={() => download(p)} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 transition min-h-[44px]">
                    <Download size={13} /> Download
                  </button>
                  <button onClick={() => removeProposal(p.id)} className="inline-flex items-center gap-1.5 px-2.5 .5 rounded-lg text-xs font-medium text-gray-400 hover:text-red-500 transition min-h-[44px]">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <WalletCards size={12} /> Proposals are saved on this device for {business.name}. Send to a client on WhatsApp and track it to Accepted or Declined.
      </p>
    </div>
  );
}
