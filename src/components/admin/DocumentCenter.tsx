import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Loader2, FolderOpen, FilePlus2, Send, CheckCircle2,
  X, ChevronDown, FileText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { NOWOPEN_ORG_ID } from '../../lib/workforce';
import { RELATIONSHIP_OPTIONS, type RelationshipType } from '../../lib/relationships';
import {
  AGREEMENT_TEMPLATES, DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS,
  DOCUMENT_KIND_LABELS, templateById, buildDocument, renderDocumentText,
  sendDocument, signDocument, declineDocument, mapDocumentRow,
  summarizeDocuments, DOCUMENTS_SEED,
  type OsDocument, type DocumentRow, type DocumentStatus,
} from '../../lib/documents';

// Document Centre — the People OS agreement layer. The library holds reusable
// templates (NDA, partnership, volunteer, creative, employment, ...); a
// template is drafted into a real document for a counterparty, and status only
// changes when someone actually sends, signs or declines it. Documents load
// from os_documents and fall back to DOCUMENTS_SEED until the migration is
// applied.

const STATUS_BADGE: Record<DocumentStatus, string> = {
  draft: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  sent: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  signed: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  declined: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  expired: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
};

interface FormState {
  templateId: string;
  counterpartyName: string;
  counterpartyEmail: string;
  relationship: RelationshipType;
}

const EMPTY_FORM: FormState = {
  templateId: 'nda',
  counterpartyName: '',
  counterpartyEmail: '',
  relationship: 'partner',
};

export default function DocumentCenter() {
  const { user } = useAuth();
  const currentUser = useMemo(
    () => (user?.id ? { id: user.id, email: user.email } : undefined),
    [user?.id, user?.email],
  );
  const [documents, setDocuments] = useState<OsDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('os_documents')
        .select('*')
        .eq('org_id', NOWOPEN_ORG_ID);
      const rows = (data ?? []) as DocumentRow[];
      if (error || rows.length === 0) throw new Error('os_documents unavailable');
      setDocuments(rows.map(mapDocumentRow));
      setUsingFallback(false);
    } catch {
      setDocuments(DOCUMENTS_SEED);
      setUsingFallback(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => summarizeDocuments(documents), [documents]);

  const visible = useMemo(
    () => (statusFilter === 'all' ? documents : documents.filter((d) => d.status === statusFilter)),
    [documents, statusFilter],
  );

  const persist = async (next: OsDocument, create = false) => {
    if (usingFallback) {
      if (create) {
        setDocuments((d) => [next, ...d]);
      } else {
        setDocuments((d) => d.map((x) => (x.id === next.id ? next : x)));
      }
      return true;
    }
    const { id: _id, ...row } = next;
    const { error } = create
      ? await supabase.from('os_documents').insert(row)
      : await supabase.from('os_documents').update(row).eq('id', next.id);
    if (error) return false;
    await load();
    return true;
  };

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.counterpartyName.trim() || !form.counterpartyEmail.trim()) {
      toast.error('Add a counterparty name and email.');
      return;
    }
    const doc = buildDocument({
      templateId: form.templateId,
      counterpartyName: form.counterpartyName.trim(),
      counterpartyEmail: form.counterpartyEmail.trim(),
      relationship: form.relationship,
    });
    if (!doc) return;
    setBusy(true);
    try {
      const ok = await persist(doc, true);
      if (ok) toast.success(`${templateById(doc.template_id)?.title} drafted for ${doc.counterparty_name}.`);
      else toast.error('Could not save the document — admin permissions needed.');
    } finally {
      setBusy(false);
      setFormOpen(false);
      setForm(EMPTY_FORM);
    }
  };

  const act = async (doc: OsDocument, action: 'send' | 'sign' | 'decline') => {
    setActingId(doc.id);
    try {
      const next = action === 'send' ? sendDocument(doc)
        : action === 'sign' ? signDocument(doc)
        : declineDocument(doc);
      const ok = await persist(next);
      if (ok) toast.success(`${next.status === 'signed' ? 'Signed' : next.status === 'sent' ? 'Sent for signature' : 'Declined'} — ${doc.counterparty_name}.`);
      else toast.error('Could not update the document — admin permissions needed.');
    } finally {
      setActingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 size={16} className="animate-spin mr-2" /> Reading the document ledger…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {usingFallback && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Showing the dev ledger — apply the os_documents migration to persist real agreements.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <FolderOpen size={18} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Document Centre</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {summary.total} documents · {summary.signed} signed · {summary.sent} sent for signature · {summary.drafts} drafts · {summary.signingRate}% signing rate
              </p>
            </div>
          </div>
          <button type="button" onClick={() => setFormOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 transition">
            <FilePlus2 size={13} /> New document
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${statusFilter === 'all' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            All · {summary.total}
          </button>
          {DOCUMENT_STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition ${statusFilter === s ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {DOCUMENT_STATUS_LABELS[s]} · {summary.byStatus[s]}
            </button>
          ))}
        </div>
      </div>

      {formOpen && (
        <form onSubmit={generate}
          className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-900 dark:text-white">Draft from the library</p>
            <button type="button" onClick={() => setFormOpen(false)} aria-label="Close document form">
              <X size={14} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Template</span>
              <select value={form.templateId}
                onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                aria-label="Document template"
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                {AGREEMENT_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Relationship</span>
              <select value={form.relationship}
                onChange={(e) => setForm({ ...form, relationship: e.target.value as RelationshipType })}
                aria-label="Counterparty relationship"
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                {RELATIONSHIP_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.emoji} {o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Counterparty name</span>
              <input value={form.counterpartyName}
                onChange={(e) => setForm({ ...form, counterpartyName: e.target.value })}
                placeholder="Meatclub Nigeria"
                aria-label="Counterparty name"
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Counterparty email</span>
              <input type="email" value={form.counterpartyEmail}
                onChange={(e) => setForm({ ...form, counterpartyEmail: e.target.value })}
                placeholder="ops@meatclub.ng"
                aria-label="Counterparty email"
                className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </label>
          </div>
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <FilePlus2 size={13} />} Generate draft
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <FolderOpen size={11} /> Agreement library · {AGREEMENT_TEMPLATES.length} templates
          </p>
          <div className="mt-3 space-y-2">
            {AGREEMENT_TEMPLATES.map((t) => (
              <div key={t.id} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{t.title}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{t.description}</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-[9px] font-bold text-purple-600 dark:text-purple-400 uppercase">
                    {DOCUMENT_KIND_LABELS[t.kind]} · {t.clauses.length} clauses
                  </span>
                  <button type="button"
                    onClick={() => { setForm({ ...EMPTY_FORM, templateId: t.id }); setFormOpen(true); }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-white bg-purple-600 hover:bg-purple-700 transition">
                    <FilePlus2 size={10} /> Generate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          {visible.length === 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No documents in this state yet — generate one from the library.
            </div>
          )}
          {visible.map((d) => {
            const expanded = expandedId === d.id;
            const template = templateById(d.template_id);
            return (
              <div key={d.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                <button type="button"
                  onClick={() => setExpandedId(expanded ? null : d.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                    <FileText size={15} className="text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{d.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[d.status]}`}>
                        {DOCUMENT_STATUS_LABELS[d.status]}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {d.counterparty_email}{template ? ` · ${template.title}` : ''} · effective {d.effective_date ?? '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {d.status === 'draft' && (
                      <span role="button" tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); void act(d, 'send'); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void act(d, 'send'); } }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition cursor-pointer">
                        <Send size={10} /> {actingId === d.id ? <Loader2 size={10} className="animate-spin" /> : 'Send'}
                      </span>
                    )}
                    {d.status === 'sent' && (
                      <>
                        <span role="button" tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); void act(d, 'sign'); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void act(d, 'sign'); } }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition cursor-pointer">
                          <CheckCircle2 size={10} /> {actingId === d.id ? <Loader2 size={10} className="animate-spin" /> : 'Mark signed'}
                        </span>
                        <span role="button" tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); void act(d, 'decline'); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void act(d, 'decline'); } }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 transition cursor-pointer">
                          <X size={10} /> Decline
                        </span>
                      </>
                    )}
                    <ChevronDown size={14} className={`text-gray-400 transition ${expanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                    <div className="mt-3 flex flex-wrap gap-1">
                      {d.clauses.map((c) => (
                        <span key={c} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-[10px] font-semibold text-gray-600 dark:text-gray-300">{c}</span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                      <span>Sent: {d.sent_at ? new Date(d.sent_at).toLocaleString() : '—'}</span>
                      <span>Signed: {d.signed_at ? new Date(d.signed_at).toLocaleString() : '—'}</span>
                    </div>
                    <pre className="mt-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-[10px] leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {renderDocumentText(d)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
